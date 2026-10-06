import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { entrar, irPara, lancarNavegadorDoPercurso, type Navegador } from "./percursos-navegador.js";

/**
 * V36 — PERCURSO DA NOTA DE ESTORNO, e da anulação no painel "antes de encerrar".
 *
 *   1. /despesa/restos-a-pagar: anular 1,00 do saldo de um empenho estimativo pelo formulário do painel (conferir,
 *      confirmar); no banco, a anulação parcial nova com 1,00;
 *   2. /despesa/anulacoes: a anulação aparece com o link "nota de estorno (PDF)", que responde um PDF;
 *   3. o mesmo id com o tipo errado responde 404 (a nota procura a anulação dentro da lista recortada).
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 SEED_ADMIN_SENHA=... \
 *      npx tsx scripts/percurso-v36-nota-de-estorno.mts
 * GRAVA (uma anulação de 1,00). Recusa a 3010 e banco que não seja o fictício.
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação; este percurso grava.");
const URL_BANCO = process.env["PERCURSO_BANCO"] ?? "";
if (!/\/gestao_publica_esperanca_ficticio(\?|$)/.test(URL_BANCO)) throw new Error("Recusado: PERCURSO_BANCO tem de ser o banco fictício que a BASE serve.");
const usuario = process.env["PERCURSO_USUARIO"] ?? "admin@cg.pb.gov.br";
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const prisma = criarPrismaClient(URL_BANCO);
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(120000);
  await entrar(n, page, usuario, senha);

  console.log("1. anular parte do saldo de um estimativo, no painel antes de encerrar");
  await irPara(n, page, "/despesa/restos-a-pagar?exercicio=2026");
  const numeroEmpenho = await page.evaluate(() => document.querySelector('[data-lista="estimativos-com-saldo"] tr[data-empenho]')?.getAttribute("data-empenho") ?? null);
  if (numeroEmpenho === null) throw new Error("A base não tem estimativo com saldo em 2026 (rode antes o percurso de adiantamentos).");
  const empenho = await prisma.empenho.findFirst({ where: { numero: numeroEmpenho, estornoDeId: null, anulacaoParcialDeId: null }, select: { id: true } });
  const numeroAnulacao = `ANE-${String(Date.now()).slice(-6)}`;
  const linha = `[data-lista="estimativos-com-saldo"] tr[data-empenho="${numeroEmpenho}"]`;
  await page.click(`${linha} details summary`);
  const valor = await page.$(`${linha} input[data-mascara="valor"]`);
  await valor?.click({ count: 3 });
  await page.keyboard.press("Backspace");
  await valor?.type("1,00");
  await page.type(`${linha} input[name="numero"]`, numeroAnulacao);
  await page.type(`${linha} input[name="motivo"]`, "estimativa revista antes do encerramento no percurso V36");
  await page.$eval(`${linha} input[name="data"]`, (el) => {
    const i = el as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(i, "2026-10-05");
    i.dispatchEvent(new Event("input", { bubbles: true }));
    i.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.click(`${linha} button[type="button"]`);
  await page.waitForSelector(`${linha} [data-conferencia-da-anulacao]`);
  await page.waitForSelector(`${linha} input[name="__chave"][data-chave-de-comando="pronta"]`);
  await page.click(`${linha} button[type="submit"]`);
  await page.waitForSelector(`${linha} [data-resultado-da-acao="anular-empenho"]`, { timeout: 120000 });
  const anulacao = await prisma.empenho.findFirst({ where: { anulacaoParcialDeId: empenho?.id ?? "", numero: numeroAnulacao }, select: { id: true, valor: true } });
  conferir(anulacao?.valor.toFixed(2) === "1.00", `anulação parcial de 1,00 gravada pelo painel (${numeroAnulacao} sobre ${numeroEmpenho})`);

  console.log("2. a nota de estorno");
  await irPara(n, page, "/despesa/anulacoes?exercicio=2026");
  const href = await page.evaluate((id) => document.querySelector(`tr[data-anulacao-registrada="${id}"] a[data-acao="nota-de-estorno"]`)?.getAttribute("href") ?? null, anulacao?.id ?? "");
  conferir(href !== null, `a central de anulações oferece a nota (${href ?? "sem link"})`);
  const baixar = (u: string) =>
    page.evaluate(async (url) => {
      const r = await fetch(url);
      return { status: r.status, tipo: r.headers.get("content-type") ?? "", tamanho: (await r.arrayBuffer()).byteLength };
    }, `${n.base}${u}`);
  const pdf = href === null ? null : await baixar(href);
  conferir(pdf !== null && pdf.status === 200 && pdf.tipo.includes("pdf") && pdf.tamanho > 1000, `a nota responde um PDF (${JSON.stringify(pdf)})`);
  const errado = href === null ? null : await baixar(href.replace("tipo=empenho", "tipo=pagamento"));
  conferir(errado?.status === 404, `com o tipo errado, 404 (${String(errado?.status)})`);
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da nota de estorno completo.");
