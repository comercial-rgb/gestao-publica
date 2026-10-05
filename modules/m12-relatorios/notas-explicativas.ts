import { z } from "zod";
import { emProsa } from "../../packages/contracts/index.js";
import { fimDoDiaCivil, inicioDoDiaCivil } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { parametroVigenteEm } from "../m10-patrimonial/parametros.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";

/**
 * V35 C2 — NOTAS EXPLICATIVAS ÀS DCASP (MCASP 11ª ed., Parte V, item 8). Ver `prisma/schema/m12-notas-explicativas.prisma`.
 *
 * ═══ QUEM ESCREVE O QUÊ ═══
 * O ente redige: natureza jurídica, domicílio, operações, legislação, declaração de conformidade, bases de mensuração,
 * julgamentos, contingências. O sistema não inventa esse texto: o que falta dos temas que o MCASP manda divulgar
 * (8.2.1 e 8.2.4) sai como pendência nomeada no próprio documento.
 * O sistema escreve o que já sabe por cadastro, lido na hora e com a origem: identificação do ente, parâmetros de
 * depreciação/amortização/exaustão por classe, metodologia do ajuste para perdas da dívida ativa (o MCASP manda que vá
 * às notas, Parte III, 5.2.5), parâmetro da apropriação das férias, e as apurações do ajuste no exercício.
 *
 * ═══ ORDEM E NUMERAÇÃO ═══
 * As quatro seções na ordem sugerida em 8.2 (a, b, c, d). Dentro da seção, as notas do sistema primeiro, depois as
 * redigidas pela `ordem`. A numeração é corrida no documento, para a referência cruzada com os quadros.
 *
 * Append-only: `redigirNotaExplicativa` grava a versão seguinte da chave; `retirarNotaExplicativa` grava uma versão
 * retirada. Ação: CADASTRAR_LINHA_DEMONSTRATIVO (a mesma que configura os demonstrativos).
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export const SECOES_DAS_NOTAS = ["INFORMACOES_GERAIS", "POLITICAS_CONTABEIS", "DETALHAMENTO", "OUTRAS_INFORMACOES"] as const;
export type SecaoDaNota = (typeof SECOES_DAS_NOTAS)[number];
export const ROTULO_DA_SECAO: Readonly<Record<SecaoDaNota, string>> = {
  INFORMACOES_GERAIS: "Informações gerais",
  POLITICAS_CONTABEIS: "Resumo das políticas contábeis significativas",
  DETALHAMENTO: "Informações de suporte e detalhamento dos itens das demonstrações",
  OUTRAS_INFORMACOES: "Outras informações relevantes",
};

export const DEMONSTRACOES_DA_NOTA = ["BALANCO_ORCAMENTARIO", "BALANCO_FINANCEIRO", "BALANCO_PATRIMONIAL", "DVP", "DFC", "DMPL", "CONJUNTO"] as const;
export type DemonstracaoDaNota = (typeof DEMONSTRACOES_DA_NOTA)[number];
export const ROTULO_DA_DEMONSTRACAO: Readonly<Record<DemonstracaoDaNota, string>> = {
  BALANCO_ORCAMENTARIO: "Balanço Orçamentário",
  BALANCO_FINANCEIRO: "Balanço Financeiro",
  BALANCO_PATRIMONIAL: "Balanço Patrimonial",
  DVP: "Demonstração das Variações Patrimoniais",
  DFC: "Demonstração dos Fluxos de Caixa",
  DMPL: "Demonstração das Mutações do Patrimônio Líquido",
  CONJUNTO: "Demonstrações em conjunto",
};

/** Os temas que o MCASP manda divulgar ("deve divulgar"), cada um com o item do manual. */
export const TEMAS_OBRIGATORIOS: readonly { readonly chave: string; readonly secao: SecaoDaNota; readonly titulo: string; readonly fonte: string }[] = [
  { chave: "FORMA_JURIDICA_E_DOMICILIO", secao: "INFORMACOES_GERAIS", titulo: "Forma jurídica, domicílio e jurisdição", fonte: "MCASP 11ª ed., Parte V, 8.2.4, a" },
  { chave: "NATUREZA_DAS_OPERACOES", secao: "INFORMACOES_GERAIS", titulo: "Natureza das operações e principais atividades", fonte: "MCASP 11ª ed., Parte V, 8.2.4, b" },
  { chave: "LEGISLACAO", secao: "INFORMACOES_GERAIS", titulo: "Legislação que rege as operações", fonte: "MCASP 11ª ed., Parte V, 8.2.4, c" },
  { chave: "DECLARACAO_DE_CONFORMIDADE", secao: "INFORMACOES_GERAIS", titulo: "Declaração de conformidade com a legislação e as normas de contabilidade", fonte: "MCASP 11ª ed., Parte V, 8.2, a, iv" },
  { chave: "BASES_DE_MENSURACAO", secao: "POLITICAS_CONTABEIS", titulo: "Bases de mensuração", fonte: "MCASP 11ª ed., Parte V, 8.2.1, a" },
];

