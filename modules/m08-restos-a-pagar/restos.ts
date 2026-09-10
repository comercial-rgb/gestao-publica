import { exigirFonteNoRolDaConta } from "../m05-despesa/guard-fonte.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { randomUUID } from "node:crypto";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import { travar } from "../../packages/locks/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import {
  gerarEstorno,
  type LancamentoContabil,
  type Partida,
} from "../../packages/ledger/index.js";
import { criarOrdemCronologicaPrisma } from "../m06-ordem-cronologica/adapter-prisma.js";
// Aresta FINA (só o guard, sem o adapter do M05) — ver o cabeçalho de `guard-fonte.ts`.
import { exigirFonteDaFicha } from "../m05-despesa/guard-fonte.js";
// M08 -> M07 (nunca o inverso): o resto a pagar também retém na fonte.
import {
  comporPagamentoComRetencoes,
  type RetencoesDoPagamento,
} from "../m07-extraorcamentario/dominio.js";
import {
  estornarRetencoesDoPagamento,
  registrarRetencoesDoPagamento,
} from "../m07-extraorcamentario/retencao.js";
import {
  comporPartidas,
  saldoParaLiquidar,
  somaLiquidaEstornaveis,
  totaisDosMovimentos,
  type TotaisRP,
  zAnularCancelamentoRestosInput,
  zAnularPagamentoRestosInput,
  zCancelarRestosInput,
  zLiquidarRestosInput,
  zPagarRestosInput,
  type AnularCancelamentoRestosInput,
  type AnularPagamentoRestosInput,
  type CancelarRestosInput,
  type LiquidarRestosInput,
  type PagarRestosInput,
  type RoteiroContabil,
} from "./dominio.js";
import type { Tx } from "./guard-exercicio.js";
// ⚠️ O FUNIL DO RAZÃO (M01). Todo lançamento passa por ele — e é lá que mora o
// travamento de competência (M16). Ver `m01-funil.test.ts`: o grep-teste proíbe o
// `lancamentoContabil.create` fora dele.
import { lancarNoRazao } from "../m01-core-contabil/razao.js";

/**
 * OPERAÇÕES DE RESTOS A PAGAR (Lei 4.320/64, art. 36).
 *
 * ═══ A REGRA QUE ATRAVESSA TUDO ═══
 * NENHUMA operação daqui cria `MovimentoDotacao`. RP não consome dotação do
 * exercício corrente: a dotação do ano que fechou já foi consumida pelo empenho.
 * Criar movimento de dotação aqui seria gastar duas vezes o mesmo dinheiro.
 *
 * O saldo de RP tem o seu próprio razão (`MovimentoRestosAPagar`) e sai sempre de
 * SUM — nunca de coluna.
 *
 * O M08 importa o M05 (models) e o M06 (ordem cronológica). Nunca o inverso.
 */

/**
 * SUM líquido: originais menos os estornados.
 *
 * A aritmética PURA vive no domínio (`somaLiquidaEstornaveis`) — aqui só se
 * converte o `Decimal` do Prisma em `Money`. Fonte única: o M12 (relatórios) usa
 * a MESMA função, com o recorte temporal dele.
 */
function somaLiquida(
  linhas: readonly {
    readonly id: string;
    readonly valor: { toFixed(n: number): string };
    readonly estornoDeId: string | null;
  }[]
): Money {
  return somaLiquidaEstornaveis(
    linhas.map((l) => ({
      id: l.id,
      valor: toMoney(l.valor.toFixed(2)),
      estornoDeId: l.estornoDeId,
    }))
  );
}

/**
 * ⚠️ NUNCA some `MovimentoRestosAPagar` sem passar por AQUI.
 *
 * Os quatro tipos NÃO têm o mesmo sinal (ver `SINAL_MOVIMENTO_RP`): os
 * `ESTORNO_*` DEVOLVEM saldo. Um `SUM(*)` cru trataria o estorno como mais uma
 * baixa e faria a anulação **reduzir** o saldo em vez de devolvê-lo — o oposto do
 * que ela significa. Foi exatamente assim que o bug do 345af7d se escondeu.
 *
 * Esta função lê os movimentos e entrega a soma ao domínio, que devolve tudo já
 * com o sinal certo. A aritmética é UMA só (`totaisDosMovimentos`) — o M12 a usa
 * também, com o recorte temporal dele.
 */
async function totaisDaInscricao(
  tx: Tx,
  inscricaoId: string
): Promise<TotaisRP> {
  const movimentos = await tx.movimentoRestosAPagar.findMany({
    where: { inscricaoId },
    select: { tipo: true, valor: true },
  });

  return totaisDosMovimentos(
    movimentos.map((m) => ({ tipo: m.tipo, valor: toMoney(m.valor.toFixed(2)) }))
  );
}

/** Liquidações do empenho criadas DEPOIS do encerramento (as de RP). */
async function liquidacoesPosInscricao(
  tx: Tx,
  empenhoId: string,
  encerradoEm: Date
): Promise<Money> {
  const linhas = await tx.liquidacao.findMany({
    where: { empenhoId, criadoEm: { gt: encerradoEm } },
    select: { id: true, valor: true, estornoDeId: true },
  });
  return somaLiquida(linhas);
}

