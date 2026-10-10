/**
 * V39-013/014 — O RECORTE DA PÁGINA DA PROPOSTA. Medido em 10/10/2026 com a proposta de 2032 da base fictícia: o
 * servidor montava os dados em ~90 ms (1.133 linhas, 484 KiB), mas a página tinha 13 MB de HTML, 46 mil nós e 1.140
 * formulários (um por linha), e levava de 22 a 39 s para chegar. O recorte mostra 100 linhas por vez, com busca; o
 * editor da linha abre só para a linha escolhida (`?editar=`).
 *
 * Puro: a busca ignora maiúsculas e acentos, e compara códigos só pelos dígitos ("3.3.90.30" acha "339030"). O total
 * do filtro é do conjunto filtrado INTEIRO, não da página.
 */

export const LINHAS_POR_PAGINA = 100;

const normal = (t: string): string => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const digitos = (t: string): string => t.replace(/\D/g, "");

export function casaComABusca(texto: string, busca: string): boolean {
  const b = busca.trim();
  if (b === "") return true;
  if (normal(texto).includes(normal(b))) return true;
  const d = digitos(b);
  // Só quando a busca é um código (só dígitos e pontuação): "3.3.90" acha "339030"; "fonte 500" não vira "500" solto.
  return d.length >= 2 && /^[\d.\-/ ]+$/.test(b) && digitos(texto).includes(d);
}

export interface Recorte<T> {
  readonly linhas: readonly T[];
  /** Linhas no conjunto inteiro. */
  readonly total: number;
  /** Linhas que casam com a busca (o total do filtro). */
  readonly filtradas: readonly T[];
  readonly pagina: number;
  readonly paginas: number;
  /** Posição (1-based) da primeira e da última linha mostradas; 0 e 0 quando nada casa. */
  readonly primeira: number;
  readonly ultima: number;
}

export function recortar<T>(todas: readonly T[], textoDe: (l: T) => string, busca: string, paginaPedida: number): Recorte<T> {
  const filtradas = todas.filter((l) => casaComABusca(textoDe(l), busca));
  const paginas = Math.max(1, Math.ceil(filtradas.length / LINHAS_POR_PAGINA));
  const pagina = Math.min(Math.max(1, Number.isFinite(paginaPedida) ? Math.trunc(paginaPedida) : 1), paginas);
  const inicio = (pagina - 1) * LINHAS_POR_PAGINA;
  const linhas = filtradas.slice(inicio, inicio + LINHAS_POR_PAGINA);
  return {
    linhas,
    total: todas.length,
    filtradas,
    pagina,
    paginas,
    primeira: linhas.length === 0 ? 0 : inicio + 1,
    ultima: inicio + linhas.length,
  };
}

/** A página em que está uma linha (para o editor abrir a linha certa mesmo vindo de outra página). */
export function paginaDaLinha<T>(filtradas: readonly T[], eh: (l: T) => boolean): number | null {
  const i = filtradas.findIndex(eh);
  return i < 0 ? null : Math.floor(i / LINHAS_POR_PAGINA) + 1;
}
