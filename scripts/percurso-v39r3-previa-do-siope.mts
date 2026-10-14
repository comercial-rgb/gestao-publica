import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { janelaDoBimestre } from "../modules/m12-relatorios/rreo-anexo1.js";
import { Decimal } from "../packages/contracts/index.js";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import { entrar, irPara, lancarNavegadorDoPercurso, type Navegador } from "./percursos-navegador.js";

/**
 * V39-R3 (R3-023, V39-086) — PELA TELA: A PRÉVIA DO SIOPE.
 *
 * Pré-requisito: a correspondência do SIOPE carregada (scripts/carregar-correspondencia-siope.ts) e a massa da R3
 * (seção 10: empenhos na 361, ensino fundamental, e na 306, merenda; o contador que consulta relatórios).
 *   1. quem só consulta a contabilidade não abre a prévia: vai para a tela de sem acesso, com a ação nomeada;
 *   2. o contador abre o 6º bimestre de 2026 (base empenhada): 361 considerada e 306 não considerada, com o empenhado
 *      conferido contra a soma feita AQUI, por SQL, dos empenhos da função 12 (original menos anulação parcial viva;
 *      estornado não conta);
 *   3. a parte custeada por impostos, por tratamento (o tratamento lido da correspondência carregada, a classe da fonte
 *      lida do banco), bate com a tela; o arquivo de importação aparece indisponível, com o que falta.
 * Só lê.
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3012" };
await exigirDestinoDoPercurso(n.base);
const prisma = criarPrismaClient(process.env["PERCURSO_BANCO"] ?? process.env["DATABASE_URL"] ?? "");
const senha = process.env["FICTICIO_SENHA"] ?? "Ficticio#2026";
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
const br = (v: Decimal): string => {
  const [i = "0", d = "00"] = v.toFixed(2).split(".");
  return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${d}`;
};
const exato = (texto: string, valor: string): boolean => new RegExp(`(^|[^\\d.,])${valor.replace(/\./g, "\\.")}($|[^\\d])`).test(texto);

const corr = await prisma.correspondenciaSiope.findFirst({ where: { exercicio: 2026 }, orderBy: { versao: "desc" }, select: { itens: { select: { subfuncaoCodigo: true, tratamento: true } } } });
if (corr === null) throw new Error("A correspondência do SIOPE de 2026 não está carregada nesta base.");
const tratamentoDe = new Map(corr.itens.map((i) => [i.subfuncaoCodigo, i.tratamento as string]));
const deImpostos = new Set((await prisma.deParaFonteClasseEducacao.findMany({ where: { classe: "IMPOSTOS_MDE" }, select: { fonteCodigo: true } })).map((x) => x.fonteCodigo));
const { fim } = janelaDoBimestre(2026, 6);

// O empenhado líquido da função 12 por subfunção, somado AQUI: original não estornado, menos as anulações parciais não
// estornadas de originais não estornados.
const empenhos = await prisma.empenho.findMany({
  where: { ficha: { exercicio: 2026, funcao: { codigo: "12" } }, data: { lte: fim } },
  select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true, ficha: { select: { subfuncao: { select: { codigo: true } }, fonte: { select: { codigo: true } } } } },
});
const estornados = new Set(empenhos.filter((e) => e.estornoDeId !== null).map((e) => e.estornoDeId!));
const total = new Map<string, Decimal>();
const totalDeImpostos = new Map<string, Decimal>();
for (const e of empenhos) {
  if (e.estornoDeId !== null || estornados.has(e.id)) continue;
  if (e.anulacaoParcialDeId !== null && estornados.has(e.anulacaoParcialDeId)) continue;
  const sinal = e.anulacaoParcialDeId === null ? 1 : -1;
  const k = e.ficha.subfuncao.codigo;
  const v = new Decimal(e.valor.toString()).times(sinal);
  total.set(k, (total.get(k) ?? new Decimal(0)).plus(v));
  if (deImpostos.has(e.ficha.fonte.codigo)) totalDeImpostos.set(k, (totalDeImpostos.get(k) ?? new Decimal(0)).plus(v));
}
const de = (k: string): Decimal => total.get(k) ?? new Decimal(0);
const porTratamento = (tr: string): Decimal => [...totalDeImpostos.entries()].filter(([k]) => (tratamentoDe.get(k) ?? "SEM_CORRESPONDENCIA") === tr).reduce((s, [, v]) => s.plus(v), new Decimal(0));
console.log(`empenhado esperado (SQL): ${[...total.entries()].map(([k, v]) => `${k} ${v.toFixed(2)}`).join(", ")}`);
if (de("361").isZero() || de("306").isZero()) throw new Error("A massa da R3 não tem os empenhos da seção 10 (361 e 306).");

const nav = await lancarNavegadorDoPercurso();
try {
  const ctxC = await nav.createBrowserContext();
  const pc = await ctxC.newPage();
  pc.setDefaultTimeout(300000);
  await entrar(n, pc, "consulta.contabilidade@ficticio.local", senha);
  await irPara(n, pc, "/relatorios/siope?exercicio=2026&bimestre=6");
  const url = pc.url();
  const temPrevia = (await pc.$("[data-previa-siope]")) !== null;
  conferir(/\/sem-acesso\?acao=CONSULTAR_RELATORIOS/.test(url) && !temPrevia, `quem só consulta a contabilidade não abre a prévia: vai para ${url.replace(/^https?:\/\/[^/]+/, "")}`);
  await ctxC.close();

  const ctx = await nav.createBrowserContext();
  const p = await ctx.newPage();
  p.setDefaultTimeout(300000);
  await entrar(n, p, "custos.contabilidade@ficticio.local", senha);
  await irPara(n, p, "/relatorios/siope?exercicio=2026&bimestre=6");
  const linha = async (sel: string): Promise<string> => (await p.$eval(sel, (e) => (e.textContent ?? "").replace(/\s+/g, " ").trim()).catch(() => ""));
  // célula a célula: subfunção, no manual, tratamento, empenhada, liquidada, paga, com impostos
  const celulas = async (sub: string): Promise<string[]> => p.$$eval(`[data-subfuncao="${sub}"] td`, (tds) => tds.map((td) => (td.textContent ?? "").replace(/\s+/g, " ").trim())).catch(() => []);
  const c361 = await celulas("361");
  const c306 = await celulas("306");
  const l361 = c361.join(" | ");
  const l306 = c306.join(" | ");
  conferir(c361[1] === "Típica da educação" && c361[2] === "Considerada no ensino" && exato(c361[3] ?? "", br(de("361"))), `361: típica, considerada no ensino, empenhado ${br(de("361"))} (${l361.slice(0, 110)})`);
  conferir(c306[1] === "Outra não considerada" && c306[2] === "Não considerada" && exato(c306[3] ?? "", br(de("306"))), `306: não considerada, empenhado ${br(de("306"))} (${l306.slice(0, 110)})`);

  const tCons = await linha('[data-total-tratamento="CONSIDERADA"]');
  const tNao = await linha('[data-total-tratamento="NAO_CONSIDERADA"]');
  conferir(exato(tCons, br(porTratamento("CONSIDERADA"))) && exato(tNao, br(porTratamento("NAO_CONSIDERADA"))), `parte de impostos por tratamento: considerada ${br(porTratamento("CONSIDERADA"))}, não considerada ${br(porTratamento("NAO_CONSIDERADA"))} (${tCons} | ${tNao})`);
  const bloqueio = await linha('[data-lista="bloqueios-siope"]');
  conferir(/Arquivo de importação das planilhas \(CSV\): indisponível\..*Tabela 2 - Código de Identificação das Planilhas de Administração Consolidada.*creche e pré-escola/.test(bloqueio), `o arquivo de importação e a separação da 365 aparecem indisponíveis, com o que falta (${bloqueio.slice(0, 90)})`);
  await ctx.close();
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da prévia do SIOPE completo.");
