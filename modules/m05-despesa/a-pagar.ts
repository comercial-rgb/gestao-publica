import { toMoney, type Money } from "../../packages/contracts/index.js";
import { anoCivil } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { saldoDaInscricao, saldoParaLiquidar, somaLiquidaEstornaveis, totaisDosMovimentos } from "../m08-restos-a-pagar/dominio.js";
import { comoLinha, listarEmpenhos, listarLiquidacoes, liquidoDeUmFato } from "./consultas.js";

/**
 * ═══ A PAGAR — O QUE O ENTE DEVE, POR CREDOR E POR OBRIGAÇÃO (V33) ═══
 *
 * Leitura pura. A aritmética é a que já existe — nada se recalcula aqui:
 *   · exercício: `listarEmpenhos` e `listarLiquidacoes` do M05 (líquido de anulações, pago bruto por liquidação viva);
 *   · restos: `saldoDaInscricao`, `totaisDosMovimentos` e `saldoParaLiquidar` do M08 (a fonte única do RP).
 *
 * ⚠️ DUAS FASES, E SÓ UMA É DÍVIDA PRONTA PARA PAGAR. O empenhado A LIQUIDAR é compromisso: o credor ainda não
 * entregou, ou a entrega não foi atestada. O LIQUIDADO A PAGAR é obrigação exigível. A tela mostra as duas e nunca
 * as soma num "a pagar" só.
 *
 * ⚠️ BRUTO, RETIDO, LÍQUIDO — SEM CONTAR DUAS VEZES. O `Pagamento` grava o BRUTO (é ele que quita a liquidação);
 * as retenções nascem no pagamento como ingresso extraorçamentário (consignação) ou como receita própria (IR/ISS do
 * ente). `retido` soma as duas, vivas; `pagoLiquido` = pago bruto − retido é o que saiu do caixa para o credor. A
 * retenção do SALDO ainda não pago não existe: ela é apurada no pagamento, e aqui não se antecipa.
 *
 * ⚠️ EXERCÍCIO ANTERIOR SÓ ENTRA PELA INSCRIÇÃO EM RESTOS. Um empenho de ano fechado com saldo e sem inscrição não
 * é dívida a pagar — é uma pendência do encerramento, e vai numa lista à parte (`semInscricao`), não na soma.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export type SituacaoDaObrigacao = "EXERCICIO" | "RP_PROCESSADO" | "RP_NAO_PROCESSADO";
export type FaseDaObrigacao = "A_LIQUIDAR" | "LIQUIDADO_A_PAGAR";

export interface ObrigacaoAPagar {
  readonly chave: string;
  readonly fase: FaseDaObrigacao;
  readonly situacao: SituacaoDaObrigacao;
  readonly exercicioOrigem: number;
  readonly credorCpfCnpj: string;
  readonly empenhoId: string;
  readonly empenhoNumero: string;
  readonly fonteCodigo: string;
  readonly unidadeCodigo: string;
  /** A liquidação da obrigação (fase LIQUIDADO_A_PAGAR). Null no a liquidar e no RP processado com mais de uma. */
  readonly liquidacaoId: string | null;
  readonly liquidacaoNumero: string | null;
  /** A inscrição em restos (situações de RP). */
  readonly inscricaoId: string | null;
  readonly data: Date;
  /** A base da obrigação: o empenhado líquido (a liquidar), o liquidado líquido (exercício, RPNP) ou o inscrito (RPP). */
  readonly base: Money;
  readonly pagoBruto: Money;
  readonly retido: Money;
  readonly pagoLiquido: Money;
  /** Restos cancelados (só RP). */
  readonly cancelado: Money;
  /** O que falta: a liquidar, ou a pagar (bruto). */
  readonly saldo: Money;
  /** A data prevista da ordem de pagamento ainda não consumida, se houver. */
  readonly vencimento: Date | null;
}

export interface EmpenhoSemInscricao {
  readonly empenhoId: string;
  readonly empenhoNumero: string;
  readonly exercicio: number;
  readonly credorCpfCnpj: string;
  readonly saldoALiquidar: Money;
  readonly saldoAPagar: Money;
}

