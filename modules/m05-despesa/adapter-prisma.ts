import { criarAutorizacaoPortPrisma } from "../m16-travamento/porta.js";
import { inverterControleDoFato } from "../m08-restos-a-pagar/controle-dos-restos.js";
import { elementoDebitaEstoque } from "../m01-core-contabil/roteiros.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { travar } from "../../packages/locks/index.js";
import { somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import { normalizarDocumento } from "../../packages/documento/index.js";
import type { LancamentoContabil, Partida } from "../../packages/ledger/index.js";
import {
  criarContaRepositoryPrisma,
  idsUuid,
} from "../m01-core-contabil/adapter-prisma.js";
// M05 -> M06 (nunca o inverso): o pagamento é que tem de respeitar a ordem.
import { criarOrdemCronologicaPrisma } from "../m06-ordem-cronologica/adapter-prisma.js";
// Guard de exercício (M08). Fica num arquivo isolado justamente para não criar
// o ciclo M05 -> M08 -> M05.
import {
  exigirCompetenciaEmExercicioAberto,
  exigirExercicioDaFichaAberto,
} from "../m08-restos-a-pagar/guard-exercicio.js";
import { registrarMovimentoDotacao } from "./dotacao-razao.js";
import { exigirFonteDaFicha, exigirFonteNoRolDaConta } from "./guard-fonte.js";
import { exigirCotaCmd } from "./guard-cmd.js";
import {
  exigirAnulacaoDePagamentoCorrente,
  exigirLiquidacaoCorrente,
  exigirPagamentoCorrente,
} from "../m08-restos-a-pagar/guard-restos.js";
// M07 — a retenção na fonte nasce e morre DENTRO da transação do pagamento.
// Arquivo isolado, como os guards do M08: o M07 não conhece o M05.
import {
  estornarRetencoesDoPagamento,
  registrarRetencoesDoPagamento,
  registrarCalculosDaRetencao,
} from "../m07-extraorcamentario/retencao.js";
// V26 — a receita das retenções próprias do Tesouro nasce e morre na transação do pagamento.
import {
  anularReceitasPorRetencaoNaTx,
  registrarReceitasPorRetencaoNaTx,
} from "../m04-receita/receita-por-retencao.js";
import { irDaFolhaPendente } from "../m33-folha/ir-da-folha.js";
import { exigirERegistrarDescontosDaFolhaNaTx } from "../m33-folha/descontos-da-folha.js";
// A derivação de "é despesa de capital?" é do M10 — reusada, nunca recopiada.
import {
  descricaoDoGrupo,
  ehGrupoDeCapital,
} from "../m10-patrimonial/dominio.js";
// M11 (TR 4.50) — o rol FECHADO dos elementos que SÃO obra. Reusado, nunca recopiado:
// derivar "é obra?" por texto pegaria o elemento 37 ("Locação de Mão-de-Obra").
import { ELEMENTOS_DE_OBRA } from "../m11-licitacoes/obras.js";
// T07 — o guard da ordem de pagamento. Ele NÃO abre transação: roda dentro desta.
import { exigirOrdemAutorizada } from "./ordem-pagamento.js";
import { exigirSolicitacaoParaEmpenho } from "./solicitacao-de-empenho.js";
// ⚠️ O FUNIL DO RAZÃO (M01). Todo lançamento passa por ele — e é lá que mora o
// travamento de competência (M16). Ver `m01-funil.test.ts`: o grep-teste proíbe o
// `lancamentoContabil.create` fora dele.
import { lancarNoRazao } from "../m01-core-contabil/razao.js";
import { exigirMedicaoAprovadaDaObra } from "../m11-licitacoes/medicoes.js";
import { conferirParcelasDaLiquidacao, gravarAlocacoesDaLiquidacao } from "../m11-licitacoes/parcelas-da-liquidacao.js";
import {
  baixarPrecatorioNoPagamento,
  exigirOrdemDoArt100,
} from "../m29-precatorios/servico.js";
import { anoCivil, diaCivil, diaCivilBr } from "../../packages/datas/index.js";
import { exigirUsoDoNumero } from "./numerador.js";
import { exigirSaldoNaData, exigirSaldoNaDataDoEmpenho } from "./saldo-na-data.js";
import { conferirSubempenhoDaLiquidacao, quadroDoEmpenhoRepartido, reais as reaisDoAdapter } from "./subempenho-saldo.js";
import type { Tx as TxDoRazao } from "../m01-core-contabil/razao.js";
// M10 — a dívida. A amortização nasce DENTRO do pagamento e morre com ele.
import {
  amortizarNoPagamento,
  estornarAmortizacaoDoPagamento,
} from "../m10-patrimonial/divida.js";
import {
  calcularSaldos,
  type CategoriaOrdemCronologica,
  type CorteTemporal,
  type SaldosFicha,
  type TipoMovimentoDotacao,
  type TotaisPorTipo,
} from "./dominio.js";
import type {
  AnularEmpenhoParams,
  AoAnularLiquidacaoPort,
  AoLiquidarMaterialPort,
  ContratoPort,
  DespesaRepositoryPort,
  EmpenharParams,
  EmpenhoResumo,
  LancamentoDaDespesa,
  LiberarReservaParams,
  M05Deps,
  ReservarParams,
} from "./ports.js";

/**
 * ADAPTERS do M05 — a única camada que conhece Prisma.
 *
 * ═══ A REGRA CRÍTICA (INVARIANTE 3) ═══
 * As colunas de saldo da ficha NUNCA são escritas com `saldo = saldo ± valor`.
 * Elas são SEMPRE recalculadas a partir do `SUM(MovimentoDotacao)`, dentro da
 * mesma transação que insere o movimento. Um UPDATE cego perde a corrida entre
 * duas transações concorrentes e o saldo derrapa em silêncio — que é como
 * sistema de orçamento estoura dotação sem ninguém ver.
 *
 * ═══ E A OUTRA (INVARIANTE 5) ═══
 * A checagem "tem saldo?" lê o SUM REAL, não a coluna cache. Confiar no cache
 * para autorizar empenho seria confiar num número que, por definição, pode
 * estar sujo.
 */

/** Qualquer coisa que fale Prisma: o client ou uma transação dele. */
export type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/**
 * ⚠️ O LOCK PESSIMISTA DA FICHA — leia antes de mexer em qualquer saldo.
 *
 * ═══ O BUG QUE ELE MATA ═══
 * Todo consumo de dotação segue o mesmo desenho: SOMA o razão (`totaisPorTipo`),
 * DECIDE (`exigirSaldo`), GRAVA. Sob READ COMMITTED — o default do Postgres — duas
 * transações concorrentes leem o razão no MESMO estado (cada uma enxerga o que
 * estava commitado quando ELA começou), as duas veem disponível, e as DUAS gravam.
 * Nenhum guard errou; o saldo estourou.
 *
 * A ficha carregava exatamente a corrida que o contrato carregava (fechada em
 * e0e7e9f). Só que a do contrato foi declarada e esta ficou escondida atrás de um
 * `if` que parecia bastar.
 *
 * ═══ O QUE O LOCK FAZ, E O QUE ELE NÃO FAZ ═══
 * `SELECT ... FOR UPDATE` trava a LINHA da ficha até o commit. A segunda transação
 * BLOQUEIA no lock, e só então soma — já enxergando a primeira. O lock protege a
 * LEITURA QUE DECIDE; ele NÃO muda a aritmética (o saldo continua saindo do SUM,
 * nunca do cache) e NÃO muda resultado nenhum em execução serial. É por isso que os
 * 588 testes seguem verdes sem uma expectativa editada.
 *
 * ⚠️ TEM DE VIR ANTES DA SOMA. Travar depois de somar é travar um número velho.
 *
 * ═══ A ORDEM DE AQUISIÇÃO — A ÚNICA, E ELA VALE PARA O REPOSITÓRIO INTEIRO ═══
 *
 *      FICHA(S) → CONTRATO → LIQUIDAÇÃO → INSCRIÇÃO DE RP → DÍVIDA
 *
 * Duas transações que travam os mesmos recursos em ordens DIFERENTES se abraçam e
 * morrem (deadlock). Então a ordem é UMA:
 *   1) as FICHAS, sempre ORDENADAS POR ID (o M03 toca várias num decreto só — sem
 *      a ordenação, dois decretos com as mesmas fichas em ordens diferentes
 *      deadlockariam);
 *   2) o CONTRATO (M11), dentro de `guardsDoContrato`;
 *   3) a LIQUIDAÇÃO (`travarLiquidacoes`) — o `pagar()` decide "pago <= liquidado"
 *      somando dentro da transação, e sem o lock dois pagamentos concorrentes leem
 *      o mesmo já-pago e os dois passam;
 *   4) a INSCRIÇÃO de restos a pagar (M08), que o `pagarRestosAPagar` trava DEPOIS
 *      da liquidação — ele decide sobre as duas;
 *   5) a DÍVIDA (M10), a última, porque é a última a ser tocada no pagamento.
 *
 * Quem tocar dois recursos, trava NESTA ordem. Nenhum caminho do repositório
 * adquire em ordem diversa — e nada deve passar a adquirir.
 */
export async function travarFichas(
  tx: Tx,
  fichaIds: readonly string[]
): Promise<void> {
  await travar(tx, "FichaOrcamentaria", fichaIds);
}

/**
 * O LOCK DA LIQUIDAÇÃO — 3º da ordem.
 *
 * O `pagar()` soma o já-pago (`pagoLiquido`) e decide se o novo pagamento cabe.
 * Sob READ COMMITTED, dois pagamentos concorrentes de 600 contra uma liquidação de
 * 1.000 leem o MESMO já-pago (zero), os dois veem que cabem, e os dois gravam:
 * 1.200 pagos sobre 1.000 liquidados. Nenhum guard errou.
 *
 * Trava a LINHA da liquidação — e é a mesma porta para TODO caminho que decide
 * sobre o saldo dela: `pagar`, `anularLiquidacao` ("já tem pagamento?"),
 * `anularPagamento` e o `pagarRestosAPagar`/`anularPagamentoRestosAPagar` do M08.
 */
export async function travarLiquidacoes(
  tx: Tx,
  liquidacaoIds: readonly string[]
): Promise<void> {
  await travar(tx, "Liquidacao", liquidacaoIds);
}

/**
 * GROUP BY tipo -> total. É o SUM REAL, a fonte da verdade.
 *
 * ⚠️ O CORTE É OBRIGATÓRIO — ver `CorteTemporal` no domínio. Antes de 2026-09-10 esta
 * função somava TUDO e o chamador não tinha como pedir outra coisa; hoje ela exige que
 * o eixo seja declarado, porque somar tudo é uma das três respostas possíveis e não a
 * única.
 */
export async function totaisPorTipo(
  tx: Tx,
  fichaId: string,
  corte: CorteTemporal
): Promise<TotaisPorTipo> {
  // ⚠️ `lte` E NÃO `lt`: "até 30/06" inclui 30/06. Com `lt`, o ato do próprio dia do
  // fechamento ficaria de fora do demonstrativo daquele dia.
  const where =
    corte.eixo === "CORRENTE"
      ? { fichaId }
      : corte.eixo === "COMPETENCIA"
        ? { fichaId, competencia: { lte: corte.ate } }
        : { fichaId, criadoEm: { lte: corte.ate } };

  const linhas = await tx.movimentoDotacao.groupBy({
    by: ["tipo"],
    where,
    _sum: { valor: true },
  });

  const totais: Partial<Record<TipoMovimentoDotacao, Money>> = {};
  for (const l of linhas) {
    totais[l.tipo] = toMoney(l._sum.valor?.toFixed(2) ?? "0.00");
  }
  return totais;
}

/**
 * NO-OP DEFENSIVO, FAIL-CLOSED.
 *
 * Esta função JÁ NÃO CRIA nada. A `DOTACAO_INICIAL` passou a nascer junto com a
 * ficha (adapter do M02, mesma transação). Aqui ela apenas CONFERE, e LANÇA se
 * faltar.
 *
 * Por que virou fail-closed: enquanto criava silenciosamente, ela MASCARAVA
 * fichas nascidas por um caminho errado — a ficha ficava sem dotação, todo
 * relatório mostrava saldo zero, e só na primeira operação de saldo o buraco era
 * tapado. O erro só aparecia no demonstrativo, nunca no código. Agora uma ficha
 * sem dotação estoura na cara de quem tentar mexer nela.
 *
 * PENDÊNCIA: remover a função por completo, depois de confirmar que nenhum
 * caminho cria ficha fora do adapter do M02. Até lá, ela é a rede.
 */
export async function garantirDotacaoInicial(
  tx: Tx,
  fichaId: string,
  _criadoPor: string
): Promise<void> {
  const jaTem = await tx.movimentoDotacao.count({
    where: { fichaId, tipo: "DOTACAO_INICIAL" },
  });
  if (jaTem > 0) return;

  const ficha = await tx.fichaOrcamentaria.findUnique({
    where: { id: fichaId },
    select: { id: true },
  });
  if (ficha === null) {
    throw new Error(`Ficha ${fichaId} não encontrada.`);
  }

  throw new Error(
    `Ficha ${fichaId} não tem DOTACAO_INICIAL. Toda ficha deve nascer com a sua ` +
      `(adapter do M02, na mesma transação da criação). Se esta ficha é antiga, ` +
      `rode o backfill: npx tsx prisma/seed/backfill-dotacao-inicial.ts`
  );
}

/**
 * INVARIANTE 3: cache = f(movimentos). Escreve as colunas a partir do SUM —
 * NUNCA incrementando. Chamar SEMPRE dentro da transação, depois do INSERT.
 */
export async function recalcularCache(tx: Tx, fichaId: string): Promise<SaldosFicha> {
  // ⚠️ CORRENTE, e por definição. As quatro colunas de cache da ficha SÃO o saldo de
  // agora — é o que a reconciliação confere contra o SUM. Um cache cortado por
  // competência seria o saldo de uma data guardado como se fosse o de hoje.
  const saldos = calcularSaldos(await totaisPorTipo(tx, fichaId, { eixo: "CORRENTE" }));

  await tx.fichaOrcamentaria.update({
    where: { id: fichaId },
    data: {
      saldoAutorizado: saldos.autorizado.toFixed(2),
      saldoReservado: saldos.reservado.toFixed(2),
      saldoEmpenhado: saldos.empenhado.toFixed(2),
      saldoDisponivel: saldos.disponivel.toFixed(2),
    },
  });

  return saldos;
}

/** INVARIANTE 5: fail-closed de saldo (TR 4.51), contra o SUM REAL. */
/**
 * OS GUARDS DO CONTRATO (M11) — DENTRO DA TRANSAÇÃO DO EMPENHO.
 *
 * Ordem da TR: existe → homologado → vigente → cabe no saldo → herda a categoria →
 * a reserva casa com o processo → a classe de bens (4.49).
 *
 * Devolve a categoria da ordem cronológica que o empenho VAI usar: a informada
 * (sem contrato) ou a HERDADA (com contrato).
 *
 * ⚠️ A LINHA DO CONTRATO É TRAVADA (`FOR UPDATE`) pela implementação do port,
 * ANTES de somar o empenhado. Sem o lock, dois empenhos concorrentes leem o mesmo
 * saldo e os DOIS passam — e o contrato estoura sem que nenhum guard tenha errado.
 */
async function guardsDoContrato(
  tx: Tx,
  contratos: ContratoPort | undefined,
  p: EmpenharParams
): Promise<CategoriaOrdemCronologica> {
  // A reserva pode estar VINCULADA a um processo (TR 4.41) — e isso importa mesmo
  // quando o empenho vem SEM contrato: é justamente esse o caso que a 4.42 barra.
  const processoDaReserva =
    p.reservaId === undefined
      ? null
      : (
          await tx.reservaDotacao.findUnique({
            where: { id: p.reservaId },
            select: { processoId: true },
          })
        )?.processoId ?? null;

  if (p.contratoId === undefined) {
    // ═══ (e) RESERVA VINCULADA EXIGE CONTRATO — TR 4.42 ═══
    if (processoDaReserva !== null) {
      throw new Error(
        `RESERVA VINCULADA A LICITAÇÃO: a reserva ${p.reservaId} está vinculada ao ` +
          `processo ${processoDaReserva}, e a regra só a libera "quando houver ` +
          `vinculação com uma licitação e esta informada na emissão da nota de ` +
          `empenho". O empenho ${p.numero} não informou contrato nenhum — informe ` +
          `o contrato daquele processo.`
      );
    }
    // Sem contrato o Zod já garantiu a categoria (não há de quem herdá-la).
    return p.categoriaOrdemCronologica!;
  }

  // FAIL-CLOSED: pediram contrato e o M11 não está ligado. Deixar passar gravaria
  // um `contratoId` que NINGUÉM validou.
  if (contratos === undefined) {
    throw new Error(
      `O empenho ${p.numero} informou o contrato ${p.contratoId}, mas o módulo de ` +
        `contratos (M11) não foi ligado às dependências do M05. Sem ele, vigência ` +
        `e saldo do contrato não seriam checados — e o empenho nasceria com um ` +
        `vínculo que ninguém validou.`
    );
  }

  // ═══ (a) EXISTE, E O PROCESSO DELE ESTÁ HOMOLOGADO ═══
  // (a implementação TRAVA a linha do contrato antes de somar — ver o port)
  const c = await contratos.situacaoParaEmpenho(tx, p.contratoId, p.data);
  if (c === null) {
    throw new Error(`Contrato ${p.contratoId} não existe.`);
  }
  if (!c.processoHomologado) {
    throw new Error(
      `PROCESSO NÃO HOMOLOGADO: o contrato ${c.numeroContrato} pende de ` +
        `homologação do processo ${c.processoId}. Não se empenha contra um ` +
        `contrato cuja licitação ainda não foi homologada.`
    );
  }

  // ═══ (b) VIGENTE NA DATA DO EMPENHO — TR 5.101/5.102 ═══
  if (!c.vigenteNaData) {
    throw new Error(
      `CONTRATO FORA DA VIGÊNCIA: o empenho ${p.numero} é de ` +
        `${p.data.toISOString()}, e o contrato ${c.numeroContrato} vige de ` +
        `${c.vigenciaInicio.toISOString()} a ${c.vigenciaFim.toISOString()} (fim ` +
        `já com as prorrogações). Empenhar fora da vigência é empenhar contra um ` +
        `contrato que não existe naquele dia — prorrogue antes.`
    );
  }

  // ═══ (c) CABE NO SALDO — TR 5.6/5.112 ═══
  if (p.valor.greaterThan(c.saldo)) {
    throw new Error(
      `SALDO DO CONTRATO INSUFICIENTE (${c.numeroContrato}): valor atualizado ` +
        `${c.valorAtualizado.toFixed(2)} − empenhado ` +
        `${c.empenhadoLiquido.toFixed(2)} = saldo ${c.saldo.toFixed(2)}, e o ` +
        `empenho ${p.numero} pede ${p.valor.toFixed(2)}. Faltam ` +
        `${p.valor.minus(c.saldo).toFixed(2)}. Aditive o contrato ou reduza o ` +
        `empenho.`
    );
  }

  // ═══ (d) HERANÇA DA CATEGORIA — nunca sobrescrever calado ═══
  const informada = p.categoriaOrdemCronologica;
  if (informada !== undefined && informada !== c.categoriaOrdemCronologica) {
    throw new Error(
      `CATEGORIA DIVERGENTE DO CONTRATO: o empenho ${p.numero} informou ` +
        `${informada}, mas o contrato ${c.numeroContrato} é ` +
        `${c.categoriaOrdemCronologica}. A fila do art. 141 é POR CATEGORIA — ` +
        `aceitar a do chamador colocaria o pagamento na fila errada, e sobrescrevê-` +
        `la em silêncio esconderia o erro de quem digitou. Corrija o empenho (ou o ` +
        `contrato, se ele é que está errado).`
    );
  }

  // ═══ (e) RESERVA E CONTRATO TÊM DE SER DO MESMO PROCESSO ═══
  if (processoDaReserva !== null && processoDaReserva !== c.processoId) {
    throw new Error(
      `RESERVA DE OUTRA LICITAÇÃO: a reserva ${p.reservaId} está vinculada ao ` +
        `processo ${processoDaReserva}, mas o contrato ${c.numeroContrato} é do ` +
        `processo ${c.processoId}. A reserva foi feita para AQUELA licitação — ` +
        `consumi-la aqui pagaria uma despesa com dinheiro separado para outra.`
    );
  }

  // ═══ (f) O VÍNCULO DE AQUISIÇÃO — TR 4.49 e 5.15 ═══
  await exigirClasseDeBens(tx, p);

  return c.categoriaOrdemCronologica;
}

export const TIPO_EMPENHO_DA_ORDEM = {
  ORDINARIA: "ORDINARIO",
  GLOBAL: "GLOBAL",
  ESTIMATIVA: "ESTIMATIVO",
} as const;

export function valorDaOrdem(
  itens: readonly { readonly quantidade: { toFixed(n: number): string }; readonly valorUnitario: { toFixed(n: number): string } }[],
  desconto: { toFixed(n: number): string } | null
): Money {
  let soma = toMoney("0");
  for (const i of itens) {
    const linha = toMoney(
      toMoney(i.quantidade.toFixed(4)).times(toMoney(i.valorUnitario.toFixed(6))).toDecimalPlaces(2).toFixed(2)
    );
    soma = toMoney(soma.plus(linha).toFixed(2));
  }
  const desc = desconto === null ? toMoney("0") : toMoney(desconto.toFixed(2));
  return toMoney(soma.minus(desc).toFixed(2));
}

/**
 * V5 — EMPENHO A PARTIR DA ORDEM DE COMPRA.
 *
 * Trava a ordem DEPOIS da ficha e do contrato (postos 2 → 5 → 6). Soma o empenhado
 * líquido contra a ordem. Ordinária: um empenho vivo, valor = total da ordem.
 * Global/estimativa: valor ≤ residual. Fornecedor da ordem = credor. Ficha da ordem
 * = ficha do empenho. Tipo da ordem mapeia o tipo do empenho.
 */
async function guardsDaOrdem(tx: Tx, p: EmpenharParams): Promise<void> {
  if (p.ordemDeCompraId === undefined) return;

  await travar(tx, "OrdemDeCompra", [p.ordemDeCompraId]);

  const ordem = await tx.ordemDeCompra.findUnique({
    where: { id: p.ordemDeCompraId },
    select: {
      id: true,
      numero: true,
      tipo: true,
      fichaId: true,
      desconto: true,
      fornecedor: { select: { documento: true } },
      itens: { select: { quantidade: true, valorUnitario: true } },
      movimentos: { where: { tipo: "ESTORNO" }, select: { id: true } },
    },
  });
  if (ordem === null) throw new Error(`Ordem de compra ${p.ordemDeCompraId} não existe.`);
  // ⚠️ V6 P1.1 — o estorno da ordem virou FATO; uma ordem estornada não se empenha.
  if (ordem.movimentos.length > 0) {
    throw new Error(`A ordem ${ordem.numero} está ESTORNADA: não há compra a empenhar. Nada foi gravado.`);
  }

  if (ordem.fichaId === null) {
    throw new Error(
      `A ordem ${ordem.numero} não tem ficha orçamentária. Declare o recurso na ordem ` +
        `antes de empenhar. Nada foi gravado.`
    );
  }
  if (ordem.fichaId !== p.fichaId) {
    throw new Error(
      `A ordem ${ordem.numero} é da ficha ${ordem.fichaId}, e o empenho ${p.numero} ` +
        `pediu a ficha ${p.fichaId}. Empenhar contra outra dotação deixaria a compra ` +
        `sem o recurso que ela declarou.`
    );
  }
  const tipoEsperado = TIPO_EMPENHO_DA_ORDEM[ordem.tipo];
  if (p.tipo !== tipoEsperado) {
    throw new Error(
      `O tipo do empenho (${p.tipo}) não corresponde ao tipo da ordem ${ordem.numero} ` +
        `(${ordem.tipo} → ${tipoEsperado}).`
    );
  }

  const credorOrdem = normalizarDocumento(ordem.fornecedor.documento);
  if (credorOrdem !== p.credorCpfCnpj) {
    throw new Error(
      `O credor do empenho (${p.credorCpfCnpj}) não é o fornecedor da ordem ` +
        `${ordem.numero} (${credorOrdem}).`
    );
  }

  const total = valorDaOrdem(ordem.itens, ordem.desconto);
  const empenhado = await empenhadoLiquidoDaOrdem(tx, ordem.id);
  const residual = toMoney(total.minus(empenhado).toFixed(2));

  if (ordem.tipo === "ORDINARIA") {
    if (empenhado.greaterThan(0)) {
      throw new Error(
        `A ordem ordinária ${ordem.numero} já tem empenho vivo ` +
          `(${empenhado.toFixed(2)}). Ordinária admite um empenho, pelo total. ` +
          `Anule o empenho anterior ou use ordem global/estimativa.`
      );
    }
    if (!p.valor.eq(total)) {
      throw new Error(
        `Empenho ordinário da ordem ${ordem.numero} tem de ser o total ` +
          `${total.toFixed(2)}, não ${p.valor.toFixed(2)}.`
      );
    }
    return;
  }

  if (p.valor.greaterThan(residual)) {
    throw new Error(
      `SALDO DA ORDEM INSUFICIENTE (${ordem.numero}): total ${total.toFixed(2)} − ` +
        `empenhado ${empenhado.toFixed(2)} = residual ${residual.toFixed(2)}, e o ` +
        `empenho ${p.numero} pede ${p.valor.toFixed(2)}.`
    );
  }
}

/**
 * AS DIMENSÕES DO EMPENHO (V22) — tudo o que classifica a despesa além da ficha: por onde uma soma
 * filtra ("empenhado do contrato", "da obra", "da ordem de compra", "do convênio"...).
 *
 * ⚠️ TODA LINHA QUE NEGA OU REDUZ UM EMPENHO (anulação total, anulação parcial, estorno da parcial)
 * COPIA TODAS ELAS do documento de origem. Uma dimensão esquecida numa só dessas linhas faz a soma
 * filtrada por ela ver o empenho e não ver a redução — o empenho fica contado inteiro para sempre.
 * Foi assim com a dívida na anulação total e com a obra e a ordem de compra no estorno da parcial,
 * cada cópia escrita à mão em três lugares. Agora as três passam por `dimensoesDe`, e o teste
 * `m05-dimensoes-das-anulacoes` confere esta lista contra as colunas do modelo: coluna de vínculo
 * nova no `Empenho` quebra o teste até ser declarada aqui ou em `VINCULOS_QUE_NAO_SAO_DIMENSAO`.
 */
export const DIMENSOES_DO_EMPENHO = [
  "subelementoId",
  "contratoId",
  "classeDeBensId",
  "dividaId",
  "obraId",
  "convenioId",
  "campanhaPublicitariaId",
  "precatorioId",
  "consorcioId",
  "ordemDeCompraId",
  "contratoPppId",
] as const;

/**
 * Os vínculos do `Empenho` que NÃO se copiam para a anulação, cada um com o motivo: a ficha vai
 * explícita (é a chave da dotação); o lançamento é o da própria anulação; `estornoDeId` e
 * `anulacaoParcialDeId` são a própria referência ao original; a solicitação é única por empenho
 * (índice único) e já foi consumida pelo original.
 */
export const VINCULOS_QUE_NAO_SAO_DIMENSAO = [
  "fichaId",
  "lancamentoId",
  "estornoDeId",
  "anulacaoParcialDeId",
  "solicitacaoDeEmpenhoId",
] as const;

type DimensaoDoEmpenho = (typeof DIMENSOES_DO_EMPENHO)[number];

const SELECAO_DAS_DIMENSOES = Object.fromEntries(DIMENSOES_DO_EMPENHO.map((d) => [d, true])) as {
  readonly [K in DimensaoDoEmpenho]: true;
};

function dimensoesDe(origem: { readonly [K in DimensaoDoEmpenho]: string | null }): { [K in DimensaoDoEmpenho]: string | null } {
  return Object.fromEntries(DIMENSOES_DO_EMPENHO.map((d) => [d, origem[d]])) as { [K in DimensaoDoEmpenho]: string | null };
}

/**
 * M28 (V22) — o EMPENHADO LÍQUIDO de um convênio: Σ dos empenhos que o executam, líquida de
 * anulações totais e parciais (a mesma soma do repositório, `packages/estornaveis`).
 *
 * ⚠️ É esta soma que exige que a anulação COPIE o `convenioId`: o filtro é pelo convênio, e uma
 * anulação sem ele ficaria fora do conjunto — o empenho seria contado inteiro para sempre.
 */
export async function empenhadoLiquidoDoConvenio(tx: Tx, convenioId: string): Promise<Money> {
  const empenhos = await tx.empenho.findMany({
    where: { convenioId },
    select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true },
  });
  return somaLiquidaEstornaveis(
    empenhos.map((e) => ({
      id: e.id,
      valor: toMoney(e.valor.toFixed(2)),
      estornoDeId: e.estornoDeId,
      anulacaoParcialDeId: e.anulacaoParcialDeId,
    }))
  );
}

