import "dotenv/config";
import { exigirDestinoDoPercurso } from "../destino-do-percurso.js";
import puppeteer, { type Browser, type Page } from "puppeteer";

/**
 * PERCURSO DE NAVEGADOR — V24: o FAP pela tela. O administrador cadastra; ele mesmo não consegue aprovar
 * (a recusa diz por quê); o usuário de aprovação dos encargos aprova; a lista mostra o FAP em uso.
 *
 * Uso: `npx tsx scripts/demonstracao/percurso-fap.ts [base] [ano]` (padrão http://localhost:3011, 2026).
 * GRAVA. Nunca contra a 3010. O aprovador é `aprovador-encargos@percursos.local`, com a senha dos
 * usuários por papel (`PERCURSOS_SENHA_PAPEIS`, ou a padrão de `percursos-usuarios-por-papel.ts`).
 */

const BASE = process.argv[2] ?? "http://localhost:3011";
// V39-R2 (R2-003): o destino e a natureza da base (declarada no banco) conferidos ANTES de qualquer credencial ou escrita.
await exigirDestinoDoPercurso(BASE);
const ANO = process.argv[3] ?? "2026";
if (/:3010\b/.test(BASE)) throw new Error("Recusado: a 3010 serve o banco da apresentação, e este percurso grava.");
const SENHA_ADMIN = process.env["SEED_ADMIN_SENHA"] ?? "";
const SENHA_PAPEIS = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";
if (SENHA_ADMIN === "") throw new Error("SEED_ADMIN_SENHA ausente.");

let passos = 0;
const falhas: string[] = [];
function afirmar(cond: boolean, oque: string): void {
  passos++;
  console.log(`  ${cond ? "ok  " : "FALHA"} ${oque}`);
  if (!cond) falhas.push(oque);
}
const esperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function entrar(b: Browser, quem: string, senha: string): Promise<Page> {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.evaluateOnNewDocument("globalThis.__name = (f) => f;");
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto(`${BASE}/login`, { waitUntil: "networkidle0", timeout: 180000 });
  await p.type('input[name="identificador"]', quem);
  await p.type('input[name="senha"]', senha);
  await p.click('button[type="submit"]');
  await p.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 120000 }).catch(() => undefined);
  afirmar(!p.url().includes("/login"), `${quem} entrou`);
  return p;
}

async function digitar(p: Page, alvo: string, valor: string): Promise<void> {
  await p.waitForSelector(alvo, { timeout: 20000 });
  await p.$eval(alvo, (e) => ((e as HTMLInputElement).value = ""));
  await p.focus(alvo);
  await p.keyboard.type(valor, { delay: 5 });
}

async function resultado(p: Page, form: string): Promise<{ tipo: string; texto: string }> {
  await esperar(5000);
  return p.evaluate((sel) => {
    const f = document.querySelector(sel);
    const a = f?.querySelector('[role="alert"]');
    if (a !== null && a !== undefined) return { tipo: "erro", texto: (a.textContent ?? "").trim() };
    const s = f?.querySelector('[role="status"]');
    return s !== null && s !== undefined ? { tipo: "ok", texto: (s.textContent ?? "").trim() } : { tipo: "silencio", texto: "" };
  }, form);
}