export interface PosicaoAPagar {
  readonly exercicio: number;
  readonly obrigacoes: readonly ObrigacaoAPagar[];
  readonly semInscricao: readonly EmpenhoSemInscricao[];
}

export interface RecorteAPagar {
  readonly exercicio: number;
  readonly unidadeCodigo?: string | undefined;
  readonly fonteCodigo?: string | undefined;
  /** Só dígitos. */
  readonly credorCpfCnpj?: string | undefined;
}

const zero = (): Money => toMoney("0.00");
const m = (d: { toFixed(n: number): string }): Money => toMoney(d.toFixed(2));

/** Retido vivo por pagamento: consignação (ingresso extra sem estorno) + retenção própria sem estorno. */
export async function retidoPorPagamento(prisma: Pick<Tx, "movimentoExtraorcamentario" | "retencaoPropriaDoPagamento">, pagamentoIds: readonly string[]): Promise<ReadonlyMap<string, Money>> {
  const por = new Map<string, Money>();
  if (pagamentoIds.length === 0) return por;
  const [extras, proprias] = await Promise.all([
    prisma.movimentoExtraorcamentario.findMany({
      where: { pagamentoId: { in: [...pagamentoIds] }, tipo: "INGRESSO", estornoDeId: null, estornos: { none: {} } },
      select: { pagamentoId: true, valor: true },
    }),
    prisma.retencaoPropriaDoPagamento.findMany({
      where: { pagamentoId: { in: [...pagamentoIds] }, estornoDeId: null, estornos: { none: {} } },
      select: { pagamentoId: true, valor: true },
    }),
  ]);
  for (const r of [...extras, ...proprias]) {
    if (r.pagamentoId === null) continue;
    por.set(r.pagamentoId, toMoney((por.get(r.pagamentoId) ?? zero()).plus(m(r.valor))));
  }
  return por;
}

/** Os pagamentos vivos de cada liquidação (originais sem estorno total) — para o retido e para a ordem consumida. */
async function pagamentosVivos(prisma: Tx, liquidacaoIds: readonly string[]): Promise<ReadonlyMap<string, readonly { readonly id: string; readonly ordemId: string | null }[]>> {
  const por = new Map<string, { id: string; ordemId: string | null }[]>();
  if (liquidacaoIds.length === 0) return por;
  const ps = await prisma.pagamento.findMany({
    where: { liquidacaoId: { in: [...liquidacaoIds] }, estornoDeId: null, anulacaoParcialDeId: null, estornos: { none: {} } },
    select: { id: true, liquidacaoId: true, ordemDePagamentoId: true },
  });
  for (const p of ps) por.set(p.liquidacaoId, [...(por.get(p.liquidacaoId) ?? []), { id: p.id, ordemId: p.ordemDePagamentoId }]);
  return por;
}

/** A data prevista da primeira ordem de pagamento da liquidação que nenhum pagamento consumiu. */
async function vencimentos(prisma: Tx, liquidacaoIds: readonly string[]): Promise<ReadonlyMap<string, Date>> {
  const por = new Map<string, Date>();
  if (liquidacaoIds.length === 0) return por;
  const ordens = await prisma.ordemDePagamento.findMany({
    where: { liquidacaoId: { in: [...liquidacaoIds] }, pagamentos: { none: {} } },
    orderBy: { dataPrevista: "asc" },
    select: { liquidacaoId: true, dataPrevista: true },
  });
  for (const o of ordens) if (!por.has(o.liquidacaoId)) por.set(o.liquidacaoId, o.dataPrevista);
  return por;
}

function somarRetido(pags: readonly { readonly id: string }[] | undefined, retido: ReadonlyMap<string, Money>): Money {
  return (pags ?? []).reduce((s, p) => toMoney(s.plus(retido.get(p.id) ?? zero())), zero());
}

