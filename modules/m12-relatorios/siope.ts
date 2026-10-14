import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import { anexo8, medirDespesa, type DespesaFundeb } from "./rreo-anexo8.js";
import { janelaDoBimestre, type Bimestre } from "./rreo-anexo1.js";

/**
 * V39-R3 (R3-023, V39-086) — A PREPARAÇÃO DO SIOPE MUNICIPAL: correspondência versionada e prévia.
 *
 * ═══ O QUE O MATERIAL OFICIAL DÁ ═══
 * O manual do SIOPE guardado (docs/oficial/fnde-siope/Manual_SIOPE_2026.txt, texto do manual embarcado no instalador
 * oficial 26.0.3.6) diz, na UNIDADE DO SIOPE MUNICIPAL (a partir da linha 4069), como cada subfunção entra no cálculo
 * da manutenção e desenvolvimento do ensino: a lista das típicas "no âmbito municipal" (linha 4521), o Quadro 18
 * (apoio administrativo), o Quadro 19 (demais consideradas) e o Quadro 20 (não consideradas). Os Quadros 13 a 16 do
 * mesmo manual são da unidade ESTADUAL e divergem (362 a 364 típicas; 061, 181, 422; apoio condicionado) — não valem
 * para o município.
 *
 * A transcrição fica aqui (`TRANSCRICAO_DO_MANUAL`), com a seção e a linha de cada código; `conferirTranscricao` a
 * confere CONTRA o texto: cada código transcrito começa a linha dita dentro da seção; TODO código que começa linha na
 * seção está transcrito (completude); o tratamento é provado pela frase da própria seção; cada palavra do nome aparece
 * na seção (os Quadros 19 e 20 vêm em colunas embaralhadas no texto, então o nome se confere na seção, não na linha).
 *
 * ⚠️ A OBSERVAÇÃO "despesas realizadas com recursos próprios" do Quadro 19 cai, no texto em colunas, ao lado do
 * código 846; pela ordem dos conceitos ela segue o transporte escolar (782), e o Quadro 15 do mesmo manual nomeia a
 * 782 "Transporte Escolar (financiado com recursos próprios)". É da 782 que ela é aqui — decisão de leitura, dita.
 *
 * ═══ A PRÉVIA NÃO CALCULA O MDE ═══
 * Os indicadores são os do RREO Anexo 8 (`anexo8`), lidos como estão. A despesa da função Educação por subfunção é
 * medida por `medirDespesa` (o medidor do Anexo 8: liquidada nos bimestres 1 a 5, empenhada no 6º), inteira e na parte
 * custeada por fontes de classe IMPOSTOS_MDE (a classe da fonte que o Anexo 8 usa). O total por tratamento soma só essa
 * parte e é uma conferência para o preenchimento, não a apuração do mínimo — o manual exclui do MDE a despesa com
 * recursos vinculados (FUNDEB, salário-educação, programas, convênios), e a apuração é a do Anexo 8.
 *
 * ═══ O QUE FALTA E O QUE ISSO BLOQUEIA ═══
 * O arquivo de importação das planilhas (CSV) pede o código de identificação da planilha (Tabela 2, citada na linha
 * 2642 do manual e não trazida), o código da conta de cada linha e a ordem das colunas de cada planilha — que o manual
 * também não traz. E a 365 vai ao SIOPE em duas planilhas (creche e pré-escola), que a classificação orçamentária não
 * separa. Só esses resultados ficam bloqueados, nomeados; a correspondência e a prévia não dependem deles.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
export type GrupoNoSiope = "TIPICA_DA_EDUCACAO" | "APOIO_ADMINISTRATIVO" | "OUTRA_CONSIDERADA" | "OUTRA_NAO_CONSIDERADA";
export type TratamentoNoSiope = "CONSIDERADA" | "CONSIDERADA_SE_DO_ENSINO_FUNDAMENTAL" | "CONSIDERADA_SE_RECURSOS_PROPRIOS" | "NAO_CONSIDERADA";
export type SecaoDoManual = "TIPICAS_MUNICIPAIS" | "QUADRO_18" | "QUADRO_19" | "QUADRO_20";

/** Onde cada seção começa e termina no texto, e a frase que prova o tratamento dela. */
interface Secao {
  readonly titulo: string;
  readonly inicio: RegExp;
  readonly fim: RegExp;
  readonly grupo: GrupoNoSiope;
  /** A frase da seção que diz se entra no cálculo (conferida no texto). */
  readonly prova: string;
}
export const SECOES: Readonly<Record<SecaoDoManual, Secao>> = {
  TIPICAS_MUNICIPAIS: { titulo: "subfunções típicas da educação no âmbito municipal", inicio: /a\) As subfunções típicas da educação, no âmbito municipal/, fim: /\*As despesas referentes às subfunções típicas da educação são consideradas/, grupo: "TIPICA_DA_EDUCACAO", prova: "As despesas referentes às subfunções típicas da educação são consideradas no cálculo do MDE" },
  QUADRO_18: { titulo: "Quadro 18 (apoio administrativo)", inicio: /Quadro 18: Lista das Subfunções de Apoio/, fim: /serem atividades realizadas pelas Secretarias de Educação/, grupo: "APOIO_ADMINISTRATIVO", prova: "As despesas referentes às subfunções de Apoio Administrativo são consideradas no cálculo do MDE, por serem atividades realizadas pelas Secretarias de Educação" },
  QUADRO_19: { titulo: "Quadro 19 (demais consideradas)", inicio: /Quadro 19 - Demais subfunções consideradas no cálculo do MDE/, fim: /Quadro 20: Subfunções da educação/, grupo: "OUTRA_CONSIDERADA", prova: "Quadro 19 - Demais subfunções consideradas no cálculo do MDE" },
  QUADRO_20: { titulo: "Quadro 20 (não consideradas)", inicio: /Quadro 20: Subfunções da educação cujas despesas não são consideradas/, fim: /^\s+Lazer\s*$/, grupo: "OUTRA_NAO_CONSIDERADA", prova: "Quadro 20: Subfunções da educação cujas despesas não são consideradas no cálculo de MDE" },
};
/** As condições de tratamento, também conferidas no texto da seção. */
const PROVA_DA_CONDICAO: Readonly<Partial<Record<TratamentoNoSiope, string>>> = {
  CONSIDERADA_SE_DO_ENSINO_FUNDAMENTAL: "OBS: só se os alunos estiverem matriculados no Ensino Fundamental",
  CONSIDERADA_SE_RECURSOS_PROPRIOS: "OBS: despesas realizadas com recursos próprios",
};