const zSecao = z.enum(SECOES_DAS_NOTAS);
const zDemonstracao = z.enum(DEMONSTRACOES_DA_NOTA);

export const zRedigirNotaExplicativa = z.object({
  exercicio: z.number().int().min(2000).max(2100),
  /** Ausente: nota nova, numerada NE-<n>. Presente: nova versão daquela nota, ou um tema obrigatório. */
  chave: z.string().trim().regex(/^[A-Z0-9_-]{2,40}$/, "Chave em maiúsculas, dígitos, _ ou -").optional(),
  secao: zSecao,
  demonstracao: zDemonstracao,
  ordem: z.number().int().min(0).max(9999),
  titulo: z.string().trim().min(3, "Dê um título à nota.").max(200),
  texto: z.string().trim().min(20, "O texto da nota é curto demais para informar alguma coisa."),
  criadoPor: z.string().min(1),
});

async function exigirExercicio(tx: Tx, exercicio: number): Promise<void> {
  if ((await tx.exercicio.findUnique({ where: { ano: exercicio }, select: { ano: true } })) === null) {
    throw new Error(`O exercício ${String(exercicio)} não está cadastrado. Nada foi gravado.`);
  }
}

async function ultimaVersao(tx: Tx, exercicio: number, chave: string) {
  return tx.notaExplicativa.findFirst({ where: { exercicio, chave }, orderBy: { versao: "desc" } });
}

export async function redigirNotaExplicativa(
  prisma: PrismaClient,
  input: z.input<typeof zRedigirNotaExplicativa>
): Promise<{ readonly chave: string; readonly versao: number }> {
  const d = zRedigirNotaExplicativa.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.redigirNotaExplicativa, "ENTE");
    await exigirExercicio(tx, d.exercicio);
    const tema = TEMAS_OBRIGATORIOS.find((t) => t.chave === d.chave);
    if (tema !== undefined && tema.secao !== d.secao) {
      throw new Error(`O tema "${tema.titulo}" pertence à seção "${ROTULO_DA_SECAO[tema.secao]}" (${tema.fonte}). Nada foi gravado.`);
    }
    let chave = d.chave;
    if (chave === undefined) {
      const livres = await tx.notaExplicativa.findMany({ where: { exercicio: d.exercicio, chave: { startsWith: "NE-" } }, select: { chave: true }, distinct: ["chave"] });
      const maior = livres.reduce((m, n) => Math.max(m, /^NE-(\d+)$/.test(n.chave) ? Number(n.chave.slice(3)) : 0), 0);
      chave = `NE-${String(maior + 1)}`;
    } else if (tema === undefined && (await ultimaVersao(tx, d.exercicio, chave)) === null) {
      throw new Error(`Não há nota "${chave}" em ${String(d.exercicio)} para revisar. Para uma nota nova, deixe a chave em branco. Nada foi gravado.`);
    }
    const anterior = await ultimaVersao(tx, d.exercicio, chave);
    const r = await tx.notaExplicativa.create({
      data: { exercicio: d.exercicio, chave, versao: (anterior?.versao ?? 0) + 1, secao: d.secao, demonstracao: d.demonstracao, ordem: d.ordem, titulo: d.titulo, texto: d.texto, criadoPor: d.criadoPor },
      select: { chave: true, versao: true },
    });
    return r;
  });
}

