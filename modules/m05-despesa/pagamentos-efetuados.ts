import { toMoney, type Money } from "../../packages/contracts/index.js";
import { diaCivil as diaCivilDoEnte } from "../../packages/datas/index.js";
import { liquidoDoFato } from "../../packages/estornaveis/index.js";
import { retidoPorPagamento } from "./a-pagar.js";
import { comoLinha } from "./consultas.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";

type Tx = Pick<PrismaClient, "pagamento" | "movimentoExtraorcamentario" | "retencaoPropriaDoPagamento">;

/**
 * V36 — PAGAMENTOS EFETUADOS NUM PERÍODO (TR 5.10.2.71 e 5.10.2.2): os do exercício E os de restos a pagar, com o
 * retido e o líquido de cada um, filtrados por credor, fonte e conta bancária, e agrupáveis.
 *
 * A lista da execução (`listarPagamentos`) recorta pela FICHA do exercício, e por isso o pagamento de um resto —
 * que é um `Pagamento` como outro qualquer, sobre a liquidação de um empenho de ano anterior — não aparecia nela.
 * Aqui o recorte é pela DATA do pagamento, e a origem sai da comparação entre o exercício da dotação e o ano do
 * pagamento.
 *
 * A aritmética é a do resto do módulo, sem segunda versão:
 *  · o pago vivo é `liquidoDoFato` (o mesmo da lista e do dossiê), sobre o original, as parciais e os estornos;
 *  · o retido é `retidoPorPagamento` (o mesmo do a pagar): retenções na fonte e próprias, sem as estornadas;
 *  · líquido = pago vivo − retido. Pagamento anulado por inteiro sai com pago vivo zero e continua na lista.
 */

export type OrigemDoPagamento = "EXERCICIO" | "RESTOS";

export interface PagamentoEfetuado {
  readonly id: string;
  readonly numero: string;
  readonly data: Date;
  readonly origem: OrigemDoPagamento;
  readonly exercicioDaDotacao: number;
  readonly empenhoId: string;
  readonly empenhoNumero: string;
  readonly liquidacaoNumero: string;
  readonly credorCpfCnpj: string;
  readonly fonteCodigo: string;
  readonly contaBancaria: string;
  readonly bruto: Money;
  readonly pagoVivo: Money;
  readonly retido: Money;
  readonly liquido: Money;
  readonly anulado: boolean;
  /** V36 (TR 5.10.2.4) — o pagamento tem documento anexado (aba Documentos do pagamento). */
  readonly comAnexo: boolean;
  /** V36 (TR 5.10.2.4) — algum documento do pagamento ou da ordem de pagamento dele tem assinatura eletrônica. */
  readonly assinado: boolean;
}

export interface RecorteDosPagamentos {
  /** Instantes já resolvidos pelo chamador (início e fim do dia civil). */
  readonly de: Date;
  readonly ate: Date;
  readonly credorCpfCnpj?: string | undefined;
  readonly fonteCodigo?: string | undefined;
  readonly contaBancaria?: string | undefined;
  readonly unidadeCodigo?: string | undefined;
  /** V36 (TR 5.10.2.4) — só os com documento anexado (true) ou só os sem (false). */
  readonly comAnexo?: boolean | undefined;
  /** V36 (TR 5.10.2.4) — só os assinados (true) ou só os não assinados (false). */
  readonly assinado?: boolean | undefined;
}

/** "Assinado": uma assinatura em documento do PAGAMENTO ou da ORDEM de pagamento que o autorizou. */
const ASSINADO = {
  OR: [
    { anexos: { some: { assinaturas: { some: {} } } } },
    { ordemDePagamento: { anexos: { some: { assinaturas: { some: {} } } } } },
  ],
};

