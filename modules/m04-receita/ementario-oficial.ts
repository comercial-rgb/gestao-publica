import { lerPlanilha } from "../../packages/planilha/index.js";

/**
 * ═══ O EMENTÁRIO OFICIAL DA RECEITA (STN 2026) COMO DADO (V35) ═══
 *
 * O ementário da STN (`docs/oficial/stn-sof/ementario-2026/ementario-receita-tabela-de-codigos-2026.xlsx`, aba
 * `ENR - 2026`) lista os códigos AGREGADORES — o oitavo dígito (Tipo) é sempre 0. O código que se arrecada troca o
 * Tipo pela espécie de arrecadação, como o MCASP 11ª edição, Parte I, define ("Tipo"):
 *   1 principal · 2 multas e juros de mora · 3 dívida ativa · 4 multas e juros da dívida ativa ·
 *   5 multas · 6 juros de mora · 7 multas da dívida ativa · 8 juros de mora da dívida ativa.
 * As receitas intraorçamentárias usam as categorias 7 e 8 no lugar de 1 e 2, com a mesma classificação.
 *
 * A descrição de um código real é a especificação do agregador, mais a espécie e, se for o caso, a marca
 * intraorçamentária. Nada é escrito à mão: código fora do ementário (ou EXCLUÍDO nele) não tem descrição.
 */

const ESPECIE_DO_TIPO: Readonly<Record<string, string>> = {
  "1": "Principal",
  "2": "Multas e Juros de Mora",
  "3": "Dívida Ativa",
  "4": "Multas e Juros de Mora da Dívida Ativa",
  "5": "Multas",
  "6": "Juros de Mora",
  "7": "Multas da Dívida Ativa",
  "8": "Juros de Mora da Dívida Ativa",
};

/** NR agregador (8 dígitos, Tipo 0) → especificação, sem as linhas excluídas. */
export function lerEmentarioDaReceita(conteudo: Buffer): ReadonlyMap<string, string> {
  const aba = lerPlanilha(conteudo).get("ENR - 2026");
  if (aba === undefined) throw new Error('O arquivo não tem a aba "ENR - 2026": não é o ementário da receita de 2026.');
  const cab = aba[0] ?? [];
  const iNr = cab.indexOf("NR");
  const iEsp = cab.indexOf("Especificação");
  const iStatus = cab.indexOf("STATUS");
  if (iNr < 0 || iEsp < 0) throw new Error("O ementário não tem as colunas NR e Especificação.");
  const mapa = new Map<string, string>();
  for (const l of aba.slice(1)) {
    const nr = (l[iNr] ?? "").replace(/\D/g, "");
    if (!/^\d{8}$/.test(nr)) continue;
    if (iStatus >= 0 && /exclu/i.test(l[iStatus] ?? "")) continue;
    mapa.set(nr, (l[iEsp] ?? "").replace(/\s+/g, " ").replace(/\.$/, "").trim());
  }
  return mapa;
}

/** A descrição oficial de um código de 8 dígitos; `null` quando o agregador não está no ementário ou o Tipo é 0. */
export function descricaoOficialDaNatureza(codigo: string, ementario: ReadonlyMap<string, string>): string | null {
  if (!/^\d{8}$/.test(codigo)) return null;
  const tipo = codigo[7]!;
  const especie = ESPECIE_DO_TIPO[tipo];
  if (especie === undefined) return null;
  const intra = codigo[0] === "7" || codigo[0] === "8";
  const categoria = codigo[0] === "7" ? "1" : codigo[0] === "8" ? "2" : codigo[0]!;
  const agregador = `${categoria}${codigo.slice(1, 7)}0`;
  const base = ementario.get(agregador);
  if (base === undefined) return null;
  return `${base} - ${especie}${intra ? " - Intraorçamentária" : ""}`;
}