/** O encerramento do exercício de origem da inscrição. */
async function encerramentoDe(tx: Tx, ano: number): Promise<Date> {
  const e = await tx.exercicio.findUnique({
    where: { ano },
    select: { encerramento: { select: { criadoEm: true } } },
  });
  if (e?.encerramento == null) {
    throw new Error(`Exercício ${ano} não está encerrado.`);
  }
  return e.encerramento.criadoEm;
}

/**
 * Resolve as contas de partidas JÁ COMPOSTAS, PRESERVANDO o valor de cada perna.
 *
 * ═══ POR QUE "CADA PERNA COM O SEU VALOR" É UMA REGRA, E NÃO UM DETALHE ═══
 * Enquanto todo lançamento de RP tinha pernas de valor igual, dava para resolver
 * as contas a partir de (valor, roteiro) e carimbar o mesmo valor em todas. Com a
 * RETENÇÃO NA FONTE (M07) isso deixou de valer: o lançamento do pagamento é
 * COMPOSTO — o caixa leva o líquido, as demais pernas o bruto. Um estorno que
 * recarimbasse um valor único em cada perna devolveria ao caixa o BRUTO de um
 * pagamento que só desembolsou o LÍQUIDO.
 */
async function resolverPartidas(
  tx: Tx,
  partidas: readonly Partida[]
): Promise<readonly { contaId: string; tipo: string; subsistema: string; valor: Money }[]> {
  const codigos = [...new Set(partidas.map((p) => p.conta))];
  const contas = await tx.contaPcasp.findMany({
    where: { codigo: { in: codigos } },
    select: { id: true, codigo: true, analitica: true },
  });
  const porCodigo = new Map(contas.map((c) => [c.codigo, c]));

  const inexistentes = codigos.filter((c) => !porCodigo.has(c));
  if (inexistentes.length > 0) {
    throw new Error(
      `Conta(s) inexistente(s) no plano PCASP: ${inexistentes.join(", ")}.`
    );
  }
  const sinteticas = contas.filter((c) => !c.analitica);
  if (sinteticas.length > 0) {
    throw new Error(
      `Conta sintética não recebe partida: ` +
        `${sinteticas.map((c) => c.codigo).join(", ")}.`
    );
  }

  return partidas.map((p) => ({
    contaId: porCodigo.get(p.conta)!.id,
    tipo: p.tipo,
    subsistema: p.subsistema,
    valor: p.valor,
  }));
}

