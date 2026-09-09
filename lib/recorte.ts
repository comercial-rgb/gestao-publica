/**
 * O RECORTE DE UMA PÁGINA DE EXECUÇÃO — exercício e unidade, lidos da URL.
 *
 * As páginas são Server Components; quem põe exercício/UG na URL é a ilha
 * `SincronizarContexto` (o UiContext do cabeçalho). Este módulo é a leitura do outro
 * lado — e existe para que as quatro telas leiam a URL do MESMO jeito. Quatro cópias
 * de `Number.parseInt(searchParams.exercicio)` divergiriam no primeiro caso de borda
 * (`?exercicio=abc`), e cada tela responderia um ano diferente.
 *
 * ⚠️ SEM DOMÍNIO E SEM PRISMA — é `lib/` fora de `lib/portas/`. Só parse de string.
 */

/** O exercício default quando a URL ainda não tem um (o primeiro render, antes da ilha sincronizar). */
export const EXERCICIO_PADRAO = 2026;

export interface RecorteDaPagina {
  readonly exercicio: number;
  /** Código SAGRES da unidade. `undefined` = consolidado (o ente inteiro). */
  readonly unidadeCodigo: string | undefined;
}

type Params = Record<string, string | string[] | undefined>;

/** Um `searchParam` pode vir repetido (`?ug=a&ug=b`); vale o primeiro. */
function primeiro(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Lê o recorte da URL. Um exercício ilegível vira o padrão — nunca `NaN`: uma consulta
 * com `exercicio: NaN` não erra, ela devolve lista vazia, e a tela mentiria dizendo
 * "não há empenhos" quando o certo é "o ano que você pediu não é um ano".
 */
export function recorteDe(sp: Params): RecorteDaPagina {
  const bruto = primeiro(sp["exercicio"]);
  const n = bruto !== undefined ? Number.parseInt(bruto, 10) : Number.NaN;
  const ug = primeiro(sp["ug"])?.trim();

  return {
    exercicio: Number.isInteger(n) ? n : EXERCICIO_PADRAO,
    unidadeCodigo: ug !== undefined && ug !== "" ? ug : undefined,
  };
}

/** "2026 · unidade 01001" — o subtítulo que diz ao usuário o que ele está vendo. */
export function descreverRecorte(r: RecorteDaPagina): string {
  return `Exercício ${r.exercicio} · ${
    r.unidadeCodigo !== undefined
      ? `unidade ${r.unidadeCodigo}`
      : "consolidado (ente)"
  }`;
}

/** Data (UTC) → "dd/mm/aaaa". A data do FATO, como o usuário a escreve. */
export function dataBr(d: Date): string {
  return d.toISOString().slice(0, 10).split("-").reverse().join("/");
}
