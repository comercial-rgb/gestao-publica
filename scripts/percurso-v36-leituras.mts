import "dotenv/config";
import { entrar, irPara, lancarNavegadorDoPercurso, type Navegador } from "./percursos-navegador.js";

/**
 * V36 — PERCURSO DAS LEITURAS NOVAS (só leitura), na base fictícia de Esperança:
 *   1. /despesa/restos-a-pagar: o painel "antes de encerrar" lista os estimativos de 2026 com saldo (os do
 *      percurso de adiantamentos são estimativos) e leva à consistência anual;
 *   2. /contabilidade/lancamentos filtrado pela conta de bancos: os totais são DA CONTA, e a diferença não é zero
 *      (antes da correção, somava as contrapartidas e dava zero sempre);
 *   3. /relatorios/gerenciais com um vínculo inexistente: "Registro não encontrado", não a lista inteira.
 *
 * Uso: BASE=http://localhost:3011 SEED_ADMIN_SENHA=... npx tsx scripts/percurso-v36-leituras.mts
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
const usuario = process.env["PERCURSO_USUARIO"] ?? "admin@cg.pb.gov.br";
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const BANCOS = "1.1.1.1.1.19.00";
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

  await irPara(n, page, "/despesa/restos-a-pagar?exercicio=2026");
  const estimativos = await page.$$eval('[data-lista="estimativos-com-saldo"] tr[data-empenho]', (trs) => trs.map((t) => t.getAttribute("data-empenho") ?? ""));
  const consistencia = await page.$$eval('[data-painel="antes-de-encerrar"] a[href*="/relatorios/consistencia?escopo=ANUAL"]', (as) => as.length);
  conferir(estimativos.length > 0, `antes de encerrar: ${String(estimativos.length)} estimativo(s) com saldo (${estimativos.slice(0, 3).join(", ")})`);
  conferir(consistencia === 1, "o painel leva à consistência anual");
  const anular = await page.$$eval('[data-lista="estimativos-com-saldo"] form', (fs) => fs.length);
  conferir(anular === estimativos.length, "cada estimativo oferece a anulação do saldo ali mesmo");

  const t = await irPara(n, page, `/contabilidade/lancamentos?desde=2026-01-01&ate=2026-12-31&conta=${encodeURIComponent(BANCOS)}`);
  conferir(t.includes(`totais da conta ${BANCOS}`.toLowerCase()), "com filtro de conta, os totais são da conta");
  // O texto da tela vem em minúsculas: "totais da conta X no recorte ... patrimonial <débito> <crédito> <diferença>".
  const linha = t.slice(t.indexOf("totais da conta")).split("somadas só")[0] ?? "";
  const diferenca = (linha.match(/patrimonial\s+[\d.,-]+\s+[\d.,-]+\s+(-?[\d.]+,\d{2})/) ?? [])[1] ?? "";
  conferir(diferenca !== "" && diferenca !== "0,00", `a diferença da conta de bancos no ano é o movimento dela: ${diferenca}`);

  const g = await irPara(n, page, "/relatorios/gerenciais?exercicio=2026&convenio=registro-que-nao-existe");
  conferir(/registro não encontrado/i.test(g), "vínculo inexistente: 'Registro não encontrado', não a lista inteira");
} finally {
  await nav.close();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso das leituras completo.");
