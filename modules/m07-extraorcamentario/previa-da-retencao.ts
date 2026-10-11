import { z } from "zod";
import { exigirPreviaAindaNaoUsada } from "./retencao.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import type { Tx } from "../m01-core-contabil/adapter-prisma.js";
import { Decimal, toMoney, type Money } from "../../packages/contracts/index.js";
import { diaCivil, diaCivilBr, meioDiaCivil } from "../../packages/datas/index.js";
import { travar } from "../../packages/locks/index.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import type { Avaliacao } from "./calculo-da-retencao.js";
import { avaliarRetencoesDoPagamento, prepararRetencoesCalculadas, type DadosFiscaisDaOperacao } from "./retencao-calculada.js";

/**
 * V39-R3 (R3-014, V39-027) — A PRÉVIA DA RETENÇÃO NA LIQUIDAÇÃO.
 *
 * Quem liquida pode deixar GUARDADA, na liquidação, a previsão do IR, do INSS e do ISS: os dados fiscais da operação
 * (documento, natureza do IR, serviço do INSS, subitem do ISS...) e a MEMÓRIA do cálculo feito pelas tabelas vigentes
 * no dia previsto. É PREVISÃO: não lança nada, não reserva nada e não vale como valor retido. Cada nova prévia é uma
 * versão (append-only); vale a mais recente.
 *
 * O RECONHECIMENTO é no pagamento: ele REAPROVEITA os dados fiscais da prévia (o operador não digita de novo) e
 * RECALCULA com o valor e a data do pagamento — pelo mesmo motor (`avaliarRetencoesDoPagamento` /
 * `prepararRetencoesCalculadas`), sem segunda aritmética. A memória gravada no pagamento diz de que prévia veio e se o
 * valor retido divergiu do previsto. A retenção e o lançamento nascem uma vez só, no pagamento.
 */

// ── os dados fiscais, como ficam guardados (dinheiro em texto, nunca número) ──

type OperacaoGuardada = {
  readonly valorDoDocumentoFiscal: string;
  readonly pagamentoComGlosa: boolean;
  readonly naturezaIR: string | null;
  readonly inss: {
    readonly servico: string | null;
    readonly modalidade: string | null;
    readonly enquadramento: string;
    readonly valorMateriais: string;
    readonly baseMinima: string | null;
    readonly deducoes: string;
    readonly dispensa: { readonly inciso: "II" | "III"; readonly declaracao: string } | null;
  };
  readonly iss: { readonly subitem: string | null; readonly municipioDaPrestacao: string | null; readonly aliquotaDoSimplesNoDocumento: string | null };
  readonly informados: Readonly<Record<string, { readonly valor: string; readonly justificativa: string }>>;
};

export function guardarOperacao(op: DadosFiscaisDaOperacao): OperacaoGuardada {
  return {
    valorDoDocumentoFiscal: op.valorDoDocumentoFiscal.toFixed(2),
    pagamentoComGlosa: op.pagamentoComGlosa,
    naturezaIR: op.naturezaIR,
    inss: {
      servico: op.inss.servico, modalidade: op.inss.modalidade, enquadramento: op.inss.enquadramento, valorMateriais: op.inss.valorMateriais.toFixed(2),
      baseMinima: op.inss.baseMinima, deducoes: op.inss.deducoes.toFixed(2), dispensa: op.inss.dispensa,
    },
    iss: { subitem: op.iss.subitem, municipioDaPrestacao: op.iss.municipioDaPrestacao, aliquotaDoSimplesNoDocumento: op.iss.aliquotaDoSimplesNoDocumento?.toString() ?? null },
    informados: Object.fromEntries(Object.entries(op.informados).map(([t, i]) => [t, { valor: i.valor.toFixed(2), justificativa: i.justificativa }])),
  };
}

export function lerOperacaoGuardada(g: OperacaoGuardada): DadosFiscaisDaOperacao {
  return {
    valorDoDocumentoFiscal: toMoney(g.valorDoDocumentoFiscal),
    pagamentoComGlosa: g.pagamentoComGlosa,
    naturezaIR: g.naturezaIR,
    inss: {
      servico: g.inss.servico, modalidade: g.inss.modalidade as DadosFiscaisDaOperacao["inss"]["modalidade"], enquadramento: g.inss.enquadramento as DadosFiscaisDaOperacao["inss"]["enquadramento"],
      valorMateriais: toMoney(g.inss.valorMateriais), baseMinima: g.inss.baseMinima, deducoes: toMoney(g.inss.deducoes), dispensa: g.inss.dispensa,
    },
    iss: { subitem: g.iss.subitem, municipioDaPrestacao: g.iss.municipioDaPrestacao, aliquotaDoSimplesNoDocumento: g.iss.aliquotaDoSimplesNoDocumento === null ? null : new Decimal(g.iss.aliquotaDoSimplesNoDocumento) },
    informados: Object.fromEntries(Object.entries(g.informados).map(([t, i]) => [t, { valor: toMoney(i.valor), justificativa: i.justificativa }])) as DadosFiscaisDaOperacao["informados"],
  };
}

