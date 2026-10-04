import "dotenv/config";
import puppeteer, { type Page } from "puppeteer";

/**
 * PERCURSO DE NAVEGADOR — V25: o dinheiro nas telas que somavam e imprimiam por `Number`. Só lê e digita:
 * nenhum formulário é enviado. Confere o valor em reais (1.234,56) nas listas, a soma das parcelas
 * digitadas (0,10 + 0,20 = 0,30, onde o ponto flutuante dava 0,30000000000000004) e a ausência de "NaN".
 *
 * Uso: `npx tsx scripts/demonstracao/percurso-dinheiro-nas-telas.ts [base]` (padrão http://localhost:3011).
 */

const BASE = process.argv[2] ?? "http://localhost:3011";
const SENHA = process.env["SEED_ADMIN_SENHA"] ?? "";
if (SENHA === "") throw new Error("SEED_ADMIN_SENHA ausente.");

let passos = 0;
const falhas: string[] = [];
const naoExecutados: string[] = [];
function afirmar(cond: boolean, oque: string): void {
  passos++;
  console.log(`  ${cond ? "ok  " : "FALHA"} ${oque}`);
  if (!cond) falhas.push(oque);
}
function pular(oque: string): void {
  naoExecutados.push(oque);
  console.log(`  NAO EXECUTADO ${oque}`);
}
const ir = (p: Page, rota: string): Promise<unknown> => p.goto(`${BASE}${rota}`, { waitUntil: "networkidle0", timeout: 180000 });
const texto = (p: Page): Promise<string> => p.evaluate(() => document.body.innerText);
const REAIS = /\d{1,3}(\.\d{3})*,\d{2}/;

/** Digita nas N primeiras caixas que casam com o seletor e devolve quantas havia. */
async function digitarEm(p: Page, seletor: string, valores: readonly string[]): Promise<number> {
  const campos = await p.$$(seletor);
  for (const [i, v] of valores.entries()) {
    const c = campos[i];
    if (c === undefined) break;
    await c.click({ count: 3 });
    await c.type(v, { delay: 10 });
  }
  await new Promise((r) => setTimeout(r, 800));
  return campos.length;
}

async function main(): Promise<void> {
  const b = await puppeteer.launch({ headless: true, args: ["--lang=pt-BR"] });
  try {
    const p = await b.newPage();
    await p.evaluateOnNewDocument("globalThis.__name = (f) => f;");
    await p.setViewport({ width: 1440, height: 900 });
    await ir(p, "/login");
    await p.type('input[name="identificador"]', "admin@cg.pb.gov.br");
    await p.type('input[name="senha"]', SENHA);
    await p.click('button[type="submit"]');
    await p.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 120000 }).catch(() => undefined);
    afirmar(!p.url().includes("/login"), "a sessão abriu");

    console.log("1. extraorçamentário: os saldos em reais");
    await ir(p, "/financeiro/extraorcamentario");
    const extra = await texto(p);
    afirmar(!/NaN/.test(extra) && REAIS.test(extra), "a tela mostra valores em reais e nenhum NaN");

    console.log("2. recolhimento: a lista e a soma das parcelas");
    await ir(p, "/financeiro/extraorcamentario/recolher");
    const lista = await texto(p);
    afirmar(!/NaN/.test(lista), "a lista das obrigações não tem NaN");
    const link = await p.$$eval('a[href*="/financeiro/extraorcamentario/recolher?tipo="]', (as) => (as[0] as HTMLAnchorElement | undefined)?.getAttribute("href") ?? "");
    if (link === "") {
      pular("não há obrigação com retenção a recolher neste banco");
    } else {
      await ir(p, link);
      const n = await digitarEm(p, 'input[name="parcela"]', ["0,10", "0,20"]);
      const t = await texto(p);
      if (n >= 2) afirmar(/Soma das parcelas: 0,30/.test(t), "0,10 + 0,20 somam 0,30");
      else afirmar(/Soma das parcelas: 0,10/.test(t), "uma parcela de 0,10 soma 0,10");
      afirmar(!/NaN|0,30000/.test(t), "nenhum NaN nem resto de ponto flutuante");
    }

    console.log("3. guia repartida: a soma e a diferença para o total");
    await ir(p, "/receita/arrecadacoes/distribuir");
    const nat = await p.$$eval('a[href*="/receita/arrecadacoes/distribuir?"][href*="natureza="]', (as) => (as[0] as HTMLAnchorElement | undefined)?.getAttribute("href") ?? "");
    if (nat === "") {
      pular("não há natureza de receita prevista para repartir neste banco");
    } else {
      await ir(p, nat);
      const caixas = await p.$$('form input[inputmode="decimal"]');
      if (caixas.length < 2) {
        pular("a natureza não tem fonte prevista para digitar");
      } else {
        // a primeira caixa é o total do depósito; as seguintes, as parcelas.
        await digitarEm(p, 'form input[inputmode="decimal"]', ["1000,00", "999,90"]);
        const t = await texto(p);
        afirmar(/Soma das parcelas: 999,90/.test(t), "a soma mostra 999,90");
        afirmar(/faltam 0,10 para atingir o total/.test(t), "a diferença mostra exatamente 0,10");
        afirmar(!/NaN/.test(t), "nenhum NaN");
      }
    }

    console.log("4. restos a pagar: os valores nas opções");
    await ir(p, "/despesa/restos-a-pagar");
    const resto = await p.$$eval('a[href^="/despesa/restos-a-pagar/"]', (as) => (as.map((a) => a.getAttribute("href") ?? "").find((h) => /\/despesa\/restos-a-pagar\/[^/?]+$/.test(h)) ?? ""));
    if (resto === "") {
      pular("não há resto a pagar inscrito neste banco");
    } else {
      await ir(p, resto);
      const t = await texto(p);
      afirmar(!/NaN/.test(t) && REAIS.test(t), "o detalhe do resto mostra reais e nenhum NaN");
    }

    console.log(`\n${String(passos - falhas.length)}/${String(passos)} passos${naoExecutados.length > 0 ? `, ${String(naoExecutados.length)} não executado(s)` : ""}`);
    if (falhas.length > 0) process.exitCode = 1;
  } finally {
    await b.close();
  }
}

await main();
