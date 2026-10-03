import { cliente } from "./cliente";

/**
 * O EMPENHO DONO DE UM DOCUMENTO DA DESPESA (V31) — para o drill "lançamento → documento".
 *
 * Empenho, liquidação e pagamento guardam as próprias anulações (total e parcial) como linhas da mesma
 * tabela, e o `origemId` do lançamento é o id dessa linha. Por isso a resolução é por TABELA, decidida
 * pelo prefixo do `origemTipo`, e não por uma lista de espécies que envelheceria.
 *
 * Devolve o endereço do dossiê do empenho com a âncora do documento, ou null se não achar.
 */
export function familiaDoTipo(tipo: string): "EMPENHO" | "LIQUIDACAO" | "PAGAMENTO" | null {
  if (/EMPENHO/.test(tipo)) return "EMPENHO";
  if (/LIQUIDACAO/.test(tipo)) return "LIQUIDACAO";
  if (/PAGAMENTO/.test(tipo)) return "PAGAMENTO";
  return null;
}

export async function empenhoDoDocumento(tipo: string, id: string): Promise<string | null> {
  const db = cliente();
  const familia = familiaDoTipo(tipo);
  if (familia === "EMPENHO") {
    const e = await db.empenho.findUnique({ where: { id }, select: { id: true } });
    return e === null ? null : `/despesa/empenhos/${e.id}`;
  }
  if (familia === "LIQUIDACAO") {
    const l = await db.liquidacao.findUnique({ where: { id }, select: { empenhoId: true, estornoDeId: true, anulacaoParcialDeId: true } });
    if (l === null) return null;
    return `/despesa/empenhos/${l.empenhoId}#liquidacao-${l.estornoDeId ?? l.anulacaoParcialDeId ?? id}`;
  }
  if (familia === "PAGAMENTO") {
    const p = await db.pagamento.findUnique({
      where: { id },
      select: { estornoDeId: true, anulacaoParcialDeId: true, liquidacao: { select: { empenhoId: true } } },
    });
    if (p === null) return null;
    return `/despesa/empenhos/${p.liquidacao.empenhoId}#pagamento-${p.estornoDeId ?? p.anulacaoParcialDeId ?? id}`;
  }
  return null;
}
