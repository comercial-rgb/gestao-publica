import type { EmpenhoFato } from "../sagres/index.js";

/**
 * COMPARAÇÃO "dados locais × TCE" (F3) — ela LÊ, não recalcula. Casa os empenhos locais (o DTO da S1)
 * com os registros que o TCE devolveu, pela chave (número do empenho), e classifica cada linha. Nenhuma
 * aritmética nova: os valores já existem dos dois lados; aqui só se COMPARA.
 */

export type SituacaoComparacao = "IGUAL" | "DIVERGENTE" | "SO_LOCAL" | "SO_TCE";

export interface LinhaComparacao {
  readonly chave: string;
  readonly valorLocal: string | null;
  readonly valorTce: string | null;
  readonly situacao: SituacaoComparacao;
}

function soDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

/** Compara empenhos locais (EmpenhoFato) × registros do TCE (schema `empenhos`), pela chave numeroEmpenho. */
export function compararEmpenhos(
  locais: readonly EmpenhoFato[],
  tce: readonly Record<string, unknown>[]
): LinhaComparacao[] {
  const localPorChave = new Map<string, string>(); // chave → valor local (2 casas)
  for (const e of locais) localPorChave.set(soDigitos(e.numEmpenho), e.valor.toFixed(2));

  const tcePorChave = new Map<string, string>();
  for (const r of tce) {
    const chave = soDigitos(String(r["numero"] ?? ""));
    const valor = typeof r["valor"] === "number" ? (r["valor"] as number).toFixed(2) : null;
    if (valor !== null) tcePorChave.set(chave, valor);
  }

  const chaves = [...new Set([...localPorChave.keys(), ...tcePorChave.keys()])].sort();
  return chaves.map((chave) => {
    const vl = localPorChave.get(chave) ?? null;
    const vt = tcePorChave.get(chave) ?? null;
    let situacao: SituacaoComparacao;
    if (vl !== null && vt !== null) situacao = vl === vt ? "IGUAL" : "DIVERGENTE";
    else if (vl !== null) situacao = "SO_LOCAL";
    else situacao = "SO_TCE";
    return { chave, valorLocal: vl, valorTce: vt, situacao };
  });
}
