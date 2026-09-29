import {
  serializar,
  toMoney,
  type Dinheiro,
  type Money,
} from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
// A APURAÇÃO DE CAIXA É DO M01 — a MESMA função do Anexo 13 (M12), com outro
// recorte. Uma aritmética, muitos recortes.
import { saldoDasContas, somasPorContaELancamento } from "../m01-core-contabil/adapter-prisma.js";
import {
  comSinalDaNatureza,
  comSinalDoSentido,
  saldoDoExtrato,
  type NaturezaExtratoDb,
  type TipoInternoConciliacao,
} from "./dominio.js";
// ⚠️ A FONTE ÚNICA dos fatos que moveram a conta — ver o cabeçalho de `caixa.ts`.
import { fatosDeCaixaDaConta, lancamentosDaContaBancaria, type ContaParaCaixa, type LancamentosDaConta } from "./caixa.js";
import {
  vinculoLiquidoDoLancamento,
  vinculoLiquidoDoMovimento,
} from "./vinculo.js";

/**
 * CONCILIAÇÃO BANCÁRIA (M09, bloco 3) — LEITURA PURA.
 *
 * Zero escrita, zero tabela nova, NENHUMA coluna cache. Todo número sai de SUM
 * com os Records de sinal (`SINAL_NATUREZA_EXTRATO`, `SINAL_VINCULO`,
 * `SINAL_MOVIMENTO_EXTRA`) — as mesmas regras do M12.
 *
 * ═══ A PERGUNTA QUE ELE RESPONDE ═══
 * "O banco e o razão contam a mesma história? Se não, ONDE exatamente eles
 * divergem?" — e a resposta não pode ser um número solto: tem de vir com as
 * LINHAS que compõem cada diferença.
 *
 * ═══ O CORTE É O MESMO NOS DOIS LADOS, E É A DATA DO FATO ═══
 * Extrato: `dataPostagem`. Contábil: `dataTransacao` do lançamento. Interno: a
 * data do próprio fato (pagamento, arrecadação, movimento extra).
 *
 * Não é `criadoEm`: comparar um lado pela data do FATO e o outro pela data da
 * DIGITAÇÃO faria os dois nunca fecharem — um pagamento de janeiro digitado em
 * março sumiria do razão de janeiro, mas não do extrato.
 *
 * ═══ A AMARRAÇÃO ═══
 *   saldoExtrato − saldoContabil == Σresidual(extrato) − Σresidual(interno)
 *
 * Ela é uma IDENTIDADE, e é por isso que vale: cada vínculo aparece dos DOIS
 * lados com o MESMO valor e o MESMO sinal (o guard de natureza garante que
 * CREDITO só casa com ENTRADA e DEBITO com SAÍDA), então os vínculos se cancelam
 * e sobra exatamente a diferença de saldos. Se ela não fechar, ou falta um fato
 * no relatório, ou há vínculo cruzando o corte — e o relatório NÃO SAI.
 */

export interface LinhaDiferenca {
  readonly id: string;
  readonly data: Date;
  readonly descricao: string;
  /** RESIDUAL COM SINAL: positivo = entrou, negativo = saiu. */
  readonly residual: Dinheiro;
}

export interface LinhaDiferencaInterna extends LinhaDiferenca {
  readonly tipoInterno: TipoInternoConciliacao;
}