export const zRetirarNotaExplicativa = z.object({
  exercicio: z.number().int().min(2000).max(2100),
  chave: z.string().trim().min(2),
  criadoPor: z.string().min(1),
});

export async function retirarNotaExplicativa(
  prisma: PrismaClient,
  input: z.input<typeof zRetirarNotaExplicativa>
): Promise<{ readonly versao: number }> {
  const d = zRetirarNotaExplicativa.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.retirarNotaExplicativa, "ENTE");
    const atual = await ultimaVersao(tx, d.exercicio, d.chave);
    if (atual === null) throw new Error(`Não há nota "${d.chave}" em ${String(d.exercicio)}. Nada foi gravado.`);
    if (atual.retirada) throw new Error(`A nota "${d.chave}" já está retirada do documento de ${String(d.exercicio)}. Nada foi gravado.`);
    const r = await tx.notaExplicativa.create({
      data: { exercicio: d.exercicio, chave: d.chave, versao: atual.versao + 1, secao: atual.secao, demonstracao: atual.demonstracao, ordem: atual.ordem, titulo: atual.titulo, texto: atual.texto, retirada: true, criadoPor: d.criadoPor },
      select: { versao: true },
    });
    return { versao: r.versao };
  });
}

// ─────────────────────────────── o documento ───────────────────────────────

export interface NotaDoDocumento {
  readonly numero: number;
  readonly chave: string;
  readonly origem: "SISTEMA" | "REDIGIDA";
  readonly demonstracao: DemonstracaoDaNota;
  /** Posição na seção (as do sistema: 0). */
  readonly ordem: number;
  readonly titulo: string;
  /** Parágrafos. */
  readonly texto: readonly string[];
  /** Nota redigida: a versão vigente; nota do sistema: a origem do dado. */
  readonly referencia: string;
}

export interface NotasExplicativas {
  readonly exercicio: number;
  readonly secoes: readonly { readonly secao: SecaoDaNota; readonly rotulo: string; readonly notas: readonly NotaDoDocumento[] }[];
  /** Temas que o MCASP manda divulgar e que o ente ainda não redigiu. */
  readonly temasPendentes: readonly { readonly chave: string; readonly titulo: string; readonly fonte: string }[];
}

type NotaSemNumero = Omit<NotaDoDocumento, "numero" | "ordem"> & { readonly ordem?: number };

/** "62.500000" → "62,5". Textual: o percentual é Decimal, nunca `number`. */
function percentualEmProsa(p: string): string {
  const [i = "0", f = ""] = p.split(".");
  const fr = f.replace(/0+$/, "");
  return fr === "" ? i : `${i},${fr}`;
}

const NOME_DO_METODO: Readonly<Record<string, string>> = { DEPRECIACAO: "depreciação", AMORTIZACAO: "amortização", EXAUSTAO: "exaustão" };
const NOME_DA_ORIGEM: Readonly<Record<string, string>> = { TRIBUTARIA: "tributária", NAO_TRIBUTARIA: "não tributária" };