export interface SubfuncaoTranscrita {
  readonly codigo: string;
  readonly nome: string;
  readonly secao: SecaoDoManual;
  readonly tratamento: TratamentoNoSiope;
  /** A linha do texto guardado onde o código começa. */
  readonly linha: number;
}

/** Transcrição da unidade do SIOPE Municipal do manual guardado (Manual_SIOPE_2026.txt), com a linha de cada código. */
export const TRANSCRICAO_DO_MANUAL: readonly SubfuncaoTranscrita[] = [
  { codigo: "361", nome: "Ensino Fundamental", secao: "TIPICAS_MUNICIPAIS", tratamento: "CONSIDERADA", linha: 4523 },
  { codigo: "365", nome: "Educação Infantil", secao: "TIPICAS_MUNICIPAIS", tratamento: "CONSIDERADA", linha: 4524 },
  { codigo: "366", nome: "Educação de Jovens e Adultos", secao: "TIPICAS_MUNICIPAIS", tratamento: "CONSIDERADA_SE_DO_ENSINO_FUNDAMENTAL", linha: 4525 },
  { codigo: "367", nome: "Educação Especial", secao: "TIPICAS_MUNICIPAIS", tratamento: "CONSIDERADA_SE_DO_ENSINO_FUNDAMENTAL", linha: 4526 },
  { codigo: "121", nome: "Planejamento e Orçamento", secao: "QUADRO_18", tratamento: "CONSIDERADA", linha: 4607 },
  { codigo: "122", nome: "Administração Geral", secao: "QUADRO_18", tratamento: "CONSIDERADA", linha: 4613 },
  { codigo: "123", nome: "Administração Financeira", secao: "QUADRO_18", tratamento: "CONSIDERADA", linha: 4619 },
  { codigo: "125", nome: "Normatização e Fiscalização", secao: "QUADRO_18", tratamento: "CONSIDERADA", linha: 4623 },
  { codigo: "126", nome: "Tecnologia da Informação", secao: "QUADRO_18", tratamento: "CONSIDERADA", linha: 4627 },
  { codigo: "128", nome: "Formação de Recursos Humanos", secao: "QUADRO_18", tratamento: "CONSIDERADA", linha: 4631 },
  { codigo: "131", nome: "Comunicação Social", secao: "QUADRO_18", tratamento: "CONSIDERADA", linha: 4639 },
  { codigo: "331", nome: "Proteção e Benefícios ao Trabalhador", secao: "QUADRO_19", tratamento: "CONSIDERADA", linha: 4660 },
  { codigo: "722", nome: "Telecomunicações (Educação a Distância)", secao: "QUADRO_19", tratamento: "CONSIDERADA", linha: 4662 },
  { codigo: "782", nome: "Transporte Escolar", secao: "QUADRO_19", tratamento: "CONSIDERADA_SE_RECURSOS_PROPRIOS", linha: 4663 },
  { codigo: "841", nome: "Refinanciamento da Dívida Interna", secao: "QUADRO_19", tratamento: "CONSIDERADA", linha: 4664 },
  { codigo: "842", nome: "Refinanciamento da Dívida Externa", secao: "QUADRO_19", tratamento: "CONSIDERADA", linha: 4665 },
  { codigo: "843", nome: "Serviço da Dívida Interna", secao: "QUADRO_19", tratamento: "CONSIDERADA", linha: 4666 },
  { codigo: "844", nome: "Serviço da Dívida Externa", secao: "QUADRO_19", tratamento: "CONSIDERADA", linha: 4668 },
  { codigo: "846", nome: "Outros Encargos Especiais", secao: "QUADRO_19", tratamento: "CONSIDERADA", linha: 4670 },
  { codigo: "242", nome: "Assistência ao Portador de Deficiência", secao: "QUADRO_20", tratamento: "NAO_CONSIDERADA", linha: 4690 },
  { codigo: "243", nome: "Assistência à Criança e ao Adolescente", secao: "QUADRO_20", tratamento: "NAO_CONSIDERADA", linha: 4691 },
  { codigo: "271", nome: "Previdência Básica", secao: "QUADRO_20", tratamento: "NAO_CONSIDERADA", linha: 4692 },
  { codigo: "272", nome: "Previdência do Regime Estatutário", secao: "QUADRO_20", tratamento: "NAO_CONSIDERADA", linha: 4693 },
  { codigo: "273", nome: "Previdência Complementar", secao: "QUADRO_20", tratamento: "NAO_CONSIDERADA", linha: 4695 },
  { codigo: "274", nome: "Previdência Especial", secao: "QUADRO_20", tratamento: "NAO_CONSIDERADA", linha: 4696 },
  { codigo: "306", nome: "Alimentação e Nutrição – Merenda Escolar", secao: "QUADRO_20", tratamento: "NAO_CONSIDERADA", linha: 4697 },
  { codigo: "392", nome: "Difusão Cultural", secao: "QUADRO_20", tratamento: "NAO_CONSIDERADA", linha: 4698 },
  { codigo: "695", nome: "Turismo", secao: "QUADRO_20", tratamento: "NAO_CONSIDERADA", linha: 4699 },
  { codigo: "812", nome: "Desporto Comunitário", secao: "QUADRO_20", tratamento: "NAO_CONSIDERADA", linha: 4700 },
  { codigo: "813", nome: "Lazer", secao: "QUADRO_20", tratamento: "NAO_CONSIDERADA", linha: 4701 },
];