export interface ConciliacaoBancaria {
  readonly relatorio: "CONCILIAÇÃO BANCÁRIA";
  readonly contaBancaria: {
    readonly id: string;
    readonly codigo: string;
    readonly contaContabil: string;
  };
  readonly corte: Date;
  /** Σ (valor × sinal da natureza) das linhas do extrato até o corte. */
  readonly saldoExtrato: Dinheiro;
  /** ΣD − ΣC das partidas na conta contábil até o corte. */
  readonly saldoContabil: Dinheiro;
  /** saldoExtrato − saldoContabil. Zero = os dois contam a mesma história. */
  readonly diferenca: Dinheiro;
  /** No BANCO e não no razão (tarifa não contabilizada, crédito não registrado). */
  readonly noExtratoSemVinculo: readonly LinhaDiferenca[];
  /** No RAZÃO e não no banco (cheque não compensado, depósito não creditado). */
  readonly internoSemVinculo: readonly LinhaDiferencaInterna[];
  /** V6 P1.2 — guias da fonte sem conta bancária (legado), fora da identidade, para o tesoureiro resolver. */
  readonly arrecadacoesSemConta: readonly ArrecadacaoSemConta[];
  /**
   * V22 rodada 7 — quando a conta contábil é de MAIS DE UMA conta bancária: os lançamentos nela que
   * não pertencem a fato de conta bancária nenhuma (um ajuste manual, uma abertura de saldo). Fora
   * da identidade — não se sabe de qual conta são —, listados para o contador resolver.
   * Vazio quando a contábil é de uma conta só (aí tudo nela é desta conta).
   */
  readonly lancamentosSemContaBancaria: readonly LancamentoSemContaBancaria[];
  /** V22 rodada 7 — os vínculos contados são os gravados até este instante (padrão: o corte). */
  readonly conhecimento: Date;
}

/** V22 rodada 7 — um lançamento na contábil compartilhada sem fato de conta bancária que o explique. */
export interface LancamentoSemContaBancaria {
  readonly lancamentoId: string;
  /** ΣD − ΣC dele na contábil. */
  readonly valor: Dinheiro;
}

/**
 * ⚠️ V4 (§10): A CONCILIAÇÃO QUE NÃO FECHA É UM ESTADO, NÃO UM 500. A identidade (diferença
 * entre saldos == soma das linhas sem vínculo) é o tripwire auto-executável deste relatório —
 * e ele acusou, sob o banco dos percursos, uma conta cuja FONTE tem arrecadação sem conta
 * bancária (a pendência do M04 registrada no MODULO.md). A tela do período deixava a exceção
 * subir e o Next devolvia 500 — escondendo a única informação útil: quanto sobra sem
 * explicação e por quê. Erro TIPADO para a tela poder dizer isso.
 */
/** V6 P1.2 — uma arrecadação da fonte da conta SEM conta bancária declarada nem atribuída. */
export interface ArrecadacaoSemConta {
  readonly id: string;
  readonly numeroReceita: string;
  readonly data: Date;
  readonly valor: string;
  readonly fonteCodigo: string;
  /** A conta contábil que a guia DEBITOU no razão — o tesoureiro compara com a da conta bancária. */
  readonly contaContabilDebitada: string | null;
}

export class ConciliacaoNaoFechaError extends Error {
  /** V6 P1.2 — o que pode explicar a diferença: guias do legado sem conta, para o tesoureiro resolver. */
  readonly arrecadacoesSemConta: readonly ArrecadacaoSemConta[];
  constructor(readonly contaBancariaId: string, mensagem: string, arrecadacoesSemConta: readonly ArrecadacaoSemConta[] = []) {
    super(mensagem);
    this.name = "ConciliacaoNaoFechaError";
    this.arrecadacoesSemConta = arrecadacoesSemConta;
  }
}

/**
 * AS GUIAS DA FONTE DESTA CONTA QUE NÃO DIZEM EM QUE CONTA ENTRARAM (legado ou importação) —
 * informativas: ficam FORA da identidade até o tesoureiro atribuir a conta (ato conferido contra o
 * razão) ou justificar. Cada uma traz a conta contábil que debitou, para a comparação ser possível.
 */
export async function arrecadacoesSemContaDaFonte(
  prisma: PrismaClient,
  fonteId: string,
  corte: Date
): Promise<readonly ArrecadacaoSemConta[]> {
  const guias = await prisma.receitaArrecadada.findMany({
    where: { fonteId, tipo: "ARRECADACAO", contaBancariaId: null, atribuicaoDeConta: null, dataArrecadacao: { lte: corte }, estornoDeId: null, estornos: { none: {} } },
    orderBy: { dataArrecadacao: "asc" },
    select: {
      id: true, numeroReceita: true, dataArrecadacao: true, valor: true,
      fonte: { select: { codigo: true } },
      lancamento: { select: { partidas: { where: { tipo: "DEBITO", subsistema: "PATRIMONIAL" }, select: { conta: { select: { codigo: true } } } } } },
    },
  });
  return guias.map((g) => ({
    id: g.id, numeroReceita: g.numeroReceita, data: g.dataArrecadacao, valor: g.valor.toFixed(2), fonteCodigo: g.fonte.codigo,
    contaContabilDebitada: g.lancamento.partidas[0]?.conta.codigo ?? null,
  }));
}