async function notasDoSistema(tx: Tx, exercicio: number): Promise<Record<SecaoDaNota, NotaSemNumero[]>> {
  const r: Record<SecaoDaNota, NotaSemNumero[]> = { INFORMACOES_GERAIS: [], POLITICAS_CONTABEIS: [], DETALHAMENTO: [], OUTRAS_INFORMACOES: [] };

  const ente = await tx.enteConfig.findUnique({ where: { id: "unico" }, select: { nome: true, cnpj: true, codigoIbge: true, uf: true, tribunalCodigo: true } });
  if (ente !== null) {
    r.INFORMACOES_GERAIS.push({
      chave: "SISTEMA:IDENTIFICACAO",
      origem: "SISTEMA",
      demonstracao: "CONJUNTO",
      titulo: "Identificação da entidade",
      texto: [
        `${ente.nome}. CNPJ ${ente.cnpj ?? "não cadastrado"}; código IBGE ${ente.codigoIbge}${ente.uf !== null ? `; UF ${ente.uf}` : ""}.`,
        `Tribunal de contas de jurisdição: ${ente.tribunalCodigo}.`,
      ],
      referencia: "Cadastro institucional do ente",
    });
  }

  // ── políticas: depreciação, amortização e exaustão, pela régua vigente em dezembro ──
  const classes = await tx.classeDeBens.findMany({ where: { ativa: true }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, descricao: true } });
  if (classes.length > 0) {
    const linhas: string[] = [];
    for (const c of classes) {
      const p = await parametroVigenteEm(tx, c.id, `${String(exercicio)}-12`);
      if (p === null) linhas.push(`${c.codigo} ${c.descricao}: sem parâmetro de vida útil cadastrado; a classe não é atualizada.`);
      else if (!p.ativo) linhas.push(`${c.codigo} ${c.descricao}: não sofre ${NOME_DO_METODO[p.metodo] ?? p.metodo}.`);
      else linhas.push(`${c.codigo} ${c.descricao}: ${NOME_DO_METODO[p.metodo] ?? p.metodo} pelo método das quotas constantes mensais, vida útil de ${String(p.vidaUtilMeses)} meses, valor residual de ${percentualEmProsa(p.percentualResidual.times(100).toFixed(6))}%.`);
    }
    r.POLITICAS_CONTABEIS.push({
      chave: "SISTEMA:DEPRECIACAO",
      origem: "SISTEMA",
      demonstracao: "BALANCO_PATRIMONIAL",
      titulo: "Depreciação, amortização e exaustão",
      texto: ["Parâmetros por classe de bens vigentes em dezembro do exercício:", ...linhas],
      referencia: "Parâmetros de atualização das classes de bens (patrimônio)",
    });
  }

  // ── políticas: metodologia do ajuste para perdas da dívida ativa (MCASP Parte III, 5.2.5) ──
  const perdas: string[] = [];
  for (const origem of ["TRIBUTARIA", "NAO_TRIBUTARIA"] as const) {
    const p = await tx.percentualDePerdaDaDividaAtiva.findFirst({ where: { exercicio, origem }, orderBy: { versao: "desc" }, select: { percentual: true, metodologia: true } });
    if (p !== null) perdas.push(`Dívida ativa ${NOME_DA_ORIGEM[origem] ?? origem}: perda esperada de ${percentualEmProsa(p.percentual.toFixed(6))}% do saldo. ${p.metodologia}`);
  }
  if (perdas.length > 0) {
    r.POLITICAS_CONTABEIS.push({ chave: "SISTEMA:PERDAS_DA_DIVIDA_ATIVA", origem: "SISTEMA", demonstracao: "BALANCO_PATRIMONIAL", titulo: "Ajuste para perdas da dívida ativa", texto: perdas, referencia: "Percentual de perda declarado (dívida ativa)" });
  }

  // ── políticas: apropriação das férias e do 13º por competência (MCASP Parte II, 18) ──
  const ferias = await tx.parametroDaApropriacaoDeFerias.findFirst({ where: { exercicio }, orderBy: { versao: "desc" } });
  if (ferias !== null) {
    r.POLITICAS_CONTABEIS.push({
      chave: "SISTEMA:APROPRIACAO_DE_PESSOAL",
      origem: "SISTEMA",
      demonstracao: "DVP",
      titulo: "Apropriação do 13º salário e das férias por competência",
      texto: [
        `O 13º salário e as férias são reconhecidos mês a mês, por competência. Férias: período aquisitivo de ${String(ferias.mesesDoPeriodoAquisitivo)} meses, abono de ${String(ferias.abonoNumerador)}/${String(ferias.abonoDenominador)}, ${ferias.incluiRemuneracaoDoPeriodo ? "com" : "sem"} a remuneração do período de gozo.`,
        `Fundamento: ${ferias.fundamento.replace(/\.$/, "")}.`,
      ],
      referencia: "Parâmetro da apropriação das férias (folha)",
    });
  }

  // ── detalhamento: as apurações do ajuste para perdas no exercício (a última de cada origem) ──
  const desde = inicioDoDiaCivil(`${String(exercicio)}-01-01`);
  const ate = fimDoDiaCivil(`${String(exercicio)}-12-31`);
  const apuracoes: string[] = [];
  for (const origem of ["TRIBUTARIA", "NAO_TRIBUTARIA"] as const) {
    const a = await tx.apuracaoDoAjusteDePerdas.findFirst({
      where: { origem, dataCorte: { gte: desde, lte: ate } },
      orderBy: { dataCorte: "desc" },
      select: { saldoDaDividaAtiva: true, ajusteEsperado: true, percentual: { select: { percentual: true } } },
    });
    if (a !== null) {
      apuracoes.push(
        `Dívida ativa ${NOME_DA_ORIGEM[origem] ?? origem}: saldo de R$ ${emProsa(a.saldoDaDividaAtiva.toFixed(2))}, ajuste para perdas de R$ ${emProsa(a.ajusteEsperado.toFixed(2))} (${percentualEmProsa(a.percentual.percentual.toFixed(6))}%), valor líquido de R$ ${emProsa(a.saldoDaDividaAtiva.minus(a.ajusteEsperado).toFixed(2))}.`
      );
    }
  }
  if (apuracoes.length > 0) {
    r.DETALHAMENTO.push({ chave: "SISTEMA:DIVIDA_ATIVA", origem: "SISTEMA", demonstracao: "BALANCO_PATRIMONIAL", titulo: "Créditos inscritos em dívida ativa", texto: ["Posição na última apuração do ajuste para perdas do exercício:", ...apuracoes], referencia: "Apurações do ajuste para perdas" });
  }
  return r;
}