const espacos = (s: string): string => s.replace(/\s+/g, " ").trim();

/** A faixa [início, fim] (linhas, base 1) de uma seção no texto; 0 quando não se acha. */
function faixaDaSecao(linhas: readonly string[], s: Secao): { readonly de: number; readonly ate: number } {
  const de = linhas.findIndex((l) => s.inicio.test(l)) + 1;
  if (de === 0) return { de: 0, ate: 0 };
  const ate = linhas.findIndex((l, k) => k >= de && s.fim.test(l)) + 1;
  return { de, ate };
}

/**
 * Confere a transcrição CONTRA o texto (não contra si mesma). Devolve os erros; vazio é conferido. Pura.
 */
export function conferirTranscricao(texto: string, transcricao: readonly SubfuncaoTranscrita[] = TRANSCRICAO_DO_MANUAL): readonly string[] {
  const linhas = texto.split(/\r?\n/);
  const erros: string[] = [];
  for (const [chave, s] of Object.entries(SECOES) as [SecaoDoManual, Secao][]) {
    const { de, ate } = faixaDaSecao(linhas, s);
    if (de === 0 || ate === 0) {
      erros.push(`A seção "${s.titulo}" não foi achada no texto.`);
      continue;
    }
    const corpo = espacos(linhas.slice(de - 1, ate).join(" "));
    if (!corpo.includes(espacos(s.prova))) erros.push(`A seção "${s.titulo}" não traz a frase do tratamento: "${s.prova}".`);
    const daSecao = transcricao.filter((t) => t.secao === chave);
    // completude: todo código que começa linha dentro da seção está transcrito nela
    const noTexto = new Set<string>();
    for (let k = de; k <= ate; k += 1) {
      const m = /^\s*(\d{3})(?=[\s-]|$)/.exec(linhas[k - 1] ?? "");
      if (m?.[1] !== undefined) noTexto.add(m[1]);
    }
    const transcritos = new Set(daSecao.map((t) => t.codigo));
    const faltam = [...noTexto].filter((c) => !transcritos.has(c)).sort();
    if (faltam.length > 0) erros.push(`A seção "${s.titulo}" tem no texto ${faltam.join(", ")}, que a transcrição não traz.`);
    for (const t of daSecao) {
      const l = linhas[t.linha - 1] ?? "";
      if (!new RegExp(`^\\s*${t.codigo}(?=[\\s-]|$)`).test(l)) erros.push(`${t.codigo}: a linha ${String(t.linha)} não começa com o código.`);
      if (!(t.linha >= de && t.linha <= ate)) erros.push(`${t.codigo}: a linha ${String(t.linha)} não está na seção "${s.titulo}" (linhas ${String(de)} a ${String(ate)}).`);
      const ausentes = t.nome.replace(/[()]/g, "").split(/\s+/).filter((p) => p.length > 1 && !corpo.includes(p));
      if (ausentes.length > 0) erros.push(`${t.codigo}: "${ausentes.join(" ")}" não aparece na seção "${s.titulo}".`);
      const condicao = PROVA_DA_CONDICAO[t.tratamento];
      if (condicao !== undefined && !corpo.includes(espacos(condicao))) erros.push(`${t.codigo}: a condição "${condicao}" não está na seção.`);
      if (t.tratamento === "NAO_CONSIDERADA" && s.grupo !== "OUTRA_NAO_CONSIDERADA") erros.push(`${t.codigo}: "não considerada" numa seção de consideradas.`);
      if (t.tratamento !== "NAO_CONSIDERADA" && s.grupo === "OUTRA_NAO_CONSIDERADA") erros.push(`${t.codigo}: considerada numa seção de não consideradas.`);
    }
  }
  const codigos = transcricao.map((t) => t.codigo);
  const repetidos = codigos.filter((c, k) => codigos.indexOf(c) !== k);
  if (repetidos.length > 0) erros.push(`Código transcrito duas vezes: ${repetidos.join(", ")}.`);
  return erros;
}

