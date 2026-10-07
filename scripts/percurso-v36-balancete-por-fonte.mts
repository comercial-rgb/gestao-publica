import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { balancetePorFonte } from "../modules/m12-relatorios/balancete-por-fonte.js";
import { fimDoDiaCivil, inicioDoDiaCivil } from "../packages/datas/index.js";
import { formatarMoeda } from "../lib/format/moeda.js";
import { entrar, irPara, lancarNavegadorDoPercurso, type Navegador } from "./percursos-navegador.js";

/**
 * V36 — PERCURSO DO BALANCETE POR FONTE DE RECURSOS (TR 5.10.1.111):
 *   o administrador abre o balancete por fonte do exercício; a linha de maior movimento da tela confere com o cálculo
 *   do domínio no mesmo banco; o formulário recorta por uma fonte e por um início de conta, e só as linhas dessa fonte e
 *   dessas contas ficam; a visão por fonte agrupa; o resumo da fonte confere; quem não consulta relatórios não abre.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 npx tsx scripts/percurso-v36-balancete-por-fonte.mts
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
const reais = (v: string): string => formatarMoeda(v).texto.replace(/\s/g, " ");

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  await entrar(n, page, "admin@cg.pb.gov.br", senha);

  const desde = "2026-01-01";
  const ate = "2026-12-31";
  const esperado = await balancetePorFonte(prisma, { desde: inicioDoDiaCivil(desde), ate: fimDoDiaCivil(ate) });
  const comFonte = esperado.linhas.filter((l) => /^\d{3}$/.test(l.fonte));
  if (comFonte.length === 0) throw new Error("a base não tem movimento com fonte em 2026");
  const maior = [...comFonte].sort((a, b) => Number(b.movimentoDebito) + Number(b.movimentoCredito) - (Number(a.movimentoDebito) + Number(a.movimentoCredito)))[0]!;

  // ── 1. o balancete do exercício, e a linha de maior movimento confere com o domínio ──
  await irPara(n, page, `/relatorios/livros/balancete-por-fonte?exercicio=2026&desde=${desde}&ate=${ate}`);
  const linhaTela = await page
    .$eval(`tr[data-linha-conta="${maior.conta}"][data-linha-fonte="${maior.fonte}"]`, (e) => (e as HTMLElement).innerText.replace(/\s+/g, " "))
    .catch(() => "");
  const totalLinhas = await page.$$eval("[data-tabela-balancete-por-fonte] tbody tr", (els) => els.length);
  conferir(
    totalLinhas === esperado.linhas.length && linhaTela.includes(reais(maior.movimentoDebito)) && linhaTela.includes(reais(maior.movimentoCredito)) && linhaTela.includes(reais(maior.saldoFinalDevedor === "0.00" ? maior.saldoFinalCredor : maior.saldoFinalDevedor)),
    `${String(totalLinhas)} linhas como no domínio (${String(esperado.linhas.length)}); ${maior.conta} na fonte ${maior.fonte}: "${linhaTela.slice(0, 160)}"`
  );

  // ── 2. o recorte por fonte e por início de conta, pelo formulário ──
  const prefixo = maior.conta.split(".").slice(0, 3).join(".");
  await page.$eval("form[data-form-balancete-por-fonte] input[name='contas']", (el, v) => ((el as HTMLInputElement).value = v), prefixo);
  await page.$eval("form[data-form-balancete-por-fonte] input[name='fontes']", (el, v) => ((el as HTMLInputElement).value = v), maior.fonte);
  await page.$eval("form[data-form-balancete-por-fonte] select[name='visao']", (el) => ((el as HTMLSelectElement).value = "fonte"));
  await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), page.$eval("form[data-form-balancete-por-fonte] button[type='submit']", (b) => (b as HTMLButtonElement).click())]);
  await page.waitForSelector("[data-tabela-balancete-por-fonte]");
  const recortadas = await page.$$eval("[data-tabela-balancete-por-fonte] tbody tr", (els) => els.map((e) => [e.getAttribute("data-linha-conta") ?? "", e.getAttribute("data-linha-fonte") ?? ""]));
  const esperadoRecorte = await balancetePorFonte(prisma, { desde: inicioDoDiaCivil(desde), ate: fimDoDiaCivil(ate), contas: [prefixo], fontes: [maior.fonte] });
  const url = new URL(page.url());
  conferir(
    recortadas.length === esperadoRecorte.linhas.length && recortadas.length > 0 && recortadas.every(([c, f]) => c.startsWith(prefixo) && f === maior.fonte) && url.searchParams.get("visao") === "fonte",
    `recorte "${prefixo}" na fonte ${maior.fonte}, organizado por fonte: ${String(recortadas.length)} linha(s), todas da fonte e das contas pedidas`
  );

  // ── 3. o resumo da fonte confere ──
  const resumoTela = await page.$eval(`tr[data-resumo-fonte="${maior.fonte}"]`, (e) => (e as HTMLElement).innerText.replace(/\s+/g, " ")).catch(() => "");
  const r = esperadoRecorte.resumo.find((x) => x.fonte === maior.fonte);
  conferir(r !== undefined && resumoTela.includes(reais(r.movimentoDebito)) && resumoTela.includes(reais(r.movimentoCredito)), `resumo da fonte ${maior.fonte}: "${resumoTela.slice(0, 160)}"`);

  // ── 4. negação ──
  const outra = await (await nav.createBrowserContext()).newPage();
  outra.setDefaultTimeout(120000);
  await entrar(n, outra, "atestador@ficticio.local", "Ficticio#2026");
  await outra.goto(`${n.base}/relatorios/livros/balancete-por-fonte?exercicio=2026`, { waitUntil: "domcontentloaded" });
  const destino = new URL(outra.url());
  const t = await outra.evaluate(() => document.body.innerText);
  const recusa = destino.pathname === "/sem-acesso" ? `sem-acesso ${destino.searchParams.get("acao") ?? ""}` : (/CONSULTAR_RELATORIOS/.exec(t)?.[0] ?? "");
  conferir(/CONSULTAR_RELATORIOS/.test(recusa) && (await outra.$("[data-tabela-balancete-por-fonte]")) === null, `sem consulta de relatórios: a tela não abre (${recusa})`);
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso do balancete por fonte completo.");
