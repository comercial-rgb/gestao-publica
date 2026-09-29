import "dotenv/config";
import { mkdirSync } from "node:fs";
import puppeteer, { type Page } from "puppeteer";

/**
 * PERCURSO DE NAVEGADOR — as tabelas da folha (V22): a tabela do IRRF de 2026 com a parcela a
 * deduzir da lei, e o cadastro recusando parcela que não fecha com as faixas.
 *
 * Uso: `npx tsx scripts/demonstracao/percurso-tabelas-da-folha.ts [base] [pasta-das-capturas]`.
 * ⚠️ NÃO GRAVA TABELA: só exercita a recusa (nada é gravado). Uma tabela nova entraria em vigor e
 * mudaria as folhas da demonstração.
 */

const BASE = process.argv[2] ?? "http://localhost:3011";
const PASTA = process.argv[3] ?? "capturas-v22";
if (/:3010\b/.test(BASE)) throw new Error("Recusado: a 3010 serve o banco da apresentação.");
const SENHA = process.env["SEED_ADMIN_SENHA"] ?? "";
if (SENHA === "") throw new Error("SEED_ADMIN_SENHA ausente.");

mkdirSync(PASTA, { recursive: true });
let passos = 0;
const falhas: string[] = [];
function afirmar(cond: boolean, oque: string): void {
  passos++;
  if (cond) console.log(`  ok   ${oque}`);
  else {
    console.log(`  FALHA ${oque}`);
    falhas.push(oque);
  }
}
const texto = (p: Page): Promise<string> => p.evaluate(() => document.body.innerText);

async function main(): Promise<void> {
  const navegador = await puppeteer.launch({ headless: true, args: ["--lang=pt-BR"] });
  try {
    const p = await navegador.newPage();
    await p.evaluateOnNewDocument("globalThis.__name = (f) => f;");
    await p.setViewport({ width: 1440, height: 900 });

    await p.goto(`${BASE}/login`, { waitUntil: "networkidle0", timeout: 120000 });
    await p.type('input[name="identificador"]', "admin@cg.pb.gov.br");
    await p.type('input[name="senha"]', SENHA);
    await p.click('button[type="submit"]');
    await p.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 120000 }).catch(() => undefined);
    afirmar(!p.url().includes("/login"), "a sessão abriu");

    console.log("1. a tabela do IRRF de 2026 traz a parcela a deduzir da lei");
    await p.goto(`${BASE}/folha/tabelas`, { waitUntil: "networkidle0", timeout: 180000 });
    const links = await p.$$eval('a[href^="/folha/tabelas/"]', (as) => as.map((a) => ({ href: a.getAttribute("href") ?? "", t: (a.closest("tr")?.textContent ?? a.textContent ?? "").replace(/\s+/g, " ") })));
    const irrf = links.find((l) => /IRRF|imposto de renda/i.test(l.t) && /2026-01/.test(l.t));
    afirmar(irrf !== undefined, `a lista tem a tabela do IRRF que começa em 2026-01 (${links.length} links)`);
    if (irrf !== undefined) {
      await p.goto(`${BASE}${irrf.href}`, { waitUntil: "networkidle0", timeout: 180000 });
      const d = await texto(p);
      afirmar(/27,50\s*%[\s\S]{0,60}parcela a deduzir 908,73/.test(d), "a faixa de 27,5% mostra a parcela a deduzir 908,73");
      afirmar(/redução de até 312,89/.test(d), "o redutor mostra o máximo da faixa isenta (312,89)");
      await p.screenshot({ path: `${PASTA}/tabelas-01-irrf-2026.png`, fullPage: true });
    }

    console.log("2. parcela que não fecha com as faixas é recusada, e nada é gravado");
    await p.goto(`${BASE}/folha/tabelas`, { waitUntil: "networkidle0", timeout: 180000 });
    const antes = await p.$$eval('a[href^="/folha/tabelas/"]', (as) => as.length);
    const form = 'form[data-acao="criar-tabela"]';
    await p.select(`${form} select[name="tipo"]`, "IRRF");
    await p.waitForSelector(`${form} input[name="faixas.1.parcelaADeduzir"]`, { timeout: 20000 });
    const campos: readonly [string, string][] = [
      ["competenciaInicio", "2099-01"], ["fundamentacaoLegal", "Percurso de teste — recusa esperada"], ["deducaoPorDependente", "189,59"],
      ["faixas.0.ate", "2.428,80"], ["faixas.0.aliquota", "0"],
      ["faixas.1.aliquota", "27,5"], ["faixas.1.parcelaADeduzir", "600,00"],
    ];
    for (const [nome, valor] of campos) await p.type(`${form} [name="${nome}"]`, valor, { delay: 5 });
    await p.waitForSelector(`${form} input[name="__chave"][data-chave-de-comando="pronta"]`, { timeout: 30000 });
    await p.$eval(`${form} button[type="submit"]`, (b) => (b as HTMLButtonElement).click());
    await new Promise((r) => setTimeout(r, 3500));
    const alerta = await p.$eval(`${form} [role="alert"]`, (a) => a.textContent ?? "").catch(() => "");
    afirmar(/parcela a deduzir não fecha/.test(alerta) && /faixa 2/.test(alerta), `a recusa nomeia a faixa (${alerta.slice(0, 160)})`);
    await p.screenshot({ path: `${PASTA}/tabelas-02-recusa-da-parcela.png`, fullPage: true });
    await p.reload({ waitUntil: "networkidle0", timeout: 180000 });
    const depois = await p.$$eval('a[href^="/folha/tabelas/"]', (as) => as.length);
    afirmar(depois === antes, `depois de recarregar, nenhuma tabela nova (${antes} → ${depois})`);
  } finally {
    await navegador.close();
  }
  console.log(`\n${passos - falhas.length}/${passos} passos`);
  if (falhas.length > 0) {
    console.log("FALHAS:\n" + falhas.map((f) => `  - ${f}`).join("\n"));
    process.exitCode = 1;
  }
}

await main();