export async function notasExplicativas(leitor: Tx, p: { readonly exercicio: number }): Promise<NotasExplicativas> {
  const sistema = await notasDoSistema(leitor, p.exercicio);
  const todas = await leitor.notaExplicativa.findMany({ where: { exercicio: p.exercicio }, orderBy: [{ chave: "asc" }, { versao: "desc" }] });
  const vigentes = new Map<string, (typeof todas)[number]>();
  for (const n of todas) if (!vigentes.has(n.chave)) vigentes.set(n.chave, n);
  const redigidas = [...vigentes.values()].filter((n) => !n.retirada);

  let numero = 0;
  const secoes = SECOES_DAS_NOTAS.map((secao) => {
    const daSecao = redigidas
      .filter((n) => n.secao === secao)
      .sort((a, b) => a.ordem - b.ordem || a.chave.localeCompare(b.chave))
      .map((n): NotaSemNumero => ({ chave: n.chave, origem: "REDIGIDA", demonstracao: n.demonstracao, ordem: n.ordem, titulo: n.titulo, texto: n.texto.split(/\n\s*\n/).map((t) => t.trim()).filter((t) => t !== ""), referencia: `Versão ${String(n.versao)}` }));
    const notas = [...sistema[secao], ...daSecao].map((n) => ({ ...n, ordem: n.ordem ?? 0, numero: (numero += 1) }));
    return { secao, rotulo: ROTULO_DA_SECAO[secao], notas };
  });
  const redigidasChaves = new Set(redigidas.map((n) => n.chave));
  return {
    exercicio: p.exercicio,
    secoes,
    temasPendentes: TEMAS_OBRIGATORIOS.filter((t) => !redigidasChaves.has(t.chave)).map(({ chave, titulo, fonte }) => ({ chave, titulo, fonte })),
  };
}