export const grupoDaSecao = (s: SecaoDoManual): GrupoNoSiope => SECOES[s].grupo;

// ═══ A PRÉVIA ═══

export interface LinhaDaPrevia {
  readonly subfuncao: string;
  readonly nome: string;
  readonly grupo: GrupoNoSiope | null;
  readonly tratamento: TratamentoNoSiope | null;
  /** Toda a despesa da subfunção na função 12. */
  readonly despesa: DespesaFundeb;
  /** A parte custeada por fontes de classe IMPOSTOS_MDE (a classe do Anexo 8). */
  readonly deImpostos: DespesaFundeb;
}

export type ChaveDoTotal = TratamentoNoSiope | "SEM_CORRESPONDENCIA";

export interface PreviaDoSiope {
  readonly exercicio: number;
  readonly bimestre: Bimestre;
  readonly correspondencia: { readonly versao: number; readonly fonte: string };
  readonly base: "liquidada" | "empenhada";
  readonly linhas: readonly LinhaDaPrevia[];
  /** Σ da parte de impostos, pelo tratamento. Conferência para o preenchimento, NÃO a apuração do MDE. */
  readonly totaisDeImpostos: Readonly<Record<ChaveDoTotal, Money>>;
  readonly indicadores: {
    readonly receitaDeImpostosRealizada: string;
    readonly minimoAlemDoFundeb: string;
    readonly recebidoDoFundeb: string;
    readonly indicadorProfissionais: string;
    readonly limiteProfissionais: string;
    readonly atingiuProfissionais: boolean;
  };
  readonly bloqueios: readonly { readonly resultado: string; readonly motivo: string }[];
}

export const BLOQUEIOS_DO_SIOPE = [
  {
    resultado: "Arquivo de importação das planilhas (CSV)",
    motivo:
      "Cada linha do arquivo pede o código de identificação da planilha, da \"Tabela 2 - Código de Identificação das Planilhas de " +
      "Administração Consolidada\" (citada na linha 2642 do manual guardado e não trazida por ele, nem achada em página oficial), " +
      "o código da conta a que a linha corresponde e os valores na ordem das colunas de cada planilha — que o manual também não traz. " +
      "Sem os três, o arquivo não é gerado. Preencha as planilhas no programa do SIOPE a partir desta prévia.",
  },
  {
    resultado: "Educação infantil separada em creche e pré-escola",
    motivo:
      "No SIOPE a subfunção 365 vai em duas planilhas, creche e pré-escola; a classificação orçamentária tem a 365 inteira, e esta " +
      "prévia não tem como separá-la. A 365 aparece inteira.",
  },
] as const;