/** A memória de uma avaliação, para guardar e mostrar. */
function memoria(a: Avaliacao): { tributo: string; resultado: string; base: string | null; aliquota: string | null; valor: string | null; explicacao: string } {
  switch (a.resultado) {
    case "RETIDO": return { tributo: a.tributo, resultado: a.resultado, base: a.base.toFixed(2), aliquota: a.aliquota.toString(), valor: a.valor.toFixed(2), explicacao: a.fundamento };
    case "NAO_RETIDO": return { tributo: a.tributo, resultado: a.resultado, base: null, aliquota: null, valor: "0.00", explicacao: a.fundamento };
    case "INFORMADO": return { tributo: a.tributo, resultado: a.resultado, base: null, aliquota: null, valor: a.valor.toFixed(2), explicacao: a.fundamento };
    case "NAO_CALCULAVEL": return { tributo: a.tributo, resultado: a.resultado, base: null, aliquota: null, valor: null, explicacao: a.motivo };
  }
}

// ── guardar a prévia ──

export const zRegistrarPreviaDeRetencao = z.object({
  liquidacaoId: z.string().min(1),
  /** O valor que se prevê pagar (normalmente o líquido a pagar da liquidação). */
  /** Canônico ("1234.56"): a tela desmascara antes. "1.234,56" é recusado em vez de lido como outro valor. */
  valorPrevisto: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Informe o valor previsto do pagamento em reais e centavos."),
  dataPrevista: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data prevista do pagamento."),
  operacao: z.custom<DadosFiscaisDaOperacao>((v) => typeof v === "object" && v !== null, "Informe os dados fiscais da operação."),
  criadoPor: z.string().min(1),
});

export async function registrarPreviaDeRetencao(prisma: PrismaClient, input: z.input<typeof zRegistrarPreviaDeRetencao>): Promise<{ readonly id: string; readonly versao: number; readonly totalPrevisto: string }> {
  const d = zRegistrarPreviaDeRetencao.parse(input);
  const valor = toMoney(d.valorPrevisto);
  if (!valor.greaterThan(0)) throw new Error("O valor previsto do pagamento tem de ser maior que zero. Nada foi gravado.");
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarPreviaDeRetencao, { liquidacao: d.liquidacaoId });
    // A liquidação travada: duas prévias ao mesmo tempo não pegam o mesmo número de versão.
    await travar(tx, "Liquidacao", [d.liquidacaoId]);
    const liq = await tx.liquidacao.findUnique({ where: { id: d.liquidacaoId }, select: { numero: true, estornoDeId: true, estornos: { select: { id: true } }, previasDeRetencao: { orderBy: { versao: "desc" }, take: 1, select: { versao: true } } } });
    if (liq === null) throw new Error("Liquidação não encontrada. Nada foi gravado.");
    if (liq.estornoDeId !== null || liq.estornos.length > 0) throw new Error(`A liquidação ${liq.numero} foi anulada: não há pagamento a prever. Nada foi gravado.`);
    const av = await avaliarRetencoesDoPagamento(tx, { liquidacaoId: d.liquidacaoId, valorDoPagamento: valor, data: meioDiaCivil(d.dataPrevista), operacao: d.operacao });
    const linhas = av.avaliacoes.map(memoria);
    const total = av.avaliacoes.reduce<Money>((t, a) => (a.resultado === "RETIDO" || a.resultado === "INFORMADO" ? toMoney(t.plus(a.valor)) : t), toMoney(0));
    const versao = (liq.previasDeRetencao[0]?.versao ?? 0) + 1;
    const criada = await tx.previaDeRetencaoDaLiquidacao.create({
      data: {
        liquidacaoId: d.liquidacaoId, versao, dataPrevista: meioDiaCivil(d.dataPrevista), valorPrevisto: valor.toFixed(2),
        operacao: guardarOperacao(d.operacao), memoria: linhas, totalPrevisto: total.toFixed(2),
        documentoDoFornecedor: av.documentoDoFornecedor, perfilFiscalId: av.perfil?.id ?? null, criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { id: criada.id, versao, totalPrevisto: total.toFixed(2) };
  });
}

