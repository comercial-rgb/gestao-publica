import { toMoney, type Money } from "../../../packages/contracts/index.js";
import {
  CATEGORIAS_ECONOMICAS,
  GRUPOS_NATUREZA_DESPESA,
} from "../../../prisma/seed/dados/natureza-componentes.js";
import {
  CATEGORIAS_RECEITA,
  ORIGEM_RECEITA,
  categoriaDaReceita,
  type ChaveOrigem,
  type OrigemReceita,
} from "../../m04-receita/natureza.js";
import { SINAL_PREVISAO, type TipoReceitaPrevista } from "../../m02-planejamento/dominio.js";

/**
 * ═══ A LEI ORÇAMENTÁRIA ANUAL CONSOLIDADA — OS ANEXOS DA LEI 4.320/64 (M02b) ═══
 *
 * Função PURA sobre o DTO já lido (padrão de `ldo.ts`): a mesma função monta o anexo do teste e o
 * do documento publicado, sem banco no meio. O leitor é `../consultas-loa.ts`.
 *
 * ⚠️ SEM SEGUNDA FONTE DE VERDADE. A despesa fixada é o `valorDotado` de cada ficha (a origem do
 * movimento DOTACAO_INICIAL); a receita prevista é a `ReceitaPrevista` com o sinal de
 * `SINAL_PREVISAO` (a DEDUÇÃO subtrai). Nada é cadastrado para a LOA além do que a execução já usa.
 * Créditos adicionais e reprevisões NÃO entram: a LOA é a lei aprovada; o vigente é o QDD e a tela
 * de reprevisão.
 *
 * ⚠️ AS CLASSIFICAÇÕES VÊM DOS CÓDIGOS, nunca de coluna paralela: categoria econômica = 1º dígito
 * da natureza, grupo = 2º dígito da despesa, origem = 2º dígito da receita (rol fechado do M04),
 * tipo da ação (projeto, atividade, operação especial) = `Acao.tipo`, vínculo do recurso = a
 * natureza DECLARADA da fonte (M01, ato do ente com fundamento). Código fora do rol = recusa.
 *
 * ⚠️ O INSTRUMENTO: `conferirLoa`. Cada quadro diz com que total ele fecha (receita, despesa, ou
 * uma parte da despesa que, somada às partes irmãs, dá a despesa). Os totais de referência NÃO são
 * somados aqui: chegam do leitor pelos caminhos que a consistência da LOA já usa
 * (`previsaoPorNaturezaFonte`, `dotacaoFixadaDetalhada`). Divergiu, a LOA não sai.
 */

// ═══════════════════════════════════════════════════════════════════════════
// DTO — o que o leitor entrega
// ═══════════════════════════════════════════════════════════════════════════

export type TipoDaAcao = "PROJETO" | "ATIVIDADE" | "OPERACAO_ESPECIAL";
export type VinculoDoRecurso = "ORDINARIOS" | "VINCULADOS" | "EXTRAORCAMENTARIOS" | "COMPENSACAO_FINANCEIRA" | "OUTROS";

export interface CodigoNome {
  readonly codigo: string;
  readonly nome: string;
}

export interface FichaDaLoa {
  readonly numero: number;
  readonly orgao: CodigoNome;
  readonly unidade: CodigoNome;
  readonly funcao: CodigoNome;
  readonly subfuncao: CodigoNome;
  readonly programa: CodigoNome;
  readonly acao: CodigoNome & { readonly tipo: TipoDaAcao };
  readonly natureza: {
    readonly codCategoria: string;
    readonly codGrupo: string;
    readonly codigoCompleto: string;
    readonly descricao: string;
  };
  readonly fonteCodigo: string;
  readonly valorDotado: Money;
}

export interface ReceitaDaLoa {
  readonly naturezaCodigo: string;
  readonly naturezaDescricao: string;
  readonly fonteCodigo: string;
  readonly tipoReceita: TipoReceitaPrevista;
  /** Valor como cadastrado (sempre positivo); o sinal é o de `SINAL_PREVISAO`. */
  readonly valorPrevisto: Money;
}

export interface DadosDaLoa {
  readonly exercicio: number;
  readonly fichas: readonly FichaDaLoa[];
  readonly receitas: readonly ReceitaDaLoa[];
  /** Natureza VIGENTE declarada de cada fonte; fonte ausente = não declarada. */
  readonly vinculoDaFonte: ReadonlyMap<string, VinculoDoRecurso>;
  /**
   * Os totais de REFERÊNCIA, somados pelo leitor por outro caminho (os leitores da consistência
   * da LOA). É contra eles que cada anexo fecha.
   */
  readonly referencia: { readonly receitaPrevista: Money; readonly despesaFixada: Money };
}