/**
 * M28 (V22) — O VÍNCULO COM O CONVÊNIO: VOLUNTÁRIO, como o da obra (ver o schema), e por isso SEM
 * gatilho por elemento. Confere-se que o convênio EXISTE e, quando o ente é o CONVENENTE (quem
 * executa o recurso recebido), que o empenho cai DENTRO DA VIGÊNCIA do instrumento.
 *
 * ⚠️ A FONTE DA REGRA DA VIGÊNCIA: Portaria Conjunta MGI/MF/CGU nº 33/2023 (normas complementares
 * ao Decreto 11.531/2023), art. 44 — "sendo vedado: I - realizar despesa em data anterior à
 * vigência do instrumento; (...) IX - efetuar pagamento em data posterior à vigência do
 * instrumento, salvo se o fato gerador da despesa tenha ocorrido durante a vigência". O empenho
 * antes do início é a despesa do inciso I; o empenho depois do fim cria um fato gerador fora da
 * vigência, cujo pagamento o inciso IX veda. Comparação por DIA CIVIL do ente (a vigência é gravada
 * como instante: início do dia e `fimDoDiaCivil`).
 *
 * ⚠️ SÓ NO PAPEL DE CONVENENTE. Quando o ente é o CONCEDENTE, o empenho é o do repasse, e o
 * repasse do concedente não é "despesa do instrumento" no sentido do art. 44 — a vedação é do
 * executor.
 */
async function exigirVinculoDeConvenio(tx: Tx, p: EmpenharParams): Promise<void> {
  if (p.convenioId === undefined) return;
  const c = await tx.convenio.findUnique({
    where: { id: p.convenioId },
    select: { id: true, identificador: true, papelDoEnte: true, vigenciaInicio: true, vigenciaFim: true },
  });
  if (c === null) {
    throw new Error(`Convênio ${p.convenioId} não existe. Nada foi gravado.`);
  }
  if (c.papelDoEnte !== "CONVENENTE") return;
  const dia = diaCivil(p.data);
  const inicio = diaCivil(c.vigenciaInicio);
  const fim = diaCivil(c.vigenciaFim);
  if (dia < inicio || dia > fim) {
    const [a, m, d] = dia.split("-");
    const br = (x: string): string => x.split("-").reverse().join("/");
    throw new Error(
      `O empenho de ${d}/${m}/${a} está fora da vigência do convênio ${c.identificador} ` +
        `(${br(inicio)} a ${br(fim)}). A despesa do convênio só pode ser realizada durante a ` +
        `vigência do instrumento (Portaria Conjunta MGI/MF/CGU nº 33/2023, art. 44, incisos I e IX). ` +
        `Nada foi gravado.`
    );
  }
}

/** V36 (TR 5.10.1.89) — a parceria público-privada vinculada tem de existir. Voluntária: sem ela, nada a conferir. */
async function exigirVinculoDePpp(tx: Tx, p: EmpenharParams): Promise<void> {
  if (p.contratoPppId === undefined) return;
  const c = await tx.contratoPPP.findUnique({ where: { id: p.contratoPppId }, select: { numero: true, vigenciaInicio: true, vigenciaFim: true } });
  if (c === null) throw new Error(`Parceria público-privada ${p.contratoPppId} não existe. Nada foi gravado.`);
  // Como o empenho de contrato: a despesa da parceria é realizada dentro da vigência dela, pelo dia civil do ente.
  const [dia, ini, fim] = [diaCivil(p.data), diaCivil(c.vigenciaInicio), diaCivil(c.vigenciaFim)];
  if (dia < ini || dia > fim) {
    const br = (s: string): string => s.split("-").reverse().join("/");
    throw new Error(`O empenho de ${br(dia)} está fora da vigência da parceria ${c.numero} (${br(ini)} a ${br(fim)}). Nada foi gravado.`);
  }
}

/** V22 — a campanha publicitária vinculada tem de existir. Voluntária: sem ela, nada a conferir. */
async function exigirVinculoDeCampanha(tx: Tx, p: EmpenharParams): Promise<void> {
  if (p.campanhaPublicitariaId === undefined) return;
  const c = await tx.campanhaPublicitaria.findUnique({ where: { id: p.campanhaPublicitariaId }, select: { id: true } });
  if (c === null) {
    throw new Error(`Campanha publicitária ${p.campanhaPublicitariaId} não existe. Nada foi gravado.`);
  }
}

/**
 * V32 — o precatório vinculado tem de existir, estar inscrito, e a ficha tem de ser de sentenças
 * judiciais (elemento 91): um precatório pago por outra despesa baixaria o passivo judicial com dinheiro
 * classificado como outra coisa. Voluntário: sem precatório, nada a conferir.
 */
async function exigirVinculoDePrecatorio(tx: Tx, p: EmpenharParams): Promise<void> {
  if (p.precatorioId === undefined) return;
  const prec = await tx.precatorio.findUnique({
    where: { id: p.precatorioId },
    select: { numeroProcesso: true, movimentos: { where: { tipo: "INSCRICAO" }, select: { id: true } } },
  });
  if (prec === null) throw new Error(`O precatório indicado não existe. Escolha o precatório na lista. Nada foi gravado.`);
  if (prec.movimentos.length === 0) {
    throw new Error(`O precatório ${prec.numeroProcesso} ainda não foi inscrito; inscreva-o antes de empenhar o pagamento. Nada foi gravado.`);
  }
  const ficha = await tx.fichaOrcamentaria.findUniqueOrThrow({
    where: { id: p.fichaId },
    select: { naturezaDespesa: { select: { codElemento: true, codigoCompleto: true } } },
  });
  if (ficha.naturezaDespesa.codElemento !== "91") {
    throw new Error(
      `O empenho ${p.numero} paga o precatório ${prec.numeroProcesso}, mas a ficha é da natureza ` +
        `${ficha.naturezaDespesa.codigoCompleto}, e não de sentenças judiciais (elemento 91). Escolha a ficha de ` +
        `sentenças judiciais. Nada foi gravado.`
    );
  }
}

export async function empenhadoLiquidoDaOrdem(tx: Tx, ordemDeCompraId: string): Promise<Money> {
  const empenhos = await tx.empenho.findMany({
    where: { ordemDeCompraId },
    select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true },
  });
  return somaLiquidaEstornaveis(
    empenhos.map((e) => ({
      id: e.id,
      valor: toMoney(e.valor.toFixed(2)),
      estornoDeId: e.estornoDeId,
      anulacaoParcialDeId: e.anulacaoParcialDeId,
    }))
  );
}

async function exigirDocumentoFiscalDaLiquidacao(
  tx: Tx,
  p: { readonly documentoFiscalId?: string | undefined; readonly valor: Money; readonly empenhoId: string },
  empenho: { readonly credorCpfCnpj: string; readonly ordemDeCompraId: string | null }
): Promise<{
  readonly notaFiscalChave: string | undefined;
  readonly notaFiscalNum: string | undefined;
  readonly notaFiscalSerie: string | undefined;
  readonly notaFiscalData: Date | undefined;
  readonly notaFiscalValor: Money | undefined;
}> {
  const vazio = {
    notaFiscalChave: undefined,
    notaFiscalNum: undefined,
    notaFiscalSerie: undefined,
    notaFiscalData: undefined,
    notaFiscalValor: undefined,
  };
  if (p.documentoFiscalId === undefined) return vazio;

  const doc = await tx.documentoFiscalRecebido.findUnique({
    where: { id: p.documentoFiscalId },
    select: {
      id: true,
      numero: true,
      serie: true,
      chaveAcesso: true,
      dataEmissao: true,
      valorTotal: true,
      emitente: { select: { documento: true } },
      empenhoId: true,
      ordemId: true,
      movimentos: { select: { tipo: true } },
      liquidacoes: {
        select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true },
      },
    },
  });
  if (doc === null) throw new Error(`Documento fiscal ${p.documentoFiscalId} não existe.`);
  if (doc.movimentos.some((m) => m.tipo === "CANCELAMENTO" || m.tipo === "SUBSTITUICAO")) {
    throw new Error(`Documento ${doc.numero}/${doc.serie} cancelado ou substituído não lastreia liquidação.`);
  }
  if (!doc.movimentos.some((m) => m.tipo === "CONFERENCIA")) {
    throw new Error(
      `Documento ${doc.numero}/${doc.serie} ainda não foi conferido. Confira a nota ` +
        `antes de liquidar. Nada foi gravado.`
    );
  }
  if (normalizarDocumento(doc.emitente.documento) !== empenho.credorCpfCnpj) {
    throw new Error(
      `O emitente do documento ${doc.numero}/${doc.serie} (${doc.emitente.documento}) ` +
        `não é o credor do empenho (${empenho.credorCpfCnpj}).`
    );
  }
  if (doc.empenhoId !== null && doc.empenhoId !== p.empenhoId) {
    throw new Error(`O documento ${doc.numero}/${doc.serie} pertence a outro empenho.`);
  }
  if (doc.ordemId !== null && empenho.ordemDeCompraId !== null && doc.ordemId !== empenho.ordemDeCompraId) {
    throw new Error(
      `O documento ${doc.numero}/${doc.serie} é de outra ordem de compra que a deste empenho.`
    );
  }
  const liquidado = somaLiquidaEstornaveis(
    doc.liquidacoes.map((l) => ({
      id: l.id,
      valor: toMoney(l.valor.toFixed(2)),
      estornoDeId: l.estornoDeId,
      anulacaoParcialDeId: l.anulacaoParcialDeId,
    }))
  );
  const aLiquidar = toMoney(toMoney(doc.valorTotal.toFixed(2)).minus(liquidado).toFixed(2));
  if (p.valor.greaterThan(aLiquidar)) {
    throw new Error(
      `Liquidação maior que o saldo do documento ${doc.numero}/${doc.serie}: ` +
        `total ${doc.valorTotal.toFixed(2)} − liquidado ${liquidado.toFixed(2)} = ` +
        `${aLiquidar.toFixed(2)}, pedido ${p.valor.toFixed(2)}.`
    );
  }
  return {
    notaFiscalChave: doc.chaveAcesso ?? undefined,
    notaFiscalNum: doc.numero,
    notaFiscalSerie: doc.serie,
    notaFiscalData: doc.dataEmissao,
    notaFiscalValor: toMoney(doc.valorTotal.toFixed(2)),
  };
}