export async function pagamentosEfetuados(prisma: Tx, r: RecorteDosPagamentos): Promise<readonly PagamentoEfetuado[]> {
  const originais = await prisma.pagamento.findMany({
    where: {
      estornoDeId: null,
      anulacaoParcialDeId: null,
      data: { gte: r.de, lte: r.ate },
      ...(r.fonteCodigo !== undefined ? { fonte: { codigo: r.fonteCodigo } } : {}),
      ...(r.contaBancaria !== undefined ? { contaBancaria: r.contaBancaria } : {}),
      ...(r.comAnexo === true ? { anexos: { some: {} } } : r.comAnexo === false ? { anexos: { none: {} } } : {}),
      ...(r.assinado === true ? ASSINADO : r.assinado === false ? { NOT: ASSINADO } : {}),
      liquidacao: {
        empenho: {
          ...(r.credorCpfCnpj !== undefined ? { credorCpfCnpj: r.credorCpfCnpj } : {}),
          ...(r.unidadeCodigo !== undefined ? { ficha: { unidadeOrc: { codigo: r.unidadeCodigo } } } : {}),
        },
      },
    },
    orderBy: [{ data: "asc" }, { numero: "asc" }],
    select: {
      id: true,
      numero: true,
      data: true,
      valor: true,
      contaBancaria: true,
      fonte: { select: { codigo: true } },
      anexos: { select: { _count: { select: { assinaturas: true } } } },
      ordemDePagamento: { select: { anexos: { select: { _count: { select: { assinaturas: true } } } } } },
      liquidacao: { select: { numero: true, empenho: { select: { id: true, numero: true, credorCpfCnpj: true, ficha: { select: { exercicio: true } } } } } },
    },
  });
  if (originais.length === 0) return [];
  const ids = originais.map((p) => p.id);
  const [reducoes, retido] = await Promise.all([
    prisma.pagamento.findMany({
      where: { OR: [{ estornoDeId: { in: ids } }, { anulacaoParcialDeId: { in: ids } }, { estornoDe: { anulacaoParcialDeId: { in: ids } } }] },
      select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true },
    }),
    retidoPorPagamento(prisma, ids),
  ]);
  const universo = [...originais.map((p) => comoLinha({ ...p, estornoDeId: null, anulacaoParcialDeId: null })), ...reducoes.map(comoLinha)];
  const totalmenteAnulados = new Set(reducoes.filter((x) => x.estornoDeId !== null && ids.includes(x.estornoDeId)).map((x) => x.estornoDeId));
  return originais.map((p) => {
    const pagoVivo = liquidoDoFato(p.id, universo);
    const ret = totalmenteAnulados.has(p.id) ? toMoney("0.00") : (retido.get(p.id) ?? toMoney("0.00"));
    const exercicioDaDotacao = p.liquidacao.empenho.ficha.exercicio;
    return {
      id: p.id,
      numero: p.numero,
      data: p.data,
      origem: exercicioDaDotacao < anoCivil(p.data) ? "RESTOS" : "EXERCICIO",
      exercicioDaDotacao,
      empenhoId: p.liquidacao.empenho.id,
      empenhoNumero: p.liquidacao.empenho.numero,
      liquidacaoNumero: p.liquidacao.numero,
      credorCpfCnpj: p.liquidacao.empenho.credorCpfCnpj,
      fonteCodigo: p.fonte.codigo,
      contaBancaria: p.contaBancaria,
      bruto: toMoney(p.valor.toFixed(2)),
      pagoVivo,
      retido: ret,
      liquido: toMoney(pagoVivo.minus(ret)),
      anulado: totalmenteAnulados.has(p.id),
      comAnexo: p.anexos.length > 0,
      assinado: [...p.anexos, ...(p.ordemDePagamento?.anexos ?? [])].some((a) => a._count.assinaturas > 0),
    };
  });
}

/** O ano civil do ente para um instante (a mesma régua de `packages/datas`). */
function anoCivil(d: Date): number {
  return Number(diaCivilDoEnte(d).slice(0, 4));
}

export type AgrupamentoDosPagamentos = "credor" | "fonte" | "conta";

export interface GrupoDePagamentos {
  readonly chave: string;
  readonly linhas: readonly PagamentoEfetuado[];
  readonly pagoVivo: Money;
  readonly retido: Money;
  readonly liquido: Money;
}

/** Agrupa e subtotaliza (Decimal). Grupos em ordem da chave; as linhas mantêm a ordem recebida. */
export function agruparPagamentos(linhas: readonly PagamentoEfetuado[], por: AgrupamentoDosPagamentos): readonly GrupoDePagamentos[] {
  const chaveDe = (l: PagamentoEfetuado): string => (por === "credor" ? l.credorCpfCnpj : por === "fonte" ? l.fonteCodigo : l.contaBancaria);
  const grupos = new Map<string, PagamentoEfetuado[]>();
  for (const l of linhas) {
    const k = chaveDe(l);
    const g = grupos.get(k) ?? [];
    g.push(l);
    grupos.set(k, g);
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([chave, ls]) => ({ chave, linhas: ls, ...totaisDosPagamentos(ls) }));
}

export function totaisDosPagamentos(linhas: readonly PagamentoEfetuado[]): { readonly pagoVivo: Money; readonly retido: Money; readonly liquido: Money } {
  let pagoVivo = toMoney("0.00");
  let retido = toMoney("0.00");
  let liquido = toMoney("0.00");
  for (const l of linhas) {
    pagoVivo = toMoney(pagoVivo.plus(l.pagoVivo));
    retido = toMoney(retido.plus(l.retido));
    liquido = toMoney(liquido.plus(l.liquido));
  }
  return { pagoVivo, retido, liquido };
}