export class MapeamentoContabilAusenteError extends Error {
  constructor(readonly contaBancariaId: string, codigo: string) {
    super(
      `A conta bancária "${codigo}" não tem CONTA CONTÁBIL mapeada ` +
        `(contaContabilId). Sem esse mapeamento é impossível dizer contra qual ` +
        `conta do razão o extrato deve fechar — e conciliar contra a conta errada ` +
        `é pior do que não conciliar. Parametrize o mapeamento antes de emitir a ` +
        `conciliação.`
    );
    this.name = "MapeamentoContabilAusenteError";
  }
}

const zero = () => toMoney("0.00");
const soma = (a: Money, b: Money) => toMoney(a.plus(b));
const sub = (a: Money, b: Money) => toMoney(a.minus(b));

/**
 * @param corte a DATA DO FATO: extrato, razão e fatos internos até ela.
 * @param opcoes.conhecimento a DATA DO CONHECIMENTO: os vínculos gravados até ela contam. Padrão: o
 *   próprio corte — "como estava em D", que é o que a conciliação por período (encerrada) precisa
 *   para continuar reproduzível. O painel ao vivo passa "agora": a conciliação sempre se faz DEPOIS
 *   do fim do extrato, e com o conhecimento no corte nenhum vínculo feito depois aparecia.
 *   ⚠️ A identidade continua exata: cada vínculo desconta o MESMO valor dos dois lados.
 */
