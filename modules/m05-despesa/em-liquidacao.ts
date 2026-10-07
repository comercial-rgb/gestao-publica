import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { saldoDoDocumentoFiscal, situacaoDoDocumentoFiscal } from "../m11-licitacoes/documento-fiscal.js";
import { posicaoAPagar, type RecorteAPagar } from "./a-pagar.js";

/**
 * V36 — EMPENHOS E RESTOS EM LIQUIDAÇÃO (TR 5.10.1.42), pela VERIFICAÇÃO DO MATERIAL OU SERVIÇO.
 *
 * "Em liquidação" aqui é o empenho (do exercício ou resto NÃO processado) que ainda tem saldo a liquidar e cuja entrega
 * já foi verificada: há nota fiscal CONFERIDA para ele com valor ainda não liquidado. É o intervalo entre a conferência
 * da nota e a liquidação — o que o TR chama de "empenhos e restos com verificação de materiais".
 *
 * A aritmética é a que já existe, sem segunda versão:
 *  · o saldo a liquidar vem de `posicaoAPagar` (fase A_LIQUIDAR; exercício pelo M05, restos pelo M08);
 *  · a situação e o saldo de cada nota, de `situacaoDoDocumentoFiscal` e `saldoDoDocumentoFiscal` do M11.
 * Em liquidação = o MENOR entre o saldo a liquidar do empenho e o verificado a liquidar das notas (nota maior que o
 * empenho não faz o empenho "dever" mais do que tem).
 *
 * A nota é do empenho que ela aponta; sem empenho, do empenho ÚNICO da ordem de compra dela. Ordem com mais de um
 * empenho não atribui — dividir a nota entre eles seria inventar um rateio — e a nota fica fora, contada à parte.
 *
 * ⚠️ A OUTRA METADE DA CLÁUSULA — "por natureza possuem lançamentos em contas orçamentárias em liquidação" — não tem
 * conteúdo neste sistema: o estágio 6.2.2.1.3.02 está DORMENTE (decisão SEM-ESTAGIO-EM-LIQUIDACAO do M01), e nos restos
 * a conta de em liquidação é zerada no mesmo lançamento. Um relatório por saldo dessas contas sairia sempre vazio.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export interface NotaVerificada {
  readonly id: string;
  readonly rotulo: string;
  readonly dataRecebimento: Date;
  readonly aLiquidar: Money;
}

export interface EmpenhoEmLiquidacao {
  readonly empenhoId: string;
  readonly empenhoNumero: string;
  readonly situacao: "EXERCICIO" | "RP_NAO_PROCESSADO";
  readonly exercicioOrigem: number;
  readonly credorCpfCnpj: string;
  readonly fonteCodigo: string;
  readonly unidadeCodigo: string;
  readonly saldoALiquidar: Money;
  /** A soma do a liquidar das notas conferidas do empenho. */
  readonly verificado: Money;
  /** min(saldo a liquidar, verificado). */
  readonly emLiquidacao: Money;
  readonly notas: readonly NotaVerificada[];
}

export interface EmLiquidacao {
  readonly empenhos: readonly EmpenhoEmLiquidacao[];
  /** Notas conferidas com saldo cuja ordem de compra tem mais de um empenho: não atribuídas, e ditas. */
  readonly notasSemAtribuicao: number;
}

/** Os mesmos rótulos da tela de documentos fiscais. */
const ROTULO_DO_MODELO: Readonly<Record<string, string>> = { NFE: "NF-e", NFCE: "NFC-e", NF_AVULSA: "Nota avulsa", CTE: "CT-e", RPS: "RPS", RECIBO: "Recibo", OUTRO: "Outro" };

export async function empenhosEmLiquidacao(prisma: Tx, recorte: RecorteAPagar): Promise<EmLiquidacao> {
  const posicao = await posicaoAPagar(prisma, recorte);
  const aLiquidar = posicao.obrigacoes.filter(
    (o): o is typeof o & { situacao: "EXERCICIO" | "RP_NAO_PROCESSADO" } => o.fase === "A_LIQUIDAR" && o.saldo.greaterThan(0) && (o.situacao === "EXERCICIO" || o.situacao === "RP_NAO_PROCESSADO")
  );
  if (aLiquidar.length === 0) return { empenhos: [], notasSemAtribuicao: 0 };
  const ids = [...new Set(aLiquidar.map((o) => o.empenhoId))];
  const notas = await prisma.documentoFiscalRecebido.findMany({
    where: { OR: [{ empenhoId: { in: ids } }, { empenhoId: null, ordem: { empenhos: { some: { id: { in: ids } } } } }] },
    orderBy: [{ dataRecebimento: "asc" }, { numero: "asc" }],
    select: { id: true, modelo: true, serie: true, numero: true, dataRecebimento: true, empenhoId: true, ordem: { select: { empenhos: { select: { id: true } } } } },
  });
  const porEmpenho = new Map<string, NotaVerificada[]>();
  let semAtribuicao = 0;
  for (const n of notas) {
    if ((await situacaoDoDocumentoFiscal(prisma, n.id)) !== "CONFERIDO") continue;
    const saldo = await saldoDoDocumentoFiscal(prisma, n.id);
    if (!saldo.aLiquidar.greaterThan(0)) continue;
    const daOrdem = n.ordem?.empenhos ?? [];
    const dono = n.empenhoId ?? (daOrdem.length === 1 ? (daOrdem[0]?.id ?? null) : null);
    if (dono === null) {
      semAtribuicao += 1;
      continue;
    }
    porEmpenho.set(dono, [
      ...(porEmpenho.get(dono) ?? []),
      { id: n.id, rotulo: `${ROTULO_DO_MODELO[n.modelo] ?? n.modelo} ${n.numero}${n.serie !== "" ? ` série ${n.serie}` : ""}`, dataRecebimento: n.dataRecebimento, aLiquidar: saldo.aLiquidar },
    ]);
  }
  const empenhos: EmpenhoEmLiquidacao[] = [];
  for (const o of aLiquidar) {
    const ns = porEmpenho.get(o.empenhoId);
    if (ns === undefined) continue;
    const verificado = ns.reduce((s, n) => toMoney(s.plus(n.aLiquidar)), toMoney("0.00"));
    empenhos.push({
      empenhoId: o.empenhoId,
      empenhoNumero: o.empenhoNumero,
      situacao: o.situacao,
      exercicioOrigem: o.exercicioOrigem,
      credorCpfCnpj: o.credorCpfCnpj,
      fonteCodigo: o.fonteCodigo,
      unidadeCodigo: o.unidadeCodigo,
      saldoALiquidar: o.saldo,
      verificado,
      emLiquidacao: verificado.lessThan(o.saldo) ? verificado : o.saldo,
      notas: ns,
    });
  }
  return { empenhos, notasSemAtribuicao: semAtribuicao };
}

export function totalEmLiquidacao(es: readonly EmpenhoEmLiquidacao[]): { readonly exercicio: Money; readonly restos: Money } {
  let exercicio = toMoney("0.00");
  let restos = toMoney("0.00");
  for (const e of es) {
    if (e.situacao === "EXERCICIO") exercicio = toMoney(exercicio.plus(e.emLiquidacao));
    else restos = toMoney(restos.plus(e.emLiquidacao));
  }
  return { exercicio, restos };
}