export async function posicaoAPagar(prisma: Tx, r: RecorteAPagar): Promise<PosicaoAPagar> {
  const recorte = {
    exercicio: r.exercicio,
    ...(r.unidadeCodigo !== undefined ? { unidadeCodigo: r.unidadeCodigo } : {}),
    ...(r.fonteCodigo !== undefined ? { fonteCodigo: r.fonteCodigo } : {}),
  };
  const obrigacoes: ObrigacaoAPagar[] = [];

  // ── (1) O EXERCÍCIO ──
  const [empenhos, liquidacoes] = await Promise.all([
    listarEmpenhos(prisma, { ...recorte, ...(r.credorCpfCnpj !== undefined ? { credorCpfCnpj: r.credorCpfCnpj } : {}) }),
    listarLiquidacoes(prisma, recorte),
  ]);
  const empenhoPorId = new Map(empenhos.map((e) => [e.id, e]));
  for (const e of empenhos) {
    if (e.anulado || !e.saldoALiquidar.greaterThan(0)) continue;
    obrigacoes.push({
      chave: `AL-${e.id}`,
      fase: "A_LIQUIDAR",
      situacao: "EXERCICIO",
      exercicioOrigem: r.exercicio,
      credorCpfCnpj: e.credorCpfCnpj,
      empenhoId: e.id,
      empenhoNumero: e.numero,
      fonteCodigo: e.fonteCodigo,
      unidadeCodigo: e.unidadeCodigo,
      liquidacaoId: null,
      liquidacaoNumero: null,
      inscricaoId: null,
      data: e.data,
      base: e.empenhadoLiquido,
      pagoBruto: zero(),
      retido: zero(),
      pagoLiquido: zero(),
      cancelado: zero(),
      saldo: e.saldoALiquidar,
      vencimento: null,
    });
  }
  const liqAbertas = liquidacoes.filter((l) => !l.anulado && l.saldoAPagar.greaterThan(0) && empenhoPorId.has(l.empenhoId));
  const liqComPagamento = liquidacoes.filter((l) => !l.anulado && l.saldoAPagar.greaterThan(0) && l.pago.greaterThan(0) && empenhoPorId.has(l.empenhoId));
  const [pags, venc] = await Promise.all([pagamentosVivos(prisma, liqComPagamento.map((l) => l.id)), vencimentos(prisma, liqAbertas.map((l) => l.id))]);
  const retido = await retidoPorPagamento(prisma, [...pags.values()].flat().map((p) => p.id));
  for (const l of liqAbertas) {
    const e = empenhoPorId.get(l.empenhoId);
    if (e === undefined) continue;
    const ret = somarRetido(pags.get(l.id), retido);
    obrigacoes.push({
      chave: `LP-${l.id}`,
      fase: "LIQUIDADO_A_PAGAR",
      situacao: "EXERCICIO",
      exercicioOrigem: r.exercicio,
      credorCpfCnpj: e.credorCpfCnpj,
      empenhoId: e.id,
      empenhoNumero: e.numero,
      fonteCodigo: e.fonteCodigo,
      unidadeCodigo: e.unidadeCodigo,
      liquidacaoId: l.id,
      liquidacaoNumero: l.numero,
      inscricaoId: null,
      data: l.data,
      base: l.liquidadoLiquido,
      pagoBruto: l.pago,
      retido: ret,
      pagoLiquido: toMoney(l.pago.minus(ret)),
      cancelado: zero(),
      saldo: l.saldoAPagar,
      vencimento: venc.get(l.id) ?? null,
    });
  }

  // ── (2) OS RESTOS — só pela inscrição ──
  const inscricoes = await prisma.inscricaoRestosAPagar.findMany({
    where: {
      exercicioOrigem: { lt: r.exercicio },
      empenho: {
        ficha: {
          ...(r.unidadeCodigo !== undefined ? { unidadeOrc: { codigo: r.unidadeCodigo } } : {}),
          ...(r.fonteCodigo !== undefined ? { fonte: { codigo: r.fonteCodigo } } : {}),
        },
        ...(r.credorCpfCnpj !== undefined ? { credorCpfCnpj: r.credorCpfCnpj } : {}),
      },
    },
    select: {
      id: true,
      tipo: true,
      exercicioOrigem: true,
      valorInscrito: true,
      criadoEm: true,
      movimentos: { select: { tipo: true, valor: true, pagamentoId: true } },
      empenho: {
        select: {
          id: true,
          numero: true,
          credorCpfCnpj: true,
          ficha: { select: { fonte: { select: { codigo: true } }, unidadeOrc: { select: { codigo: true } } } },
          liquidacoes: { select: { id: true, numero: true, data: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true, estornos: { select: { id: true } } } },
        },
      },
    },
  });
  // Liquidações dos empenhos inscritos, e o pago bruto de cada uma (a mesma soma do M05).
  const liqDosRestos = inscricoes.flatMap((i) => i.empenho.liquidacoes.filter((l) => l.estornoDeId === null && l.anulacaoParcialDeId === null && l.estornos.length === 0));
  const pagosDosRestos = await prisma.pagamento.findMany({
    where: { liquidacaoId: { in: liqDosRestos.map((l) => l.id) } },
    select: { id: true, liquidacaoId: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true },
  });
  const pagsRestos = await pagamentosVivos(prisma, liqDosRestos.map((l) => l.id));
  const retidoRestos = await retidoPorPagamento(prisma, [...pagsRestos.values()].flat().map((p) => p.id));
  const vencRestos = await vencimentos(prisma, liqDosRestos.map((l) => l.id));

  for (const i of inscricoes) {
    const inscrito = m(i.valorInscrito);
    const movs = i.movimentos.map((x) => ({ tipo: x.tipo, valor: m(x.valor) }));
    const tot = totaisDosMovimentos(movs);
    const saldo = saldoDaInscricao(inscrito, movs);
    const comum = {
      exercicioOrigem: i.exercicioOrigem,
      credorCpfCnpj: i.empenho.credorCpfCnpj,
      empenhoId: i.empenho.id,
      empenhoNumero: i.empenho.numero,
      fonteCodigo: i.empenho.ficha.fonte.codigo,
      unidadeCodigo: i.empenho.ficha.unidadeOrc.codigo,
      inscricaoId: i.id,
    };
    const universoLiq = i.empenho.liquidacoes.map(comoLinha);
    const vivas = i.empenho.liquidacoes.filter((l) => l.estornoDeId === null && l.anulacaoParcialDeId === null && l.estornos.length === 0);
    const retidoDe = (liqIds: readonly string[]): Money => liqIds.reduce((s, id) => toMoney(s.plus(somarRetido(pagsRestos.get(id), retidoRestos))), zero());

    if (i.tipo === "PROCESSADO") {
      if (!saldo.greaterThan(0)) continue;
      const comSaldo = vivas.filter((l) => {
        const pago = somaLiquidaEstornaveis(pagosDosRestos.filter((p) => p.liquidacaoId === l.id).map(comoLinha));
        return liquidoDeUmFato(l.id, universoLiq).greaterThan(pago);
      });
      const unica = comSaldo.length === 1 ? comSaldo[0] : undefined;
      const ret = retidoDe(vivas.map((l) => l.id));
      obrigacoes.push({
        ...comum,
        chave: `RPP-${i.id}`,
        fase: "LIQUIDADO_A_PAGAR",
        situacao: "RP_PROCESSADO",
        liquidacaoId: unica?.id ?? null,
        liquidacaoNumero: unica?.numero ?? null,
        data: i.criadoEm,
        base: inscrito,
        pagoBruto: tot.pagoLiquido,
        retido: ret,
        pagoLiquido: toMoney(tot.pagoLiquido.minus(ret)),
        cancelado: tot.canceladoLiquido,
        saldo,
        vencimento: unica !== undefined ? (vencRestos.get(unica.id) ?? null) : null,
      });
      continue;
    }

    // NÃO PROCESSADO: o que ainda pode virar despesa, e o que já foi liquidado depois da inscrição e falta pagar.
    const posInscricao = vivas.filter((l) => anoCivil(l.data) > i.exercicioOrigem);
    const liquidadoPos = posInscricao.reduce((s, l) => toMoney(s.plus(liquidoDeUmFato(l.id, universoLiq))), zero());
    const aLiquidar = saldoParaLiquidar(inscrito, tot.canceladoLiquido, liquidadoPos);
    if (aLiquidar.greaterThan(0)) {
      obrigacoes.push({
        ...comum,
        chave: `RPN-${i.id}`,
        fase: "A_LIQUIDAR",
        situacao: "RP_NAO_PROCESSADO",
        liquidacaoId: null,
        liquidacaoNumero: null,
        data: i.criadoEm,
        base: inscrito,
        pagoBruto: zero(),
        retido: zero(),
        pagoLiquido: zero(),
        cancelado: tot.canceladoLiquido,
        saldo: aLiquidar,
        vencimento: null,
      });
    }
    for (const l of posInscricao) {
      const liquido = liquidoDeUmFato(l.id, universoLiq);
      const pago = somaLiquidaEstornaveis(pagosDosRestos.filter((p) => p.liquidacaoId === l.id).map(comoLinha));
      const aPagar = toMoney(liquido.minus(pago));
      if (!aPagar.greaterThan(0)) continue;
      const ret = retidoDe([l.id]);
      obrigacoes.push({
        ...comum,
        chave: `RPNL-${l.id}`,
        fase: "LIQUIDADO_A_PAGAR",
        situacao: "RP_NAO_PROCESSADO",
        liquidacaoId: l.id,
        liquidacaoNumero: l.numero,
        data: l.data,
        base: liquido,
        pagoBruto: pago,
        retido: ret,
        pagoLiquido: toMoney(pago.minus(ret)),
        cancelado: zero(),
        saldo: aPagar,
        vencimento: vencRestos.get(l.id) ?? null,
      });
    }
  }

  // ── (3) EXERCÍCIOS FECHADOS SEM INSCRIÇÃO, COM SALDO — pendência do encerramento, fora da soma ──
  const anos = await prisma.fichaOrcamentaria.findMany({
    where: { exercicio: { lt: r.exercicio }, empenhos: { some: { estornoDeId: null, anulacaoParcialDeId: null, inscricoesRestos: { none: {} } } } },
    distinct: ["exercicio"],
    select: { exercicio: true },
  });
  const semInscricao: EmpenhoSemInscricao[] = [];
  for (const { exercicio } of anos) {
    const lista = await listarEmpenhos(prisma, { ...recorte, exercicio, ...(r.credorCpfCnpj !== undefined ? { credorCpfCnpj: r.credorCpfCnpj } : {}) });
    const inscritos = new Set(
      (await prisma.inscricaoRestosAPagar.findMany({ where: { empenhoId: { in: lista.map((e) => e.id) } }, select: { empenhoId: true } })).map((x) => x.empenhoId)
    );
    for (const e of lista) {
      if (e.anulado || inscritos.has(e.id)) continue;
      if (!e.saldoALiquidar.greaterThan(0) && !e.saldoAPagar.greaterThan(0)) continue;
      semInscricao.push({ empenhoId: e.id, empenhoNumero: e.numero, exercicio, credorCpfCnpj: e.credorCpfCnpj, saldoALiquidar: e.saldoALiquidar, saldoAPagar: e.saldoAPagar });
    }
  }

  obrigacoes.sort((a, b) => a.credorCpfCnpj.localeCompare(b.credorCpfCnpj) || a.exercicioOrigem - b.exercicioOrigem || a.data.getTime() - b.data.getTime());
  return { exercicio: r.exercicio, obrigacoes, semInscricao };
}

