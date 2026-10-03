import { anoCivil } from "../../../../packages/datas/index";

/**
 * O exercício das demonstrações, e a leitura do que vem na URL.
 *
 * ⚠️ V33 — O PADRÃO É O EXERCÍCIO DO CONTEXTO (`?exercicio=`, que o menu e o seletor do cabeçalho põem na URL), e,
 * sem ele, o ano civil corrente. Antes era 2026 cravado: com 2027 no cabeçalho, o balanço abria 2026 sem dizer nada
 * (o mesmo defeito que a V31 corrigiu nos livros).
 */
function exercicioDaUrl(sp: Record<string, string | string[] | undefined>): number | null {
  const bruto = Array.isArray(sp["exercicio"]) ? sp["exercicio"][0] : sp["exercicio"];
  return bruto !== undefined && /^\d{4}$/.test(bruto) ? Number(bruto) : null;
}

/** Lê `exercicio` (yyyy) da query. Valor inválido ou ausente cai no ano civil corrente — nunca em NaN. */
export function lerExercicio(
  sp: Record<string, string | string[] | undefined>
): { readonly exercicio: number; readonly exercicioStr: string } {
  const exercicio = exercicioDaUrl(sp) ?? anoCivil(new Date());
  return { exercicio, exercicioStr: String(exercicio) };
}

/** Lê `corte` (yyyy-mm-dd) da query; padrão = 31/12 do exercício do contexto. */
export function lerCorteStr(
  sp: Record<string, string | string[] | undefined>
): string {
  const bruto = Array.isArray(sp["corte"]) ? sp["corte"][0] : sp["corte"];
  if (bruto !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(bruto)) return bruto;
  return `${String(exercicioDaUrl(sp) ?? anoCivil(new Date()))}-12-31`;
}
