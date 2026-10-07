import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
import { situacaoPelosMovimentos } from "../m11-licitacoes/documento-fiscal.js";
import { posicaoAPagar, type RecorteAPagar } from "./a-pagar.js";

/**
 * V36 — EMPENHOS E RESTOS EM LIQUIDAÇÃO (TR 5.10.1.42), pela VERIFICAÇÃO DO MATERIAL OU SERVIÇO.
 *
 * "Em liquidação" aqui é o empenho (do exercício ou resto NÃO processado) que ainda tem saldo a liquidar e cuja entrega
 * já foi verificada além do que foi liquidado: as notas fiscais CONFERIDAS para ele somam mais do que o liquidado dele.
 * É o intervalo entre a conferência da nota e a liquidação — o que o TR chama de "empenhos e restos com verificação de
 * materiais".
 *
 * ⚠️ A CONTA É NO EMPENHO, NÃO NA NOTA. O vínculo da liquidação com a nota é opcional na tela; contar o "a liquidar" de
 * cada nota faria uma liquidação gravada sem escolher a nota deixar a entrega para sempre "em liquidação" (achado da
 * auditoria). Por isso:
 *     verificado     = Σ valor das notas CONFERIDAS do empenho (canceladas e substituídas não entram);
 *     liquidado      = Σ líquido das liquidações do empenho (somaLiquidaEstornaveis, a mesma do saldo da nota);
 *     em liquidação  = min(saldo a liquidar do empenho, max(0, verificado − liquidado)).
 * O saldo a liquidar vem de `posicaoAPagar` (fase A_LIQUIDAR; exercício pelo M05, restos pelo M08) — sem segunda versão.
 *
 * A nota é do empenho que ela aponta; sem empenho, do empenho ÚNICO da ordem de compra dela. Ordem com mais de um
 * empenho não atribui — dividir a nota entre eles seria inventar um rateio — e a nota fica fora, contada à parte só
 * quando todos os empenhos da ordem estão no recorte (o contador não fala de empenho que o leitor não vê).
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
  readonly valor: Money;
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
  /** Σ das notas conferidas do empenho. */
  readonly verificado: Money;
  /** Σ líquido das liquidações do empenho. */
  readonly liquidado: Money;
  /** min(saldo a liquidar, max(0, verificado − liquidado)). */
  readonly emLiquidacao: Money;
  readonly notas: readonly NotaVerificada[];
}

export interface EmLiquidacao {
  readonly empenhos: readonly EmpenhoEmLiquidacao[];
  /** Notas conferidas de ordem de compra com mais de um empenho (todos no recorte): não atribuídas, e ditas. */
  readonly notasSemAtribuicao: number;
}

/** Os mesmos rótulos da tela de documentos fiscais. */
const ROTULO_DO_MODELO: Readonly<Record<string, string>> = { NFE: "NF-e", NFCE: "NFC-e", NF_AVULSA: "Nota avulsa", CTE: "CT-e", RPS: "RPS", RECIBO: "Recibo", OUTRO: "Outro" };
const zero = (): Money => toMoney("0.00");

export async function empenhosEmLiquidacao(prisma: Tx, recorte: RecorteAPagar): Promise<EmLiquidacao> {
  const posicao = await posicaoAPagar(prisma, recorte);
  const aLiquidar = posicao.obrigacoes.filter(
    (o): o is typeof o & { situacao: "EXERCICIO" | "RP_NAO_PROCESSADO" } => o.fase === "A_LIQUIDAR" && o.saldo.greaterThan(0) && (o.situacao === "EXERCICIO" || o.situacao === "RP_NAO_PROCESSADO")
  );
  if (aLiquidar.length === 0) return { empenhos: [], notasSemAtribuicao: 0 };
  const ids = [...new Set(aLiquidar.map((o) => o.empenhoId))];
  const noRecorte = new Set(ids);
  // Duas leituras em lote, nenhuma por nota: as notas com os movimentos (a situação) e as liquidações dos empenhos.
  const [notas, liquidacoes] = await Promise.all([
    prisma.documentoFiscalRecebido.findMany({
      where: { OR: [{ empenhoId: { in: ids } }, { empenhoId: null, ordem: { empenhos: { some: { id: { in: ids } } } } }] },
      orderBy: [{ dataRecebimento: "asc" }, { numero: "asc" }],
      select: {
        id: true, modelo: true, serie: true, numero: true, dataRecebimento: true, valorTotal: true, empenhoId: true,
        movimentos: { select: { tipo: true } },
        ordem: { select: { empenhos: { select: { id: true } } } },
      },
    }),
    prisma.liquidacao.findMany({ where: { empenhoId: { in: ids } }, select: { id: true, empenhoId: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true } }),
  ]);
  const porEmpenho = new Map<string, NotaVerificada[]>();
  let semAtribuicao = 0;
  for (const n of notas) {
    if (situacaoPelosMovimentos(n.movimentos.map((m) => m.tipo)) !== "CONFERIDO") continue;
    const daOrdem = n.ordem?.empenhos ?? [];
    const dono = n.empenhoId ?? (daOrdem.length === 1 ? (daOrdem[0]?.id ?? null) : null);
    if (dono === null) {
      if (daOrdem.every((e) => noRecorte.has(e.id))) semAtribuicao += 1;
      continue;
    }
    porEmpenho.set(dono, [
      ...(porEmpenho.get(dono) ?? []),
      { id: n.id, rotulo: `${ROTULO_DO_MODELO[n.modelo] ?? n.modelo} ${n.numero}${n.serie !== "" ? ` série ${n.serie}` : ""}`, dataRecebimento: n.dataRecebimento, valor: toMoney(n.valorTotal.toFixed(2)) },
    ]);
  }
  const liquidadoDe = (empenhoId: string): Money =>
    somaLiquidaEstornaveis(
      liquidacoes
        .filter((l) => l.empenhoId === empenhoId)
        .map((l) => ({ id: l.id, valor: toMoney(l.valor.toFixed(2)), estornoDeId: l.estornoDeId, anulacaoParcialDeId: l.anulacaoParcialDeId }))
    );
  const empenhos: EmpenhoEmLiquidacao[] = [];
  for (const o of aLiquidar) {
    const ns = porEmpenho.get(o.empenhoId);
    if (ns === undefined) continue;
    const verificado = ns.reduce((s, n) => toMoney(s.plus(n.valor)), zero());
    const liquidado = liquidadoDe(o.empenhoId);
    const aMais = toMoney(verificado.minus(liquidado));
    if (!aMais.greaterThan(0)) continue;
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
      liquidado,
      emLiquidacao: aMais.lessThan(o.saldo) ? aMais : o.saldo,
      notas: ns,
    });
  }
  return { empenhos, notasSemAtribuicao: semAtribuicao };
}

export function totalEmLiquidacao(es: readonly EmpenhoEmLiquidacao[]): { readonly exercicio: Money; readonly restos: Money } {
  let exercicio = zero();
  let restos = zero();
  for (const e of es) {
    if (e.situacao === "EXERCICIO") exercicio = toMoney(exercicio.plus(e.emLiquidacao));
    else restos = toMoney(restos.plus(e.emLiquidacao));
  }
  return { exercicio, restos };
}