/**
 * TR 4.48 — EMPENHO DO GRUPO 6 (AMORTIZAÇÃO DA DÍVIDA) TEM DE DIZER QUAL DÍVIDA.
 *
 * A bicondicional é dos DOIS lados: grupo 6 SEM dívida é pagar no escuro (e o
 * demonstrativo da dívida nunca fecha com a despesa); dívida FORA do grupo 6 é um
 * vínculo sem sentido — um empenho de material de expediente não amortiza nada.
 *
 * ⚠️ O grupo 6 é o ÚNICO. Ele é despesa de CAPITAL e NÃO traz bem (a lição do M10:
 * é por isso que ele fica de fora do `ehGrupoDeCapital` da classe de bens). Aqui é o
 * contrário: é o único que exige dívida.
 *
 * Roda SEMPRE — com ou sem contrato. Amortizar dívida não depende de licitação.
 */
const GRUPO_AMORTIZACAO_DIVIDA = "6";

async function exigirVinculoDeDivida(tx: Tx, p: EmpenharParams): Promise<void> {
  const ficha = await tx.fichaOrcamentaria.findUniqueOrThrow({
    where: { id: p.fichaId },
    select: {
      naturezaDespesa: { select: { codNatureza: true, codigoCompleto: true } },
    },
  });
  const grupo = ficha.naturezaDespesa.codNatureza;
  const ehAmortizacao = grupo === GRUPO_AMORTIZACAO_DIVIDA;

  if (ehAmortizacao && p.dividaId === undefined) {
    throw new Error(
      `EMPENHO DE AMORTIZAÇÃO SEM DÍVIDA: o empenho ${p.numero} é do grupo ` +
        `6 (${descricaoDoGrupo(grupo)}), natureza ` +
        `${ficha.naturezaDespesa.codigoCompleto} — ele PAGA uma dívida, e não diz ` +
        `qual. Sem o vínculo, o demonstrativo da dívida consolidada nunca fecha com a ` +
        `despesa executada, e o saldo devedor vira uma opinião. Informe a dívida.`
    );
  }

  if (!ehAmortizacao && p.dividaId !== undefined) {
    throw new Error(
      `VÍNCULO DE DÍVIDA SEM SENTIDO: o empenho ${p.numero} informou a dívida ` +
        `${p.dividaId}, mas é do grupo ${grupo} (${descricaoDoGrupo(grupo)}), não do ` +
        `grupo 6 (Amortização da Dívida). Só se amortiza dívida com despesa de ` +
        `amortização — este empenho pagaria outra coisa e baixaria o saldo devedor.`
    );
  }

  if (p.dividaId !== undefined) {
    const divida = await tx.dividaConsolidada.findUnique({
      where: { id: p.dividaId },
      select: { id: true },
    });
    if (divida === null) {
      throw new Error(`Dívida ${p.dividaId} não existe.`);
    }
  }
}

/**
 * TR 4.49/5.15 — EMPENHO DE CAPITAL COM CONTRATO TEM DE DIZER O QUE COMPRA.
 *
 * A derivação de "é capital?" é a do M10 (`ehGrupoDeCapital`, 2º dígito da natureza)
 * — REUSADA, não recopiada. E o grupo 6 (amortização da dívida) fica de fora
 * de propósito: ele é capital e NÃO traz bem nenhum (a lição do M10 — capital sem
 * bem existe, e exigir classe dele travaria o pagamento da dívida).
 *
 * ⚠️ SÓ EXIGE QUANDO HÁ CONTRATO: o escopo do TR é a cadeia LICITATÓRIA
 * (licitação → contrato → empenho → bem). Uma aquisição fora de contrato (doação
 * incorporada, dação em pagamento) não passa por aqui — está no MODULO.md.
 */
async function exigirClasseDeBens(tx: Tx, p: EmpenharParams): Promise<void> {
  const ficha = await tx.fichaOrcamentaria.findUniqueOrThrow({
    where: { id: p.fichaId },
    select: {
      naturezaDespesa: { select: { codNatureza: true, codigoCompleto: true } },
    },
  });
  const grupo = ficha.naturezaDespesa.codNatureza;

  if (!ehGrupoDeCapital(grupo)) {
    return; // custeio não compra bem; o grupo 6 é capital SEM bem
  }

  if (p.classeDeBensId === undefined) {
    throw new Error(
      `EMPENHO DE CAPITAL SEM CLASSE DE BENS: o empenho ${p.numero} ` +
        `é do grupo ${grupo} (${descricaoDoGrupo(grupo)}), natureza ` +
        `${ficha.naturezaDespesa.codigoCompleto}, e executa um contrato — mas não ` +
        `diz QUE CLASSE DE BEM vai adquirir. Sem isso, o bem entra no patrimônio ` +
        `sem que ninguém consiga ligá-lo ao contrato que o comprou, e o ` +
        `levantamento por classe (5.15) não fecha com a despesa de capital. ` +
        `Informe a classe de bens.`
    );
  }

  const classe = await tx.classeDeBens.findUnique({
    where: { id: p.classeDeBensId },
    select: { id: true, codigo: true, ativa: true },
  });
  if (classe === null) {
    throw new Error(`Classe de bens ${p.classeDeBensId} não existe.`);
  }
  if (!classe.ativa) {
    throw new Error(
      `Classe de bens ${classe.codigo} está INATIVA — não se empenha aquisição ` +
        `numa classe que o ente desativou.`
    );
  }
}

/**
 * TR 4.50 — EMPENHO DE OBRA TEM DE DIZER QUAL OBRA.
 *
 * O gatilho é o ELEMENTO da despesa (51 — "Obras e Instalações"), pelo Record FECHADO
 * `ELEMENTOS_DE_OBRA` do M11. Ele é fechado porque o rol oficial tem uma armadilha
 * literal: o elemento **37** chama-se "Locação de Mão-de-**Obra**" e não é obra nenhuma.
 * Qualquer derivação por texto o pegaria.
 *
 * ═══ ⚠️ E ELE É **UNIDIRECIONAL** — a diferença deliberada para o 4.48 ═══
 * O guard da dívida é BICONDICIONAL: dívida fora do grupo 6 é vínculo sem sentido, e ele
 * recusa os dois lados. Aqui NÃO:
 *
 *   · elemento 51 SEM obra                -> REJEITA (é o furo que o TR 4.50 fecha);
 *   · obra num empenho de OUTRO elemento  -> **PERMITIDO**.
 *
 * A instalação elétrica de uma escola pode vir, legitimamente, no elemento 39 — e o ente
 * tem todo o direito de rastreá-la na obra. Proibir o vínculo voluntário obrigaria quem
 * quer rastrear a MENTIR na classificação da despesa, que é o oposto do que se quer. Um
 * vínculo a mais não corrompe soma nenhuma; um vínculo a menos deixa a obra invisível
 * para a Receita.
 *
 * Roda SEMPRE — com ou sem contrato. Uma obra por administração direta não tem contrato,
 * e nem por isso deixa de ter matrícula CEI e retenção previdenciária.
 */
async function exigirVinculoDeObra(tx: Tx, p: EmpenharParams): Promise<void> {
  const ficha = await tx.fichaOrcamentaria.findUniqueOrThrow({
    where: { id: p.fichaId },
    select: {
      naturezaDespesa: { select: { codElemento: true, codigoCompleto: true } },
    },
  });
  const elemento = ficha.naturezaDespesa.codElemento;

  if (ELEMENTOS_DE_OBRA[elemento] === true && p.obraId === undefined) {
    throw new Error(
      `EMPENHO DE OBRA SEM OBRA: o empenho ${p.numero} é do elemento ` +
        `${elemento} ("Obras e Instalações"), natureza ` +
        `${ficha.naturezaDespesa.codigoCompleto} — ele CONSTRÓI alguma coisa, e não diz ` +
        `o quê. Sem o vínculo, a obra não aparece no registro L800 do MANAD (obras e ` +
        `serviços sujeitos à RETENÇÃO PREVIDENCIÁRIA), que é exatamente o que a ` +
        `fiscalização da Receita vem procurar no arquivo — e o ente entrega um MANAD ` +
        `sem a parte que interessa. Informe a obra. ` +
        `(O rol de elementos de obra é FECHADO: {${Object.keys(ELEMENTOS_DE_OBRA).join(", ")}}. ` +
        `O elemento 37, "Locação de Mão-de-Obra", NÃO é obra — é pessoal.)`
    );
  }

  if (p.obraId === undefined) return;

  const obra = await tx.obra.findUnique({
    where: { id: p.obraId },
    select: { id: true, identificador: true, ativa: true },
  });
  if (obra === null) {
    throw new Error(`Obra ${p.obraId} não existe.`);
  }
  if (!obra.ativa) {
    throw new Error(
      `Obra ${obra.identificador} está INATIVA — não se empenha despesa numa obra que ` +
        `o ente encerrou.`
    );
  }
}

function exigirSaldo(disponivel: Money, valor: Money, fichaId: string): void {
  if (valor.greaterThan(disponivel)) {
    throw new Error(
      `Saldo insuficiente na ficha ${fichaId}: disponível ` +
        `${disponivel.toFixed(2)}, solicitado ${valor.toFixed(2)}.`
    );
  }
}

async function criarLancamento(
  tx: Tx,
  l: LancamentoDaDespesa
): Promise<void> {
  const contaIds = [...new Set(l.partidas.map((p) => p.contaId))];
  const contas = await tx.contaPcasp.findMany({
    where: { id: { in: contaIds } },
    select: { id: true, codigo: true, analitica: true },
  });
  if (contas.length !== contaIds.length) {
    throw new Error(`Conta(s) inexistente(s) no PCASP ao persistir ${l.numeroControle}.`);
  }
  const sinteticas = contas.filter((c) => !c.analitica);
  if (sinteticas.length > 0) {
    throw new Error(
      `Conta sintética não recebe partida: ${sinteticas.map((c) => c.codigo).join(", ")}.`
    );
  }

  await lancarNoRazao(tx, {
    id: l.id,
    numeroControle: l.numeroControle,
    dataTransacao: l.dataTransacao,
    historico: l.historico,
    origemTipo: l.origemTipo,
    origemId: l.origemId ?? null,
    estornoDeId: l.estornoDeId ?? null,
    criadoPor: l.criadoPor,
    partidas: l.partidas.map((p) => ({
      contaId: p.contaId,
      tipo: p.tipo,
      subsistema: p.subsistema,
      valor: p.valor.toFixed(2),
      fichaId: p.fichaId ?? null,
    })),
  });
}

/**
 * O estorno espelha o original PERNA POR PERNA — inclusive a ficha de cada uma.
 *
 * ═══ POR QUE NÃO BASTA O `gerarEstorno` ═══
 * O motor puro inverte débito/crédito, mas ele não conhece `fichaId`: quem
 * resolve as contas é o serviço, e ele carimba a MESMA ficha em toda perna. Num
 * pagamento COM RETENÇÃO (M07) isso estaria errado — as pernas de passivo do
 * consignatário não têm dimensão orçamentária (dinheiro de terceiro não é
 * execução da ficha, ele só transita pelo caixa dela), e o estorno delas passaria
 * a ter. A mesma conta de consignação apareceria ora com ficha, ora sem, e
 * qualquer relatório por ficha somaria dinheiro que não é do município.
 *
 * Então a ficha de cada perna do estorno é COPIADA do original. Para um pagamento
 * sem retenção isto é um no-op: todas as pernas já tinham a ficha do empenho.
 */
async function espelharFichaDoOriginal(
  tx: Tx,
  lancamentoOriginalId: string,
  l: LancamentoDaDespesa
): Promise<LancamentoDaDespesa> {
  const partidasOriginais = await tx.partidaContabil.findMany({
    where: { lancamentoId: lancamentoOriginalId },
    select: { contaId: true, fichaId: true },
  });

  const fichaPorConta = new Map<string, string | null>();
  for (const po of partidasOriginais) {
    const visto = fichaPorConta.get(po.contaId);
    // Fail-closed: a mesma conta com fichas diferentes no mesmo lançamento
    // tornaria o espelho ambíguo. Não acontece hoje — e se passar a acontecer,
    // que estoure aqui, e não num relatório seis meses depois.
    if (visto !== undefined && visto !== po.fichaId) {
      throw new Error(
        `Lançamento ${lancamentoOriginalId}: a conta ${po.contaId} tem pernas ` +
          `com fichas DIFERENTES — o estorno não tem como espelhar a dimensão ` +
          `orçamentária delas.`
      );
    }
    fichaPorConta.set(po.contaId, po.fichaId);
  }

  return {
    ...l,
    partidas: l.partidas.map((p) => {
      const ficha = fichaPorConta.get(p.contaId);
      if (ficha === undefined) {
        throw new Error(
          `Estorno do lançamento ${lancamentoOriginalId}: a perna na conta ` +
            `${p.contaId} não existe no original.`
        );
      }
      return {
        contaId: p.contaId,
        tipo: p.tipo,
        subsistema: p.subsistema,
        valor: p.valor,
        ...(ficha !== null ? { fichaId: ficha } : {}),
      };
    }),
  };
}

/**
 * A RESERVA DE DOTAÇÃO dentro de uma transação de quem chama (V36: a prévia de alteração orçamentária bloqueia as
 * anulações com reservas, todas na transação da prévia). Mesmo corpo do `reservar` do repositório, que agora a chama.
 */
export async function reservarNaTransacao(tx: Tx, p: ReservarParams, opcoes: { readonly bloqueioDePrevia?: boolean } = {}): Promise<string> {
  // V36 — o bloqueio da anulação da prévia é a mesma retenção do disponível, com o tipo de movimento (e o roteiro) próprio.
  const tipoDoMovimento = opcoes.bloqueioDePrevia === true ? "BLOQUEIO_DE_PREVIA" : "RESERVA";
  // 1º LOCK: a ficha. ANTES da soma — ver `travarFichas`.
  await travarFichas(tx, [p.fichaId]);

  // M08 — fail-closed: exercício da ficha tem de estar aberto.
  await exigirExercicioDaFichaAberto(tx, p.fichaId, "reserva de dotação");
  await garantirDotacaoInicial(tx, p.fichaId, p.criadoPor);

  // INVARIANTE 5: saldo do SUM REAL, dentro da transação E sob o lock.
  // ⚠️ CORRENTE: o guard pergunta "há dinheiro disponível AGORA para reservar?".
  // Cortado por competência, ele ignoraria um crédito adicional já concedido e
  // recusaria uma reserva legítima; cortado por registro, o mesmo.
  const saldos = calcularSaldos(await totaisPorTipo(tx, p.fichaId, { eixo: "CORRENTE" }));
  exigirSaldo(saldos.disponivel, p.valor, p.fichaId);
  // V37 — com data do fato, a reserva também cabe no disponível DAQUELA data (a mesma régua do empenho): uma reserva
  // retroativa não consome crédito aberto depois dela.
  if (p.data !== undefined) await exigirSaldoNaData(tx, { fichaId: p.fichaId, data: p.data, valor: p.valor, ato: "da reserva" });

  const reserva = await tx.reservaDotacao.create({
    data: {
      id: p.reservaId,
      fichaId: p.fichaId,
      valor: p.valor.toFixed(2),
      historico: p.historico,
      processoId: p.processoId ?? null,
      data: p.data ?? null,
      criadoPor: p.criadoPor,
    },
    select: { id: true },
  });

  // A RESERVA CONSOME O DISPONÍVEL — e agora isso aparece no razão (D disponível /
  // C reservado). Sem esta perna, o disponível do razão ignoraria o reservado e a
  // amarração A1-orc não fecharia.
  await registrarMovimentoDotacao(tx, {
    fichaId: p.fichaId,
    tipo: tipoDoMovimento,
    valor: p.valor.toFixed(2),
    origemTipo: tipoDoMovimento,
    origemId: reserva.id,
    criadoPor: p.criadoPor,
    // V37 — a reserva ganhou data própria: com ela, a competência do movimento é a data do fato e o corte por data
    // (MSC, saldo na data) a segue. Sem ela (reservas antigas, bloqueio da prévia), a da gravação.
    ...(p.data !== undefined ? { data: p.data } : {}),
  });

  // INVARIANTE 3: cache recalculado do SUM.
  await recalcularCache(tx, p.fichaId);


  return reserva.id;
}

/**
 * A LIBERAÇÃO DA RESERVA dentro de uma transação de quem chama. `daPrevia` só a prévia passa: é o que desfaz o
 * bloqueio de uma anulação (V36); a liberação pela tela de reservas recusa o bloqueio.
 */
