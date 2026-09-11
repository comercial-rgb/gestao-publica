import type { DefinicaoDeRecurso, FiltroDoMolde } from "./tipos.js";

/**
 * A LEITURA DA QUERY STRING DO MOLDE — pura, e por isso testável sem React e sem banco.
 *
 * ⚠️ TODA A NAVEGAÇÃO DA LISTAGEM É URL: filtro, página, ordenação e seleção. É o que faz a
 * lista ser linkável, sobreviver ao refresh, abrir em nova aba e funcionar sem JavaScript.
 * E é o que permite a este arquivo existir: não há estado a reproduzir num teste.
 *
 * ⚠️ ELE É FAIL-SAFE, NÃO FAIL-CLOSED, e a diferença importa. Uma página `?pagina=-3` não é
 * ataque, é link velho — ela volta para a 1. Um `?ordem=coluna_que_nao_existe` NÃO vira
 * ordenação nenhuma, em vez de virar SQL: quem ordena é a porta, e ela só aceita nome que
 * esteja no descritor. Isto é a fronteira que impede a query string de escolher coluna.
 */

export const TAMANHO_DE_PAGINA = 25;
export const MAXIMO_DE_SELECAO = 500;

export interface ConsultaDoMolde {
  readonly filtros: Readonly<Record<string, string>>;
  readonly pagina: number;
  readonly ordem: string | null;
  readonly direcao: "asc" | "desc";
  readonly selecionados: readonly string[];
  readonly aba: string;
}

/** O tipo que o Next entrega em `searchParams`. */
export type ParametrosBrutos = Readonly<Record<string, string | string[] | undefined>>;

function primeiro(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

function todos(v: string | string[] | undefined): readonly string[] {
  if (Array.isArray(v)) return v;
  return v === undefined || v === "" ? [] : [v];
}

function normalizarFiltro(f: FiltroDoMolde, bruto: string): string {
  const v = bruto.trim();
  if (v === "") return "";
  if (f.tipo === "inteiro") return /^-?\d+$/.test(v) ? v : "";
  // ⚠️ A DATA VEM COMO `YYYY-MM-DD` — um DIA, não um instante. Quem o transforma em janela
  // de instantes é a porta, pelo dia civil do ente (`packages/datas`). Aceitar aqui um
  // formato livre deixaria a porta adivinhando o fuso.
  if (f.tipo === "data") return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
  if (f.tipo === "selecao") {
    return (f.opcoes ?? []).some((o) => o.valor === v) ? v : "";
  }
  // Texto: limite de tamanho para o `contains` não virar varredura de MB.
  return v.slice(0, 120);
}

export function lerConsulta(
  d: DefinicaoDeRecurso,
  brutos: ParametrosBrutos
): ConsultaDoMolde {
  const filtros: Record<string, string> = {};
  for (const f of d.filtros) {
    filtros[f.nome] = normalizarFiltro(f, primeiro(brutos[f.nome]));
  }

  const paginaBruta = Number(primeiro(brutos["pagina"]));
  const pagina = Number.isInteger(paginaBruta) && paginaBruta >= 1 ? paginaBruta : 1;

  // ⚠️ SÓ COLUNA DECLARADA ORDENÁVEL. Sem esta conferência, a query string escolheria a
  // coluna do `orderBy` — e uma coluna que o descritor não conhece é, na melhor hipótese,
  // um erro do Prisma na cara do usuário.
  const ordemBruta = primeiro(brutos["ordem"]);
  const ordem =
    d.colunas.some((c) => c.nome === ordemBruta && c.ordenavel === true) ? ordemBruta : null;
  const direcao = primeiro(brutos["dir"]) === "desc" ? "desc" : "asc";

  // ⚠️ O TETO DA SELEÇÃO É EXPLÍCITO. Sem ele, um link com dez mil `sel=` viraria um `IN`
  // de dez mil itens — e o custo apareceria como lentidão inexplicável, não como recusa.
  const selecionados = [...new Set(todos(brutos["sel"]).filter((s) => s !== ""))].slice(
    0,
    MAXIMO_DE_SELECAO
  );

  const abaBruta = primeiro(brutos["aba"]);
  const aba = d.abas.includes(abaBruta as never) ? abaBruta : "dados";

  return { filtros, pagina, ordem, direcao, selecionados, aba };
}