export interface TotaisDoCredor {
  readonly credorCpfCnpj: string;
  readonly aLiquidar: Money;
  readonly liquidadoAPagar: Money;
  readonly obrigacoes: readonly ObrigacaoAPagar[];
}

/** Agrupa por credor, mantendo as duas fases separadas. Pura. */
export function porCredor(obrigacoes: readonly ObrigacaoAPagar[]): readonly TotaisDoCredor[] {
  const mapa = new Map<string, ObrigacaoAPagar[]>();
  for (const o of obrigacoes) mapa.set(o.credorCpfCnpj, [...(mapa.get(o.credorCpfCnpj) ?? []), o]);
  return [...mapa.entries()]
    .map(([credorCpfCnpj, os]) => ({
      credorCpfCnpj,
      aLiquidar: os.filter((o) => o.fase === "A_LIQUIDAR").reduce((s, o) => toMoney(s.plus(o.saldo)), zero()),
      liquidadoAPagar: os.filter((o) => o.fase === "LIQUIDADO_A_PAGAR").reduce((s, o) => toMoney(s.plus(o.saldo)), zero()),
      obrigacoes: os,
    }))
    .sort((a, b) => b.liquidadoAPagar.comparedTo(a.liquidadoAPagar) || a.credorCpfCnpj.localeCompare(b.credorCpfCnpj));
}
