import { fimDoDiaCivil, inicioDoDiaCivil } from "../../../../packages/datas/index";
/** Período padrão dos livros: o exercício de 2026 inteiro (ISO yyyy-mm-dd). */
export const PADRAO_DESDE = "2026-01-01";
export const PADRAO_ATE = "2026-12-31";

/** Lê `desde`/`ate` (yyyy-mm-dd) da query, com o exercício inteiro como padrão. */
export function lerPeriodo(sp: Record<string, string | string[] | undefined>): {
  readonly desde: Date;
  readonly ate: Date;
  readonly desdeStr: string;
  readonly ateStr: string;
} {
  const desdeStr = umaData(sp["desde"], PADRAO_DESDE);
  const ateStr = umaData(sp["ate"], PADRAO_ATE);
  // corte inclusivo: `ate` cobre o dia inteiro (23:59:59).
  return {
    desde: inicioDoDiaCivil(desdeStr),
    ate: fimDoDiaCivil(ateStr),
    desdeStr,
    ateStr,
  };
}

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
function umaData(v: string | string[] | undefined, padrao: string): string {
  const bruto = Array.isArray(v) ? v[0] : v;
  return bruto !== undefined && RE_DATA.test(bruto) ? bruto : padrao;
}