// ═══════════════════════════════════════════════════════════════════════════
// SAÍDA — anexos como quadros
// ═══════════════════════════════════════════════════════════════════════════

/** `item` é a folha: só ela soma no fechamento. Os demais níveis são agregações das folhas. */
export type NivelDaLinha = "nivel1" | "nivel2" | "nivel3" | "nivel4" | "nivel5" | "item" | "total";

export interface LinhaDoQuadro {
  readonly codigo: string;
  readonly especificacao: string;
  readonly nivel: NivelDaLinha;
  /** Profundidade na árvore (0 = primeiro nível) — só apresentação: o recuo da especificação. */
  readonly profundidade: number;
  readonly valores: readonly Money[];
}

/** Com o que o quadro fecha. `PARTE_DA_DESPESA`: a soma dos quadros-parte do anexo é a despesa. */
export type FechamentoDoQuadro = "RECEITA" | "DESPESA" | "PARTE_DA_DESPESA" | "NENHUM";

export interface QuadroDoAnexo {
  readonly titulo: string;
  readonly colunas: readonly string[];
  readonly linhas: readonly LinhaDoQuadro[];
  readonly fecha: FechamentoDoQuadro;
}

export interface AnexoDaLoa {
  /** Numeração oficial da Lei 4.320/64. */
  readonly numero: string;
  readonly titulo: string;
  readonly fundamento: string;
  readonly quadros: readonly QuadroDoAnexo[];
  readonly notas: readonly string[];
}

export interface AnexoIndisponivel {
  readonly numero: string | null;
  readonly titulo: string;
  readonly fundamento: string;
  readonly motivo: string;
}

export type SituacaoDoEquilibrio = "EQUILIBRADA" | "RECEITA_MAIOR" | "DESPESA_MAIOR";

export interface LoaMontada {
  readonly exercicio: number;
  readonly resumo: {
    readonly receitaPrevista: Money;
    readonly despesaFixada: Money;
    /** receita − despesa */
    readonly diferenca: Money;
    readonly situacao: SituacaoDoEquilibrio;
    readonly fichas: number;
    readonly naturezasDeReceita: number;
  };
  readonly anexos: readonly AnexoDaLoa[];
  readonly indisponiveis: readonly AnexoIndisponivel[];
}

