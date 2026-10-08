import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { disponivelDaFichaNaData } from "../modules/m05-despesa/saldo-na-data.js";
import { toMoney } from "../packages/contracts/index.js";
import { diaCivil, somarDiasCivis } from "../packages/datas/index.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V36 — PERCURSO DO SALDO DA DOTAÇÃO NA DATA DE EMISSÃO DO EMPENHO (TR 5.10.1.10), em /despesa/empenhos:
 *   1. na base, uma ficha de 2026 cujo disponível num dia passado (a véspera de um crédito ou de uma anulação) é menor
 *      que o de hoje;
 *   2. escolhidas a ficha e aquela data pela tela, o formulário mostra o disponível na data e o de hoje, iguais aos do
 *      M05;
 *   3. um empenho de um centavo acima do disponível na data (e abaixo do de hoje) é recusado pela tela com o motivo, e
 *      nada é gravado;
 *   4. com a data de hoje, o formulário mostra o disponível na data igual ao de hoje.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 SEED_ADMIN_SENHA=... \
 *      npx tsx scripts/percurso-v36-saldo-na-data-do-empenho.mts
 * Não grava (a única emissão tentada é recusada).
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação.");
const URL_BANCO = process.env["PERCURSO_BANCO"] ?? "";
if (!/\/gestao_publica_esperanca_ficticio(_[a-z]+)?(\?|$)/.test(URL_BANCO)) throw new Error("Recusado: PERCURSO_BANCO tem de ser a base fictícia que a BASE serve.");
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const prisma = criarPrismaClient(URL_BANCO);
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
const hoje = diaCivil(new Date());
const br = (v: string): string => {
  const [i = "0", c = "00"] = v.replace("-", "").split(".");
  return `${v.startsWith("-") ? "-" : ""}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${c}`;
};

// ── 1. a ficha e o dia ──
const positivos = await prisma.movimentoDotacao.findMany({
  where: { tipo: { in: ["CREDITO_ADICIONAL", "EMPENHO_ANULADO", "REALOCACAO_ACRESCIMO"] }, ficha: { exercicio: 2026 } },
  select: { fichaId: true, competencia: true },
  orderBy: { competencia: "desc" },
  take: 200,
});
let alvo: { fichaId: string; dia: string; naData: string; atual: string } | undefined;
for (const m of positivos) {
  const dia = diaCivil(somarDiasCivis(m.competencia, -1));
  if (!dia.startsWith("2026-") || dia > hoje) continue;
  const s = await disponivelDaFichaNaData(prisma, m.fichaId, dia);
  if (s.naData.greaterThanOrEqualTo(0) && s.naData.plus("0.01").lessThanOrEqualTo(s.atual)) {
    alvo = { fichaId: m.fichaId, dia, naData: s.naData.toFixed(2), atual: s.atual.toFixed(2) };
    break;
  }
}
if (alvo === undefined) throw new Error("a base não tem ficha de 2026 com disponível passado menor que o de hoje");
const A = alvo;
console.log(`ficha ${A.fichaId}, dia ${A.dia}: na data ${A.naData}, hoje ${A.atual}`);

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  await entrar(n, page, "admin@cg.pb.gov.br", senha);
  await irPara(n, page, "/despesa/empenhos?exercicio=2026");
  const pessoa = await prisma.pessoa.findFirst({ orderBy: { documento: "asc" }, where: { documento: { not: { startsWith: "0" } } }, select: { documento: true } });

  // ── 2. ficha e data pela tela ──
  await page.select('form[data-acao="empenhar"] select[name="fichaId"]', A.fichaId);
  await page.$eval('form[data-acao="empenhar"] input[name="data"]', (el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, A.dia);
  await page.waitForSelector(`[data-disponivel-na-data="${A.dia}"] [data-valor-na-data]`);
  const naTela = await page.$eval(`[data-disponivel-na-data="${A.dia}"]`, (e) => (e.textContent ?? "").replace(/\s+/g, " ").trim());
  conferir(naTela.includes(`R$ ${br(A.naData)}`) && naTela.includes(`hoje: R$ ${br(A.atual)}`), `o formulário mostra o disponível em ${A.dia} e o de hoje: "${naTela}"`);

  // ── 3. um centavo acima do disponível na data ──
  const valor = toMoney(A.naData).plus("0.01").toFixed(2);
  const antes = await prisma.empenho.count({ where: { fichaId: A.fichaId } });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('form[data-acao="empenhar"] button')].find((x) => /Credor sem cadastro/i.test(x.textContent ?? ""));
    (b as HTMLButtonElement | undefined)?.click();
  });
  await page.$eval('form[data-acao="empenhar"] [name="historico"]', (el) => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(el, "Empenho com data anterior (percurso do saldo na data)");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const r = await preencherEEnviar(page, "empenhar", [
    { sel: '[data-mascara="cpf-cnpj"]', valor: pessoa?.documento ?? "" },
    { sel: '[data-mascara="valor"]', valor: br(valor) },
    { sel: 'input[name="data"]', valor: A.dia, tipo: "data" },
    { sel: 'select[name="categoria"]', valor: "PRESTACAO_SERVICOS", tipo: "select" },
  ]);
  const depois = await prisma.empenho.count({ where: { fichaId: A.fichaId } });
  conferir(
    r.tipo === "erro" && /na data do empenho/.test(r.texto) && r.texto.includes(`disponível naquela data R$ ${br(A.naData)}`) && depois === antes,
    `empenho de R$ ${br(valor)} em ${A.dia} recusado pela tela (${r.tipo}: ${r.texto.replace(/\s+/g, " ").slice(0, 160)}); empenhos da ficha ${String(antes)} → ${String(depois)}`
  );

  // ── 4. com a data de hoje, os dois disponíveis coincidem ──
  await page.$eval('form[data-acao="empenhar"] input[name="data"]', (el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, hoje);
  await page.waitForSelector(`[data-disponivel-na-data="${hoje}"] [data-valor-na-data]`);
  const [vData, vHoje] = await page.$eval(`[data-disponivel-na-data="${hoje}"]`, (e) => [e.querySelector("[data-valor-na-data]")?.textContent ?? "", e.querySelector("[data-valor-atual]")?.textContent ?? ""]);
  const s = await disponivelDaFichaNaData(prisma, A.fichaId, hoje);
  conferir(vData === vHoje && (vData ?? "").includes(br(s.naData.toFixed(2))), `com a data de hoje, na data ${vData ?? ""} e hoje ${vHoje ?? ""}`);
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso do saldo na data do empenho completo.");
