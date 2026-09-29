import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer, { type Page } from "puppeteer";

/**
 * PERCURSO DE NAVEGADOR — a Lei Orçamentária Anual (V22, M02b), na aplicação servida.
 *
 * Uso: `npx tsx scripts/demonstracao/percurso-lei-orcamentaria.ts [base] [pasta-das-capturas]`
 * (padrão http://localhost:3011). GRAVA: cadastra o projeto da LOA de um exercício livre (a partir
 * de 2030, o primeiro que ainda não tem LOA), recusa a publicação antes da sanção, registra a lei,
 * anexa um PDF e confere tudo depois de recarregar. ⚠️ Nunca contra a 3010.
 *
 * Cada passo afirma o EFEITO (a linha na lista, o selo, o dado no detalhe, o anexo na aba), não só
 * que a página abriu.
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
const texto = (p: Page): Promise<string> => p.evaluate(() => document.body.innerText);

/** Preenche e envia um formulário do molde pelo `data-acao`; devolve o que o servidor respondeu. */
async function enviar(p: Page, acao: string, campos: Readonly<Record<string, string>>): Promise<{ readonly tipo: "ok" | "erro" | "silencio"; readonly texto: string }> {
  const form = `form[data-acao="${acao}"]`;
  await p.waitForSelector(form, { timeout: 30000 });
  for (const [nome, valor] of Object.entries(campos)) {
    const sel = `${form} [name="${nome}"]`;
    await p.waitForSelector(sel, { timeout: 20000 });
    const tipo = await p.$eval(sel, (e) => (e as HTMLInputElement).type);
    if (tipo === "date") {
      await p.$eval(sel, (e, v) => {
        (e as HTMLInputElement).value = v;
        e.dispatchEvent(new Event("input", { bubbles: true }));
        e.dispatchEvent(new Event("change", { bubbles: true }));
      }, valor);
      continue;
    }
    await p.click(sel, { count: 3 });
    await p.keyboard.press("Backspace");
    await p.type(sel, valor, { delay: 5 });
  }
  await p.waitForSelector(`${form} input[name="__chave"][data-chave-de-comando="pronta"]`, { timeout: 30000 });
  await p.$eval(`${form} button[type="submit"]`, (b) => (b as HTMLButtonElement).click());
  await new Promise((r) => setTimeout(r, 3500));
  return p.evaluate((sel) => {
    const f = document.querySelector(sel);
    const alerta = f?.querySelector('[role="alert"]') ?? null;
    if (alerta !== null) return { tipo: "erro" as const, texto: (alerta.textContent ?? "").trim() };
    const bom = Array.from(f?.querySelectorAll("p") ?? []).find((x) => x.className.includes("status-ok"));
    return bom !== undefined ? { tipo: "ok" as const, texto: (bom.textContent ?? "").trim() } : { tipo: "silencio" as const, texto: "" };
  }, form);
}