export async function liberarReservaNaTransacao(
  tx: Tx,
  p: LiberarReservaParams,
  /** `daPrevia`: só a prévia desfaz o bloqueio dela; `data`: a data do fato (a do decreto, na efetivação). */
  opcoes: { readonly daPrevia?: boolean; readonly data?: Date } = {}
): Promise<string> {
  const original = await tx.reservaDotacao.findUnique({
    where: { id: p.reservaOriginalId },
    select: {
      id: true,
      fichaId: true,
      valor: true,
      estornos: { select: { id: true } },
      empenhos: { select: { empenhoId: true } },
      itemDaPrevia: { select: { previa: { select: { numero: true, exercicio: true } } } },
    },
  });
  if (original === null) {
    throw new Error(`Reserva ${p.reservaOriginalId} não encontrada.`);
  }
  if (original.estornos.length > 0) {
    throw new Error(`Reserva ${p.reservaOriginalId} já foi liberada.`);
  }
  // V36 — o BLOQUEIO de uma anulação de prévia de alteração orçamentária só se desfaz pela prévia (efetivação ou
  // descarte). Liberado pela tela de reservas, a prévia aprovada seria efetivada sobre um valor já desbloqueado.
  if (original.itemDaPrevia !== null && opcoes.daPrevia !== true) {
    const pv = original.itemDaPrevia.previa;
    throw new Error(
      `A reserva ${p.reservaOriginalId} é o bloqueio da prévia de alteração orçamentária nº ${String(pv.numero)}/${String(pv.exercicio)}: ` +
        `ela se libera ao efetivar ou descartar a prévia. Nada foi gravado.`
    );
  }
  if (original.empenhos.length > 0) {
    throw new Error(
      `Reserva ${p.reservaOriginalId} já foi empenhada — não há o que liberar.`
    );
  }

  // Devolve saldo, mas grava e recalcula o cache — mesmo motivo da anulação.
  await travarFichas(tx, [original.fichaId]);

  const liberacao = await tx.reservaDotacao.create({
    data: {
      id: p.reservaLiberacaoId,
      fichaId: original.fichaId,
      valor: original.valor,
      historico: p.historico,
      estornoDeId: original.id,
      criadoPor: p.criadoPor,
    },
    select: { id: true },
  });

  await registrarMovimentoDotacao(tx, {
    fichaId: original.fichaId,
    tipo: original.itemDaPrevia !== null ? "BLOQUEIO_DE_PREVIA_LIBERADO" : "RESERVA_LIBERADA",
    valor: original.valor.toFixed(2),
    origemTipo: original.itemDaPrevia !== null ? "BLOQUEIO_DE_PREVIA_LIBERADO" : "RESERVA_LIBERADA",
    origemId: liberacao.id,
    estornoDeId: original.id,
    criadoPor: p.criadoPor,
    // idem: a liberação não tem data própria — salvo a do bloqueio da prévia, que se desfaz na data do decreto.
    ...(opcoes.data !== undefined ? { data: opcoes.data } : {}),
  });

  await recalcularCache(tx, original.fichaId);

  return liberacao.id;
}

/**
 * `contratos` é OPCIONAL: quem não usa o M11 constrói o adapter sem ele, e o
 * caminho sem contrato segue idêntico. Quem informa `contratoId` num empenho e
 * NÃO ligou o port recebe erro — nunca um vínculo não validado.
 */
