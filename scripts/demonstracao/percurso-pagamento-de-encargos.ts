import "dotenv/config";
import puppeteer, { type Page } from "puppeteer";

/**
 * PERCURSO DE NAVEGADOR — V24: pagar pela tela a liquidação dos ENCARGOS da folha e ver, no livro de
 * lançamentos, a obrigação de encargos (e não fornecedores) sendo extinta.
 *
 * Uso: `npx tsx scripts/demonstracao/percurso-pagamento-de-encargos.ts [base] [liquidacao] [valor] [conta]`
 * (padrão http://localhost:3011, liquidação "206", 1040,00, obrigação 2.1.1.4.3.01.01). GRAVA: um
 * pagamento. Nunca contra a 3010.
 */

const BASE = process.argv[2] ?? "http://localhost:3011";
const LIQUIDACAO = process.argv[3] ?? "206";
const VALOR = process.argv[4] ?? "1040,00";
const OBRIGACAO = process.argv[5] ?? "2.1.1.4.3.01.01";
const FORNECEDORES = "2.1.3.1.1.01.01";
const DIA = "2026-09-26";
if (/:3010\b/.test(BASE)) throw new Error("Recusado: a 3010 serve o banco da apresentação, e este percurso grava.");
const SENHA = process.env["SEED_ADMIN_SENHA"] ?? "";
if (SENHA === "") throw new Error("SEED_ADMIN_SENHA ausente.");

let passos = 0;
const falhas: string[] = [];
function afirmar(cond: boolean, oque: string): void {
  passos++;
  console.log(`  ${cond ? "ok  " : "FALHA"} ${oque}`);
  if (!cond) falhas.push(oque);
}
const ir = (p: Page, rota: string): Promise<unknown> => p.goto(`${BASE}${rota}`, { waitUntil: "networkidle0", timeout: 180000 });
async function digitar(p: Page, alvo: string, valor: string): Promise<void> {
  await p.waitForSelector(alvo, { timeout: 20000 });
  await p.$eval(alvo, (e) => ((e as HTMLInputElement).value = ""));
  await p.focus(alvo);
  await p.keyboard.type(valor, { delay: 5 });
}
/** As linhas do livro de lançamentos que trazem a conta e o valor, no dia. */
async function linhasDoLivro(p: Page, conta: string): Promise<string> {
  await ir(p, `/contabilidade/lancamentos?conta=${encodeURIComponent(conta)}&desde=${DIA}&ate=${DIA}`);
  return p.evaluate(() => document.body.innerText);
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

    console.log("1. pagar a liquidação dos encargos pela tela");
    await ir(p, "/despesa/pagamentos");
    const f = 'form[data-acao="pagar"]';
    const id = await p.$eval(`${f} select[name="liquidacaoId"]`, (s, n) => Array.from((s as HTMLSelectElement).options).find((o) => o.textContent?.includes(` · ${n} · `))?.value ?? "", LIQUIDACAO);
    afirmar(id !== "", `a liquidação ${LIQUIDACAO} está na fila`);
    await p.select(`${f} select[name="liquidacaoId"]`, id);
    await digitar(p, `${f} input[name="numero"]`, "9024002");
    await digitar(p, `${f} input[inputmode="decimal"]`, VALOR);
    await p.$eval(`${f} input[name="data"]`, (e, v) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(e, v);
      e.dispatchEvent(new Event("input", { bubbles: true }));
      e.dispatchEvent(new Event("change", { bubbles: true }));
    }, DIA);
    const conta = await p.$eval(`${f} select[name="contaBancaria"]`, (s) => Array.from((s as HTMLSelectElement).options).find((o) => o.value !== "")?.value ?? "");
    await p.select(`${f} select[name="contaBancaria"]`, conta);
    await digitar(p, `${f} input[name="historico"]`, "Recolhimento dos encargos patronais da folha");
    if ((await p.$(`${f} select[name="hipotese"]`)) !== null) {
      await p.select(`${f} select[name="hipotese"]`, "V_ATIVIDADE_FINALISTICA");
      await digitar(p, `${f} input[name="autorizadoPor"]`, "Secretario de Financas");
      await digitar(p, `${f} textarea[name="justificativa"]`, "Encargos da folha com vencimento legal antes dos demais credores");
    }
    await p.waitForSelector(`${f} input[name="__chave"][data-chave-de-comando="pronta"]`, { timeout: 30000 });
    await p.$eval(`${f} button[type="submit"]`, (x) => (x as HTMLButtonElement).click());
    await new Promise((r) => setTimeout(r, 6000));
    const r = await p.evaluate((sel) => {
      const form = document.querySelector(sel);
      const erro = form?.querySelector(':scope > p[role="alert"]');
      if (erro !== null && erro !== undefined) return { ok: false, texto: (erro.textContent ?? "").trim() };
      const ok = Array.from(form?.querySelectorAll(":scope > p") ?? []).find((x) => /status-ok/.test(x.className));
      return { ok: ok !== undefined, texto: (ok?.textContent ?? "").trim() };
    }, f);
    afirmar(r.ok && /registrado/.test(r.texto), `o pagamento foi registrado (${r.texto.slice(0, 100)})`);

    console.log("2. o livro de lançamentos mostra a obrigação de encargos extinta, e não fornecedores");
    const obrigacao = await linhasDoLivro(p, OBRIGACAO);
    afirmar(obrigacao.includes(VALOR), `a conta ${OBRIGACAO} tem o movimento de ${VALOR} no dia`);
    const fornecedores = await linhasDoLivro(p, FORNECEDORES);
    afirmar(!fornecedores.includes(VALOR), `a conta de fornecedores ${FORNECEDORES} não recebeu ${VALOR} no dia`);
    await p.screenshot({ path: "capturas-v24-encargos.png", fullPage: true });

    console.log(`\n${String(passos - falhas.length)}/${String(passos)} passos`);
    if (falhas.length > 0) process.exitCode = 1;
  } finally {
    await b.close();
  }
}

await main();