/** A prévia do exercício e bimestre. Sem correspondência carregada para o exercício, recusa (fail-closed). Leitura. */
export async function previaDoSiope(tx: Tx, p: { readonly exercicio: number; readonly bimestre: Bimestre }): Promise<PreviaDoSiope> {
  const c = await tx.correspondenciaSiope.findFirst({
    where: { exercicio: p.exercicio },
    orderBy: { versao: "desc" },
    select: { versao: true, fonte: true, itens: { select: { subfuncaoCodigo: true, nome: true, grupo: true, tratamento: true } } },
  });
  if (c === null) throw new Error(`A correspondência do SIOPE para ${String(p.exercicio)} não está carregada; sem ela a prévia não diz como cada subfunção entra no cálculo.`);
  const porCodigo = new Map(c.itens.map((i) => [i.subfuncaoCodigo, i]));
  const { fim } = janelaDoBimestre(p.exercicio, p.bimestre);
  const base: "liquidada" | "empenhada" = p.bimestre === 6 ? "empenhada" : "liquidada";

  const [fichas, classes] = await Promise.all([
    tx.fichaOrcamentaria.findMany({
      where: { exercicio: p.exercicio, funcao: { codigo: "12" } },
      select: { id: true, fonte: { select: { codigo: true } }, subfuncao: { select: { codigo: true, nome: true } } },
    }),
    tx.deParaFonteClasseEducacao.findMany({ where: { classe: "IMPOSTOS_MDE" }, select: { fonteCodigo: true } }),
  ]);
  const deImpostos = new Set(classes.map((x) => x.fonteCodigo));
  const porSubfuncao = new Map<string, { nome: string; ids: string[]; idsDeImpostos: string[] }>();
  for (const f of fichas) {
    const g = porSubfuncao.get(f.subfuncao.codigo) ?? { nome: f.subfuncao.nome, ids: [], idsDeImpostos: [] };
    g.ids.push(f.id);
    if (deImpostos.has(f.fonte.codigo)) g.idsDeImpostos.push(f.id);
    porSubfuncao.set(f.subfuncao.codigo, g);
  }
  const linhas: LinhaDaPrevia[] = [];
  for (const [codigo, g] of [...porSubfuncao.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const item = porCodigo.get(codigo);
    const rotulo = `${codigo} ${item?.nome ?? g.nome}`;
    const despesa = await medirDespesa(tx, g.ids, null, p.exercicio, fim, base, rotulo);
    const parte = await medirDespesa(tx, g.idsDeImpostos, null, p.exercicio, fim, base, rotulo);
    linhas.push({ subfuncao: codigo, nome: item?.nome ?? g.nome, grupo: item?.grupo ?? null, tratamento: item?.tratamento ?? null, despesa, deImpostos: parte });
  }
  const zero = toMoney("0.00");
  const totais: Record<ChaveDoTotal, Money> = { CONSIDERADA: zero, CONSIDERADA_SE_DO_ENSINO_FUNDAMENTAL: zero, CONSIDERADA_SE_RECURSOS_PROPRIOS: zero, NAO_CONSIDERADA: zero, SEM_CORRESPONDENCIA: zero };
  for (const l of linhas) {
    const k: ChaveDoTotal = l.tratamento ?? "SEM_CORRESPONDENCIA";
    totais[k] = toMoney(totais[k].plus(l.deImpostos.acompanhamento));
  }
  const a8 = await anexo8(tx, { exercicio: p.exercicio, bimestre: p.bimestre });
  return {
    exercicio: p.exercicio,
    bimestre: p.bimestre,
    correspondencia: { versao: c.versao, fonte: c.fonte },
    base,
    linhas,
    totaisDeImpostos: totais,
    indicadores: {
      receitaDeImpostosRealizada: a8.totalReceitas.realizada,
      minimoAlemDoFundeb: a8.minimoAlemFundeb,
      recebidoDoFundeb: a8.totalRecebidoFundeb,
      indicadorProfissionais: a8.indicadorProfissionais,
      limiteProfissionais: a8.limiteProfissionais,
      atingiuProfissionais: a8.atingiuProfissionais,
    },
    bloqueios: BLOQUEIOS_DO_SIOPE,
  };
}