export function criarDespesaRepositoryPrisma(
  prisma: PrismaClient,
  contratos?: ContratoPort,
  aoAnularLiquidacao?: AoAnularLiquidacaoPort,
  /**
   * M10 (ENT06 item 2) — a entrada no almoxarifado que nasce da liquidação de material.
   *
   * ⚠️ AUSENTE É FAIL-CLOSED AQUI, ao contrário do port da anulação. Lá, módulo ausente não
   * pode travar o M05 e a amarração segue como rede de fundo. Aqui, liquidar elemento de
   * material sem o M10 ligado gravaria exatamente o furo que a pendência
   * `LIQUIDACAO-MATERIAL-ALMOXARIFADO` existe para impedir.
   */
  aoLiquidarMaterial?: AoLiquidarMaterialPort
): DespesaRepositoryPort {
  // M05 -> M06, nunca o inverso. Quem paga é que precisa respeitar a ordem.
  const ordem = criarOrdemCronologicaPrisma(prisma);

  return {
    async reservar(p: ReservarParams): Promise<string> {
      return prisma.$transaction((tx) => reservarNaTransacao(tx, p));
    },

    async empenhar(
      p: EmpenharParams,
      lancamento: LancamentoDaDespesa
    ): Promise<string> {
      return prisma.$transaction(async (tx) => {
        // ⚠️ ORDEM DE AQUISIÇÃO: FICHA primeiro, CONTRATO depois (dentro de
        // `guardsDoContrato`). Inverter aqui é abrir um deadlock — ver `travarFichas`.
        await travarFichas(tx, [p.fichaId]);

        // M08 — fail-closed: não se empenha em exercício encerrado. Despesa de
        // exercício encerrado vira restos a pagar, não empenho novo.
        await exigirExercicioDaFichaAberto(tx, p.fichaId, "empenho");
        // ⚠️ E a data do PRÓPRIO empenho: `p.data` vem de fora. Sem isto, um empenho
        // datado de 20/12 do exercício encerrado entraria com a ficha do ano aberto.
        await exigirCompetenciaEmExercicioAberto(tx, p.data, "empenho");
        await garantirDotacaoInicial(tx, p.fichaId, p.criadoPor);

        // ⚠️ CORRENTE — mesmo motivo do guard da reserva, logo acima.
        const saldos = calcularSaldos(await totaisPorTipo(tx, p.fichaId, { eixo: "CORRENTE" }));

        // Empenho vindo de reserva NÃO precisa de disponível novo: o valor já
        // está retido em `reservado`, e ele será liberado agora. O que se exige
        // é que a reserva cubra o empenho.
        if (p.reservaId !== undefined) {
          const reserva = await tx.reservaDotacao.findUnique({
            where: { id: p.reservaId },
            select: { id: true, fichaId: true, valor: true, empenhos: true, estornos: true, itemDaPrevia: { select: { previa: { select: { numero: true, exercicio: true } } } } },
          });
          if (reserva === null) {
            throw new Error(`Reserva ${p.reservaId} não encontrada.`);
          }
          // V36 — o bloqueio de uma anulação de prévia de alteração orçamentária não é reserva para empenho: o valor está
          // retido para ser anulado pelo decreto que a prévia vai gerar.
          if (reserva.itemDaPrevia !== null) {
            throw new Error(
              `A reserva ${p.reservaId} é o bloqueio da prévia de alteração orçamentária nº ` +
                `${String(reserva.itemDaPrevia.previa.numero)}/${String(reserva.itemDaPrevia.previa.exercicio)} e não serve a empenho. Nada foi gravado.`
            );
          }
          if (reserva.fichaId !== p.fichaId) {
            throw new Error(
              `Reserva ${p.reservaId} é de outra ficha (${reserva.fichaId}).`
            );
          }
          if (reserva.estornos.length > 0) {
            throw new Error(`Reserva ${p.reservaId} já foi liberada.`);
          }
          if (reserva.empenhos.length > 0) {
            throw new Error(`Reserva ${p.reservaId} já foi empenhada.`);
          }
          const valorReserva = toMoney(reserva.valor.toFixed(2));
          if (p.valor.greaterThan(valorReserva)) {
            throw new Error(
              `Empenho (${p.valor.toFixed(2)}) excede a reserva ` +
                `${p.reservaId} (${valorReserva.toFixed(2)}).`
            );
          }
          // V37 — O SALDO NA DATA, PARA O EMPENHO POR RESERVA (fecha SALDO-NA-DATA-DO-EMPENHO-POR-RESERVA). O empenho por
          // reserva não consome disponível novo: move o valor do reservado para o empenhado. Isso só vale a partir do dia
          // em que a reserva existe (a competência do movimento dela). Datado ANTES, o empenho consumiria um valor que
          // naquela data não estava reservado, e a liberação, datada antes da reserva, deixaria o reservado negativo no
          // intervalo. Recusa nomeando as duas datas; com data igual ou posterior, a própria reserva garante o saldo.
          const movimentoDaReserva = await tx.movimentoDotacao.findFirst({
            where: { origemId: reserva.id, tipo: "RESERVA", estornoDeId: null },
            select: { competencia: true },
          });
          if (movimentoDaReserva !== null && diaCivil(p.data) < diaCivil(movimentoDaReserva.competencia)) {
            throw new Error(
              `O empenho por reserva não pode ter data anterior à da reserva: empenho em ${diaCivilBr(p.data)}, reserva em ` +
                `${diaCivilBr(movimentoDaReserva.competencia)}. Naquela data o valor não estava reservado. Emita com data ` +
                `igual ou posterior à da reserva, ou empenhe direto, sem a reserva. Nada foi gravado.`
            );
          }
        } else {
          // Empenho direto: consome disponível.
          exigirSaldo(saldos.disponivel, p.valor, p.fichaId);
          // V36 (TR 5.10.1.10) — e o disponível NA DATA DE EMISSÃO: o empenho retroativo não consome crédito de data
          // posterior. O empenho por reserva fica fora (ver `saldo-na-data.ts`).
          await exigirSaldoNaDataDoEmpenho(tx, { fichaId: p.fichaId, data: p.data, valor: p.valor });
        }

        // M02 (TR 4.43) — a LIMITAÇÃO DE EMPENHO pelo CMD. OPT-IN: no-op se o exercício não
        // ativou a limitação (o default, e o que preserva a regressão). A cota é o posto 3 —
        // travada DEPOIS da ficha (posto 2). Ver `exigirCotaCmd`.
        await exigirCotaCmd(tx, { fichaId: p.fichaId, valor: p.valor, data: p.data });

        // M11 — DENTRO da transação: vigência, saldo do contrato (com a linha
        // travada), herança da categoria, reserva×processo e classe de bens.
        const categoria = await guardsDoContrato(tx, contratos, p);
        await guardsDaOrdem(tx, p);

        // M10 (TR 4.48) — o vínculo com a dívida. Roda com ou sem contrato.
        await exigirVinculoDeDivida(tx, p);

        // M11 (TR 4.50) — o vínculo com a OBRA. Roda com ou sem contrato: uma obra por
        // administração direta não tem contrato, e nem por isso deixa de ter CEI.
        await exigirVinculoDeObra(tx, p);

        // M28 (V22) — o vínculo com o CONVÊNIO: voluntário, mas tem de existir.
        await exigirVinculoDeConvenio(tx, p);
        await exigirVinculoDeCampanha(tx, p);
        await exigirVinculoDePpp(tx, p);
        await exigirVinculoDePrecatorio(tx, p);

        // V22 — emitido de SOLICITAÇÃO: ela tem de estar autorizada, não empenhada, e casar com
        // o empenho. ÚLTIMO trinco da transação (posto da solicitação) — logo antes de gravar.
        if (p.solicitacaoDeEmpenhoId !== undefined) {
          await exigirSolicitacaoParaEmpenho(tx, {
            solicitacaoDeEmpenhoId: p.solicitacaoDeEmpenhoId,
            fichaId: p.fichaId,
            credorCpfCnpj: p.credorCpfCnpj,
            valor: p.valor,
            tipo: p.tipo,
            contratoId: p.contratoId,
            ordemDeCompraId: p.ordemDeCompraId,
            convenioId: p.convenioId,
            obraId: p.obraId,
            dividaId: p.dividaId,
          });
        }

        await criarLancamento(tx, lancamento);

        // V22 — número reservado pelo numerador só é usado por quem o reservou (`numerador.ts`).
        await conferirNumeroDoEmpenho(tx, p.fichaId, p.numero, p.chaveDoNumero);
        const empenho = await tx.empenho.create({
          data: {
            id: p.empenhoId,
            fichaId: p.fichaId,
            subelementoId: p.subelementoId ?? null,
            // M11 — a dimensão contrato. A anulação copia este campo (ver abaixo).
            contratoId: p.contratoId ?? null,
            ordemDeCompraId: p.ordemDeCompraId ?? null,
            // M11/M10 (TR 4.49) — o que este empenho promete adquirir.
            classeDeBensId: p.classeDeBensId ?? null,
            // M10 (TR 4.48) — a dívida que este empenho amortiza.
            dividaId: p.dividaId ?? null,
            // M11 (TR 4.50) — a obra que este empenho executa. A anulação a COPIA.
            obraId: p.obraId ?? null,
            // M28 (V22) — o convênio que este empenho executa. A anulação o COPIA.
            convenioId: p.convenioId ?? null,
            // V22 — a campanha publicitária que este empenho custeia. A anulação a COPIA.
            campanhaPublicitariaId: p.campanhaPublicitariaId ?? null,
            // V36 (TR 5.10.1.89) — a parceria público-privada. A anulação a COPIA (DIMENSOES_DO_EMPENHO).
            contratoPppId: p.contratoPppId ?? null,
            // V32 — o precatório que este empenho paga. A anulação o COPIA (DIMENSOES_DO_EMPENHO).
            precatorioId: p.precatorioId ?? null,
            // V22 — a solicitação autorizada de origem (única; a anulação NÃO a copia).
            solicitacaoDeEmpenhoId: p.solicitacaoDeEmpenhoId ?? null,
            numero: p.numero,
            tipo: p.tipo,
            valor: p.valor.toFixed(2),
            data: p.data,
            credorCpfCnpj: p.credorCpfCnpj,
            historico: p.historico,
            // HERDADA do contrato quando há contrato (guardsDoContrato).
            categoriaOrdemCronologica: categoria,
            lancamentoId: lancamento.id,
            criadoPor: p.criadoPor,
          },
          select: { id: true },
        });

        await tx.movimentoDotacao.create({
          data: {
            fichaId: p.fichaId,
            tipo: "EMPENHO",
            valor: p.valor.toFixed(2),
            origemTipo: "EMPENHO",
            origemId: empenho.id,
            criadoPor: p.criadoPor,
            // ⚠️ A COMPETÊNCIA É A DATA DO EMPENHO — a MESMA que foi gravada em
            // `Empenho.data` logo acima. Era exatamente esta simetria que faltava:
            // o empenho tinha data do fato e o movimento dele, não.
            competencia: p.data,
          },
        });

        // Veio de reserva: libera o valor empenhado da retenção.
        if (p.reservaId !== undefined) {
          await tx.reservaEmpenho.create({
            data: { reservaId: p.reservaId, empenhoId: empenho.id },
          });
          await registrarMovimentoDotacao(tx, {
            fichaId: p.fichaId,
            tipo: "RESERVA_LIBERADA",
            valor: p.valor.toFixed(2),
            origemTipo: "EMPENHO_DE_RESERVA",
            origemId: empenho.id,
            estornoDeId: p.reservaId,
            criadoPor: p.criadoPor,
            data: p.data,
          });
        }

        await recalcularCache(tx, p.fichaId);
        return empenho.id;
      });
    },

    async anularEmpenho(
      p: AnularEmpenhoParams,
      lancamento: LancamentoDaDespesa
    ): Promise<string> {
      return prisma.$transaction(async (tx) => {
        const original = await tx.empenho.findUnique({
          where: { id: p.empenhoOriginalId },
          select: {
            id: true,
            fichaId: true,
            valor: true,
            categoriaOrdemCronologica: true,
            ...SELECAO_DAS_DIMENSOES,
            estornoDeId: true,
            anulacaoParcialDeId: true,
            anulacoesParciais: { select: { estornos: { select: { id: true } } } },
            estornos: { select: { id: true } },
          },
        });
        if (original === null) {
          throw new Error(`Empenho ${p.empenhoOriginalId} não encontrado.`);
        }
        exigirFatoOriginalSemParcialViva(`O empenho ${p.empenhoOriginalId}`, original, "anular");

        // ⚠️ GUARD NOVO (ADR de 2026-09-10). A anulação DEVOLVE crédito à ficha, e o
        // movimento dela carrega `p.data` como competência. Datada dentro de um
        // exercício encerrado, ela alteraria um saldo cujos demonstrativos já foram
        // publicados. Anular despesa de exercício encerrado é operação de restos a
        // pagar, não de empenho.
        await exigirCompetenciaEmExercicioAberto(tx, p.data, "anulação de empenho");
        // Recheck na tx: a garantia dura é o índice único parcial.
        if (original.estornos.length > 0) {
          throw new Error(`Empenho ${p.empenhoOriginalId} já foi anulado.`);
        }

        // A anulação DEVOLVE saldo — ela não pode estourar nada, e por isso não
        // decide nada sobre o disponível. Mas ela GRAVA e RECALCULA o cache da
        // ficha: sem o lock, uma anulação e um empenho concorrentes recalculariam
        // o cache a partir de SUMs diferentes e o último a escrever venceria — o
        // cache ficaria mentindo até a próxima operação. Trava-se pela MESMA porta,
        // na MESMA ordem.
        await travarFichas(tx, [original.fichaId]);

        // V36 (TR 5.10.1.7) — o empenho repartido em subempenhos não se anula inteiro enquanto algum deles tiver valor:
        // a parcela ficaria apontando para um empenho que deixou de existir. Anula-se antes o saldo de cada subempenho.
        const repartido = await quadroDoEmpenhoRepartido(tx, original.id);
        if (repartido.repartido.greaterThan(0)) {
          throw new Error(
            `O empenho está repartido em subempenhos (${reaisDoAdapter(repartido.repartido)}). Antes de anulá-lo inteiro, anule o saldo não liquidado de cada ` +
              "subempenho e, do que já foi liquidado neles, a liquidação. Nada foi gravado."
          );
        }

        await criarLancamento(tx, lancamento);

        // V22 — número reservado pelo numerador só é usado por quem o reservou (`numerador.ts`).
        await conferirNumeroDoEmpenho(tx, original.fichaId, p.numero, undefined);
        const anulacao = await tx.empenho.create({
          data: {
            id: p.empenhoAnulacaoId,
            fichaId: original.fichaId,
            numero: p.numero,
            tipo: "ORDINARIO",
            valor: original.valor,
            data: p.data,
            credorCpfCnpj: "ANULACAO",
            historico: p.historico,
            // a anulação herda a categoria do empenho original
            categoriaOrdemCronologica: original.categoriaOrdemCronologica,
            // ⚠️ E HERDA TODAS AS DIMENSÕES (contrato, obra, dívida, convênio, ordem...). Sem
            // isto, a soma do empenhado por contrato veria o empenho original e NÃO veria a
            // anulação dele — o contrato ficaria eternamente empenhado. Ver DIMENSOES_DO_EMPENHO.
            ...dimensoesDe(original),
            lancamentoId: lancamento.id,
            estornoDeId: original.id,
            criadoPor: p.criadoPor,
          },
          select: { id: true },
        });

        await tx.movimentoDotacao.create({
          data: {
            fichaId: original.fichaId,
            tipo: "EMPENHO_ANULADO",
            valor: original.valor,
            origemTipo: "EMPENHO_ANULADO",
            origemId: anulacao.id,
            estornoDeId: original.id,
            criadoPor: p.criadoPor,
            // A competência é a data da ANULAÇÃO, não a do empenho original: a
            // anulação é um fato NOVO, e é no mês dela que o crédito volta.
            competencia: p.data,
          },
        });

        await recalcularCache(tx, original.fichaId);
        return anulacao.id;
      });
    },


    /**
     * TR 5.35 — ANULAÇÃO PARCIAL DE EMPENHO.
     *
     * O guard é o SALDO DE BAIXO: só se anula o que ainda NÃO foi liquidado. Anular
     * abaixo do liquidado deixaria despesa reconhecida sem empenho que a cubra.
     *
     * A ficha recupera o valor POR DERIVAÇÃO: um MovimentoDotacao EMPENHO_ANULADO com
     * o valor PARCIAL. Nenhuma escrita de saldo, e NENHUM tipo novo no enum — o Record
     * de sinais já sabia o que fazer com ele.
     */
    async anularEmpenhoParcial(p, lancamento): Promise<string> {
      return prisma.$transaction(async (tx) => {
        const original = await tx.empenho.findUnique({
          where: { id: p.originalId },
          select: {
            id: true,
            fichaId: true,
            numero: true,
            valor: true,
            ...SELECAO_DAS_DIMENSOES,
            categoriaOrdemCronologica: true,
            estornoDeId: true,
            anulacaoParcialDeId: true,
            estornos: { select: { id: true } },
          },
        });
        if (original === null) {
          throw new Error(`Empenho ${p.originalId} não encontrado.`);
        }
        if (original.estornoDeId !== null || original.anulacaoParcialDeId !== null) {
          throw new Error(
            `Empenho ${p.originalId} JÁ É uma anulação — não se anula uma anulação.`
          );
        }
        if (original.estornos.length > 0) {
          throw new Error(
            `Empenho ${original.numero} já foi anulado INTEIRO — não há o que anular ` +
              `parcialmente.`
          );
        }

        // LOCK: a FICHA (posto 1) — decide-se sobre saldo, trava-se antes de somar.
        await travarFichas(tx, [original.fichaId]);
        await exigirExercicioDaFichaAberto(tx, original.fichaId, "anulação parcial");
        await exigirCompetenciaEmExercicioAberto(tx, p.data, "anulação parcial");

        // ═══ O GUARD: o SALDO A LIQUIDAR ═══
        const empenhado = await empenhadoLiquidoDoEmpenho(tx, original.id);
        const liquidado = await liquidadoLiquido(tx, original.id);
        const aLiquidar = toMoney(empenhado.minus(liquidado));

        if (p.valor.greaterThan(aLiquidar)) {
          throw new Error(
            `ANULAÇÃO PARCIAL MAIOR QUE O SALDO A LIQUIDAR do empenho ` +
              `${original.numero}: empenhado líquido ${empenhado.toFixed(2)} − ` +
              `liquidado ${liquidado.toFixed(2)} = ${aLiquidar.toFixed(2)}, e a ` +
              `anulação pede ${p.valor.toFixed(2)}. Anular abaixo do liquidado ` +
              `deixaria despesa reconhecida sem empenho que a cubra — anule a ` +
              `liquidação primeiro.`
          );
        }
        // V36 (TR 5.10.1.7) — o que está repartido em subempenhos também não se anula pelo empenho: anula-se pelo subempenho.
        const repartido = await quadroDoEmpenhoRepartido(tx, original.id);
        if (p.valor.greaterThan(repartido.livre)) {
          throw new Error(
            `ANULAÇÃO PARCIAL MAIOR QUE O SALDO LIVRE do empenho ${original.numero}: ${reaisDoAdapter(repartido.livre)} livres, ` +
              `${reaisDoAdapter(repartido.repartido)} repartidos em subempenhos, e a anulação pede ${reaisDoAdapter(p.valor)}. ` +
              "Anule antes o saldo do subempenho. Nada foi gravado."
          );
        }

        await criarLancamento(tx, lancamento);

        // V22 — número reservado pelo numerador só é usado por quem o reservou (`numerador.ts`).
        await conferirNumeroDoEmpenho(tx, original.fichaId, p.numero, p.chaveDoNumero);
        const anulacao = await tx.empenho.create({
          data: {
            id: p.anulacaoId,
            fichaId: original.fichaId,
            numero: p.numero,
            tipo: "ORDINARIO",
            valor: p.valor.toFixed(2),
            data: p.data,
            credorCpfCnpj: "ANULACAO_PARCIAL",
            historico: p.motivo,
            categoriaOrdemCronologica: original.categoriaOrdemCronologica,
            // ⚠️ COPIA as dimensões: sem isso, a soma por CONTRATO veria o empenho e
            // não veria a redução dele (a lição do bloco 2 do M11). Ver DIMENSOES_DO_EMPENHO.
            ...dimensoesDe(original),
            lancamentoId: lancamento.id,
            // ⚠️ NÃO é estornoDeId: a parcial REDUZ, não NEGA.
            anulacaoParcialDeId: original.id,
            criadoPor: p.criadoPor,
          },
          select: { id: true },
        });

        // A ficha recupera o valor POR DERIVAÇÃO.
        await tx.movimentoDotacao.create({
          data: {
            fichaId: original.fichaId,
            tipo: "EMPENHO_ANULADO",
            valor: p.valor.toFixed(2),
            origemTipo: "ANULACAO_PARCIAL_EMPENHO",
            origemId: anulacao.id,
            criadoPor: p.criadoPor,
            // Data da anulação parcial — o fato novo que reduz.
            competencia: p.data,
          },
        });

        await recalcularCache(tx, original.fichaId);
        return anulacao.id;
      });
    },

    /**
     * TR 5.35 — ANULAÇÃO PARCIAL DE LIQUIDAÇÃO.
     *
     * Guard: o saldo NÃO PAGO. E a CASCATA (M10): quem gerou fato a partir desta
     * liquidação (a entrada no almoxarifado) tem de caber no NOVO líquido — senão a
     * anulação INTEIRA é rejeitada, sem estado intermediário.
     */
    async anularLiquidacaoParcial(p, lancamento): Promise<string> {
      return prisma.$transaction(async (tx) => {
        // LOCK: a LIQUIDAÇÃO (posto 3).
        await travarLiquidacoes(tx, [p.originalId]);

        const original = await tx.liquidacao.findUnique({
          where: { id: p.originalId },
          select: {
            id: true,
            empenhoId: true,
            numero: true,
            valor: true,
            estornoDeId: true,
            anulacaoParcialDeId: true,
            documentoFiscalId: true,
            estornos: { select: { id: true } },
          },
        });
        if (original === null) {
          throw new Error(`Liquidação ${p.originalId} não encontrada.`);
        }
        if (original.estornoDeId !== null || original.anulacaoParcialDeId !== null) {
          throw new Error(`Liquidação ${p.originalId} JÁ É uma anulação.`);
        }
        if (original.estornos.length > 0) {
          throw new Error(`Liquidação ${original.numero} já foi anulada INTEIRA.`);
        }
        await exigirLiquidacaoCorrente(tx, original.empenhoId);

        const liquidado = await liquidoDaLiquidacao(tx, original.id);
        const pago = await pagoLiquido(tx, original.id);
        const naoPago = toMoney(liquidado.minus(pago));

        if (p.valor.greaterThan(naoPago)) {
          throw new Error(
            `ANULAÇÃO PARCIAL MAIOR QUE O SALDO NÃO PAGO da liquidação ` +
              `${original.numero}: liquidado líquido ${liquidado.toFixed(2)} − pago ` +
              `${pago.toFixed(2)} = ${naoPago.toFixed(2)}, e a anulação pede ` +
              `${p.valor.toFixed(2)}. Anular abaixo do pago deixaria o fornecedor com ` +
              `dinheiro que a despesa já não reconhece — anule o pagamento primeiro.`
          );
        }

        // ═══ A CASCATA (M10) — DENTRO da transação, ANTES de gravar ═══
        // Se as entradas de almoxarifado não couberem no novo líquido, NADA acontece.
        if (aoAnularLiquidacao !== undefined) {
          await aoAnularLiquidacao.aoAnularParcial(
            tx,
            original.id,
            toMoney(liquidado.minus(p.valor))
          );
        }

        await criarLancamento(tx, lancamento);

        // V22 — número reservado pelo numerador só é usado por quem o reservou (`numerador.ts`): conferido no fim.
        const anulacao = await tx.liquidacao.create({
          data: {
            id: p.anulacaoId,
            empenhoId: original.empenhoId,
            numero: p.numero,
            valor: p.valor.toFixed(2),
            data: p.data,
            responsavelAtesto: "ANULACAO_PARCIAL",
            // V23 — SAGRES EstornoLiquidacao §4.11 (obrigatório no leiaute).
            motivo: p.motivo,
            lancamentoId: lancamento.id,
            anulacaoParcialDeId: original.id,
            documentoFiscalId: original.documentoFiscalId,
            criadoPor: p.criadoPor,
          },
          select: { id: true },
        });
        // ⚠️ V37 — conferido DEPOIS de gravar, como em todo caminho que grava liquidação com número: a linha (empenho,
        // número) primeiro, o NumeradorDoExercicio (último posto) por último. Ordem única entre os caminhos, para dois
        // atos concorrentes com o mesmo número não se esperarem em cruz (um na linha, outro no numerador).
        await conferirNumeroDaLiquidacao(tx, original.empenhoId, p.numero, p.chaveDoNumero);
        return anulacao.id;
      });
    },

    /**
     * TR 5.35 — ANULAÇÃO PARCIAL DE PAGAMENTO.
     *
     * ⚠️ AS DUAS PORTAS FECHADAS (guards ANTES de tudo):
     *  · pagamento COM RETENÇÃO (M07): o lançamento é COMPOSTO — o caixa levou o
     *    líquido, a obrigação morreu pelo bruto, e o retido virou passivo do
     *    consignatário. Reduzi-lo em parte exigiria decidir de QUEM sai o pedaço
     *    anulado (do fornecedor ou do INSS), e essa resposta não está em lugar nenhum.
     *  · pagamento que AMORTIZOU DÍVIDA (M10): a amortização nasceu junto e teria de
     *    encolher junto — e "encolher uma amortização" é um fato que ninguém definiu.
     * Nos dois casos: anule o pagamento INTEIRO e refaça-o pelo valor certo.
     */
    async anularPagamentoParcial(p, lancamento): Promise<string> {
      return prisma.$transaction(async (tx) => {
        const original = await tx.pagamento.findUnique({
          where: { id: p.originalId },
          select: {
            id: true,
            liquidacaoId: true,
            numero: true,
            valor: true,
            contaBancaria: true,
            fonteId: true,
            estornoDeId: true,
            anulacaoParcialDeId: true,
            estornos: { select: { id: true } },
            retencoes: { select: { id: true } },
            retencoesProprias: { select: { id: true } },
            movimentosDivida: { select: { id: true } },
          },
        });
        if (original === null) {
          throw new Error(`Pagamento ${p.originalId} não encontrado.`);
        }
        if (original.estornoDeId !== null || original.anulacaoParcialDeId !== null) {
          throw new Error(`Pagamento ${p.originalId} JÁ É uma anulação.`);
        }
        if (original.estornos.length > 0) {
          throw new Error(`Pagamento ${original.numero} já foi anulado INTEIRO.`);
        }

        // ═══ PORTA FECHADA 1: RETENÇÃO (M07) ═══
        if (original.retencoes.length > 0 || original.retencoesProprias.length > 0) {
          throw new Error(
            `ANULAÇÃO PARCIAL DE PAGAMENTO COM RETENÇÃO É PROIBIDA ` +
              `(${original.numero}): o lançamento é COMPOSTO — o caixa levou o ` +
              `líquido, a obrigação morreu pelo bruto, e o retido virou passivo do ` +
              `consignatário. Reduzi-lo em parte exigiria decidir de QUEM sai o pedaço ` +
              `anulado (do fornecedor ou do consignatário), e essa resposta não está ` +
              `em lugar nenhum. Anule o pagamento INTEIRO e refaça-o pelo valor certo.`
          );
        }

        // ═══ PORTA FECHADA 2: AMORTIZAÇÃO DE DÍVIDA (M10) ═══
        if (original.movimentosDivida.length > 0) {
          throw new Error(
            `ANULAÇÃO PARCIAL DE PAGAMENTO QUE AMORTIZOU DÍVIDA É PROIBIDA ` +
              `(${original.numero}): a amortização nasceu DENTRO deste pagamento e ` +
              `teria de encolher junto — e "encolher uma amortização" é um fato que ` +
              `ninguém definiu. Anule o pagamento INTEIRO (a amortização é estornada ` +
              `junto, na mesma transação) e refaça-o pelo valor certo.`
          );
        }

        // LOCK: a LIQUIDAÇÃO (posto 3) — decide-se sobre o pago dela.
        await travarLiquidacoes(tx, [original.liquidacaoId]);
        await exigirAnulacaoDePagamentoCorrente(tx, original.id);

        const pagoDoFato = await liquidoDoPagamento(tx, original.id);
        if (p.valor.greaterThan(pagoDoFato)) {
          throw new Error(
            `ANULAÇÃO PARCIAL MAIOR QUE O PAGAMENTO ${original.numero}: ele vale ` +
              `${pagoDoFato.toFixed(2)} (já líquido de outras anulações parciais), e a ` +
              `anulação pede ${p.valor.toFixed(2)}.`
          );
        }

        await criarLancamento(tx, lancamento);

        const anulacao = await tx.pagamento.create({
          data: {
            id: p.anulacaoId,
            liquidacaoId: original.liquidacaoId,
            numero: p.numero,
            valor: p.valor.toFixed(2),
            data: p.data,
            contaBancaria: original.contaBancaria,
            fonteId: original.fonteId,
            lancamentoId: lancamento.id,
            anulacaoParcialDeId: original.id,
            motivo: p.motivo,
            criadoPor: p.criadoPor,
          },
          select: { id: true },
        });
        return anulacao.id;
      });
    },


    /**
     * TR 5.35 — O ESTORNO DE UMA ANULAÇÃO PARCIAL.
     *
     * A parcial era um FATO — e todo fato se estorna. O estorno usa `estornoDeId`
     * (ele NEGA a parcial inteira), e as duas colunas passam a conviver dizendo coisas
     * diferentes: `anulacaoParcialDeId` REDUZ; `estornoDeId` NEGA.
     *
     * O original volta ao valor de antes POR DERIVAÇÃO: a parcial deixa de estar viva,
     * e `packages/estornaveis` para de descontá-la. Nenhuma escrita no original.
     */
    async estornarAnulacaoParcial(p, lancamento): Promise<string> {
      return prisma.$transaction(async (tx) => {
        // ⚠️ GUARD NOVO (ADR de 2026-09-10) — o estorno RECONSOME dotação, com `p.data`
        // como competência. Mesma razão da anulação: não se mexe em exercício encerrado.
        await exigirCompetenciaEmExercicioAberto(
          tx,
          p.data,
          "estorno de anulação parcial"
        );

        if (p.nivel === "EMPENHO") {
          const parcial = await tx.empenho.findUnique({
            where: { id: p.anulacaoId },
            select: {
              id: true,
              fichaId: true,
              numero: true,
              valor: true,
              ...SELECAO_DAS_DIMENSOES,
              categoriaOrdemCronologica: true,
              anulacaoParcialDeId: true,
              estornos: { select: { id: true } },
            },
          });
          if (parcial === null || parcial.anulacaoParcialDeId === null) {
            throw new Error(
              `${p.anulacaoId} não é uma ANULAÇÃO PARCIAL de empenho.`
            );
          }
          if (parcial.estornos.length > 0) {
            throw new Error(`Anulação parcial ${parcial.numero} já foi estornada.`);
          }

          // LOCK: a ficha — restaurar o empenho CONSOME dotação de novo.
          await travarFichas(tx, [parcial.fichaId]);
          // ⚠️ CORRENTE: restaurar o empenho consome dotação AGORA.
          const saldos = calcularSaldos(await totaisPorTipo(tx, parcial.fichaId, { eixo: "CORRENTE" }));
          const valor = toMoney(parcial.valor.toFixed(2));
          exigirSaldo(saldos.disponivel, valor, parcial.fichaId);

          await criarLancamento(tx, lancamento);

          // V22 — número reservado pelo numerador só é usado por quem o reservou (`numerador.ts`).
          await conferirNumeroDoEmpenho(tx, parcial.fichaId, p.numero, undefined);
          const estorno = await tx.empenho.create({
            data: {
              id: p.estornoId,
              fichaId: parcial.fichaId,
              numero: p.numero,
              tipo: "ORDINARIO",
              valor: parcial.valor,
              data: p.data,
              credorCpfCnpj: "ESTORNO_ANULACAO_PARCIAL",
              historico: p.motivo,
              categoriaOrdemCronologica: parcial.categoriaOrdemCronologica,
              // O estorno da parcial entra em toda soma filtrada: sem as dimensões, a parcial
              // continuaria "viva" para quem filtra por elas. Ver DIMENSOES_DO_EMPENHO.
              ...dimensoesDe(parcial),
              lancamentoId: lancamento.id,
              estornoDeId: parcial.id,
              criadoPor: p.criadoPor,
            },
            select: { id: true },
          });

          // A dotação volta a ser consumida — derivação, nunca escrita de saldo.
          await tx.movimentoDotacao.create({
            data: {
              fichaId: parcial.fichaId,
              tipo: "EMPENHO",
              valor: parcial.valor,
              origemTipo: "ESTORNO_ANULACAO_PARCIAL_EMPENHO",
              origemId: estorno.id,
              estornoDeId: parcial.id,
              criadoPor: p.criadoPor,
              // Data do ESTORNO. A dotação volta a ser consumida no mês em que se
              // estornou, não naquele em que se anulou.
              competencia: p.data,
            },
          });

          await recalcularCache(tx, parcial.fichaId);
          return estorno.id;
        }

        if (p.nivel === "LIQUIDACAO") {
          const parcial = await tx.liquidacao.findUnique({
            where: { id: p.anulacaoId },
            select: {
              id: true,
              empenhoId: true,
              numero: true,
              valor: true,
              anulacaoParcialDeId: true,
              documentoFiscalId: true,
              estornos: { select: { id: true } },
            },
          });
          if (parcial === null || parcial.anulacaoParcialDeId === null) {
            throw new Error(
              `${p.anulacaoId} não é uma ANULAÇÃO PARCIAL de liquidação.`
            );
          }
          if (parcial.estornos.length > 0) {
            throw new Error(`Anulação parcial ${parcial.numero} já foi estornada.`);
          }
          // V36 (TR 5.10.1.7) — o estorno DEVOLVE valor ao liquidado do empenho (e do subempenho da liquidação original).
          // Trava-se a FICHA do empenho antes da liquidação (a ordem dos postos), a mesma trava da emissão e da anulação
          // do subempenho e da liquidação, e confere-se que o liquidado de volta ainda cabe: no empenhado (o empenho pode
          // ter sido anulado em parte depois da anulação da liquidação), no saldo do subempenho (ele pode ter tido o saldo
          // anulado) ou, na liquidação direta de empenho repartido, no livre.
          const doEmpenho = await tx.empenho.findUniqueOrThrow({ where: { id: parcial.empenhoId }, select: { fichaId: true, numero: true } });
          await travarFichas(tx, [doEmpenho.fichaId]);
          await travarLiquidacoes(tx, [parcial.anulacaoParcialDeId]);
          const devolvido = toMoney(parcial.valor.toFixed(2));
          const empenhadoAgora = await empenhadoLiquidoDoEmpenho(tx, parcial.empenhoId);
          const liquidadoAgora = await liquidadoLiquido(tx, parcial.empenhoId);
          if (liquidadoAgora.plus(devolvido).greaterThan(empenhadoAgora)) {
            throw new Error(
              `O estorno devolveria ${reaisDoAdapter(devolvido)} ao liquidado do empenho ${doEmpenho.numero}, que passaria do empenhado ` +
                `(${reaisDoAdapter(empenhadoAgora)}, já liquidados ${reaisDoAdapter(liquidadoAgora)}): o empenho foi anulado em parte depois. Nada foi gravado.`
            );
          }
          const original = await tx.liquidacao.findUniqueOrThrow({ where: { id: parcial.anulacaoParcialDeId }, select: { subempenhoId: true } });
          const repartido = await quadroDoEmpenhoRepartido(tx, parcial.empenhoId);
          const sub = original.subempenhoId === null ? undefined : repartido.subempenhos.find((s) => s.id === original.subempenhoId);
          if (sub !== undefined ? devolvido.greaterThan(sub.saldo) : repartido.subempenhos.length > 0 && devolvido.greaterThan(repartido.livre)) {
            throw new Error(
              sub !== undefined
                ? `O estorno devolveria ${reaisDoAdapter(devolvido)} ao subempenho ${doEmpenho.numero}/${String(sub.numero)}, que tem só ${reaisDoAdapter(sub.saldo)} de saldo (parte foi anulada depois). Nada foi gravado.`
                : `O estorno devolveria ${reaisDoAdapter(devolvido)} à liquidação direta do empenho ${doEmpenho.numero}, que tem só ${reaisDoAdapter(repartido.livre)} livres (o resto está em subempenhos). Nada foi gravado.`
            );
          }

          await criarLancamento(tx, lancamento);
          // V22 — número reservado pelo numerador só é usado por quem o reservou (`numerador.ts`): conferido no fim.
          const estorno = await tx.liquidacao.create({
            data: {
              id: p.estornoId,
              empenhoId: parcial.empenhoId,
              numero: p.numero,
              valor: parcial.valor,
              data: p.data,
              responsavelAtesto: "ESTORNO_ANULACAO_PARCIAL",
              lancamentoId: lancamento.id,
              estornoDeId: parcial.id,
              documentoFiscalId: parcial.documentoFiscalId,
              criadoPor: p.criadoPor,
            },
            select: { id: true },
          });
          // V37 — conferido depois de gravar, na ordem única dos caminhos que gravam liquidação com número.
          await conferirNumeroDaLiquidacao(tx, parcial.empenhoId, p.numero, undefined);
          return estorno.id;
        }

        const parcial = await tx.pagamento.findUnique({
          where: { id: p.anulacaoId },
          select: {
            id: true,
            liquidacaoId: true,
            numero: true,
            valor: true,
            contaBancaria: true,
            fonteId: true,
            anulacaoParcialDeId: true,
            estornos: { select: { id: true } },
          },
        });
        if (parcial === null || parcial.anulacaoParcialDeId === null) {
          throw new Error(
            `${p.anulacaoId} não é uma ANULAÇÃO PARCIAL de pagamento.`
          );
        }
        if (parcial.estornos.length > 0) {
          throw new Error(`Anulação parcial ${parcial.numero} já foi estornada.`);
        }
        await travarLiquidacoes(tx, [parcial.liquidacaoId]);

        await criarLancamento(tx, lancamento);
        const estorno = await tx.pagamento.create({
          data: {
            id: p.estornoId,
            liquidacaoId: parcial.liquidacaoId,
            numero: p.numero,
            valor: parcial.valor,
            data: p.data,
            contaBancaria: parcial.contaBancaria,
            fonteId: parcial.fonteId,
            lancamentoId: lancamento.id,
            estornoDeId: parcial.id,
            criadoPor: p.criadoPor,
          },
          select: { id: true },
        });
        return estorno.id;
      });
    },

    async liberarReserva(p: LiberarReservaParams): Promise<string> {
      return prisma.$transaction((tx) => liberarReservaNaTransacao(tx, p));
    },

    async saldosReais(
      fichaId: string,
      corte: CorteTemporal
    ): Promise<SaldosFicha> {
      return calcularSaldos(await totaisPorTipo(prisma, fichaId, corte));
    },

    async saldosCache(fichaId: string): Promise<SaldosFicha> {
      const f = await prisma.fichaOrcamentaria.findUniqueOrThrow({
        where: { id: fichaId },
        select: {
          saldoAutorizado: true,
          saldoReservado: true,
          saldoEmpenhado: true,
          saldoDisponivel: true,
        },
      });
      return {
        autorizado: toMoney(f.saldoAutorizado.toFixed(2)),
        reservado: toMoney(f.saldoReservado.toFixed(2)),
        empenhado: toMoney(f.saldoEmpenhado.toFixed(2)),
        disponivel: toMoney(f.saldoDisponivel.toFixed(2)),
      };
    },

    async buscarEmpenho(id: string): Promise<EmpenhoResumo | null> {
      const e = await prisma.empenho.findUnique({
        where: { id },
        select: {
          id: true,
          fichaId: true,
          numero: true,
          valor: true,
          lancamentoId: true,
          estornoDeId: true,
          estornos: { select: { id: true } },
        },
      });
      if (e === null) return null;
      return {
        id: e.id,
        fichaId: e.fichaId,
        numero: e.numero,
        valor: toMoney(e.valor.toFixed(2)),
        lancamentoId: e.lancamentoId,
        estornoDeId: e.estornoDeId,
        estornos: e.estornos.map((x) => x.id),
      };
    },

    async buscarLancamentoDoEmpenho(
      empenhoId: string
    ): Promise<LancamentoContabil> {
      const e = await prisma.empenho.findUniqueOrThrow({
        where: { id: empenhoId },
        select: {
          lancamento: {
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
          },
        },
      });

      const l = e.lancamento;
      const partidas: readonly Partida[] = l.partidas.map((p) => ({
        conta: p.conta.codigo,
        tipo: p.tipo,
        subsistema: p.subsistema,
        valor: toMoney(p.valor.toFixed(2)),
      }));

      return {
        id: l.id,
        numeroControle: l.numeroControle,
        partidas,
        dataTransacao: l.dataTransacao,
        historico: l.historico,
        ...(l.estornoDeId !== null ? { estornoDeId: l.estornoDeId } : {}),
        estornos: l.estornos.map((x) => x.id),
      };
    },

    // ── BLOCO 2 ─────────────────────────────────────────────────────────────

    async liquidar(p, lancamento): Promise<string> {
      return prisma.$transaction(async (tx) => {
        const empenho = await tx.empenho.findUnique({
          where: { id: p.empenhoId },
          select: {
            id: true,
            numero: true,
            tipo: true,
            fichaId: true,
            valor: true,
            obraId: true,
            contratoId: true,
            credorCpfCnpj: true,
            ordemDeCompraId: true,
            estornoDeId: true,
            anulacaoParcialDeId: true,
            estornos: { select: { id: true } },
            // ⚠️ M10 (ENT06 item 2) — O ELEMENTO decide se esta liquidação é de MATERIAL, e
            // material não vira despesa: vira ESTOQUE. A leitura é aqui, DENTRO da
            // transação, porque é aqui que a decisão tem de valer — a mesma disciplina da
            // medição de obra logo abaixo.
            ficha: {
              select: {
                naturezaDespesa: { select: { codElemento: true, codigoCompleto: true } },
              },
            },
          },
        });
        if (empenho === null) {
          throw new Error(`Empenho ${p.empenhoId} não encontrado.`);
        }
        if (empenho.estornos.length > 0) {
          throw new Error(`Empenho ${p.empenhoId} está ANULADO — não se liquida.`);
        }
        exigirFatoOriginalSemParcialViva(`O empenho ${p.empenhoId}`, empenho, "liquidar");

        // ⚠️ LOCK: a FICHA do empenho (posto 2), ANTES de somar o já liquidado. Achado de V7 M2 U3 (m05-concorrencia t5):
        // duas liquidações concorrentes de 700 num empenho de 1.000 liam "já liquidado = 0" e gravavam as duas. É a
        // mesma primitiva do empenho sobre a ficha; os trincos posteriores desta transação (o contrato da parcela, a
        // classe de material) têm posto maior.
        await travarFichas(tx, [empenho.fichaId]);

        // M08 — empenho de exercício encerrado saiu do orçamento corrente:
        // ele se liquida por liquidarRestosAPagar(), não aqui.
        await exigirLiquidacaoCorrente(tx, p.empenhoId);

        // ⚠️ V7 M2 U3 — A PARCELA RECEBIDA DO CONTRATO, conferida PRIMEIRO e antes de gravar: soma, documento de
        // cobrança, empenho do contrato e credor, elegível não consumido — sob o trinco do contrato (posto 5; nada foi
        // travado antes nesta transação). Vem antes do limite do empenho e do saldo da nota para que a recusa de uma
        // parcela já consumida diga ISSO (e não "excede o empenho"). As alocações vão no mesmo commit, depois da liquidação.
        if (p.parcelasDoContrato !== undefined) {
          await conferirParcelasDaLiquidacao(tx, {
            empenho: { id: empenho.id, contratoId: empenho.contratoId, credorCpfCnpj: empenho.credorCpfCnpj, debitaEstoque: elementoDebitaEstoque(empenho.ficha.naturezaDespesa.codElemento) },
            documentoFiscalId: p.documentoFiscalId,
            valor: p.valor,
            data: p.data,
            parcelas: p.parcelasDoContrato,
          });
        }

        // INVARIANTE 3: limite lido do SUM REAL, dentro da transação — e o empenhado é o LÍQUIDO das anulações
        // parciais vivas (V33): pelo bruto, liquidava-se a parte que a parcial já tinha devolvido à ficha.
        const empenhado = await empenhadoLiquidoDoEmpenho(tx, p.empenhoId);
        const jaLiquidado = await liquidadoLiquido(tx, p.empenhoId);
        // V35 — O EMPENHO ORDINÁRIO SE LIQUIDA DE UMA VEZ (MCASP 11ª ed., Parte I, 4.4.2.1: "despesas de valor fixo e
        // previamente determinado, cujo pagamento deva ocorrer de uma só vez"). Despesa em parcelas é empenho GLOBAL;
        // montante indeterminado, ESTIMATIVO. Liquidação estornada não conta: o líquido é zero e a despesa se refaz.
        if (empenho.tipo === "ORDINARIO" && jaLiquidado.greaterThan(0)) {
          throw new Error(
            `O empenho ${empenho.numero} é ORDINÁRIO e já tem liquidação de ${jaLiquidado.toFixed(2)}: o empenho ordinário é de valor fixo, ` +
              "pago de uma só vez (MCASP, Parte I, 4.4.2.1). Despesa em parcelas se empenha como GLOBAL; de montante indeterminado, como ESTIMATIVO. " +
              "Se a liquidação anterior está errada, estorne-a e liquide de novo. Nada foi gravado."
          );
        }
        const depois = toMoney(jaLiquidado.plus(p.valor));

        if (depois.greaterThan(empenhado)) {
          throw new Error(
            `Liquidação excede o empenho ${p.empenhoId}: empenhado ` +
              `${empenhado.toFixed(2)}, já liquidado ${jaLiquidado.toFixed(2)}, ` +
              `solicitado ${p.valor.toFixed(2)}.`
          );
        }

        // V36 (TR 5.10.1.7) — O SUBEMPENHO: a liquidação que o informa cabe no saldo dele; a direta, num empenho
        // repartido, cabe no livre (o repartido está reservado aos subempenhos). Sob a mesma trava da ficha.
        conferirSubempenhoDaLiquidacao(await quadroDoEmpenhoRepartido(tx, p.empenhoId), {
          numeroDoEmpenho: empenho.numero,
          tipo: empenho.tipo,
          subempenhoId: p.subempenhoId,
          valor: p.valor,
          data: p.data,
        });

        // ⚠️ M11 (ENT03b) — LIQUIDAR OBRA EXIGE MEDIÇÃO APROVADA (Lei 14.133, art. 140).
        //
        // O guard é UNIDIRECIONAL, como o do `obraId` no empenho: empenho COM obra exige
        // medição; empenho sem obra ignora o campo. A liquidação de custeio, de material e
        // de serviço não tem medição nenhuma, e exigi-la delas quebraria a execução inteira.
        //
        // ⚠️ AQUI, NA TRANSAÇÃO DA LIQUIDAÇÃO, e não na borda: se a medição não serve, a
        // LIQUIDAÇÃO INTEIRA aborta. Não existe "liquidou sem medir".
        if (empenho.obraId !== null) {
          await exigirMedicaoAprovadaDaObra(tx, {
            obraId: empenho.obraId,
            medicaoId: p.medicaoId,
            valorDaLiquidacao: p.valor,
          });
        }

        const notaDoDocumento = await exigirDocumentoFiscalDaLiquidacao(tx, p, empenho);

        await criarLancamento(tx, lancamento);

        // V22 — número reservado pelo numerador só é usado por quem o reservou (`numerador.ts`): conferido NO FIM
        // da transação (ver o fim deste caso de uso), não aqui.
        const liq = await tx.liquidacao.create({
          data: {
            id: p.liquidacaoId,
            empenhoId: p.empenhoId,
            medicaoId: p.medicaoId ?? null,
            subempenhoId: p.subempenhoId ?? null,
            numero: p.numero,
            valor: p.valor.toFixed(2),
            data: p.data,
            responsavelAtesto: p.responsavelAtesto,
            despesaSemEmpenhoPrevio: p.despesaSemEmpenhoPrevio === true,
            notaFiscalChave: notaDoDocumento.notaFiscalChave ?? p.notaFiscalChave ?? null,
            notaFiscalNum: notaDoDocumento.notaFiscalNum ?? p.notaFiscalNum ?? null,
            notaFiscalSerie: notaDoDocumento.notaFiscalSerie ?? p.notaFiscalSerie ?? null,
            notaFiscalData: notaDoDocumento.notaFiscalData ?? p.notaFiscalData ?? null,
            notaFiscalValor: (notaDoDocumento.notaFiscalValor ?? p.notaFiscalValor)?.toFixed(2) ?? null,
            documentoFiscalId: p.documentoFiscalId ?? null,
            lancamentoId: lancamento.id,
            criadoPor: p.criadoPor,
          },
          select: { id: true },
        });

        if (p.parcelasDoContrato !== undefined) await gravarAlocacoesDaLiquidacao(tx, liq.id, p.parcelasDoContrato, p.criadoPor);

        // ═══ ⚠️ M10 (ENT06 item 2; sessão noturna V4 §6) — LIQUIDAR MATERIAL É UM ATO SÓ ═══
        //
        // O rol do M01 manda o elemento de material debitar ESTOQUE: a despesa não some, vira
        // ativo. Mas o estoque tem dono, e é o M10. Gravar a liquidação aqui e deixar a entrada
        // para uma segunda chamada deixaria — no intervalo, ou para sempre, se a segunda
        // falhasse — estoque no razão que NENHUM movimento explica.
        //
        // ⚠️ O GATILHO É A NATUREZA DA OPERAÇÃO (achado A08 da auditoria): "este elemento liquida
        // em estoque?" — a resposta do rol do M01 (`elementoDebitaEstoque`), a MESMA que escolheu a
        // perna de débito. Não é a existência de uma `ClasseDeMaterial` cadastrada: cadastro
        // ausente não desliga a obrigação de integrar — vira pendência IMPEDITIVA, nomeada abaixo.
        //
        // ⚠️ RESTRIÇÃO DECLARADA: uma liquidação é de UM elemento (empenho → ficha → natureza), e
        // por isso é INTEIRAMENTE de material ou não é de material. Um documento fiscal misto
        // (material e serviço) são DUAS liquidações, uma por empenho/ficha — e as entradas de
        // estoque fecham com a liquidação de material, nunca com o bruto do documento.
        const codElemento = empenho.ficha.naturezaDespesa.codElemento;
        if (elementoDebitaEstoque(codElemento)) {
          const naturezaTexto = `${codElemento} (${empenho.ficha.naturezaDespesa.codigoCompleto})`;
          // ⚠️ FAIL-CLOSED, e é a diferença deliberada para o port da ANULAÇÃO — lá, módulo
          // ausente não pode travar o M05. Aqui, ausente significaria gravar o furo.
          if (aoLiquidarMaterial === undefined) {
            throw new Error(
              `LIQUIDAÇÃO DE MATERIAL SEM O ALMOXARIFADO LIGADO: o empenho é do elemento ` +
                `${naturezaTexto}, que debita ESTOQUE, e este repositório foi montado sem o port ` +
                `do M10. Liquidar assim deixaria o razão com estoque que nenhum movimento explica. ` +
                `Use \`criarM05DepsComAlmoxarifado\`. Nada foi gravado.`
            );
          }
          if (p.entradasDeMaterial === undefined || p.entradasDeMaterial.length === 0) {
            throw new Error(
              `LIQUIDAÇÃO DE MATERIAL SEM A ENTRADA NO ALMOXARIFADO: o empenho é do elemento ` +
                `${naturezaTexto}, e material de consumo vira ESTOQUE. Informe a CLASSE de material ` +
                `de cada parcela — uma nota abastece mais de uma (papel e toner são contas ` +
                `diferentes), e a soma delas tem de fechar com o valor liquidado. Documento fiscal ` +
                `misto (material e serviço) são duas liquidações, uma por empenho. Nada foi gravado.`
            );
          }
          // ⚠️ A CONFIGURAÇÃO OBRIGATÓRIA: cada classe informada existe, está ativa e declara a
          // conta que ESTA liquidação debitou. Sem isso, a integração não "não se aplica": ela
          // está IMPEDIDA por cadastro ausente, e a liquidação é recusada nomeando o que falta.
          const contasDebitadas = new Set(lancamento.partidas.filter((x) => x.tipo === "DEBITO").map((x) => x.contaId));
          for (const e of p.entradasDeMaterial) {
            const classe = await tx.classeDeMaterial.findUnique({
              where: { id: e.classeDeMaterialId },
              select: { codigo: true, ativa: true, contaContabilId: true, contaContabil: { select: { codigo: true } } },
            });
            if (classe === null) {
              throw new Error(
                `CONFIGURAÇÃO OBRIGATÓRIA AUSENTE: a classe de material ${e.classeDeMaterialId} não existe. ` +
                  `A liquidação do elemento ${naturezaTexto} é de material e exige uma classe cadastrada que ` +
                  `declare a conta de estoque debitada. Cadastre a classe antes de liquidar. Nada foi gravado.`
              );
            }
            if (!classe.ativa) {
              throw new Error(
                `CONFIGURAÇÃO OBRIGATÓRIA AUSENTE: a classe de material ${classe.codigo} está INATIVA — não ` +
                  `recebe entrada. Reative-a ou informe outra classe. Nada foi gravado.`
              );
            }
            if (!contasDebitadas.has(classe.contaContabilId)) {
              throw new Error(
                `CONFIGURAÇÃO OBRIGATÓRIA AUSENTE: a classe de material ${classe.codigo} declara a conta ` +
                  `${classe.contaContabil.codigo}, mas esta liquidação debitou outra conta de estoque. ` +
                  `A amarração razão × almoxarifado só fecha quando a classe aponta para a conta que a ` +
                  `liquidação debita — ajuste o cadastro da classe (ou o roteiro) antes de liquidar. ` +
                  `Nada foi gravado.`
              );
            }
          }

          await aoLiquidarMaterial.aoLiquidarMaterial(tx, {
            liquidacaoId: liq.id,
            valorDaLiquidacao: p.valor,
            dataMovimento: p.data,
            entradas: p.entradasDeMaterial,
            criadoPor: p.criadoPor,
          });
        }

        // ⚠️ V37 — O NÚMERO SE CONFERE POR ÚLTIMO. A conferência trava o NumeradorDoExercicio, o último posto da ordem
        // de locks; a entrada no almoxarifado (acima) trava a liquidação, a classe e o estoque, de posto menor. Conferido
        // antes, toda liquidação de material com número só de dígitos — o que a tela manda — era recusada pela guarda de
        // inversão (medido no percurso das compras; t1b do M10). Na mesma transação, a recusa do número desfaz tudo.
        await conferirNumeroDaLiquidacao(tx, p.empenhoId, p.numero, undefined);
        return liq.id;
      });
    },

    async pagar(p, lancamento): Promise<string> {
      return prisma.$transaction(async (tx) => {
        // 3º LOCK da ordem: a LIQUIDAÇÃO, ANTES de somar o já-pago.
        await travarLiquidacoes(tx, [p.liquidacaoId]);

        const liq = await tx.liquidacao.findUnique({
          where: { id: p.liquidacaoId },
          select: {
            id: true,
            valor: true,
            estornoDeId: true,
            anulacaoParcialDeId: true,
            estornos: { select: { id: true } },
          },
        });
        if (liq === null) {
          throw new Error(`Liquidação ${p.liquidacaoId} não encontrada.`);
        }
        if (liq.estornos.length > 0) {
          throw new Error(`Liquidação ${p.liquidacaoId} está ANULADA — não se paga.`);
        }
        exigirFatoOriginalSemParcialViva(`A liquidação ${p.liquidacaoId}`, liq, "pagar");

        // M08 — pagamento de despesa de exercício encerrado é pagamento de
        // RESTOS A PAGAR: ele baixa a inscrição, não a dotação.
        await exigirPagamentoCorrente(tx, p.liquidacaoId);

        // TR 5.23 — a fonte do pagamento TEM de casar com a fonte da conta.
        const conta = await tx.contaBancaria.findUnique({
          where: { codigo: p.contaBancaria },
          select: { id: true, codigo: true, fonteId: true },
        });
        if (conta === null) {
          throw new Error(
            `Conta bancária "${p.contaBancaria}" não cadastrada.`
          );
        }
        // ⚠️ "NO ROL", e não "igual à da conta" — ver `guard-fonte.ts`. A conta admite
        // várias fontes desde o ADR de 2026-09-10.
        await exigirFonteNoRolDaConta(tx, { id: conta.id }, p.fonteId, "pagamento");

        // ...E O OUTRO ELO DA CORRENTE: a fonte da FICHA que autorizou a despesa. O
        // guard da conta sozinho deixava pagar uma despesa da fonte 500 com dinheiro do
        // FUNDEB — bastava usar a conta do FUNDEB, e os dois "casavam". Ver `guard-fonte`.
        await exigirFonteDaFicha(tx, p.liquidacaoId, p.fonteId);

        // V36 (TR 5.10.2.42) — o número do cheque é único na conta. Conferido ANTES de gravar: a `@@unique` é a rede
        // final, mas estouraria como erro de constraint depois do lançamento já composto.
        if (p.cheque !== undefined) {
          const usado = await tx.cheque.findUnique({
            where: { contaBancariaId_numero: { contaBancariaId: conta.id, numero: p.cheque.numero } },
            select: { id: true },
          });
          if (usado !== null) {
            throw new Error(`O cheque ${p.cheque.numero} já foi emitido na conta ${conta.codigo}. Nada foi gravado.`);
          }
        }

        // T07 — A ORDEM DE PAGAMENTO, quando houver. DENTRO da transação e antes de
        // gravar: entre conferir e gravar, outra transação poderia consumir a mesma
        // autorização — e a `@unique` em `ordemDePagamentoId` é a rede final, mas uma
        // rede que estoura com erro de constraint em vez de mensagem de negócio.
        //
        // ⚠️ ANTES DO TETO DA LIQUIDAÇÃO, de propósito. Pagar duas vezes contra a MESMA
        // ordem também estoura o teto — mas "excede a liquidação" manda o operador
        // procurar o valor, e o problema era outro: a autorização já tinha sido usada.
        // O guard mais específico fala primeiro.
        if (p.ordemDePagamentoId !== undefined) {
          await exigirOrdemAutorizada(tx, {
            ordemId: p.ordemDePagamentoId,
            liquidacaoId: p.liquidacaoId,
            valor: p.valor,
          });
        }

        // Limite: SUM REAL do já pago, dentro da transação.
        // V33 — o liquidado é o LÍQUIDO das anulações parciais vivas: pelo bruto, pagava-se a glosa.
        const liquidado = await liquidoDaLiquidacao(tx, p.liquidacaoId);
        const jaPago = await pagoLiquido(tx, p.liquidacaoId);
        const depois = toMoney(jaPago.plus(p.valor));

        if (depois.greaterThan(liquidado)) {
          throw new Error(
            `Pagamento excede a liquidação ${p.liquidacaoId}: liquidado ` +
              `${liquidado.toFixed(2)}, já pago ${jaPago.toFixed(2)}, ` +
              `solicitado ${p.valor.toFixed(2)}.`
          );
        }

        // M06 — ORDEM CRONOLÓGICA (Lei 14.133/2021, art. 141).
        // DENTRO da transação e ANTES de gravar: se a ordem for quebrada sem
        // justificativa, nada existe — nem pagamento, nem lançamento, nem
        // movimento. Se houver justificativa, ela é gravada aqui, atomicamente
        // com o pagamento: um não pode existir sem o outro (§2º).
        await ordem.validarOrdemCronologica(
          tx,
          p.liquidacaoId,
          p.justificativaQuebraOrdem
        );


        // O lançamento COMPOSTO: as pernas do pagamento (caixa = líquido) já vêm
        // com as pernas de passivo das retenções. O motor do ledger validou o
        // conjunto (ΣD == ΣC por subsistema) antes de qualquer I/O.
        await criarLancamento(tx, lancamento);

        const pag = await tx.pagamento.create({
          data: {
            id: p.pagamentoId,
            liquidacaoId: p.liquidacaoId,
            numero: p.numero,
            // BRUTO: a liquidação quita pelo bruto, a fila anda pelo bruto.
            valor: p.valor.toFixed(2),
            data: p.data,
            contaBancaria: p.contaBancaria,
            fonteId: p.fonteId,
            lancamentoId: lancamento.id,
            ...(p.ordemDePagamentoId !== undefined
              ? { ordemDePagamentoId: p.ordemDePagamentoId }
              : {}),
            criadoPor: p.criadoPor,
          },
          select: { id: true },
        });

        if (p.cheque !== undefined) {
          try {
            await tx.cheque.create({
              data: {
                contaBancariaId: conta.id,
                numero: p.cheque.numero,
                origem: "PAGAMENTO",
                pagamentoId: pag.id,
                data: p.data,
                valor: p.cheque.valor.toFixed(2),
                criadoPor: p.criadoPor,
              },
            });
          } catch (e) {
            // A corrida que a conferência acima não vê (outro pagamento ou um avulso com o mesmo número, ao mesmo
            // tempo): a unicidade do banco decide, e a transação inteira volta com a mensagem de negócio.
            if (typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002") {
              throw new Error(`O cheque ${p.cheque.numero} já foi emitido na conta ${conta.codigo}. Nada foi gravado.`);
            }
            throw e;
          }
        }

        // M07 — o razão do consignatário, na MESMA transação. Se qualquer
        // retenção falhar (tipo inativo, por exemplo), o pagamento INTEIRO
        // não existe.
        let idsDasRetencoes: readonly string[] = [];
        if (p.retencoes !== undefined && p.retencoes.length > 0) {
          idsDasRetencoes = await registrarRetencoesDoPagamento(tx, {
            pagamentoId: pag.id,
            lancamentoId: lancamento.id,
            contaBancariaId: conta.id,
            data: p.data,
            historico: lancamento.historico,
            criadoPor: p.criadoPor,
            retencoes: p.retencoes,
          });
        }
        // V24 — a memória do cálculo, casada com os movimentos acabados de criar (mesma ordem).
        if (p.calculosDaRetencao !== undefined) {
          const retencoes = p.retencoes ?? [];
          await registrarCalculosDaRetencao(tx, {
            pagamentoId: pag.id,
            criadoPor: p.criadoPor,
            calculos: p.calculosDaRetencao,
            movimentos: idsDasRetencoes.map((id, i) => ({ id, tipoConsignacaoId: retencoes[i]!.tipoConsignacaoId, valor: retencoes[i]!.valor })),
            proprias: (p.retencoesProprias ?? []).map((r) => ({ fato: r.fato, valor: r.valor })),
          });
        }

        // ═══ M10 (TR 4.48) — A AMORTIZAÇÃO, NA MESMA TRANSAÇÃO ═══
        // Se o empenho aponta para uma dívida, pagar É amortizar. Pelo BRUTO: a
        // retenção não perdoa parte da dívida — ela muda o credor daquele pedaço.
        // Se a dívida não cobrir o valor, o PAGAMENTO INTEIRO aborta: não existe
        // "pagou mas não amortizou". (Mesmo desenho da retenção do M07.)
        const vinculosDoEmpenho = await tx.liquidacao.findUniqueOrThrow({
          where: { id: p.liquidacaoId },
          select: {
            empenho: {
              select: { dividaId: true, precatorioId: true, data: true, numero: true },
            },
          },
        });
        const dividaDoEmpenho = vinculosDoEmpenho;
        if (dividaDoEmpenho.empenho.dividaId !== null) {
          await amortizarNoPagamento(tx, {
            dividaId: dividaDoEmpenho.empenho.dividaId,
            pagamentoId: pag.id,
            valorBruto: p.valor,
            data: p.data,
            numeroPagamento: p.numero,
            criadoPor: p.criadoPor,
          });
        }

        // ═══ M29 (ENT03b · CF art. 100) — O PRECATÓRIO, NA MESMA TRANSAÇÃO ═══
        //
        // ⚠️ SÃO DUAS COISAS, E AS DUAS ABORTAM O PAGAMENTO INTEIRO:
        //   1. a ORDEM CONSTITUCIONAL — alimentar antes de comum, preferência do §2º,
        //      depois a data de apresentação. Furá-la é possível (acordo homologado,
        //      sequestro determinado pelo tribunal) e exige JUSTIFICATIVA no mesmo ato;
        //   2. a BAIXA do passivo, pelo BRUTO — a retenção não perdoa parte do precatório,
        //      ela muda o credor daquele pedaço. É o mesmo desenho da dívida logo acima.
        //
        // ⚠️ NÃO EXISTE "PAGOU MAS FUROU A FILA" nem "pagou mas não baixou": se qualquer
        // das duas falhar, o pagamento inteiro aborta.
        if (vinculosDoEmpenho.empenho.precatorioId !== null) {
          const exercicio = anoCivil(vinculosDoEmpenho.empenho.data);
          await exigirOrdemDoArt100(tx, {
            precatorioId: vinculosDoEmpenho.empenho.precatorioId,
            exercicio,
            // ⚠️ É A JUSTIFICATIVA DO ART. 100, E NÃO A DO ART. 141 — ver `PagarParams`.
            // A primeira versão reusava a do 141, e o primeiro teste derrubou o argumento:
            // aquele campo exige uma HIPÓTESE de um rol fechado da Lei 14.133, e nenhuma das
            // cinco cobre acordo homologado nem sequestro de verba. Reusar obrigaria o
            // operador a declarar uma hipótese falsa para conseguir pagar.
            justificativaOrdemConstitucional: p.justificativaOrdemConstitucional,
          });
          await baixarPrecatorioNoPagamento(tx, {
            precatorioId: vinculosDoEmpenho.empenho.precatorioId,
            pagamentoId: pag.id,
            valorBruto: p.valor,
            data: p.data,
            numeroPagamento: p.numero,
            criadoPor: p.criadoPor,
            ...(p.justificativaOrdemConstitucional !== undefined
              ? { justificativaQuebraDeOrdem: p.justificativaOrdemConstitucional }
              : {}),
          });
        }

        // ═══ V26 — A FOLHA NÃO SE PAGA SEM O IR DO SERVIDOR ═══
        // O pagamento da liquidação de uma folha cujo IR ainda não foi retido tem de retê-lo: como receita do
        // município (mesmo caixa) ou como consignação ao município (conta de outra entidade). Pagar o bruto sem
        // reter faria o servidor receber o IR, e a receita nunca existiria.
        const irPendente = await irDaFolhaPendente(tx, p.liquidacaoId);
        if (irPendente !== null && irPendente.total.greaterThan(0)) {
          const retidoComoReceita = (p.retencoesProprias ?? []).some((r) => r.fato === "IRRF_FOLHA");
          const retidoComoConsignacao = (p.retencoes ?? []).length > 0;
          if (!retidoComoReceita && !retidoComoConsignacao) {
            throw new Error(
              `Esta é a liquidação de uma folha com ${irPendente.total.toFixed(2)} de IR dos servidores ainda não retido: o pagamento tem de reter o IR. Pague pela tela de pagamentos, que o calcula. Nada foi gravado.`
            );
          }
        }

        // ═══ V28 — A FOLHA NÃO SE PAGA SEM OS DESCONTOS DOS SERVIDORES ═══
        // Previdência do servidor, pensão, consignado: dinheiro do servidor que o ente segura e repassa. O pagamento
        // da liquidação de folha tem de retê-los, por consignação declarada para cada rubrica; senão o banco pagaria
        // ao servidor o que é do instituto. Os elos (contracheque, rubrica, geração) nascem aqui, na mesma transação.
        await exigirERegistrarDescontosDaFolhaNaTx(tx, {
          liquidacaoId: p.liquidacaoId,
          pagamentoId: pag.id,
          retidas: p.retencoes ?? [],
          criadoPor: p.criadoPor,
        });

        // ═══ V26 — A RECEITA DAS RETENÇÕES PRÓPRIAS, ÚLTIMA PERNA DA TRANSAÇÃO ═══
        // O lançamento acima já creditou o crédito tributário de cada uma; aqui nasce a guia que o
        // reconhece e arrecada (VPA, receita realizada, controle da disponibilidade) e o elo com o pagamento.
        // ÚLTIMA porque o número da guia é o posto mais alto da ordem de locks. Se falhar, nada existe.
        if (p.retencoesProprias !== undefined && p.retencoesProprias.length > 0) {
          await registrarReceitasPorRetencaoNaTx(tx, {
            pagamentoId: pag.id,
            numeroDoPagamento: p.numero,
            data: p.data,
            criadoPor: p.criadoPor,
            // A memória de cada uma vem do cálculo do mesmo tributo (IR de PJ → IRRF, ISS → ISS).
            proprias: p.retencoesProprias.map((r) => {
              const c = (p.calculosDaRetencao ?? []).find((x) => (r.fato === "IRRF_FORNECEDOR_PJ" ? x.tributo === "IRRF" : x.tributo === r.fato) && x.valor.equals(r.valor));
              return c === undefined ? r : { ...r, memoria: { base: c.base, aliquota: c.aliquota, fundamento: c.fundamento, entrada: c.entrada } };
            }),
          });
        }

        return pag.id;
      });
    },

    async anularLiquidacao(p, lancamento): Promise<string> {
      return prisma.$transaction(async (tx) => {
        // MESMA PORTA que o `pagar()`: aqui se decide "esta liquidação já tem
        // pagamento?". Sem o lock, anular e pagar concorrentes passariam os dois —
        // o pagamento ficaria órfão de uma liquidação anulada.
        await travarLiquidacoes(tx, [p.liquidacaoOriginalId]);

        const original = await tx.liquidacao.findUnique({
          where: { id: p.liquidacaoOriginalId },
          select: {
            id: true,
            empenhoId: true,
            valor: true,
            data: true,
            responsavelAtesto: true,
            documentoFiscalId: true,
            estornoDeId: true,
            anulacaoParcialDeId: true,
            anulacoesParciais: { select: { estornos: { select: { id: true } } } },
            estornos: { select: { id: true } },
            lancamentoId: true,
          },
        });
        if (original === null) {
          throw new Error(`Liquidação ${p.liquidacaoOriginalId} não encontrada.`);
        }
        exigirFatoOriginalSemParcialViva(`A liquidação ${p.liquidacaoOriginalId}`, original, "anular");
        if (original.estornos.length > 0) {
          throw new Error(`Liquidação ${p.liquidacaoOriginalId} já foi anulada.`);
        }

        // Sem ÓRFÃO: não se anula liquidação que já tem pagamento vivo.
        const pago = await pagoLiquido(tx, original.id);
        if (pago.greaterThan(0)) {
          throw new Error(
            `Liquidação ${p.liquidacaoOriginalId} tem ${pago.toFixed(2)} já ` +
              `PAGO — anule o pagamento primeiro. Anular a liquidação sob um ` +
              `pagamento deixaria o pagamento órfão.`
          );
        }

        await criarLancamento(tx, lancamento);

        // V22 — número reservado pelo numerador só é usado por quem o reservou (`numerador.ts`): conferido NO FIM,
        // depois da cascata do almoxarifado (ver o fim deste caso de uso).
        const anulacao = await tx.liquidacao.create({
          data: {
            id: p.anulacaoId,
            empenhoId: original.empenhoId,
            numero: p.numero,
            valor: original.valor,
            data: p.data,
            responsavelAtesto: original.responsavelAtesto,
            // V23 — SAGRES EstornoLiquidacao §4.11 (obrigatório no leiaute).
            motivo: p.motivo,
            lancamentoId: lancamento.id,
            estornoDeId: original.id,
            documentoFiscalId: original.documentoFiscalId,
            criadoPor: p.criadoPor,
          },
          select: { id: true },
        });

        // ═══ A CASCATA (M10) — DENTRO da mesma transação ═══
        // A liquidação deixou de valer: TUDO que ela gerou tem de ser desfeito AGORA.
        // Sem isto, o razão inverte (o estoque volta a zero) e o MOVIMENTO de entrada
        // do almoxarifado fica VIVO — o material eterno na prateleira, e a amarração
        // razão×movimentos acusando sem que ninguém possa consertar. Era o furo
        // declarado em e9cf648.
        if (aoAnularLiquidacao !== undefined) {
          await aoAnularLiquidacao.aoAnularTotal(tx, original.id);
        }
        // V35 A3 — a liquidação de um resto a pagar controlado (5.3/6.3) desfaz o seu controle junto.
        if (original.lancamentoId !== null) {
          await inverterControleDoFato(tx, { lancamentoOriginalId: original.lancamentoId, lancamentoDaAnulacaoId: lancamento.id, evento: "ANULACAO_LIQUIDACAO", data: p.data, criadoPor: p.criadoPor });
        }

        // ⚠️ V37 — POR ÚLTIMO, como na liquidação: a cascata (acima) trava a classe, de posto menor que o
        // NumeradorDoExercicio. Conferido antes, anular liquidação de material com número só de dígitos era recusado
        // pela guarda de inversão (t8c do M10).
        await conferirNumeroDaLiquidacao(tx, original.empenhoId, p.numero, undefined);
        return anulacao.id;
      });
    },

    async anularPagamento(p, lancamento): Promise<string> {
      return prisma.$transaction(async (tx) => {
        const original = await tx.pagamento.findUnique({
          where: { id: p.pagamentoOriginalId },
          select: {
            id: true,
            liquidacaoId: true,
            valor: true,
            contaBancaria: true,
            fonteId: true,
            lancamentoId: true,
            estornoDeId: true,
            anulacaoParcialDeId: true,
            anulacoesParciais: { select: { estornos: { select: { id: true } } } },
            estornos: { select: { id: true } },
          },
        });
        if (original === null) {
          throw new Error(`Pagamento ${p.pagamentoOriginalId} não encontrado.`);
        }
        exigirFatoOriginalSemParcialViva(`O pagamento ${p.pagamentoOriginalId}`, original, "anular");
        if (original.estornos.length > 0) {
          throw new Error(`Pagamento ${p.pagamentoOriginalId} já foi anulado.`);
        }

        // A anulação MEXE no já-pago da liquidação (grava um Pagamento de estorno).
        // Mesma porta, mesma ordem: sem o lock, uma anulação e um pagamento
        // concorrentes decidiriam sobre um saldo que o outro está mudando.
        await travarLiquidacoes(tx, [original.liquidacaoId]);

        // M08 — anular aqui um pagamento de RP deixaria o
        // MovimentoRestosAPagar órfão e o saldo da inscrição errado PARA MENOS.
        await exigirAnulacaoDePagamentoCorrente(tx, p.pagamentoOriginalId);

        await criarLancamento(
          tx,
          await espelharFichaDoOriginal(tx, original.lancamentoId, lancamento)
        );

        const anulacao = await tx.pagamento.create({
          data: {
            id: p.anulacaoId,
            liquidacaoId: original.liquidacaoId,
            numero: p.numero,
            valor: original.valor,
            data: p.data,
            contaBancaria: original.contaBancaria,
            fonteId: original.fonteId,
            lancamentoId: lancamento.id,
            estornoDeId: original.id,
            motivo: p.motivo,
            criadoPor: p.criadoPor,
          },
          select: { id: true },
        });

        // ═══ M07 — A ANULAÇÃO DESFAZ A RETENÇÃO JUNTO ═══
        // O lançamento de estorno acima JÁ inverteu as pernas de passivo (o
        // `gerarEstorno` inverte todas as pernas do lançamento composto), então a
        // contabilidade fecharia sem isto — e é exatamente aí que o bug se
        // esconderia: o RAZÃO do M07 continuaria dizendo que o ente deve ao
        // consignatário, de um pagamento que não existe mais.
        //
        // Também é aqui que o "repasse já feito" BLOQUEIA a anulação: se o
        // dinheiro do consignatário já saiu, desfazer o ingresso deixaria o saldo
        // dele negativo. Estorne o repasse primeiro.
        await estornarRetencoesDoPagamento(tx, {
          pagamentoOriginalId: original.id,
          lancamentoEstornoId: lancamento.id,
          data: p.data,
          motivo: `Anulação do pagamento (${p.numero}).`,
          criadoPor: p.criadoPor,
        });

        // V26 — a receita da retenção própria morre com o pagamento: a guia é anulada (o lançamento acima
        // já inverteu a perna do crédito tributário) e o elo ganha a linha de estorno.
        await anularReceitasPorRetencaoNaTx(tx, {
          pagamentoOriginalId: original.id,
          data: p.data,
          criadoPor: p.criadoPor,
        });

        // M10 — SIMETRIA COMPLETA: a amortização nasceu dentro do pagamento e morre
        // com ele, na MESMA transação. Sem isto, anular o pagamento devolveria o
        // dinheiro ao caixa e deixaria a dívida baixada — o ente teria quitado uma
        // parcela que nunca pagou.
        await estornarAmortizacaoDoPagamento(tx, {
          pagamentoOriginalId: original.id,
          data: p.data,
          motivo: `Anulação do pagamento (${p.numero}).`,
          criadoPor: p.criadoPor,
        });

        return anulacao.id;
      });
    },

    async totaisDoEmpenho(empenhoId) {
      const e = await prisma.empenho.findUnique({
        where: { id: empenhoId },
        select: { id: true, valor: true, estornos: { select: { id: true } } },
      });
      if (e === null) return null;

      return {
        empenhado: toMoney(e.valor.toFixed(2)),
        liquidado: await liquidadoLiquido(prisma, empenhoId),
        pago: await pagoDoEmpenho(prisma, empenhoId),
        anulado: e.estornos.length > 0,
      };
    },

    async buscarLiquidacao(id) {
      const l = await prisma.liquidacao.findUnique({
        where: { id },
        select: {
          id: true,
          empenhoId: true,
          valor: true,
          lancamentoId: true,
          estornoDeId: true,
          anulacaoParcialDeId: true,
          estornos: { select: { id: true } },
          empenho: { select: { fichaId: true } },
          lancamento: { select: { partidas: { where: { tipo: "CREDITO", subsistema: "PATRIMONIAL", conta: { codigo: { startsWith: "2." } } }, select: { conta: { select: { codigo: true } } } } } },
        },
      });
      if (l === null) return null;
      return {
        id: l.id,
        empenhoId: l.empenhoId,
        fichaId: l.empenho.fichaId,
        valor: toMoney(l.valor.toFixed(2)),
        lancamentoId: l.lancamentoId,
        estornoDeId: l.estornoDeId,
        anulacaoParcialDeId: l.anulacaoParcialDeId,
        estornos: l.estornos.map((x) => x.id),
        obrigacoes: [...new Set(l.lancamento.partidas.map((p) => p.conta.codigo))],
      };
    },

    async buscarPagamento(id) {
      const p = await prisma.pagamento.findUnique({
        where: { id },
        select: {
          id: true,
          liquidacaoId: true,
          valor: true,
          lancamentoId: true,
          estornoDeId: true,
          estornos: { select: { id: true } },
          liquidacao: {
            select: { empenhoId: true, empenho: { select: { fichaId: true } } },
          },
        },
      });
      if (p === null) return null;
      return {
        id: p.id,
        liquidacaoId: p.liquidacaoId,
        empenhoId: p.liquidacao.empenhoId,
        fichaId: p.liquidacao.empenho.fichaId,
        valor: toMoney(p.valor.toFixed(2)),
        lancamentoId: p.lancamentoId,
        estornoDeId: p.estornoDeId,
        estornos: p.estornos.map((x) => x.id),
      };
    },

    async buscarLancamentoDaLiquidacao(id) {
      const l = await prisma.liquidacao.findUniqueOrThrow({
        where: { id },
        select: { lancamentoId: true },
      });
      return lancamentoDoDominio(prisma, l.lancamentoId);
    },

    async buscarLancamentoDoPagamento(id) {
      const p = await prisma.pagamento.findUniqueOrThrow({
        where: { id },
        select: { lancamentoId: true },
      });
      return lancamentoDoDominio(prisma, p.lancamentoId);
    },
  };
}

