import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { diaCivil } from "../packages/datas/index.js";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import { entrar, irPara, lancarNavegadorDoPercurso, type Navegador } from "./percursos-navegador.js";

/**
 * V39-R2 — CORREÇÃO, PELA TELA: anula (estorno integral, append-only) um pagamento gravado por engano numa conta que a
 * rodada manda manter sem movimento novo. O número do pagamento vem de PERCURSO_PAGAMENTO; o motivo diz o porquê.
 * GRAVA (base de demonstração ou ensaio, conferida pelo `entrar`): a anulação.
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação; este percurso grava.");
await exigirDestinoDoPercurso(n.base);
const prisma = criarPrismaClient(process.env["PERCURSO_BANCO"] ?? process.env["DATABASE_URL"] ?? "");
const numero = process.env["PERCURSO_PAGAMENTO"] ?? "";
if (numero === "") throw new Error("PERCURSO_PAGAMENTO ausente.");
const pag = await prisma.pagamento.findFirst({ where: { numero, estornoDeId: null }, select: { id: true, valor: true, estornos: { select: { id: true } } } });
if (pag === null) throw new Error(`Pagamento ${numero} não encontrado.`);
if (pag.estornos.length > 0) throw new Error(`Pagamento ${numero} já anulado.`);

const nav = await lancarNavegadorDoPercurso();
let ok = false;
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(300000);
  await entrar(n, page, process.env["PERCURSO_USUARIO"] ?? "admin@cg.pb.gov.br", process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "");
  await irPara(n, page, "/despesa/pagamentos");
  const F = `form[data-acao="anular-pagamento"]:has(input[name="id"][value="${pag.id}"])`;
  await page.waitForSelector(F);
  await page.$eval(F, (f) => { const d = f.closest("details"); if (d !== null) (d as HTMLDetailsElement).open = true; f.scrollIntoView({ block: "center" }); });
  await page.$eval(`${F} input[name="motivo"]`, (e) => (e as HTMLInputElement).focus());
  await page.keyboard.type("Pagamento gravado por engano na conta da Câmara; a conta segue sem movimento nesta rodada", { delay: 2 });
  await page.$eval(`${F} input[name="data"]`, (e, v) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    set?.call(e, v);
    e.dispatchEvent(new Event("input", { bubbles: true }));
    e.dispatchEvent(new Event("change", { bubbles: true }));
  }, diaCivil(new Date()));
  if ((await page.$eval(`${F} input[name="numero"]`, (e) => (e as HTMLInputElement).value)) === "") {
    await page.$eval(`${F} input[name="numero"]`, (e) => (e as HTMLInputElement).focus());
    await page.keyboard.type(`7${String(Date.now()).slice(-6)}`);
  }
  const invalidos = await page.$eval(F, (f) => Array.from(f.querySelectorAll("input")).filter((i) => !(i as HTMLInputElement).checkValidity()).map((i) => (i as HTMLInputElement).name));
  if (invalidos.length > 0) console.log(`campos inválidos: ${invalidos.join(", ")}`);
  await page.$eval(F, (f) => Array.from(f.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Conferir")?.click());
  await page.waitForSelector(`${F} [data-conferencia-da-anulacao]`, { timeout: 30000 });
  console.log(`conferência: ${(await page.$eval(`${F} [data-conferencia-da-anulacao]`, (e) => (e.textContent ?? "").replace(/\s+/g, " "))).slice(0, 200)}`);
  await page.$eval(`${F} button[type="submit"]`, (b) => (b as HTMLButtonElement).click());
  await page.waitForSelector(`${F} [data-resultado-da-acao="anular-pagamento"]`, { timeout: 120000 });
  console.log(`resultado: ${(await page.$eval(`${F} [data-resultado-da-acao="anular-pagamento"]`, (e) => (e.textContent ?? "").trim())).slice(0, 200)}`);
  const depois = await prisma.pagamento.findUniqueOrThrow({ where: { id: pag.id }, select: { estornos: { select: { valor: true } } } });
  ok = depois.estornos.length === 1 && depois.estornos[0]!.valor.toFixed(2) === pag.valor.toFixed(2);
  console.log(`${ok ? "ok " : "FALHA"} pagamento ${numero} anulado por estorno integral de ${pag.valor.toFixed(2)}`);
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (!ok) process.exitCode = 1;