export async function conciliacaoBancaria(
  prisma: PrismaClient,
  contaBancariaId: string,
  corte: Date,
  opcoes: { readonly conhecimento?: Date } = {}
): Promise<ConciliacaoBancaria> {
  const conhecimento = opcoes.conhecimento ?? corte;
  if (conhecimento.getTime() < corte.getTime()) {
    throw new Error("A data do conhecimento dos vínculos não pode ser anterior ao corte dos fatos.");
  }
  const conta = await prisma.contaBancaria.findUnique({
    where: { id: contaBancariaId },
    select: {
      id: true,
      codigo: true,
      fonteId: true,
      // ⚠️ O ID, e não só o código: é por ele que se acham as OUTRAS contas bancárias da
      // mesma contábil, e aí o lado contábil passa a ser atribuído por conta (V22 rodada 7).
      contaContabilId: true,
      contaContabil: { select: { codigo: true } },
    },
  });
  if (conta === null) {
    throw new Error(`Conta bancária ${contaBancariaId} não cadastrada.`);
  }
  // FAIL-CLOSED: sem mapeamento não há contra o que fechar.
  if (conta.contaContabil === null || conta.contaContabilId === null) {
    throw new MapeamentoContabilAusenteError(contaBancariaId, conta.codigo);
  }
  const contaContabil = conta.contaContabil.codigo;

  // ── (a) SALDO DO EXTRATO — SUM via SINAL_NATUREZA_EXTRATO ────────────────
  const linhasExtrato = await prisma.lancamentoExtrato.findMany({
    where: { contaBancariaId: conta.id, dataPostagem: { lte: corte } },
    select: {
      id: true,
      fitid: true,
      memo: true,
      dataPostagem: true,
      natureza: true,
      valor: true,
    },
    orderBy: { dataPostagem: "asc" },
  });

  const saldoExtrato = saldoDoExtrato(
    linhasExtrato.map((l) => ({
      natureza: l.natureza,
      valor: toMoney(l.valor.toFixed(2)),
    }))
  );

  // ── (b) SALDO CONTÁBIL — a MESMA apuração do Anexo 13, outro recorte ─────
  const { saldoContabil, lancamentosSemContaBancaria } = await saldoContabilDaConta(prisma, { id: conta.id, codigo: conta.codigo, contaContabilId: conta.contaContabilId }, contaContabil, corte);

  // ── (c) DIFERENÇAS NOMEADAS ──────────────────────────────────────────────
  const noExtratoSemVinculo: LinhaDiferenca[] = [];
  for (const l of linhasExtrato) {
    const valor = toMoney(l.valor.toFixed(2));
    // O vínculo também respeita o corte: um vínculo feito depois não pode
    // explicar retroativamente uma linha que, naquela data, estava em aberto.
    const vinculado = await vinculoLiquidoDoLancamento(prisma, l.id, conhecimento);
    const residual = sub(valor, vinculado);
    if (residual.greaterThan(0)) {
      noExtratoSemVinculo.push({
        id: l.id,
        data: l.dataPostagem,
        descricao: `[${l.natureza}] ${l.memo} (FITID ${l.fitid})`,
        residual: serializar(comSinalDaNatureza(l.natureza, residual)),
      });
    }
  }

  const internoSemVinculo = await residuaisInternos(prisma, conta, corte, conhecimento);

  // ── (c2) O LEGADO SEM CONTA (V6 P1.2) — informativo, fora da identidade ──────
  const arrecadacoesSemConta = await arrecadacoesSemContaDaFonte(prisma, conta.fonteId, corte);

  // ── (d) A AMARRAÇÃO — auto-executável ────────────────────────────────────
  const diferenca = sub(saldoExtrato, saldoContabil);

  const somaResiduais = (linhas: readonly LinhaDiferenca[]): Money =>
    linhas.reduce((acc, l) => soma(acc, toMoney(l.residual)), zero());

  const explicado = sub(
    somaResiduais(noExtratoSemVinculo),
    somaResiduais(internoSemVinculo)
  );

  if (!diferenca.equals(explicado)) {
    throw new ConciliacaoNaoFechaError(
      conta.id,
      `CONCILIAÇÃO NÃO FECHA (conta ${conta.codigo}): a diferença entre os ` +
        `saldos é ${serializar(diferenca)} (extrato ${serializar(saldoExtrato)} ` +
        `− contábil ${serializar(saldoContabil)}), mas as linhas sem vínculo ` +
        `explicam ${serializar(explicado)} — sobram ` +
        `${serializar(sub(diferenca, explicado))} SEM EXPLICAÇÃO. Ou falta um ` +
        `fato no relatório, ou há vínculo cruzando a data de corte. A ` +
        `conciliação não sai enquanto a diferença não estiver toda nomeada.` +
        (arrecadacoesSemConta.length > 0
          ? ` Há ${arrecadacoesSemConta.length} arrecadação(ões) da fonte desta conta SEM conta bancária declarada — se o razão ` +
            `delas debitou a conta contábil ${contaContabil}, atribua a conta; se debitou outra, a escrituração é de outra conta.`
          : ""),
      arrecadacoesSemConta
    );
  }

  return {
    relatorio: "CONCILIAÇÃO BANCÁRIA",
    contaBancaria: { id: conta.id, codigo: conta.codigo, contaContabil },
    corte,
    saldoExtrato: serializar(saldoExtrato),
    saldoContabil: serializar(saldoContabil),
    diferenca: serializar(diferenca),
    noExtratoSemVinculo,
    internoSemVinculo,
    arrecadacoesSemConta,
    lancamentosSemContaBancaria,
    conhecimento,
  };
}

/**
 * O LADO CONTÁBIL DA CONTA BANCÁRIA — V22 rodada 7.
 *
 * Contábil de UMA conta bancária (o caso comum): o saldo dela inteira, exatamente como antes.
 * Contábil COMPARTILHADA (o plano oficial do TCE-PB tem uma analítica de movimento para todas): só
 * os lançamentos dos fatos DESTA conta (`lancamentosDaContaBancaria`), na mesma aritmética ΣD − ΣC,
 * com a data do FATO. O que na contábil não é de conta nenhuma volta nomeado, fora da identidade.
 */
