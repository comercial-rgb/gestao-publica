import "dotenv/config";
import { entrar, irPara, lancarNavegadorDoPercurso, type Navegador } from "./percursos-navegador.js";
import type { Page } from "puppeteer";

/**
 * V36 — PERCURSO DOS FILTROS E DA ORDENAÇÃO DA CONCILIAÇÃO (TR 5.10.2.50 e 5.10.2.51), na base fictícia com extrato.
 *   1. ordem pelo valor, decrescente e crescente, nos dois lados (as linhas exibidas vêm na ordem pedida);
 *   2. filtro pelo valor de uma pendência do extrato: só as linhas com esse valor, sem sinal, e a soma das exibidas aparece
 *      ao lado da soma do motor, que não muda;
 *   3. valor ilegível é avisado e não esvazia a lista.
 *
 * Uso: BASE=http://localhost:3011 SEED_ADMIN_SENHA=... npx tsx scripts/percurso-v36-conciliacao-filtros.mts
 * SÓ LÊ.
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
const usuario = process.env["PERCURSO_USUARIO"] ?? "admin@cg.pb.gov.br";
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
const residuais = (page: Page, lista: string): Promise<number[]> =>
  page.$$eval(`[data-lista="${lista}"] tbody tr`, (rs) => rs.map((r) => Number(r.getAttribute("data-residual") ?? "NaN"))).catch(() => []);
const ordenado = (xs: readonly number[], sentido: 1 | -1): boolean => xs.every((x, i) => i === 0 || sentido * (x - (xs[i - 1] ?? 0)) >= 0);

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(120000);
  await entrar(n, page, usuario, senha);

  await irPara(n, page, "/financeiro/conciliacao?exercicio=2026");
  const internasSemFiltro = await residuais(page, "pendencias-internas");
  const extratoSemFiltro = await residuais(page, "pendencias-extrato");
  const somaDoMotor = await page.$eval('[data-lista="pendencias-extrato"] tfoot td:last-child', (e) => (e.textContent ?? "").trim()).catch(() => "");
  if (extratoSemFiltro.length < 2) throw new Error("A base fictícia precisa de ao menos duas pendências do extrato na conciliação.");

  for (const [ordem, sentido] of [["valor-desc", -1], ["valor-asc", 1]] as const) {
    await irPara(n, page, `/financeiro/conciliacao?exercicio=2026&ordem=${ordem}`);
    const i = await residuais(page, "pendencias-internas");
    const e = await residuais(page, "pendencias-extrato");
    conferir(i.length === internasSemFiltro.length && ordenado(i, sentido) && e.length === extratoSemFiltro.length && ordenado(e, sentido), `${ordem}: ${String(i.length)} internas e ${String(e.length)} do extrato, na ordem pedida`);
  }

  const alvo = Math.abs(extratoSemFiltro[0] ?? 0);
  const digitado = alvo.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  await irPara(n, page, `/financeiro/conciliacao?exercicio=2026&valor=${encodeURIComponent(digitado)}`);
  const so = await residuais(page, "pendencias-extrato");
  const esperadas = extratoSemFiltro.filter((x) => Math.abs(x) === alvo).length;
  const exibida = await page.$eval('[data-soma-exibida="pendencias-extrato"]', (e) => (e.textContent ?? "").trim()).catch(() => "");
  const motor = await page.$eval('[data-lista="pendencias-extrato"] tfoot td:last-child', (e) => (e.textContent ?? "").trim()).catch(() => "");
  conferir(
    so.length === esperadas && so.every((x) => Math.abs(x) === alvo) && exibida !== "" && motor.startsWith(somaDoMotor.slice(0, 8)),
    `valor ${digitado}: ${String(so.length)} linha(s) (esperadas ${String(esperadas)}), soma exibida ${exibida}; a soma do motor continua lá`
  );

  await irPara(n, page, "/financeiro/conciliacao?exercicio=2026&valor=mil");
  const aviso = await page.$eval("[data-valor-ignorado]", (e) => (e.textContent ?? "").trim()).catch(() => "");
  conferir(/não é um número e foi ignorado/.test(aviso) && (await residuais(page, "pendencias-extrato")).length === extratoSemFiltro.length, `valor ilegível: "${aviso}", lista inteira`);
} finally {
  await nav.close();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso dos filtros da conciliação completo.");
