import "dotenv/config";
import { mkdirSync } from "node:fs";
import puppeteer, { type Page } from "puppeteer";

/**
 * PERCURSO DE NAVEGADOR — a emissão do empenho da V22, de ponta a ponta, na aplicação servida.
 *
 * Uso: `npx tsx scripts/demonstracao/percurso-execucao-da-despesa.ts [base] [pasta-das-capturas]`
 * (padrão http://localhost:3011). Entra com o administrador (`SEED_ADMIN_SENHA`), e GRAVA: emite
 * um empenho de verdade a partir de uma ordem de compra. ⚠️ Nunca contra a 3010 (o banco da
 * apresentação) — ver `docs/lotes/V21-continuacao-em-maquina-nova.md`.
 *
 * Cada passo afirma o EFEITO na tela (o texto que aparece, o valor que o campo carrega, a linha que
 * entra na lista), não só que a página abriu.
 */

const BASE = process.argv[2] ?? "http://localhost:3011";
const PASTA = process.argv[3] ?? "capturas-v22";
if (/:3010\b/.test(BASE)) throw new Error("Recusado: a 3010 serve o banco da apresentação, e este percurso grava.");
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
const foto = (p: Page, nome: string): Promise<unknown> => p.screenshot({ path: `${PASTA}/${nome}.png`, fullPage: true });