export class ConferenciaDaLoaError extends Error {
  constructor(readonly divergencias: readonly string[]) {
    super(
      `A Lei Orçamentária Anual não foi emitida porque os anexos não fecham com os totais da ` +
        `receita prevista e da despesa fixada: ${divergencias.join(" · ")}`
    );
    this.name = "ConferenciaDaLoaError";
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RÓTULOS OFICIAIS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * O nome de cada origem da receita (Portaria Interministerial STN/SOF 163/2001, 2º dígito). A
 * CHAVE é o rol fechado do M04 (`OrigemReceita`) — Record exaustivo: uma origem nova no rol sem
 * nome aqui não compila.
 */
const NOME_DA_ORIGEM: Readonly<Record<OrigemReceita, string>> = {
  IMPOSTOS_TAXAS_CONTRIBUICOES_DE_MELHORIA: "Impostos, Taxas e Contribuições de Melhoria",
  CONTRIBUICOES: "Contribuições",
  RECEITA_PATRIMONIAL: "Receita Patrimonial",
  RECEITA_AGROPECUARIA: "Receita Agropecuária",
  RECEITA_INDUSTRIAL: "Receita Industrial",
  RECEITA_DE_SERVICOS: "Receita de Serviços",
  TRANSFERENCIAS_CORRENTES: "Transferências Correntes",
  OUTRAS_RECEITAS_CORRENTES: "Outras Receitas Correntes",
  OPERACOES_DE_CREDITO: "Operações de Crédito",
  ALIENACAO_DE_BENS: "Alienação de Bens",
  AMORTIZACAO_DE_EMPRESTIMOS: "Amortização de Empréstimos",
  TRANSFERENCIAS_DE_CAPITAL: "Transferências de Capital",
  OUTRAS_RECEITAS_DE_CAPITAL: "Outras Receitas de Capital",
};

/** Categorias da despesa fora das duas econômicas: as reservas (Portaria STN/SOF 163/2001, art. 8º). */
const CATEGORIAS_DE_RESERVA: Readonly<Record<string, string>> = {
  "7": "Reserva do RPPS",
  "9": "Reserva de Contingência",
};

function nomeDaCategoriaDaDespesa(cod: string): string {
  const c = CATEGORIAS_ECONOMICAS.find((x) => x.codigo === cod)?.descricao ?? CATEGORIAS_DE_RESERVA[cod];
  if (c === undefined) {
    throw new Error(`Natureza de despesa com categoria econômica "${cod}", fora do rol oficial. A LOA não foi emitida.`);
  }
  return c;
}

function nomeDoGrupoDaDespesa(cod: string): string {
  const g = GRUPOS_NATUREZA_DESPESA.find((x) => x.codigo === cod)?.descricao;
  if (g === undefined) {
    throw new Error(`Natureza de despesa com grupo "${cod}", fora do rol oficial. A LOA não foi emitida.`);
  }
  return g;
}

function origemDaNaturezaReceita(codigo: string): { chave: string; nome: string } {
  const cat = categoriaDaReceita(codigo);
  const base = cat === "7" ? "1" : cat === "8" ? "2" : cat;
  const chave = `${base}${codigo.charAt(1)}`;
  const origem = ORIGEM_RECEITA[chave as ChaveOrigem] as OrigemReceita | undefined;
  if (origem === undefined) {
    throw new Error(`Natureza de receita ${codigo}: origem "${codigo.charAt(1)}" fora do rol oficial da categoria. A LOA não foi emitida.`);
  }
  return { chave: `${codigo.charAt(0)}.${codigo.charAt(1)}`, nome: NOME_DA_ORIGEM[origem] };
}

/** 11180111 → 1.1.1.8.01.1.1 */
export function codigoDaReceitaFormatado(c: string): string {
  if (!/^\d{8}$/.test(c)) return c;
  return `${c[0]}.${c[1]}.${c[2]}.${c[3]}.${c.slice(4, 6)}.${c[6]}.${c[7]}`;
}

/** 339039 → 3.3.90.39 */
export function codigoDaDespesaFormatado(c: string): string {
  if (!/^\d{6}$/.test(c)) return c;
  return `${c[0]}.${c[1]}.${c.slice(2, 4)}.${c.slice(4, 6)}`;
}

const TITULO_DA_CATEGORIA_DA_RECEITA = (cat: string): string => {
  const t = CATEGORIAS_RECEITA[cat as keyof typeof CATEGORIAS_RECEITA];
  // categoriaDaReceita já recusou o que não é 1, 2, 7 ou 8.
  return t.charAt(0) + t.slice(1).toLowerCase().replace("intraorçamentárias", "Intraorçamentárias");
};

// ═══════════════════════════════════════════════════════════════════════════
// A ÁRVORE — uma função monta toda hierarquia; os agregados SAEM DAS FOLHAS
// ═══════════════════════════════════════════════════════════════════════════

interface Degrau {
  readonly codigo: string;
  readonly nome: string;
  /** Ordem de apresentação; por omissão, o código. */
  readonly ordem?: string;
}

interface Folha {
  readonly caminho: readonly Degrau[];
  readonly valores: readonly Money[];
}

const NIVEIS: readonly NivelDaLinha[] = ["nivel1", "nivel2", "nivel3", "nivel4", "nivel5"];
const zeros = (n: number): Money[] => Array.from({ length: n }, () => toMoney("0.00"));
const somar = (a: readonly Money[], b: readonly Money[]): Money[] => a.map((x, i) => toMoney(x.plus(b[i] ?? toMoney("0.00"))));

interface No {
  readonly degrau: Degrau;
  valores: Money[];
  readonly filhos: Map<string, No>;
}

/**
 * Monta as linhas depth-first: cada agregado ANTES dos seus filhos, com o valor somado das folhas
 * que estão sob ele; o último degrau do caminho é a linha `item`. Uma linha `total` fecha o quadro.
 */
function arvore(folhas: readonly Folha[], nColunas: number, rotuloTotal: string): LinhaDoQuadro[] {
  const raiz = new Map<string, No>();
  for (const f of folhas) {
    let nivel = raiz;
    for (const d of f.caminho) {
      const chave = d.codigo;
      let no = nivel.get(chave);
      if (no === undefined) {
        no = { degrau: d, valores: zeros(nColunas), filhos: new Map() };
        nivel.set(chave, no);
      }
      no.valores = somar(no.valores, f.valores);
      nivel = no.filhos;
    }
  }
  const linhas: LinhaDoQuadro[] = [];
  const ordenar = (m: Map<string, No>): No[] =>
    [...m.values()].sort((a, b) => (a.degrau.ordem ?? a.degrau.codigo).localeCompare(b.degrau.ordem ?? b.degrau.codigo, "pt-BR"));
  const visitar = (m: Map<string, No>, profundidade: number): void => {
    for (const no of ordenar(m)) {
      const folha = no.filhos.size === 0;
      linhas.push({
        codigo: no.degrau.codigo,
        especificacao: no.degrau.nome,
        nivel: folha ? "item" : (NIVEIS[profundidade] ?? "nivel5"),
        profundidade,
        valores: no.valores,
      });
      visitar(no.filhos, profundidade + 1);
    }
  };
  visitar(raiz, 0);
  let total = zeros(nColunas);
  for (const no of raiz.values()) total = somar(total, no.valores);
  linhas.push({ codigo: "", especificacao: rotuloTotal, nivel: "total", profundidade: 0, valores: total });
  return linhas;
}

// ═══════════════════════════════════════════════════════════════════════════
// DEGRAUS COMUNS
// ═══════════════════════════════════════════════════════════════════════════

const degrauFuncao = (f: FichaDaLoa): Degrau => ({ codigo: f.funcao.codigo, nome: f.funcao.nome });
const degrauSubfuncao = (f: FichaDaLoa): Degrau => ({ codigo: `${f.funcao.codigo}.${f.subfuncao.codigo}`, nome: f.subfuncao.nome });
const degrauPrograma = (f: FichaDaLoa): Degrau => ({
  codigo: `${f.funcao.codigo}.${f.subfuncao.codigo}.${f.programa.codigo}`,
  nome: f.programa.nome,
});
const degrauAcao = (f: FichaDaLoa): Degrau => ({
  codigo: `${f.funcao.codigo}.${f.subfuncao.codigo}.${f.programa.codigo}.${f.acao.codigo}`,
  nome: f.acao.nome,
});
const degrauCategoriaDespesa = (f: FichaDaLoa): Degrau => ({
  codigo: f.natureza.codCategoria,
  nome: nomeDaCategoriaDaDespesa(f.natureza.codCategoria),
});
const ehReserva = (f: FichaDaLoa): boolean => CATEGORIAS_DE_RESERVA[f.natureza.codCategoria] !== undefined;
const degrauGrupoDespesa = (f: FichaDaLoa): Degrau => ({
  codigo: `${f.natureza.codCategoria}.${f.natureza.codGrupo}`,
  nome: nomeDoGrupoDaDespesa(f.natureza.codGrupo),
});

/** Projetos · Atividades · Operações especiais · Total — Anexos 6 e 7. */
const COLUNAS_POR_TIPO_DE_ACAO = ["Projetos", "Atividades", "Operações especiais", "Total"] as const;
function valoresPorTipoDeAcao(f: FichaDaLoa): Money[] {
  const z = toMoney("0.00");
  const v = f.valorDotado;
  return [
    f.acao.tipo === "PROJETO" ? v : z,
    f.acao.tipo === "ATIVIDADE" ? v : z,
    f.acao.tipo === "OPERACAO_ESPECIAL" ? v : z,
    v,
  ];
}

const porCodigo = <T extends { readonly codigo: string }>(a: T, b: T): number => a.codigo.localeCompare(b.codigo, "pt-BR");

function unidadesDasFichas(fichas: readonly FichaDaLoa[]): { orgao: CodigoNome; unidade: CodigoNome; fichas: FichaDaLoa[] }[] {
  const m = new Map<string, { orgao: CodigoNome; unidade: CodigoNome; fichas: FichaDaLoa[] }>();
  for (const f of fichas) {
    const k = f.unidade.codigo;
    const u = m.get(k) ?? { orgao: f.orgao, unidade: f.unidade, fichas: [] };
    u.fichas.push(f);
    m.set(k, u);
  }
  return [...m.values()].sort((a, b) => porCodigo(a.unidade, b.unidade));
}

const tituloDaUnidade = (u: { orgao: CodigoNome; unidade: CodigoNome }): string =>
  `Órgão ${u.orgao.codigo} — ${u.orgao.nome} · Unidade orçamentária ${u.unidade.codigo} — ${u.unidade.nome}`;

// ═══════════════════════════════════════════════════════════════════════════
// OS ANEXOS
// ═══════════════════════════════════════════════════════════════════════════

const valorComSinal = (r: ReceitaDaLoa): Money =>
  SINAL_PREVISAO[r.tipoReceita] === 1 ? r.valorPrevisto : toMoney(r.valorPrevisto.negated());

const DEDUCOES: Degrau = { codigo: "D", nome: "(−) Deduções da receita", ordem: "Z" };

/** A receita como folhas: categoria › origem (› natureza, se `detalhar`). Deduções num ramo próprio. */
function folhasDaReceita(receitas: readonly ReceitaDaLoa[], detalhar: boolean): Folha[] {
  return receitas.map((r) => {
    const cat = categoriaDaReceita(r.naturezaCodigo);
    const origem = origemDaNaturezaReceita(r.naturezaCodigo);
    const degrauCat: Degrau = { codigo: cat, nome: TITULO_DA_CATEGORIA_DA_RECEITA(cat) };
    const degrauOrigem: Degrau = { codigo: origem.chave, nome: origem.nome };
    const natureza: Degrau = {
      codigo: codigoDaReceitaFormatado(r.naturezaCodigo),
      nome: r.tipoReceita === "DEDUCAO" ? `${r.naturezaDescricao} (dedução)` : r.naturezaDescricao,
    };
    const base = r.tipoReceita === "DEDUCAO" ? [DEDUCOES, degrauOrigem] : [degrauCat, degrauOrigem];
    return { caminho: detalhar ? [...base, natureza] : base, valores: [valorComSinal(r)] };
  });
}

function anexo1(d: DadosDaLoa): AnexoDaLoa {
  const despesa = d.fichas.map<Folha>((f) => ({
    caminho: ehReserva(f) ? [degrauCategoriaDespesa(f)] : [degrauCategoriaDespesa(f), degrauGrupoDespesa(f)],
    valores: [f.valorDotado],
  }));
  // O resultado do orçamento corrente (Lei 4.320, art. 11, § 3º): receitas correntes (1 e 7,
  // líquidas das deduções dessas categorias) − despesas correntes (categoria 3).
  const receitaCorrente = d.receitas
    .filter((r) => ["1", "7"].includes(categoriaDaReceita(r.naturezaCodigo)))
    .reduce((a, r) => toMoney(a.plus(valorComSinal(r))), toMoney("0.00"));
  const despesaCorrente = d.fichas
    .filter((f) => f.natureza.codCategoria === "3")
    .reduce((a, f) => toMoney(a.plus(f.valorDotado)), toMoney("0.00"));
  const resultado = toMoney(receitaCorrente.minus(despesaCorrente));
  return {
    numero: "1",
    titulo: "Demonstração da Receita e Despesa segundo as Categorias Econômicas",
    fundamento: "Lei nº 4.320/1964, art. 2º, § 1º, II, e art. 11",
    quadros: [
      { titulo: "Receita", colunas: ["Valor"], linhas: arvore(folhasDaReceita(d.receitas, false), 1, "Total da receita"), fecha: "RECEITA" },
      { titulo: "Despesa", colunas: ["Valor"], linhas: arvore(despesa, 1, "Total da despesa"), fecha: "DESPESA" },
      {
        titulo: "Resultado do orçamento corrente",
        colunas: ["Valor"],
        fecha: "NENHUM",
        linhas: [
          { codigo: "", especificacao: "Receitas correntes, líquidas das deduções", nivel: "item", profundidade: 0, valores: [receitaCorrente] },
          { codigo: "", especificacao: "(−) Despesas correntes", nivel: "item", profundidade: 0, valores: [despesaCorrente] },
          {
            codigo: "",
            especificacao: resultado.isNegative() ? "Déficit do orçamento corrente" : "Superávit do orçamento corrente",
            nivel: "total",
            profundidade: 0,
            valores: [resultado],
          },
        ],
      },
    ],
    notas: [
      "Receita pela previsão inicial e despesa pela dotação inicial da lei aprovada; créditos adicionais e reprevisões posteriores não integram este demonstrativo.",
      "O superávit do orçamento corrente é receita de capital, mas não constitui item orçamentário (Lei 4.320/1964, art. 11, § 3º).",
    ],
  };
}

function quadroNaturezaDaDespesa(titulo: string, fichas: readonly FichaDaLoa[], fecha: FechamentoDoQuadro): QuadroDoAnexo {
  const folhas = fichas.map<Folha>((f) => {
    const natureza: Degrau = { codigo: codigoDaDespesaFormatado(f.natureza.codigoCompleto), nome: f.natureza.descricao };
    return {
      caminho: ehReserva(f) ? [degrauCategoriaDespesa(f), natureza] : [degrauCategoriaDespesa(f), degrauGrupoDespesa(f), natureza],
      valores: [f.valorDotado],
    };
  });
  return { titulo, colunas: ["Valor"], linhas: arvore(folhas, 1, "Total"), fecha };
}

function anexo2(d: DadosDaLoa): AnexoDaLoa {
  return {
    numero: "2",
    titulo: "Receita segundo as Categorias Econômicas e Natureza da Despesa segundo as Categorias Econômicas",
    fundamento: "Lei nº 4.320/1964, art. 2º, § 1º, II, e arts. 11 a 13",
    quadros: [
      { titulo: "Receita segundo as categorias econômicas", colunas: ["Valor"], linhas: arvore(folhasDaReceita(d.receitas, true), 1, "Total da receita"), fecha: "RECEITA" },
      quadroNaturezaDaDespesa("Natureza da despesa segundo as categorias econômicas — consolidação geral", d.fichas, "DESPESA"),
      ...unidadesDasFichas(d.fichas).map((u) => quadroNaturezaDaDespesa(tituloDaUnidade(u), u.fichas, "PARTE_DA_DESPESA")),
    ],
    notas: ["A despesa é apresentada na consolidação geral e, em seguida, por unidade orçamentária."],
  };
}

function quadroProgramaDeTrabalho(titulo: string, fichas: readonly FichaDaLoa[], fecha: FechamentoDoQuadro): QuadroDoAnexo {
  const folhas = fichas.map<Folha>((f) => ({
    caminho: [degrauFuncao(f), degrauSubfuncao(f), degrauPrograma(f), degrauAcao(f)],
    valores: valoresPorTipoDeAcao(f),
  }));
  return { titulo, colunas: COLUNAS_POR_TIPO_DE_ACAO, linhas: arvore(folhas, 4, "Total"), fecha };
}

function anexo6(d: DadosDaLoa): AnexoDaLoa {
  return {
    numero: "6",
    titulo: "Programa de Trabalho",
    fundamento: "Lei nº 4.320/1964, art. 2º, § 2º, II",
    quadros: unidadesDasFichas(d.fichas).map((u) => quadroProgramaDeTrabalho(tituloDaUnidade(u), u.fichas, "PARTE_DA_DESPESA")),
    notas: ["Um quadro por órgão e unidade orçamentária, na classificação funcional e programática (função, subfunção, programa e ação)."],
  };
}

function anexo7(d: DadosDaLoa): AnexoDaLoa {
  return {
    numero: "7",
    titulo: "Programa de Trabalho de Governo — Demonstrativo de Funções, Subfunções e Programas por Projetos, Atividades e Operações Especiais",
    fundamento: "Lei nº 4.320/1964, art. 2º, § 2º, II",
    quadros: [quadroProgramaDeTrabalho("Consolidação geral", d.fichas, "DESPESA")],
    notas: [],
  };
}

/** `null` quando o vínculo de alguma fonte não sustenta o anexo — o motivo vai para os indisponíveis. */
function anexo8(d: DadosDaLoa): AnexoDaLoa | AnexoIndisponivel {
  const titulo = "Demonstrativo da Despesa por Funções, Subfunções e Programas conforme o Vínculo com os Recursos";
  const fundamento = "Lei nº 4.320/1964, art. 2º, § 2º, II";
  const fontes = [...new Set(d.fichas.map((f) => f.fonteCodigo))].sort();
  const semDeclaracao = fontes.filter((c) => !d.vinculoDaFonte.has(c));
  const foraDoOrcamento = fontes.filter((c) => {
    const v = d.vinculoDaFonte.get(c);
    return v !== undefined && v !== "ORDINARIOS" && v !== "VINCULADOS";
  });
  if (semDeclaracao.length > 0 || foraDoOrcamento.length > 0) {
    const partes: string[] = [];
    if (semDeclaracao.length > 0) {
      partes.push(`a(s) fonte(s) ${semDeclaracao.join(", ")} ainda não têm a natureza declarada (recursos ordinários ou vinculados)`);
    }
    if (foraDoOrcamento.length > 0) {
      partes.push(`a(s) fonte(s) ${foraDoOrcamento.join(", ")} estão declaradas com natureza que não é de recurso ordinário nem vinculado`);
    }
    return {
      numero: "8",
      titulo,
      fundamento,
      motivo: `O vínculo de cada fonte de recurso é o que separa as colunas deste anexo, e ${partes.join("; ")}. Declare-as em Contabilidade › Natureza das fontes.`,
    };
  }
  const folhas = d.fichas.map<Folha>((f) => {
    const ordinario = d.vinculoDaFonte.get(f.fonteCodigo) === "ORDINARIOS";
    const z = toMoney("0.00");
    return {
      caminho: [degrauFuncao(f), degrauSubfuncao(f), degrauPrograma(f)],
      valores: [ordinario ? f.valorDotado : z, ordinario ? z : f.valorDotado, f.valorDotado],
    };
  });
  return {
    numero: "8",
    titulo,
    fundamento,
    quadros: [{ titulo: "Consolidação geral", colunas: ["Ordinários", "Vinculados", "Total"], linhas: arvore(folhas, 3, "Total"), fecha: "DESPESA" }],
    notas: ["O vínculo de cada fonte é o declarado pelo ente na natureza das fontes, na versão vigente."],
  };
}

function anexo9(d: DadosDaLoa): AnexoDaLoa {
  const folhas = d.fichas.map<Folha>((f) => ({
    caminho: [
      { codigo: f.orgao.codigo, nome: f.orgao.nome },
      { codigo: `${f.orgao.codigo}.${f.funcao.codigo}`, nome: f.funcao.nome },
    ],
    valores: [f.valorDotado],
  }));
  const porFuncao = d.fichas.map<Folha>((f) => ({ caminho: [degrauFuncao(f)], valores: [f.valorDotado] }));
  return {
    numero: "9",
    titulo: "Demonstrativo da Despesa por Órgãos e Funções",
    fundamento: "Lei nº 4.320/1964, art. 2º, § 2º, II",
    quadros: [
      { titulo: "Despesa por órgão e função", colunas: ["Valor"], linhas: arvore(folhas, 1, "Total"), fecha: "DESPESA" },
      { titulo: "Total por função", colunas: ["Valor"], linhas: arvore(porFuncao, 1, "Total"), fecha: "DESPESA" },
    ],
    notas: [],
  };
}

/** O que a LOA pede e os dados de hoje não sustentam — dito, com o motivo, em vez de inventado. */
const INDISPONIVEIS_FIXOS: readonly AnexoIndisponivel[] = [
  {
    numero: null,
    titulo: "Quadro demonstrativo da receita e planos de aplicação dos fundos especiais",
    fundamento: "Lei nº 4.320/1964, art. 2º, § 2º, I",
    motivo:
      "O cadastro das unidades orçamentárias não identifica quais são fundos especiais, e a receita prevista é registrada por natureza e fonte, sem unidade. Sem essas duas informações não há como separar a receita e a aplicação de cada fundo.",
  },
  {
    numero: null,
    titulo: "Demonstrativo da compatibilidade da programação com os objetivos e metas da LDO",
    fundamento: "Lei Complementar nº 101/2000, art. 5º, I",
    motivo: "As fichas orçamentárias ainda não são vinculadas às ações do PPA e às metas da LDO; a compatibilidade não pode ser demonstrada sem esse vínculo.",
  },
  {
    numero: null,
    titulo: "Demonstrativo regionalizado do efeito das isenções, anistias, remissões, subsídios e benefícios",
    fundamento: "Constituição Federal, art. 165, § 6º",
    motivo: "A classificação da despesa e a renúncia de receita não são registradas por região; o demonstrativo exige essa regionalização.",
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// O INSTRUMENTO
// ═══════════════════════════════════════════════════════════════════════════

const ultima = (l: LinhaDoQuadro): Money => l.valores[l.valores.length - 1] ?? toMoney("0.00");

/**
 * CONFERE a LOA montada contra os totais de referência. Devolve as divergências (vazio = fecha).
 *
 *   1. Em todo quadro, a linha `total` = Σ das linhas `item`, coluna a coluna (nenhuma folha
 *      perdida ou duplicada entre a montagem e a linha de total).
 *   2. Quadro que fecha com a RECEITA/DESPESA: a última coluna do total = a referência.
 *   3. Quadros-parte de um anexo: Σ das últimas colunas dos totais = a despesa de referência.
 *   4. Nos quadros com mais de uma coluna, a última é o total da linha: Σ das demais = última
 *      (projetos + atividades + operações especiais = total; ordinários + vinculados = total).
 */
export function conferirLoa(
  anexos: readonly AnexoDaLoa[],
  referencia: { readonly receitaPrevista: Money; readonly despesaFixada: Money }
): string[] {
  const div: string[] = [];
  for (const a of anexos) {
    let partes = toMoney("0.00");
    let temPartes = false;
    for (const q of a.quadros) {
      const onde = `Anexo ${a.numero} (${q.titulo})`;
      const total = q.linhas.find((l) => l.nivel === "total");
      if (total === undefined) {
        div.push(`${onde}: sem linha de total`);
        continue;
      }
      if (q.fecha !== "NENHUM") {
        const itens = q.linhas.filter((l) => l.nivel === "item");
        for (let i = 0; i < q.colunas.length; i++) {
          const s = itens.reduce((acc, l) => toMoney(acc.plus(l.valores[i] ?? toMoney("0.00"))), toMoney("0.00"));
          const t = total.valores[i] ?? toMoney("0.00");
          if (!s.equals(t)) div.push(`${onde}: coluna "${q.colunas[i]}" soma ${s.toFixed(2)} nas linhas e ${t.toFixed(2)} no total`);
        }
        if (q.colunas.length > 1) {
          for (const l of q.linhas) {
            const parciais = l.valores.slice(0, -1).reduce((acc, v) => toMoney(acc.plus(v)), toMoney("0.00"));
            if (!parciais.equals(ultima(l))) div.push(`${onde}, linha ${l.codigo || l.especificacao}: as colunas somam ${parciais.toFixed(2)} e o total da linha é ${ultima(l).toFixed(2)}`);
          }
        }
      }
      if (q.fecha === "RECEITA" && !ultima(total).equals(referencia.receitaPrevista)) {
        div.push(`${onde}: total ${ultima(total).toFixed(2)} difere da receita prevista ${referencia.receitaPrevista.toFixed(2)}`);
      }
      if (q.fecha === "DESPESA" && !ultima(total).equals(referencia.despesaFixada)) {
        div.push(`${onde}: total ${ultima(total).toFixed(2)} difere da despesa fixada ${referencia.despesaFixada.toFixed(2)}`);
      }
      if (q.fecha === "PARTE_DA_DESPESA") {
        temPartes = true;
        partes = toMoney(partes.plus(ultima(total)));
      }
    }
    if (temPartes && !partes.equals(referencia.despesaFixada)) {
      div.push(`Anexo ${a.numero}: a soma das unidades orçamentárias é ${partes.toFixed(2)} e a despesa fixada é ${referencia.despesaFixada.toFixed(2)}`);
    }
  }
  return div;
}

// ═══════════════════════════════════════════════════════════════════════════
// A MONTAGEM
// ═══════════════════════════════════════════════════════════════════════════

export function montarLoa(d: DadosDaLoa): LoaMontada {
  const receitaPrevista = d.referencia.receitaPrevista;
  const despesaFixada = d.referencia.despesaFixada;
  const diferenca = toMoney(receitaPrevista.minus(despesaFixada));

  const a8 = anexo8(d);
  const anexos: AnexoDaLoa[] = [anexo1(d), anexo2(d), anexo6(d), anexo7(d)];
  const indisponiveis: AnexoIndisponivel[] = [];
  if ("quadros" in a8) anexos.push(a8);
  else indisponiveis.push(a8);
  anexos.push(anexo9(d));
  indisponiveis.push(...INDISPONIVEIS_FIXOS);

  const divergencias = conferirLoa(anexos, d.referencia);
  if (divergencias.length > 0) throw new ConferenciaDaLoaError(divergencias);

  return {
    exercicio: d.exercicio,
    resumo: {
      receitaPrevista,
      despesaFixada,
      diferenca,
      situacao: diferenca.isZero() ? "EQUILIBRADA" : diferenca.isPositive() ? "RECEITA_MAIOR" : "DESPESA_MAIOR",
      fichas: d.fichas.length,
      naturezasDeReceita: new Set(d.receitas.map((r) => r.naturezaCodigo)).size,
    },
    anexos,
    indisponiveis,
  };
}