async function criarLancamentoRP(
  tx: Tx,
  l: {
    numeroControle: string;
    data: Date;
    historico: string;
    origemTipo: string;
    origemId: string;
    criadoPor: string;
    /** Já compostas e validadas pelo motor — cada perna com o SEU valor. */
    partidas: readonly Partida[];
  }
): Promise<string> {
  const partidas = await resolverPartidas(tx, l.partidas);

  return lancarNoRazao(tx, {
    numeroControle: l.numeroControle,
    dataTransacao: l.data,
    historico: l.historico,
    origemTipo: l.origemTipo,
    origemId: l.origemId,
    criadoPor: l.criadoPor,
    partidas: partidas.map((p) => ({
      contaId: p.contaId,
      tipo: p.tipo as "DEBITO" | "CREDITO",
      subsistema: p.subsistema as "ORCAMENTARIO" | "PATRIMONIAL" | "CONTROLE",
      valor: p.valor.toFixed(2),
      // fichaId FICA NULO: a partida de RP não pertence à dotação corrente.
    })),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 1) LIQUIDAR RESTOS A PAGAR NÃO PROCESSADOS
// ═══════════════════════════════════════════════════════════════════════════

export async function liquidarRestosAPagar(
  prisma: PrismaClient,
  input: LiquidarRestosInput,
  roteiro: RoteiroContabil
): Promise<{ readonly liquidacaoId: string; readonly lancamentoId: string }> {
  const dados = zLiquidarRestosInput.parse(input);

  return prisma.$transaction(async (tx) => {
    // ⚠️ A UG DO RESTO É A DO EMPENHO QUE O INSCREVEU — é o MESMO dinheiro, de um ano para o outro.
    // Liquidar um resto da Saúde é ato da Saúde: a inscrição herdou o empenho, e o empenho tem a ficha.
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.liquidarRestosAPagar, { empenho: dados.empenhoId });

    const inscricao = await tx.inscricaoRestosAPagar.findFirst({
      where: { empenhoId: dados.empenhoId, tipo: "NAO_PROCESSADO" },
      select: { id: true, valorInscrito: true, exercicioOrigem: true },
    });
    // 4º LOCK da ordem (ver packages/locks): a INSCRIÇÃO. Aqui se decide quanto
    // ainda pode virar despesa — SUM dentro da transação, e sem o lock duas
    // liquidações concorrentes leriam o mesmo saldo e as duas passariam.
    if (inscricao !== null) {
      await travar(tx, "InscricaoRestosAPagar", [inscricao.id]);
    }
    if (inscricao === null) {
      throw new Error(
        `Empenho ${dados.empenhoId} não tem inscrição de RESTOS A PAGAR NÃO ` +
          `PROCESSADOS — não há o que liquidar em RP.`
      );
    }

    const encerradoEm = await encerramentoDe(tx, inscricao.exercicioOrigem);

    // FAIL-CLOSED: o limite sai do SUM real, dentro da transação.
    // `canceladoLiquido` (não o bruto): um cancelamento ESTORNADO devolve o
    // valor ao campo do que ainda pode virar despesa.
    const inscrito = toMoney(inscricao.valorInscrito.toFixed(2));
    const totais = await totaisDaInscricao(tx, inscricao.id);
    const jaLiquidado = await liquidacoesPosInscricao(
      tx,
      dados.empenhoId,
      encerradoEm
    );
    const disponivel = saldoParaLiquidar(
      inscrito,
      totais.canceladoLiquido,
      jaLiquidado
    );

    if (dados.valor.greaterThan(disponivel)) {
      throw new Error(
        `Liquidação de RP excede o saldo não processado: inscrito ` +
          `${inscrito.toFixed(2)}, cancelado ` +
          `${totais.canceladoLiquido.toFixed(2)}, já liquidado ` +
          `${jaLiquidado.toFixed(2)}, disponível ${disponivel.toFixed(2)}, ` +
          `solicitado ${dados.valor.toFixed(2)}.`
      );
    }

    const lancamentoId = await criarLancamentoRP(tx, {
      numeroControle: dados.numero,
      data: dados.data,
      historico: dados.historico,
      origemTipo: "LIQUIDACAO_RP",
      origemId: inscricao.id,
      criadoPor: dados.criadoPor,
      partidas: comporPartidas(dados.valor, roteiro),
    });

    // Reutiliza o model Liquidacao — "é liquidação de RP" é DERIVADO
    // (criada depois do encerramento, num empenho com inscrição NP).
    const liq = await tx.liquidacao.create({
      data: {
        empenhoId: dados.empenhoId,
        numero: dados.numero,
        valor: dados.valor.toFixed(2),
        data: dados.data,
        responsavelAtesto: dados.responsavelAtesto,
        lancamentoId,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });

    // NENHUM MovimentoDotacao. RP não consome dotação.
    return { liquidacaoId: liq.id, lancamentoId };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 2) PAGAR RESTOS A PAGAR
// ═══════════════════════════════════════════════════════════════════════════

export async function pagarRestosAPagar(
  prisma: PrismaClient,
  input: PagarRestosInput,
  roteiro: RoteiroContabil,
  retencoes?: RetencoesDoPagamento
): Promise<{ readonly pagamentoId: string; readonly lancamentoId: string }> {
  const dados = zPagarRestosInput.parse(input);
  const ordem = criarOrdemCronologicaPrisma(prisma);

  // M07 — RETENÇÃO NA FONTE: o resto a pagar também retém (a GPS do INSS sobre um
  // serviço prestado em dezembro não some porque o ano virou). Mesma anatomia do
  // pagamento corrente: o caixa leva o LÍQUIDO, uma perna de passivo por
  // consignação, e TODO o resto — o `Pagamento` e a BAIXA da inscrição — no BRUTO.
  // Baixar a inscrição pelo líquido deixaria o resto a pagar eternamente aberto na
  // parte retida, e o credor apareceria como não pago daquilo que já recebeu.
  //
  // Puro e fail-closed ANTES da transação: retenção inválida nem abre o banco.
  const composto = comporPagamentoComRetencoes({
    valorBruto: dados.valor,
    roteiro,
    ...(retencoes !== undefined
      ? { contaDisponibilidade: retencoes.contaDisponibilidade }
      : {}),
    retencoes: retencoes?.retencoes ?? [],
  });

  return prisma.$transaction(async (tx) => {
    // A UG vem da LIQUIDAÇÃO do resto -> empenho -> ficha. (A retenção do M07 que nasce aqui dentro é
    // perna DESTE ato, e vai nesta autorização — quem paga, retém.)
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.pagarRestosAPagar, { liquidacao: dados.liquidacaoId });

    // 3º LOCK: a LIQUIDAÇÃO (o guard "pago <= liquidado" soma aqui dentro).
    // O 4º (a INSCRIÇÃO) vem logo abaixo, depois de sabermos qual é — a ordem
    // LIQUIDACAO → INSCRICAO é a do packages/locks, e invertê-la é deadlock.
    await travar(tx, "Liquidacao", [dados.liquidacaoId]);

    const liq = await tx.liquidacao.findUnique({
      where: { id: dados.liquidacaoId },
      select: {
        id: true,
        criadoEm: true,
        valor: true,
        estornos: { select: { id: true } },
        empenho: {
          select: {
            id: true,
            ficha: { select: { exercicio: true } },
            inscricoesRestos: {
              select: { id: true, tipo: true, valorInscrito: true, exercicioOrigem: true },
            },
          },
        },
        pagamentos: { select: { id: true, valor: true, estornoDeId: true } },
      },
    });
    if (liq === null) {
      throw new Error(`Liquidação ${dados.liquidacaoId} não encontrada.`);
    }
    if (liq.estornos.length > 0) {
      throw new Error(`Liquidação ${dados.liquidacaoId} está ANULADA.`);
    }

    // GUARD INVERSO: RP só existe depois da virada. Uma liquidação de exercício
    // ABERTO se paga por pagar() do M05 — pagá-la aqui baixaria uma inscrição
    // que não existe, e o pagamento não apareceria na execução do ano corrente.
    const ano = liq.empenho.ficha.exercicio;
    const exercicio = await tx.exercicio.findUnique({
      where: { ano },
      select: { encerramento: { select: { criadoEm: true } } },
    });
    if (exercicio?.encerramento == null) {
      throw new Error(
        `Exercício ${ano} está ABERTO — use pagar() do M05. Restos a pagar só ` +
          `existem depois do encerramento do exercício.`
      );
    }

    const inscricoes = liq.empenho.inscricoesRestos;
    if (inscricoes.length === 0) {
      throw new Error(
        `Empenho ${liq.empenho.id} não tem inscrição de RESTOS A PAGAR — ` +
          `não há resto a pagar para quitar.`
      );
    }

    const encerradoEm = exercicio.encerramento.criadoEm;

    // QUAL inscrição esta liquidação quita?
    //   liquidação criada ANTES do encerramento -> RP PROCESSADO;
    //   criada DEPOIS -> veio da operação 1 -> RP NÃO PROCESSADO.
    // Derivado do fato, nunca de flag.
    const tipoAlvo =
      liq.criadoEm <= encerradoEm ? "PROCESSADO" : "NAO_PROCESSADO";
    const inscricao = inscricoes.find((i) => i.tipo === tipoAlvo);
    // 4º LOCK: a INSCRIÇÃO — o guard "não pagar mais que o saldo do RP" soma
    // logo abaixo.
    if (inscricao !== undefined) {
      await travar(tx, "InscricaoRestosAPagar", [inscricao.id]);
    }
    if (inscricao === undefined) {
      throw new Error(
        `Empenho ${liq.empenho.id} não tem inscrição ${tipoAlvo} — a liquidação ` +
          `${dados.liquidacaoId} não corresponde a nenhum resto a pagar.`
      );
    }

    // TR 5.23 — a fonte do pagamento tem de casar com a da conta bancária.
    const conta = await tx.contaBancaria.findUnique({
      where: { codigo: dados.contaBancaria },
      select: { id: true, codigo: true, fonteId: true },
    });
    if (conta === null) {
      throw new Error(`Conta bancária "${dados.contaBancaria}" não cadastrada.`);
    }
    // ⚠️ "NO ROL", e não "igual à da conta" — a conta admite várias fontes desde o
    // ADR de 2026-09-10. A regra mora em `m05-despesa/guard-fonte.ts`, uma vez.
    await exigirFonteNoRolDaConta(tx, { id: conta.id }, dados.fonteId, "pagamento de restos a pagar");

    // ⚠️ O MESMO GUARD DO `pagar()` DO M05 — e ele TEM de estar aqui, porque o pagamento
    // de RP NÃO passa por lá: este caminho cria o `Pagamento` por conta própria. Fechar
    // só no M05 deixaria o furo inteiro justamente onde a troca de fonte é mais
    // tentadora (o exercício virou, a conta mudou, o RP ficou). Uma função, dois
    // chamadores — nunca duas cópias.
    await exigirFonteDaFicha(tx, dados.liquidacaoId, dados.fonteId);

    // LIMITE 1: não pagar mais do que a liquidação.
    const liquidado = toMoney(liq.valor.toFixed(2));
    const jaPago = somaLiquida(liq.pagamentos);
    if (toMoney(jaPago.plus(dados.valor)).greaterThan(liquidado)) {
      throw new Error(
        `Pagamento excede a liquidação: liquidado ${liquidado.toFixed(2)}, já ` +
          `pago ${jaPago.toFixed(2)}, solicitado ${dados.valor.toFixed(2)}.`
      );
    }

    // LIMITE 2: não pagar mais do que o saldo da INSCRIÇÃO (SUM real, com o
    // sinal de cada tipo — os ESTORNO_* DEVOLVEM saldo).
    const inscrito = toMoney(inscricao.valorInscrito.toFixed(2));
    const baixado = (await totaisDaInscricao(tx, inscricao.id)).baixaLiquida;
    const saldoRP = toMoney(inscrito.minus(baixado));
    if (dados.valor.greaterThan(saldoRP)) {
      throw new Error(
        `Pagamento excede o saldo do resto a pagar ${tipoAlvo}: inscrito ` +
          `${inscrito.toFixed(2)}, já baixado ${baixado.toFixed(2)}, saldo ` +
          `${saldoRP.toFixed(2)}, solicitado ${dados.valor.toFixed(2)}.`
      );
    }

    // ART. 141 — a ordem cronológica vale para RP. Mesma fila, mesma regra,
    // mesma justificativa. Dentro da MESMA transação.
    await ordem.validarOrdemCronologica(
      tx,
      dados.liquidacaoId,
      dados.justificativaQuebraOrdem
    );

    // O lançamento COMPOSTO (sem retenção, são as pernas do roteiro e mais nada).
    const lancamentoId = await criarLancamentoRP(tx, {
      numeroControle: dados.numero,
      data: dados.data,
      historico: dados.historico,
      origemTipo: "PAGAMENTO_RP",
      origemId: inscricao.id,
      criadoPor: dados.criadoPor,
      partidas: composto.partidas,
    });

    const pag = await tx.pagamento.create({
      data: {
        liquidacaoId: dados.liquidacaoId,
        numero: dados.numero,
        // BRUTO — ver a nota da retenção no topo desta função.
        valor: dados.valor.toFixed(2),
        data: dados.data,
        contaBancaria: dados.contaBancaria,
        fonteId: dados.fonteId,
        lancamentoId,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });

    // O razão do RP: a baixa por PAGAMENTO, pelo BRUTO. A obrigação com o credor
    // foi extinta INTEIRA — parte em dinheiro, parte em retenção.
    await tx.movimentoRestosAPagar.create({
      data: {
        inscricaoId: inscricao.id,
        tipo: "PAGAMENTO",
        valor: dados.valor.toFixed(2),
        lancamentoId,
        pagamentoId: pag.id,
        criadoPor: dados.criadoPor,
      },
    });

    // M07 — o razão do consignatário, na MESMA transação.
    if (composto.retencoes.length > 0) {
      await registrarRetencoesDoPagamento(tx, {
        pagamentoId: pag.id,
        lancamentoId,
        contaBancariaId: conta.id,
        data: dados.data,
        historico: dados.historico,
        criadoPor: dados.criadoPor,
        retencoes: composto.retencoes,
      });
    }

    // NENHUM MovimentoDotacao.
    return { pagamentoId: pag.id, lancamentoId };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 3) CANCELAR RESTOS A PAGAR
// ═══════════════════════════════════════════════════════════════════════════

export async function cancelarRestosAPagar(
  prisma: PrismaClient,
  input: CancelarRestosInput,
  roteiro: RoteiroContabil
): Promise<{ readonly movimentoId: string; readonly lancamentoId: string }> {
  const dados = zCancelarRestosInput.parse(input);

  return prisma.$transaction(async (tx) => {
    // A UG vem da INSCRIÇÃO -> empenho -> ficha. Cancelar o resto EXTINGUE uma dívida do ente com o
    // credor — e quem a extingue tem de poder na unidade que a contraiu.
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.cancelarRestosAPagar, { inscricaoRp: dados.inscricaoId });

    // 4º LOCK: a INSCRIÇÃO — o saldo cancelável é somado dentro da transação.
    await travar(tx, "InscricaoRestosAPagar", [dados.inscricaoId]);

    const inscricao = await tx.inscricaoRestosAPagar.findUnique({
      where: { id: dados.inscricaoId },
      select: {
        id: true,
        empenhoId: true,
        tipo: true,
        valorInscrito: true,
        exercicioOrigem: true,
      },
    });
    if (inscricao === null) {
      throw new Error(`Inscrição ${dados.inscricaoId} não encontrada.`);
    }

    const inscrito = toMoney(inscricao.valorInscrito.toFixed(2));
    const totais = await totaisDaInscricao(tx, inscricao.id);

    let cancelavel: Money;
    if (inscricao.tipo === "NAO_PROCESSADO") {
      // Só se cancela o que NÃO virou despesa: a parte já liquidada saiu do
      // campo do "não processado" e agora é obrigação a pagar. Cancelá-la aqui
      // seria apagar uma despesa que já foi reconhecida.
      // `canceladoLiquido`: um cancelamento estornado volta a ser cancelável.
      const encerradoEm = await encerramentoDe(tx, inscricao.exercicioOrigem);
      const jaLiquidado = await liquidacoesPosInscricao(
        tx,
        inscricao.empenhoId,
        encerradoEm
      );
      cancelavel = saldoParaLiquidar(
        inscrito,
        totais.canceladoLiquido,
        jaLiquidado
      );
    } else {
      // PROCESSADO: cancela-se o que ainda não foi pago nem cancelado. Um
      // pagamento (ou cancelamento) estornado volta a ser cancelável — daí a
      // baixa LÍQUIDA.
      cancelavel = toMoney(inscrito.minus(totais.baixaLiquida));
    }

    if (dados.valor.greaterThan(cancelavel)) {
      throw new Error(
        `Cancelamento excede o saldo cancelável da inscrição ` +
          `${inscricao.tipo}: cancelável ${cancelavel.toFixed(2)}, solicitado ` +
          `${dados.valor.toFixed(2)}.` +
          (inscricao.tipo === "NAO_PROCESSADO"
            ? ` A parte já liquidada não é cancelável aqui — ela virou obrigação a pagar.`
            : "")
      );
    }

    const lancamentoId = await criarLancamentoRP(tx, {
      numeroControle: `CANC-${inscricao.id.slice(0, 8)}-${dados.data
        .toISOString()
        .slice(0, 10)}`,
      data: dados.data,
      historico: `Cancelamento de RP ${inscricao.tipo}: ${dados.motivo}`,
      origemTipo: "CANCELAMENTO_RP",
      origemId: inscricao.id,
      criadoPor: dados.criadoPor,
      partidas: comporPartidas(dados.valor, roteiro),
    });

    const mov = await tx.movimentoRestosAPagar.create({
      data: {
        inscricaoId: inscricao.id,
        tipo: "CANCELAMENTO",
        valor: dados.valor.toFixed(2),
        lancamentoId,
        motivo: dados.motivo,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });

    // NENHUM MovimentoDotacao.
    return { movimentoId: mov.id, lancamentoId };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 4) ANULAR PAGAMENTO DE RP — fecha a assimetria do saldo
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Anula um pagamento de RESTOS A PAGAR.
 *
 * ═══ O BUG QUE ISTO FECHA ═══
 * Antes, anular pelo M05 um `Pagamento` que era de RP criava um `Pagamento` de
 * estorno — mas deixava o `MovimentoRestosAPagar(PAGAMENTO)` ÓRFÃO. O saldo da
 * inscrição continuava baixado, e o sistema achava que tinha pago algo que foi
 * desfeito: **saldo de RP errado PARA MENOS**, e o dinheiro "sumia" do resto a
 * pagar sem ter saído do caixa.
 *
 * Agora o M05 REJEITA anular pagamento de RP (guard) e manda usar esta função,
 * que faz as três coisas NA MESMA TRANSAÇÃO:
 *   - `Pagamento` NOVO com `estornoDeId` (append-only — o original é intocado);
 *   - `LancamentoContabil` de estorno, com as pernas invertidas pelo
 *     `gerarEstorno` do M01 (o `uq_estorno_unico` protege a dupla anulação);
 *   - `MovimentoRestosAPagar(ESTORNO_PAGAMENTO)` — o saldo VOLTA pelo SUM.
 */
export async function anularPagamentoRestosAPagar(
  prisma: PrismaClient,
  input: AnularPagamentoRestosInput
): Promise<{
  readonly pagamentoId: string;
  readonly lancamentoId: string;
  readonly movimentoId: string;
}> {
  const dados = zAnularPagamentoRestosInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.anularPagamentoRestosAPagar, { pagamento: dados.pagamentoId });

    const pag = await tx.pagamento.findUnique({
      where: { id: dados.pagamentoId },
      select: {
        id: true,
        liquidacaoId: true,
        valor: true,
        contaBancaria: true,
        fonteId: true,
        lancamentoId: true,
        estornoDeId: true,
        estornos: { select: { id: true } },
        movimentosRestos: {
          select: { id: true, tipo: true, inscricaoId: true, estornos: { select: { id: true } } },
        },
      },
    });
    if (pag === null) {
      throw new Error(`Pagamento ${dados.pagamentoId} não encontrado.`);
    }
    if (pag.estornoDeId !== null) {
      throw new Error(
        `Pagamento ${dados.pagamentoId} JÁ É uma anulação — não se anula uma anulação.`
      );
    }
    if (pag.estornos.length > 0) {
      throw new Error(`Pagamento ${dados.pagamentoId} já foi anulado.`);
    }

    // FAIL-CLOSED: esta função é SÓ para RP. Um pagamento corrente se anula pelo
    // LOCKS, na ordem: LIQUIDAÇÃO (o estorno muda o já-pago dela) e depois a
    // INSCRIÇÃO (o ESTORNO_PAGAMENTO devolve saldo ao RP).
    await travar(tx, "Liquidacao", [pag.liquidacaoId]);

    // M05 — anular aqui criaria um movimento de RP que não existe.
    const movRP = pag.movimentosRestos.find((m) => m.tipo === "PAGAMENTO");
    if (movRP !== undefined) {
      await travar(tx, "InscricaoRestosAPagar", [movRP.inscricaoId]);
    }
    if (movRP === undefined) {
      throw new Error(
        `Pagamento ${dados.pagamentoId} NÃO é de restos a pagar — use a ` +
          `anulação do M05 (anularPagamento).`
      );
    }
    if (movRP.estornos.length > 0) {
      throw new Error(
        `O movimento de RP do pagamento ${dados.pagamentoId} já foi estornado.`
      );
    }

    // Lançamento original -> domínio -> gerarEstorno (motor puro do M01).
    const lancOriginal = await tx.lancamentoContabil.findUniqueOrThrow({
      where: { id: pag.lancamentoId },
      select: {
        id: true,
        numeroControle: true,
        dataTransacao: true,
        historico: true,
        estornoDeId: true,
        estornos: { select: { id: true } },
        partidas: {
          select: {
            tipo: true,
            subsistema: true,
            valor: true,
            conta: { select: { codigo: true } },
          },
        },
      },
    });

    const dominio: LancamentoContabil = {
      id: lancOriginal.id,
      numeroControle: lancOriginal.numeroControle,
      partidas: lancOriginal.partidas.map((p) => ({
        conta: p.conta.codigo,
        tipo: p.tipo,
        subsistema: p.subsistema,
        valor: toMoney(p.valor.toFixed(2)),
      })),
      dataTransacao: lancOriginal.dataTransacao,
      historico: lancOriginal.historico,
      ...(lancOriginal.estornoDeId !== null
        ? { estornoDeId: lancOriginal.estornoDeId }
        : {}),
      estornos: lancOriginal.estornos.map((e) => e.id),
    };

    // O motor puro inverte as pernas e valida o balanceamento por subsistema.
    const estorno = gerarEstorno(dominio, {
      idEstorno: randomUUID(),
      numeroControleEstorno: dados.numero,
      dataEstorno: dados.data,
    });

    // CADA PERNA COM O SEU VALOR — o lançamento pode ser COMPOSTO (M07: caixa no
    // líquido, passivo do consignatário à parte). Recarimbar `pag.valor` em todas
    // devolveria ao caixa o BRUTO de um pagamento que só desembolsou o LÍQUIDO.
    // Trancado por teste: "estorno de lançamento com pernas DESIGUAIS".
    const partidas = await resolverPartidas(tx, estorno.partidas);

    const lancEstornoId = await lancarNoRazao(tx, {
      id: estorno.id,
      numeroControle: dados.numero,
      dataTransacao: dados.data,
      historico: `${estorno.historico} — ${dados.motivo}`,
      origemTipo: "PAGAMENTO_RP_ANULADO",
      origemId: movRP.inscricaoId,
      // uq_estorno_unico (M01) protege a dupla anulação do lançamento.
      estornoDeId: lancOriginal.id,
      criadoPor: dados.criadoPor,
      partidas: partidas.map((p) => ({
        contaId: p.contaId,
        tipo: p.tipo as "DEBITO" | "CREDITO",
        subsistema: p.subsistema as "ORCAMENTARIO" | "PATRIMONIAL" | "CONTROLE",
        valor: p.valor.toFixed(2),
      })),
    });

    // Pagamento NOVO: append-only. uq_estorno_pagamento_unico protege.
    const pagEstorno = await tx.pagamento.create({
      data: {
        liquidacaoId: pag.liquidacaoId,
        numero: dados.numero,
        valor: pag.valor,
        data: dados.data,
        contaBancaria: pag.contaBancaria,
        fonteId: pag.fonteId,
        lancamentoId: lancEstornoId,
        estornoDeId: pag.id,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });

    // O SALDO VOLTA: ESTORNO_PAGAMENTO soma. uq_estorno_mov_rp_unico protege a
    // devolução dupla (senão a inscrição teria mais saldo do que foi inscrita).
    const mov = await tx.movimentoRestosAPagar.create({
      data: {
        inscricaoId: movRP.inscricaoId,
        tipo: "ESTORNO_PAGAMENTO",
        valor: pag.valor,
        lancamentoId: lancEstornoId,
        pagamentoId: pagEstorno.id,
        estornoDeId: movRP.id,
        motivo: dados.motivo,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });

    // M07 — a retenção do pagamento de RP é desfeita JUNTO, na mesma transação.
    // Sem isto, o razão do consignatário continuaria dizendo que o ente deve ao
    // INSS uma retenção de um pagamento que não existe mais — a MESMA assimetria
    // que este arquivo já pagou caro duas vezes (345af7d, 4768cff).
    //
    // E é aqui também que o "repasse já feito" BLOQUEIA a anulação: se o dinheiro
    // do consignatário já saiu, desfazer o ingresso deixaria o saldo dele
    // negativo. Estorne o dispêndio primeiro.
    await estornarRetencoesDoPagamento(tx, {
      pagamentoOriginalId: pag.id,
      lancamentoEstornoId: lancEstornoId,
      data: dados.data,
      motivo: dados.motivo,
      criadoPor: dados.criadoPor,
    });

    // NENHUM MovimentoDotacao — nem na anulação.
    return {
      pagamentoId: pagEstorno.id,
      lancamentoId: lancEstornoId,
      movimentoId: mov.id,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 5) ANULAR CANCELAMENTO DE RP — a assimetria irmã
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Anula um CANCELAMENTO de restos a pagar.
 *
 * ═══ O BUG QUE ISTO FECHA ═══
 * O cancelamento não tinha volta. Um cancelamento feito por engano era
 * IRREVERSÍVEL: a obrigação com o credor ficava extinta no sistema **sem ter sido
 * extinta na vida**. O credor continuava com direito a receber, e o sistema não
 * tinha mais como pagá-lo — o saldo estava zerado.
 *
 * Mesma classe do bug do estorno de pagamento (345af7d), no outro tipo de
 * movimento.
 *
 * Na MESMA transação:
 *   - `MovimentoRestosAPagar(ESTORNO_CANCELAMENTO)` referenciando o cancelamento
 *     original — o saldo VOLTA pelo SUM;
 *   - lançamento de estorno com as pernas invertidas (`gerarEstorno` do M01):
 *     **reverte a variação AUMENTATIVA** do cancelamento — o ganho patrimonial
 *     que o cancelamento tinha registrado deixa de existir, porque a obrigação
 *     voltou.
 */
export async function anularCancelamentoRestosAPagar(
  prisma: PrismaClient,
  input: AnularCancelamentoRestosInput
): Promise<{ readonly movimentoId: string; readonly lancamentoId: string }> {
  const dados = zAnularCancelamentoRestosInput.parse(input);

  return prisma.$transaction(async (tx) => {
    // A UG vem do MOVIMENTO cancelado -> inscrição -> empenho -> ficha.
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.anularCancelamentoRestosAPagar, { movimentoRp: dados.movimentoId });

    const original = await tx.movimentoRestosAPagar.findUnique({
      where: { id: dados.movimentoId },
      select: {
        id: true,
        tipo: true,
        valor: true,
        inscricaoId: true,
        lancamentoId: true,
        estornoDeId: true,
        estornos: { select: { id: true } },
      },
    });
    if (original === null) {
      throw new Error(`Movimento ${dados.movimentoId} não encontrado.`);
    }

    // 4º LOCK: a INSCRIÇÃO — o ESTORNO_CANCELAMENTO devolve saldo a ela.
    await travar(tx, "InscricaoRestosAPagar", [original.inscricaoId]);

    // FAIL-CLOSED: esta função é SÓ para CANCELAMENTO.
    if (original.tipo !== "CANCELAMENTO") {
      throw new Error(
        `Movimento ${dados.movimentoId} é ${original.tipo}, não CANCELAMENTO. ` +
          (original.tipo === "PAGAMENTO"
            ? `Use anularPagamentoRestosAPagar().`
            : `Um estorno não se estorna.`)
      );
    }
    if (original.estornoDeId !== null) {
      throw new Error(`Movimento ${dados.movimentoId} JÁ É um estorno.`);
    }
    if (original.estornos.length > 0) {
      throw new Error(
        `Cancelamento ${dados.movimentoId} já foi anulado.`
      );
    }
    if (original.lancamentoId === null) {
      throw new Error(
        `Cancelamento ${dados.movimentoId} não tem lançamento contábil — não há ` +
          `o que estornar.`
      );
    }

    // Lançamento original -> domínio -> gerarEstorno (motor puro do M01).
    const lancOriginal = await tx.lancamentoContabil.findUniqueOrThrow({
      where: { id: original.lancamentoId },
      select: {
        id: true,
        numeroControle: true,
        dataTransacao: true,
        historico: true,
        estornoDeId: true,
        estornos: { select: { id: true } },
        partidas: {
          select: {
            tipo: true,
            subsistema: true,
            valor: true,
            conta: { select: { codigo: true } },
          },
        },
      },
    });

    const dominio: LancamentoContabil = {
      id: lancOriginal.id,
      numeroControle: lancOriginal.numeroControle,
      partidas: lancOriginal.partidas.map((p) => ({
        conta: p.conta.codigo,
        tipo: p.tipo,
        subsistema: p.subsistema,
        valor: toMoney(p.valor.toFixed(2)),
      })),
      dataTransacao: lancOriginal.dataTransacao,
      historico: lancOriginal.historico,
      ...(lancOriginal.estornoDeId !== null
        ? { estornoDeId: lancOriginal.estornoDeId }
        : {}),
      estornos: lancOriginal.estornos.map((e) => e.id),
    };

    const estorno = gerarEstorno(dominio, {
      idEstorno: randomUUID(),
      numeroControleEstorno: dados.numero,
      dataEstorno: dados.data,
    });

    // Cada perna com o SEU valor (ver `resolverPartidas`).
    const partidas = await resolverPartidas(tx, estorno.partidas);

    const lancEstornoId = await lancarNoRazao(tx, {
      id: estorno.id,
      numeroControle: dados.numero,
      dataTransacao: dados.data,
      historico: `${estorno.historico} — ${dados.motivo}`,
      origemTipo: "CANCELAMENTO_RP_ANULADO",
      origemId: original.inscricaoId,
      // uq_estorno_unico (M01) protege a dupla anulação do lançamento.
      estornoDeId: lancOriginal.id,
      criadoPor: dados.criadoPor,
      partidas: partidas.map((p) => ({
        contaId: p.contaId,
        tipo: p.tipo as "DEBITO" | "CREDITO",
        subsistema: p.subsistema as "ORCAMENTARIO" | "PATRIMONIAL" | "CONTROLE",
        valor: p.valor.toFixed(2),
      })),
    });

    // O SALDO VOLTA. uq_estorno_mov_rp_unico protege a devolução dupla.
    const mov = await tx.movimentoRestosAPagar.create({
      data: {
        inscricaoId: original.inscricaoId,
        tipo: "ESTORNO_CANCELAMENTO",
        valor: original.valor,
        lancamentoId: lancEstornoId,
        estornoDeId: original.id,
        motivo: dados.motivo,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });

    // NENHUM MovimentoDotacao.
    return { movimentoId: mov.id, lancamentoId: lancEstornoId };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Consulta
// ═══════════════════════════════════════════════════════════════════════════

export interface SaldoRP {
  readonly inscricaoId: string;
  readonly empenhoId: string;
  readonly tipo: "PROCESSADO" | "NAO_PROCESSADO";
  readonly exercicioOrigem: number;
  readonly valorInscrito: Money;
  /** Pago BRUTO (soma dos PAGAMENTO). */
  readonly pago: Money;
  /** Soma dos ESTORNO_PAGAMENTO — devolve saldo. */
  readonly estornado: Money;
  /** pago − estornado. O que de fato saiu do caixa. */
  readonly pagoLiquido: Money;
  /** Cancelado BRUTO (soma dos CANCELAMENTO). */
  readonly cancelado: Money;
  /** Soma dos ESTORNO_CANCELAMENTO — devolve saldo. */
  readonly estornoCancelamento: Money;
  /** cancelado − estornoCancelamento. A obrigação que de fato morreu. */
  readonly canceladoLiquido: Money;
  /** valorInscrito − pagoLiquido − canceladoLiquido. Sempre por SUM. */
  readonly saldo: Money;
}

export async function saldoDosRestos(
  prisma: PrismaClient,
  inscricaoId: string
): Promise<SaldoRP> {
  const i = await prisma.inscricaoRestosAPagar.findUniqueOrThrow({
    where: { id: inscricaoId },
    select: {
      id: true,
      empenhoId: true,
      tipo: true,
      exercicioOrigem: true,
      valorInscrito: true,
    },
  });

  const t = await totaisDaInscricao(prisma, inscricaoId);
  const inscrito = toMoney(i.valorInscrito.toFixed(2));

  return {
    inscricaoId: i.id,
    empenhoId: i.empenhoId,
    tipo: i.tipo,
    exercicioOrigem: i.exercicioOrigem,
    valorInscrito: inscrito,
    pago: t.pago,
    estornado: t.estornoPagamento,
    pagoLiquido: t.pagoLiquido,
    cancelado: t.cancelado,
    estornoCancelamento: t.estornoCancelamento,
    canceladoLiquido: t.canceladoLiquido,
    saldo: toMoney(inscrito.minus(t.baixaLiquida)),
  };
}