async function saldoContabilDaConta(
  prisma: PrismaClient,
  conta: { readonly id: string; readonly codigo: string; readonly contaContabilId: string },
  contaContabil: string,
  corte: Date
): Promise<{ saldoContabil: Money; lancamentosSemContaBancaria: LancamentoSemContaBancaria[] }> {
  const irmas = await prisma.contaBancaria.findMany({ where: { contaContabilId: conta.contaContabilId }, select: { id: true, codigo: true } });
  if (irmas.length <= 1) {
    // A data do FATO — ver a nota do corte, no topo.
    return { saldoContabil: await saldoDasContas(prisma, [contaContabil], corte, "dataTransacao"), lancamentosSemContaBancaria: [] };
  }

  const porLancamento = await somasPorContaELancamento(prisma, { codigos: [contaContabil], ate: corte, campoData: "dataTransacao" });
  const atribuidos = await Promise.all(irmas.map((c) => lancamentosDaContaBancaria(prisma, c)));
  const daqui = atribuidos[irmas.findIndex((c) => c.id === conta.id)]!;

  /** A parte (ΣD, ΣC) de um lançamento que pertence a um conjunto de lançamentos da conta. */
  const parte = (l: LancamentosDaConta, id: string, debito: Money, credito: Money): { d: Money; c: Money } =>
    l.inteiros.has(id)
      ? { d: debito, c: credito }
      : { d: l.soDebito.has(id) ? debito : zero(), c: l.soCredito.has(id) ? credito : zero() };

  let saldo = zero();
  const sem: LancamentoSemContaBancaria[] = [];
  for (const s of porLancamento) {
    const minha = parte(daqui, s.lancamentoId, s.debito, s.credito);
    saldo = soma(saldo, sub(minha.d, minha.c));
    // O que NENHUMA conta reclama deste lançamento.
    let d = s.debito;
    let c = s.credito;
    for (const l of atribuidos) {
      const p = parte(l, s.lancamentoId, s.debito, s.credito);
      d = sub(d, p.d);
      c = sub(c, p.c);
    }
    // um lançamento reclamado inteiro por uma conta e só por uma perna por outra não fica negativo:
    // o que sobra é o que ninguém reclama (quando todas reclamam tudo, sobra zero ou menos).
    const resto = sub(d.greaterThan(0) ? d : zero(), c.greaterThan(0) ? c : zero());
    if (!resto.isZero()) sem.push({ lancamentoId: s.lancamentoId, valor: serializar(resto) });
  }
  return { saldoContabil: saldo, lancamentosSemContaBancaria: sem };
}

// ═══════════════════════════════════════════════════════════════════════════
// O LADO INTERNO — agora uma CASCA sobre `caixa.ts`.
//
// ⚠️ A ENUMERAÇÃO SAIU DAQUI, E A SAÍDA FOI O PONTO. Ela vivia neste arquivo e era a
// única resposta para "que fatos moveram esta conta?". Quando a movimentação bancária
// (TR 5.62) precisou da mesma resposta para perguntar "há saldo?", escrever uma segunda
// consulta teria criado um segundo caminho para os mesmos fatos — e o sintoma seria o
// pior possível: o guard de saldo aprovando um saque que a conciliação, minutos depois,
// mostraria como impossível.
//
// O que sobrou aqui é o que é EXCLUSIVO da conciliação: descontar do fato o que já foi
// vinculado, e ficar só com o residual. O saldo não desconta vínculo nenhum — vínculo
// não move dinheiro, só explica.
// ═══════════════════════════════════════════════════════════════════════════

async function residuaisInternos(
  prisma: PrismaClient,
  conta: ContaParaCaixa,
  corte: Date,
  conhecimento: Date
): Promise<readonly LinhaDiferencaInterna[]> {
  const fatos = await fatosDeCaixaDaConta(prisma, conta, corte);

  const linhas: LinhaDiferencaInterna[] = [];
  for (const f of fatos) {
    // O vínculo também respeita o corte: um vínculo feito depois não pode explicar
    // retroativamente um fato que, naquela data, estava em aberto.
    const vinculado = await vinculoLiquidoDoMovimento(
      prisma,
      f.tipoInterno,
      f.id,
      conhecimento
    );
    const residual = sub(f.teto, vinculado);
    if (residual.greaterThan(0)) {
      linhas.push({
        tipoInterno: f.tipoInterno,
        id: f.id,
        data: f.data,
        descricao: f.descricao,
        residual: serializar(comSinalDoSentido(f.sentido, residual)),
      });
    }
  }
  return linhas;
}

/** A natureza usada no relatório — reexportada para quem consome a estrutura. */
export type { NaturezaExtratoDb };
