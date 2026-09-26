/** O exercício padrão das demonstrações anuais, e a leitura do que vem na URL. */
export const PADRAO_EXERCICIO = 2026;

/** Lê `exercicio` (yyyy) da query. Valor inválido cai no padrão — nunca em NaN. */
export function lerExercicio(
  sp: Record<string, string | string[] | undefined>
): { readonly exercicio: number; readonly exercicioStr: string } {
  const bruto = Array.isArray(sp["exercicio"]) ? sp["exercicio"][0] : sp["exercicio"];
  const ok = bruto !== undefined && /^\d{4}$/.test(bruto);
  const exercicio = ok ? Number(bruto) : PADRAO_EXERCICIO;
  return { exercicio, exercicioStr: String(exercicio) };
}

/** Lê `corte` (yyyy-mm-dd) da query; padrão = 31/12 do exercício padrão. */
export const PADRAO_CORTE = `${PADRAO_EXERCICIO}-12-31`;
export function lerCorteStr(
  sp: Record<string, string | string[] | undefined>
): string {
  const bruto = Array.isArray(sp["corte"]) ? sp["corte"][0] : sp["corte"];
  return bruto !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(bruto) ? bruto : PADRAO_CORTE;
}