async function main(): Promise<void> {
  const navegador = await puppeteer.launch({ headless: true, args: ["--lang=pt-BR"] });
  try {
    const p = await navegador.newPage();
    await p.evaluateOnNewDocument("globalThis.__name = (f) => f;");
    await p.setViewport({ width: 1440, height: 900 });

    console.log("1. entrada");
    await p.goto(`${BASE}/login`, { waitUntil: "networkidle0", timeout: 120000 });
    await p.type('input[name="identificador"]', "admin@cg.pb.gov.br");
    await p.type('input[name="senha"]', SENHA);
    await p.click('button[type="submit"]');
    await p.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 120000 }).catch(() => undefined);
    afirmar(!p.url().includes("/login"), "a sessão abriu");
    if (p.url().includes("/login")) throw new Error("Sem sessão.");

    console.log("2. o menu do planejamento leva à tela");
    await p.goto(`${BASE}/planejamento`, { waitUntil: "networkidle0", timeout: 180000 });
    afirmar((await p.$('a[href="/planejamento/leis-orcamentarias"]')) !== null, "o planejamento oferece o projeto e a lei da LOA");
    await p.goto(`${BASE}/planejamento/leis-orcamentarias`, { waitUntil: "networkidle0", timeout: 180000 });
    const lista = await texto(p);
    afirmar(/Leis orçamentárias anuais/.test(lista), "a lista abre com o título");
    const usados = new Set([...lista.matchAll(/\b(20\d\d)\b/g)].map((m) => Number(m[1])));
    let exercicio = 2030;
    while (usados.has(exercicio)) exercicio++;
    const projeto = `PL ${exercicio - 2029}/${exercicio - 1}`;

    console.log(`3. cadastrar o projeto da LOA ${exercicio}`);
    const r1 = await enviar(p, "criar-leis-orcamentarias", {
      exercicio: String(exercicio),
      numeroDoProjeto: projeto,
      dataDoEnvio: `${exercicio - 1}-09-30`,
      ementa: `Estima a receita e fixa a despesa do Município para o exercício de ${exercicio}.`,
    });
    afirmar(r1.tipo === "ok" && r1.texto.includes(String(exercicio)), `o servidor aceitou o projeto (${r1.tipo}: ${r1.texto})`);
    const r1b = await enviar(p, "criar-leis-orcamentarias", {
      exercicio: String(exercicio), numeroDoProjeto: "PL 999", dataDoEnvio: `${exercicio - 1}-10-01`, ementa: "Segunda LOA do mesmo exercício.",
    });
    afirmar(r1b.tipo === "erro" && /Já existe a LOA de \d{4}/.test(r1b.texto), `a segunda LOA do mesmo exercício é recusada com o motivo (${r1b.texto})`);
    await p.goto(`${BASE}/planejamento/leis-orcamentarias?q=${exercicio}`, { waitUntil: "networkidle0", timeout: 180000 });
    const linha = await texto(p);
    afirmar(linha.includes(projeto) && /aguardando aprova/.test(linha), "depois de recarregar, a lista traz o projeto aguardando aprovação");
    await foto(p, "loa-01-lista");
    const href = await p.$eval(`::-p-xpath(//a[normalize-space()="${exercicio}"])`, (a) => (a as HTMLAnchorElement).getAttribute("href") ?? "").catch(() => "");
    afirmar(/^\/planejamento\/leis-orcamentarias\/\w+/.test(href), `o exercício leva ao detalhe (${href})`);
    if (href === "") throw new Error("Sem link para o detalhe.");

    console.log("4. registrar a lei aprovada");
    await p.goto(`${BASE}${href}`, { waitUntil: "networkidle0", timeout: 180000 });
    afirmar(/Projeto de lei/.test(await texto(p)), "o detalhe mostra o projeto");
    const botao = await p.$('::-p-xpath(//button[contains(normalize-space(.), "Registrar a lei aprovada")])');
    if (botao !== null && (await p.$('form[data-acao="registrar-aprovacao"]')) === null) await botao.click();
    const errado = await enviar(p, "registrar-aprovacao", {
      numeroDaLei: `${exercicio - 2025}.100/${exercicio - 1}`, dataDaSancao: `${exercicio - 1}-12-18`, dataDaPublicacao: `${exercicio - 1}-12-17`, veiculoDePublicacao: "Diário Oficial do Município",
    });
    afirmar(errado.tipo === "erro" && /publicação .* anterior à sanção/.test(errado.texto), `publicação antes da sanção é recusada com as datas (${errado.texto})`);
    const lei = `${exercicio - 2025}.100/${exercicio - 1}`;
    const r2 = await enviar(p, "registrar-aprovacao", {
      numeroDaLei: lei, dataDaSancao: `${exercicio - 1}-12-18`, dataDaPublicacao: `${exercicio - 1}-12-19`, veiculoDePublicacao: "Diário Oficial do Município",
    });
    afirmar(r2.tipo === "ok", `a lei foi registrada (${r2.tipo}: ${r2.texto})`);
    await p.reload({ waitUntil: "networkidle0", timeout: 180000 });
    const detalhe = await texto(p);
    afirmar(detalhe.includes(`Lei ${lei}`) && /lei aprovada e publicada/.test(detalhe), "depois de recarregar, o detalhe traz a lei e o selo de aprovada");
    afirmar(/19\/12\/\d{4}/.test(detalhe) && /18\/12\/\d{4}/.test(detalhe), "sanção e publicação aparecem em dia/mês/ano");
    afirmar((await p.$('form[data-acao="registrar-aprovacao"]')) === null && detalhe.includes("já está registrada"), "com a lei registrada, a tela deixa de oferecer o registro e diz por quê");
    await foto(p, "loa-02-detalhe");

    console.log("5. anexar a lei publicada");
    await p.goto(`${BASE}${href}?aba=anexos`, { waitUntil: "networkidle0", timeout: 180000 });
    const pdf = join(PASTA, `lei-${exercicio}.pdf`);
    writeFileSync(pdf, `%PDF-1.4\n% Lei ${lei} - percurso de teste\n%%EOF\n`);
    const campo = await p.waitForSelector('form[data-acao="anexar"] input[type="file"]', { timeout: 30000 });
    await (campo as unknown as { uploadFile(c: string): Promise<void> }).uploadFile(pdf);
    await p.waitForSelector('form[data-acao="anexar"] input[name="__chave"][data-chave-de-comando="pronta"]', { timeout: 30000 });
    await p.$eval('form[data-acao="anexar"] button[type="submit"]', (b) => (b as HTMLButtonElement).click());
    await new Promise((r) => setTimeout(r, 4000));
    await p.reload({ waitUntil: "networkidle0", timeout: 180000 });
    const anexos = await texto(p);
    afirmar(anexos.includes(`lei-${exercicio}.pdf`), "depois de recarregar, o PDF aparece na aba de anexos");
    const link = await p.$eval(`::-p-xpath(//a[contains(., "lei-${exercicio}.pdf")])`, (a) => (a as HTMLAnchorElement).href).catch(() => "");
    if (link !== "") {
      const status = await p.evaluate(async (u) => (await fetch(u)).status, link);
      afirmar(status === 200, `o download do anexo responde 200 (${status})`);
    } else afirmar(false, "o anexo tem link de download");
    await foto(p, "loa-03-anexos");
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