/**
 * ⚠️ V33 — A LINHA DE ANULAÇÃO NÃO É FATO, E O FATO COM PARCIAL VIVA NÃO SE ANULA INTEIRO.
 *
 * (1) A anulação parcial é uma linha da MESMA tabela, com `anulacaoParcialDeId` e `estornoDeId` nulo. Quem
 * informasse o id dela como se fosse o empenho, a liquidação ou o pagamento liquidava, pagava ou "anulava" contra
 * a glosa: os guards só olhavam o `estornoDeId`.
 *
 * (2) A anulação TOTAL inverte o lançamento ORIGINAL inteiro e grava o valor cheio. Com uma parcial viva, a parte
 * já devolvida pela parcial voltaria DE NOVO: a ficha ganhava crédito em dobro e o SAGRES declarava 1.000 + 9.000
 * de estorno sobre um fato de 9.000. O caminho certo existe e não perde nada: anular o SALDO pela anulação parcial
 * (ela aceita o saldo inteiro). Fail-closed, com o caminho na mensagem.
 */
function exigirFatoOriginalSemParcialViva(
  rotulo: string,
  fato: {
    readonly estornoDeId: string | null;
    readonly anulacaoParcialDeId: string | null;
    readonly anulacoesParciais?: readonly { readonly estornos: readonly unknown[] }[];
  },
  ato: "liquidar" | "pagar" | "anular" | null
): void {
  if (fato.estornoDeId !== null || fato.anulacaoParcialDeId !== null) {
    throw new Error(`${rotulo} É uma anulação${fato.anulacaoParcialDeId !== null ? " parcial" : ""}, e não o fato original${ato === null ? "" : ` — não se ${ato === "anular" ? "anula uma anulação" : ato === "liquidar" ? "liquida" : "paga"}`}. Nada foi gravado.`);
  }
  if (ato === "anular" && (fato.anulacoesParciais ?? []).some((p) => p.estornos.length === 0)) {
    throw new Error(
      `${rotulo} tem anulação parcial viva: anulá-lo inteiro devolveria de novo o que a parcial já devolveu. ` +
        `Anule o saldo restante pela anulação parcial. Nada foi gravado.`
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BLOCO 2 — liquidação e pagamento.
//
// Mesma disciplina: os limites são lidos do SUM REAL, DENTRO da transação.
// `liquidado` e `pago` já saem LÍQUIDOS das anulações (uma anulação é um
// registro NOVO com estornoDeId apontando para o original; ela conta negativo).
// ═══════════════════════════════════════════════════════════════════════════

/** SUM líquido: soma os originais e subtrai os que foram estornados. */
async function liquidadoLiquido(
  tx: Tx,
  empenhoId: string
): Promise<Money> {
  const linhas = await tx.liquidacao.findMany({
    where: { empenhoId },
    // TR 5.35: a ANULAÇÃO PARCIAL reduz a liquidação — ela não a zera.
    select: {
      id: true,
      valor: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
    },
  });

  // A aritmética é UMA (packages/estornaveis). Esta era a TERCEIRA cópia dela.
  return somaLiquidaEstornaveis(
    linhas.map((l) => ({
      id: l.id,
      valor: toMoney(l.valor.toFixed(2)),
      estornoDeId: l.estornoDeId,
      anulacaoParcialDeId: l.anulacaoParcialDeId,
    }))
  );
}

/** O líquido de UMA liquidação (já descontadas as suas anulações parciais). */
async function liquidoDaLiquidacao(tx: Tx, id: string): Promise<Money> {
  const linhas = await tx.liquidacao.findMany({
    // ⚠️ V33 — A FAMÍLIA INTEIRA: o fato, as parciais dele, o estorno TOTAL dele e o estorno de cada parcial.
    // Sem as duas últimas pernas, o fato anulado inteiro saía com o valor cheio e a parcial estornada continuava
    // descontando (o guard recusava uma parcial legítima).
    where: { OR: [{ id }, { anulacaoParcialDeId: id }, { estornoDeId: id }, { estornoDe: { anulacaoParcialDeId: id } }] },
    select: {
      id: true,
      valor: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
    },
  });
  return somaLiquidaEstornaveis(
    linhas.map((l) => ({
      id: l.id,
      valor: toMoney(l.valor.toFixed(2)),
      estornoDeId: l.estornoDeId,
      anulacaoParcialDeId: l.anulacaoParcialDeId,
    }))
  );
}

/** O líquido de UM pagamento (já descontadas as suas anulações parciais). */
async function liquidoDoPagamento(tx: Tx, id: string): Promise<Money> {
  const linhas = await tx.pagamento.findMany({
    // ⚠️ V33 — A FAMÍLIA INTEIRA: o fato, as parciais dele, o estorno TOTAL dele e o estorno de cada parcial.
    // Sem as duas últimas pernas, o fato anulado inteiro saía com o valor cheio e a parcial estornada continuava
    // descontando (o guard recusava uma parcial legítima).
    where: { OR: [{ id }, { anulacaoParcialDeId: id }, { estornoDeId: id }, { estornoDe: { anulacaoParcialDeId: id } }] },
    select: {
      id: true,
      valor: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
    },
  });
  return somaLiquidaEstornaveis(
    linhas.map((l) => ({
      id: l.id,
      valor: toMoney(l.valor.toFixed(2)),
      estornoDeId: l.estornoDeId,
      anulacaoParcialDeId: l.anulacaoParcialDeId,
    }))
  );
}

/** O empenhado líquido de UM empenho (já descontadas as parciais dele). */
async function empenhadoLiquidoDoEmpenho(tx: Tx, id: string): Promise<Money> {
  const linhas = await tx.empenho.findMany({
    // ⚠️ V33 — A FAMÍLIA INTEIRA: o fato, as parciais dele, o estorno TOTAL dele e o estorno de cada parcial.
    // Sem as duas últimas pernas, o fato anulado inteiro saía com o valor cheio e a parcial estornada continuava
    // descontando (o guard recusava uma parcial legítima).
    where: { OR: [{ id }, { anulacaoParcialDeId: id }, { estornoDeId: id }, { estornoDe: { anulacaoParcialDeId: id } }] },
    select: {
      id: true,
      valor: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
    },
  });
  return somaLiquidaEstornaveis(
    linhas.map((l) => ({
      id: l.id,
      valor: toMoney(l.valor.toFixed(2)),
      estornoDeId: l.estornoDeId,
      anulacaoParcialDeId: l.anulacaoParcialDeId,
    }))
  );
}

async function pagoLiquido(tx: Tx, liquidacaoId: string): Promise<Money> {
  const linhas = await tx.pagamento.findMany({
    where: { liquidacaoId },
    // TR 5.35: a ANULAÇÃO PARCIAL reduz o pagamento — ela não o zera.
    select: {
      id: true,
      valor: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
    },
  });

  // A aritmética é UMA (packages/estornaveis) — aqui só se escolhe o recorte.
  return somaLiquidaEstornaveis(
    linhas.map((p) => ({
      id: p.id,
      valor: toMoney(p.valor.toFixed(2)),
      estornoDeId: p.estornoDeId,
      anulacaoParcialDeId: p.anulacaoParcialDeId,
    }))
  );
}

/** Total pago de um EMPENHO = soma do pago de todas as suas liquidações vivas. */
async function pagoDoEmpenho(tx: Tx, empenhoId: string): Promise<Money> {
  const liquidacoes = await tx.liquidacao.findMany({
    where: { empenhoId, estornoDeId: null },
    select: { id: true, estornos: { select: { id: true } } },
  });

  let total = toMoney("0.00");
  for (const l of liquidacoes) {
    if (l.estornos.length > 0) continue; // liquidação anulada
    total = toMoney(total.plus(await pagoLiquido(tx, l.id)));
  }
  return total;
}

async function lancamentoDoDominio(
  tx: Tx,
  lancamentoId: string
): Promise<LancamentoContabil> {
  const l = await tx.lancamentoContabil.findUniqueOrThrow({
    where: { id: lancamentoId },
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

  const partidas: readonly Partida[] = l.partidas.map((p) => ({
    conta: p.conta.codigo,
    tipo: p.tipo,
    subsistema: p.subsistema,
    valor: toMoney(p.valor.toFixed(2)),
  }));

  return {
    id: l.id,
    numeroControle: l.numeroControle,
    partidas,
    dataTransacao: l.dataTransacao,
    historico: l.historico,
    ...(l.estornoDeId !== null ? { estornoDeId: l.estornoDeId } : {}),
    estornos: l.estornos.map((x) => x.id),
  };
}

export function criarM05Deps(
  prisma: PrismaClient,
  contratos?: ContratoPort,
  aoAnularLiquidacao?: AoAnularLiquidacaoPort,
  aoLiquidarMaterial?: AoLiquidarMaterialPort
): M05Deps {
  return {
    autz: criarAutorizacaoPortPrisma(prisma),
    contas: criarContaRepositoryPrisma(prisma),
    despesa: criarDespesaRepositoryPrisma(
      prisma,
      contratos,
      aoAnularLiquidacao,
      aoLiquidarMaterial
    ),
    ids: idsUuid,
  };
}


/** V22 — a conferência do numerador para um EMPENHO (e a anulação/estorno dele), no exercício da ficha. */
async function conferirNumeroDoEmpenho(tx: TxDoRazao, fichaId: string, numero: string, chaveDoNumero: string | undefined): Promise<void> {
  const ficha = await tx.fichaOrcamentaria.findUnique({ where: { id: fichaId }, select: { exercicio: true } });
  if (ficha === null) throw new Error(`Ficha ${fichaId} não existe. Nada foi gravado.`);
  await exigirUsoDoNumero(tx, { exercicio: ficha.exercicio, numero, chaveDoNumero });
}

/** V22 — idem para uma LIQUIDAÇÃO: a que leva o número do próprio empenho passa (convenção da folha). */
async function conferirNumeroDaLiquidacao(tx: TxDoRazao, empenhoId: string, numero: string, chaveDoNumero: string | undefined): Promise<void> {
  const e = await tx.empenho.findUnique({ where: { id: empenhoId }, select: { numero: true, ficha: { select: { exercicio: true } } } });
  if (e === null) throw new Error(`Empenho ${empenhoId} não existe. Nada foi gravado.`);
  await exigirUsoDoNumero(tx, { exercicio: e.ficha.exercicio, numero, chaveDoNumero, numeroDoEmpenho: e.numero });
}