/** A prévia vigente (a de maior versão) da liquidação, com os dados fiscais prontos para o pagamento. Leitura. */
export async function previaVigenteDaLiquidacao(tx: Tx, liquidacaoId: string): Promise<{ readonly id: string; readonly versao: number; readonly operacao: DadosFiscaisDaOperacao; readonly porTributo: Readonly<Record<string, string | null>>; readonly dataPrevista: string; readonly valorPrevisto: string } | null> {
  const p = await tx.previaDeRetencaoDaLiquidacao.findFirst({ where: { liquidacaoId }, orderBy: { versao: "desc" }, select: { id: true, versao: true, operacao: true, memoria: true, dataPrevista: true, valorPrevisto: true } });
  if (p === null) return null;
  const linhas = p.memoria as unknown as readonly { tributo: string; valor: string | null }[];
  return {
    id: p.id, versao: p.versao, operacao: lerOperacaoGuardada(p.operacao as unknown as OperacaoGuardada),
    porTributo: Object.fromEntries(linhas.map((l) => [l.tributo, l.valor])), dataPrevista: diaCivil(p.dataPrevista), valorPrevisto: p.valorPrevisto.toFixed(2),
  };
}

/**
 * NO PAGAMENTO: reaproveita os dados fiscais da prévia vigente e RECALCULA com o valor e a data do pagamento (o mesmo
 * `prepararRetencoesCalculadas` do pagamento comum). A memória de cada tributo leva a prévia de origem, o valor
 * previsto e se o retido divergiu. Recusa se a liquidação não tem prévia.
 */
export async function retencoesPelaPreviaDaLiquidacao(
  tx: Tx,
  p: { readonly liquidacaoId: string; readonly valorDoPagamento: Money; readonly data: Date; readonly contaBancariaId: string },
): Promise<Awaited<ReturnType<typeof prepararRetencoesCalculadas>> & { readonly previa: { readonly id: string; readonly versao: number; readonly divergentes: readonly string[] } }> {
  const previa = await previaVigenteDaLiquidacao(tx, p.liquidacaoId);
  if (previa === null) throw new Error("Esta liquidação não tem prévia das retenções guardada: informe os dados fiscais no pagamento. Nada foi gravado.");
  // A base do INSS e do ISS é o valor do documento fiscal guardado na prévia, não o valor pago: reaproveitá-la num
  // pagamento parcial reteria de novo sobre o documento inteiro a cada parcela. Só o pagamento do valor previsto
  // reaproveita; o parcial informa os dados fiscais dele.
  if (!toMoney(previa.valorPrevisto).equals(p.valorDoPagamento)) {
    throw new Error(`A prévia da liquidação foi feita para um pagamento de R$ ${previa.valorPrevisto.replace(".", ",")}, e este é de R$ ${p.valorDoPagamento.toFixed(2).replace(".", ",")}. Num pagamento de outro valor, informe os dados fiscais dele (o valor do documento fiscal decide a base). Nada foi gravado.`);
  }
  // A mesma guarda que o pagamento repete na transação dele, depois da trava da liquidação; aqui, para recusar cedo.
  await exigirPreviaAindaNaoUsada(tx, previa.id, null);
  const r = await prepararRetencoesCalculadas(tx, { liquidacaoId: p.liquidacaoId, valorDoPagamento: p.valorDoPagamento, data: p.data, operacao: previa.operacao, contaBancariaId: p.contaBancariaId });
  const divergentes: string[] = [];
  const calculos = r.calculos.map((c) => {
    const previsto = previa.porTributo[c.tributo] ?? null;
    const diverge = previsto === null || !toMoney(previsto).equals(c.valor);
    if (diverge) divergentes.push(c.tributo);
    return { ...c, entrada: { ...c.entrada, previaDaLiquidacao: { id: previa.id, versao: previa.versao, valorPrevisto: previsto, dataPrevista: previa.dataPrevista, valorDoPagamentoPrevisto: previa.valorPrevisto, divergiu: diverge } } };
  });
  return { ...r, calculos, previa: { id: previa.id, versao: previa.versao, divergentes } };
}

/** O rótulo da prévia vigente, para a tela do pagamento oferecer o reaproveitamento. Leitura. */
export async function rotulosDasPrevias(tx: Tx, liquidacaoIds: readonly string[]): Promise<Readonly<Record<string, string>>> {
  if (liquidacaoIds.length === 0) return {};
  const ps = await tx.previaDeRetencaoDaLiquidacao.findMany({ where: { liquidacaoId: { in: [...liquidacaoIds] } }, orderBy: { versao: "desc" }, select: { liquidacaoId: true, versao: true, totalPrevisto: true, dataPrevista: true } });
  const saida: Record<string, string> = {};
  for (const x of ps) if (saida[x.liquidacaoId] === undefined) saida[x.liquidacaoId] = `versão ${String(x.versao)}, de ${diaCivilBr(x.dataPrevista)}, retenção prevista de R$ ${x.totalPrevisto.toFixed(2).replace(".", ",")}`;
  return saida;
}