/** Digita num combobox pelo rótulo, espera a opção que contém `trecho` e escolhe. */
async function escolherNoSeletor(p: Page, rotulo: string, busca: string, trecho: string): Promise<boolean> {
  const campo = await p.waitForSelector(`::-p-xpath(//label[normalize-space()="${rotulo}"]/following-sibling::input[@role="combobox"])`);
  if (campo === null) return false;
  await campo.click();
  await p.keyboard.down("Control");
  await p.keyboard.press("KeyA");
  await p.keyboard.up("Control");
  await p.keyboard.press("Backspace");
  await campo.type(busca, { delay: 30 });
  try {
    const op = await p.waitForSelector(`::-p-xpath(//li[@role="option"][contains(., "${trecho}")])`, { timeout: 15000 });
    await op?.click();
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const navegador = await puppeteer.launch({ headless: true, args: ["--lang=pt-BR"] });
  const p = await navegador.newPage();
  await p.setViewport({ width: 1440, height: 900 });

  console.log("1. entrada");
  await p.goto(`${BASE}/login`, { waitUntil: "networkidle0", timeout: 120000 });
  afirmar((await p.$('img[src="/marca/engine-horizontal-fundo-escuro.svg"]')) !== null, "a entrada assina com a marca Engine");
  await foto(p, "01-entrada");
  await p.type('input[name="identificador"]', "admin@cg.pb.gov.br");
  await p.type('input[name="senha"]', SENHA);
  await p.click('button[type="submit"]');
  await p.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 120000 }).catch(() => undefined);
  afirmar(!p.url().includes("/login"), `a sessão abriu (${p.url()})`);
  if (p.url().includes("/login")) throw new Error("Sem sessão, o resto do percurso afirmaria sobre a página de entrada.");

  console.log("2. empenhos — a ficha com o disponível em reais");
  await p.goto(`${BASE}/despesa/empenhos`, { waitUntil: "networkidle0", timeout: 180000 });
  const opcoesDaFicha = await p.$$eval('select[name="fichaId"] option', (os) => os.map((o) => o.textContent ?? ""));
  // ⚠️ N > 0 ANTES do "toda": sem fichas, o "every" passa por vacuidade — já passou uma vez, sobre a página errada.
  afirmar(opcoesDaFicha.length > 1, `o formulário oferece fichas (${opcoesDaFicha.length - 1})`);
  afirmar(opcoesDaFicha.length > 1 && opcoesDaFicha.slice(1).every((t) => /disponível R\$\s*[\d.]+,\d{2}/.test(t)), `toda ficha mostra "disponível R$ 0.000,00" (${opcoesDaFicha.length - 1} fichas)`);
  afirmar(!opcoesDaFicha.some((t) => /disponível \d+\.\d{2}\b/.test(t)), "nenhuma ficha mostra o valor cru (ex.: 10000.00)");
  const barra = await p.$eval('aside[data-superficie="grafite"]', (a) => getComputedStyle(a).backgroundColor).catch(() => "");
  afirmar(barra === "rgb(26, 26, 26)", `a barra lateral é grafite (${barra})`);

  console.log("3. a ordem de compra preenche o formulário");
  afirmar(await escolherNoSeletor(p, "Ordem de compra", "003", "OC 003/2026"), "digitar 003 filtra e oferece a OC 003/2026");
  await p.waitForFunction(() => (document.querySelector('textarea[name="historico"]') as HTMLTextAreaElement | null)?.value.includes("OC 003/2026") === true, { timeout: 15000 }).catch(() => undefined);
  const historico = await p.$eval('textarea[name="historico"]', (t) => (t as HTMLTextAreaElement).value);
  afirmar(historico.startsWith("Empenho referente à Ordem de Compra OC 003/2026"), `o histórico se autopreencheu: "${historico}"`);
  const fichaEscolhida = await p.$eval('select[name="fichaId"]', (s) => (s as HTMLSelectElement).value);
  afirmar(fichaEscolhida !== "", "a ficha da ordem foi selecionada");
  await p.waitForFunction(() => (document.querySelector('input[type="hidden"][name="credor"]') as HTMLInputElement | null)?.value === "26471983000138", { timeout: 15000 }).catch(() => undefined);
  const credor = await p.$eval('input[type="hidden"][name="credor"]', (i) => (i as HTMLInputElement).value);
  afirmar(credor === "26471983000138", `o credor da ordem veio conferido do cadastro (${credor})`);
  const valor = await p.$eval('input[type="hidden"][name="valor"]', (i) => (i as HTMLInputElement).value);
  afirmar(valor === "1140.00", `o valor da ordem veio para o campo (${valor})`);
  const sugestoes = await p.$$eval("[data-sugestoes-de-historico] button", (b) => b.length);
  afirmar(sugestoes >= 1, `há textos sugeridos para o histórico (${sugestoes})`);
  await foto(p, "02-empenho-preenchido-pela-ordem");

  console.log("4. o credor se busca por CPF/CNPJ");
  afirmar(await escolherNoSeletor(p, "Credor", "4172", "Papelaria Central"), "digitar 4172 lista a Papelaria Central Ltda");
  await foto(p, "03-credor-por-documento");
  afirmar(await escolherNoSeletor(p, "Credor", "2647", "Clínica Vida Saudável"), "e volta à Clínica pelo documento");

  console.log("5. emitir e ver na lista");
  const numero = `2026NE9${String(Date.now()).slice(-5)}`;
  await p.type('input[name="numero"]', numero);
  await p.$eval('input[name="data"]', (i) => {
    const el = i as HTMLInputElement;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    set?.call(el, "2026-09-28");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await p.select('select[name="categoria"]', "PRESTACAO_SERVICOS");
  await p.click('form[data-acao="empenhar"] button[type="submit"]');
  const resposta = await p
    .waitForSelector("[data-resultado-do-envio]", { timeout: 60000 })
    .then((el) => el?.evaluate((e) => `${e.getAttribute("data-resultado-do-envio") ?? ""}: ${e.textContent ?? ""}`));
  afirmar(resposta?.startsWith("sucesso:") === true, `a emissão foi aceita (${resposta ?? "sem resposta"})`);
  await p.goto(`${BASE}/despesa/empenhos`, { waitUntil: "networkidle0", timeout: 120000 });
  const naLista = await p.$(`::-p-xpath(//button[@aria-label="Abrir o empenho ${numero}"])`);
  afirmar(naLista !== null, `o empenho ${numero} está na lista depois de recarregar`);

  console.log("6. clicar no número abre o modal");
  await naLista?.click();
  const modal = await p.waitForSelector("dialog[open]", { timeout: 10000 }).catch(() => null);
  const textoDoModal = (await modal?.evaluate((d) => d.textContent ?? "")) ?? "";
  afirmar(textoDoModal.includes("Clínica Vida Saudável") && textoDoModal.includes("1.140,00"), "o modal mostra o credor pelo nome e o valor em reais");
  afirmar(textoDoModal.includes("Nota de Empenho (PDF)") && textoDoModal.includes("Imprimir") && textoDoModal.includes("dossiê"), "o modal oferece NE em PDF, impressão e o dossiê");
  await foto(p, "04-modal-do-empenho");
  await p.keyboard.press("Escape");

  console.log("7. exportar Excel");
  const href = await p.$eval('a[download][href*="/despesa/empenhos/xlsx"]', (a) => (a as HTMLAnchorElement).href);
  const xlsx = await p.evaluate(async (u) => {
    const r = await fetch(u);
    const b = new Uint8Array(await r.arrayBuffer());
    return { status: r.status, tipo: r.headers.get("content-type") ?? "", pk: b[0] === 0x50 && b[1] === 0x4b, tamanho: b.length };
  }, href);
  afirmar(xlsx.status === 200 && xlsx.tipo.includes("spreadsheetml") && xlsx.pk, `o Excel sai como .xlsx (${xlsx.status}, ${xlsx.tamanho} bytes)`);
  await foto(p, "05-lista-de-empenhos");

  await navegador.close();
  console.log(`\n${passos - falhas.length}/${passos} afirmações`);
  if (falhas.length > 0) process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