async function main(): Promise<void> {
  const b = await puppeteer.launch({ headless: true, args: ["--lang=pt-BR"] });
  try {
    console.log("1. o administrador cadastra o FAP do ano");
    const admin = await entrar(b, "admin@cg.pb.gov.br", SENHA_ADMIN);
    await admin.goto(`${BASE}/folha/encargos`, { waitUntil: "networkidle0", timeout: 180000 });
    afirmar(/Fator Acidentário de Prevenção/.test(await admin.evaluate(() => document.body.innerText)), "a tela dos encargos leva ao FAP");
    await admin.goto(`${BASE}/folha/encargos/fap`, { waitUntil: "networkidle0", timeout: 180000 });
    const f = 'form[data-acao="cadastrar-fap"]';
    await digitar(admin, `${f} input[name="ano"]`, ANO);
    await digitar(admin, `${f} input[name="fator"]`, "2,0001");
    await digitar(admin, `${f} input[name="fonte"]`, `Consulta ao FAP ${ANO} do CNPJ do ente em 10/01/${ANO}`);
    await admin.waitForSelector(`${f} input[name="__chave"][data-chave-de-comando="pronta"]`, { timeout: 30000 });
    await admin.$eval(`${f} button[type="submit"]`, (x) => (x as HTMLButtonElement).click());
    const fora = await resultado(admin, f);
    afirmar(fora.tipo === "erro" && /entre 0,5000 e 2,0000/.test(fora.texto), `FAP fora do intervalo é recusado com a regra (${fora.texto.slice(0, 90)})`);
    await admin.goto(`${BASE}/folha/encargos/fap`, { waitUntil: "networkidle0", timeout: 180000 });
    await digitar(admin, `${f} input[name="ano"]`, ANO);
    await digitar(admin, `${f} input[name="fator"]`, "1,2345");
    await digitar(admin, `${f} input[name="fonte"]`, `Consulta ao FAP ${ANO} do CNPJ do ente em 10/01/${ANO}`);
    await admin.waitForSelector(`${f} input[name="__chave"][data-chave-de-comando="pronta"]`, { timeout: 30000 });
    await admin.$eval(`${f} button[type="submit"]`, (x) => (x as HTMLButtonElement).click());
    const ok = await resultado(admin, f);
    afirmar(ok.tipo === "ok" && /aguardando a aprovação/.test(ok.texto), `FAP cadastrado, aguardando aprovação (${ok.texto.slice(0, 80)})`);

    console.log("2. quem cadastrou não aprova");
    await admin.goto(`${BASE}/folha/encargos/fap`, { waitUntil: "networkidle0", timeout: 180000 });
    const ap = `tr[data-fap-ano="${ANO}"] form[data-acao="aprovar-fap"]`;
    await admin.waitForSelector(`${ap} input[name="__chave"][data-chave-de-comando="pronta"]`, { timeout: 30000 });
    await admin.$eval(`${ap} button[type="submit"]`, (x) => (x as HTMLButtonElement).click());
    const auto = await resultado(admin, ap);
    afirmar(auto.tipo === "erro" && /AUTOAPROVACAO-DO-FAP/.test(auto.texto), `a autoaprovação é recusada com o motivo (${auto.texto.slice(0, 90)})`);

    console.log("3. o usuário de aprovação dos encargos aprova");
    const aprovador = await entrar(b, "aprovador-encargos@percursos.local", SENHA_PAPEIS);
    await aprovador.goto(`${BASE}/folha/encargos/fap`, { waitUntil: "networkidle0", timeout: 180000 });
    await aprovador.waitForSelector(`${ap} input[name="__chave"][data-chave-de-comando="pronta"]`, { timeout: 30000 });
    await aprovador.$eval(`${ap} button[type="submit"]`, (x) => (x as HTMLButtonElement).click());
    const aprovado = await resultado(aprovador, ap);
    afirmar(aprovado.tipo !== "erro", `a aprovação não foi recusada (${aprovado.texto.slice(0, 80)})`);
    await aprovador.goto(`${BASE}/folha/encargos/fap`, { waitUntil: "networkidle0", timeout: 180000 });
    const linha = await aprovador.$eval(`tr[data-fap-ano="${ANO}"]`, (tr) => tr.textContent ?? "");
    afirmar(/1,2345/.test(linha) && /Em uso na apuração/.test(linha) && /aprovador-encargos@percursos\.local/.test(linha), "a lista mostra o FAP 1,2345 em uso, aprovado por outra pessoa");

    console.log("4. o estabelecimento de uma lotação: CNPJ errado é recusado; o certo aparece na lista");
    await admin.goto(`${BASE}/folha/encargos/fap`, { waitUntil: "networkidle0", timeout: 180000 });
    const e = 'form[data-acao="registrar-estabelecimento"]';
    const lotacao = await admin.$eval(`${e} select[name="lotacaoId"]`, (x) => Array.from((x as HTMLSelectElement).options).find((o) => o.value !== "")?.value ?? "");
    afirmar(lotacao !== "", "há lotação para escolher");
    const preencher = async (cnpj: string): Promise<void> => {
      await admin.select(`${e} select[name="lotacaoId"]`, lotacao);
      await digitar(admin, `${e} input[name="cnpj"]`, cnpj);
      await admin.$eval(`${e} input[name="competenciaInicio"]`, (x, v) => {
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
        set.call(x, v);
        x.dispatchEvent(new Event("input", { bubbles: true }));
      }, `${ANO}-05`);
      await digitar(admin, `${e} input[name="fundamento"]`, "Fundo Municipal de Saúde, cadastro do estabelecimento no eSocial");
      await admin.waitForSelector(`${e} input[name="__chave"][data-chave-de-comando="pronta"]`, { timeout: 30000 });
      await admin.$eval(`${e} button[type="submit"]`, (x) => (x as HTMLButtonElement).click());
    };
    await preencher("11.222.333/0001-82");
    const errado = await resultado(admin, e);
    afirmar(errado.tipo === "erro" && /dígitos verificadores/.test(errado.texto), `CNPJ com dígito errado é recusado (${errado.texto.slice(0, 80)})`);
    await admin.goto(`${BASE}/folha/encargos/fap`, { waitUntil: "networkidle0", timeout: 180000 });
    await preencher("11.222.333/0001-81");
    const certo = await resultado(admin, e);
    afirmar(certo.tipo === "ok" && /Estabelecimento registrado/.test(certo.texto), `estabelecimento registrado (${certo.texto.slice(0, 60)})`);
    await admin.goto(`${BASE}/folha/encargos/fap`, { waitUntil: "networkidle0", timeout: 180000 });
    const est = await admin.$eval('tr[data-estabelecimento="11222333000181"]', (tr) => tr.textContent ?? "").catch(() => "");
    afirmar(est.includes(`05/${ANO}`) && /Fundo Municipal de Saúde/.test(est), `a lista mostra a lotação com o CNPJ, desde 05/${ANO}`);

    console.log(`\n${String(passos - falhas.length)}/${String(passos)} passos`);
    if (falhas.length > 0) process.exitCode = 1;
  } finally {
    await b.close();
  }
}

await main();
