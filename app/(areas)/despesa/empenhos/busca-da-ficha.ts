/** O que a busca precisa de cada ficha (a forma de `FichaParaEmpenho`, sem depender do componente cliente). */
export interface FichaBuscavel {
  readonly numero: number;
  readonly naturezaCodigo: string;
  readonly naturezaDescricao: string;
  readonly fonteCodigo: string;
  readonly unidade?: string;
  readonly classificacao?: string;
}

/**
 * V36 — A BUSCA DA DOTAÇÃO (TR 5.10.1.9). Cada termo digitado tem de aparecer em alguma parte da ficha (número,
 * natureza e título, fonte, unidade, função.subfunção.programa.ação e título da ação), sem diferença de caixa ou
 * acento. Termos vários restringem (E), não ampliam. Pura e exportada para teste.
 */
export function fichasQueCasam<T extends FichaBuscavel>(fichas: readonly T[], busca: string): readonly T[] {
  const sem = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const termos = sem(busca).split(/\s+/).filter((t) => t !== "");
  if (termos.length === 0) return fichas;
  return fichas.filter((f) => {
    const texto = sem(`${String(f.numero)} ${f.naturezaCodigo} ${f.naturezaDescricao} fonte ${f.fonteCodigo} ${f.unidade ?? ""} ${f.classificacao ?? ""}`);
    return termos.every((t) => texto.includes(t));
  });
}
