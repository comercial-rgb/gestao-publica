import type { Page } from "puppeteer";

/**
 * OS AJUDANTES DE NAVEGADOR DOS PERCURSOS NOVOS (V6.2) — um lugar só.
 *
 * ⚠️ `PERCURSOS-SEM-HELPER-COMUM`: dez cópias de `preencherEEnviar`, cinco das quais perderam o ramo
 * do campo de data. Os percursos ANTIGOS continuam com as suas cópias (migrá-los todos de uma vez
 * mudaria vinte arquivos que hoje passam); os percursos NOVOS desta rodada — ficha pela tela,
 * encargos da folha e os serviços do P3 — nascem daqui, e a pendência encolhe em vez de crescer.
 *
 * O corpo é o do `smoke-atesto-da-folha.ts` (o mais recente e o que já passou pelos cinco papéis),
 * com a base como parâmetro e o campo referenciado (`CampoReferenciado`) acrescentado.
 */

export interface Navegador {
  readonly base: string;
}

export interface CampoDoPercurso {
  readonly sel: string;
  readonly valor: string;
  readonly tipo?: "select" | "data" | "marcar" | "referencia" | "arquivo";
  readonly indice?: number;
  /** Para `referencia`: o texto a buscar; o valor é o `data-valor` da opção a escolher ("" = a primeira). */
  readonly busca?: string;
}

export interface Resposta {
  readonly tipo: "ok" | "erro" | "silencio";
  readonly texto: string;
}

const espera = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function texto(page: Page): Promise<string> {
  const bruto = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
  return bruto.toLowerCase();
}

export async function entrar(n: Navegador, page: Page, usuario: string, senha: string): Promise<void> {
  await page.goto(`${n.base}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('button[type="submit"]', { timeout: 60000 });
  await page.type('input[name="identificador"]', usuario);
  await page.type('input[name="senha"]', senha);
  const enviou = await page.evaluate(() => {
    const f = document.querySelector("form");
    if (!(f instanceof HTMLFormElement)) return "não achei o formulário de login";
    if (!f.checkValidity()) return "o formulário de login não passou na validação do navegador";
    f.requestSubmit();
    return "";
  });
  if (enviou !== "") throw new Error(enviou);
  for (let i = 0; i < 120; i += 1) {
    await espera(500);
    if (!page.url().includes("/login")) return;
  }
  throw new Error(`login de ${usuario} não passou (ainda em ${page.url()}).`);
}

export async function sair(n: Navegador, page: Page): Promise<void> {
  await page.goto(`${n.base}/`, { waitUntil: "networkidle2" });
  await page.evaluate(() => {
    const f = Array.from(document.querySelectorAll("form")).find((x) => x.querySelector('button[title="Sair"]'));
    f?.requestSubmit();
  });
  for (let i = 0; i < 60; i += 1) {
    await espera(500);
    if (page.url().includes("/login")) return;
  }
  throw new Error("sair não voltou ao login");
}

export async function irPara(n: Navegador, page: Page, rota: string): Promise<string> {
  let resposta = null;
  for (let tentativa = 1; ; tentativa += 1) {
    try {
      resposta = await page.goto(`${n.base}${rota}`, { waitUntil: "networkidle2" });
      break;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (tentativa >= 3 || !/ERR_CONNECTION_RESET|ERR_CONNECTION_REFUSED|ERR_EMPTY_RESPONSE/.test(msg)) throw e;
      await espera(8000);
    }
  }
  const status = resposta?.status() ?? 0;
  if (status !== 200) throw new Error(`${rota} respondeu ${status}`);
  if (page.url().includes("/login")) throw new Error(`${rota} devolveu ao login`);
  return texto(page);
}

/** A rota recusa quem não pode: redireciona para /sem-acesso ou /login, ou mostra a recusa. */
export async function barrado(n: Navegador, page: Page, rota: string): Promise<{ readonly barrado: boolean; readonly url: string; readonly status: number }> {
  const r = await page.goto(`${n.base}${rota}`, { waitUntil: "networkidle2" });
  const url = page.url();
  const corpo = await texto(page);
  return { barrado: url.includes("/sem-acesso") || url.includes("/login") || /acesso negado|não tem a ação|sem acesso|não está no seu acesso/.test(corpo) || (r?.status() ?? 0) === 404, url, status: r?.status() ?? 0 };
}

export async function hrefDoRegistro(page: Page, trecho: string): Promise<string | null> {
  return page.evaluate((t) => {
    const a = Array.from(document.querySelectorAll("tbody a, main a")).find((x) => (x.textContent ?? "").includes(t)) as HTMLAnchorElement | undefined;
    if (a === undefined) return null;
    const u = new URL(a.href);
    return `${u.pathname}${u.search}`;
  }, trecho);
}

/** GET autenticado pela sessão do navegador — para provar a resposta de uma rota de dados. */
export async function buscarJson(page: Page, url: string): Promise<{ readonly status: number; readonly corpo: unknown }> {
  return page.evaluate(async (u) => {
    const r = await fetch(u, { headers: { accept: "application/json" }, cache: "no-store" });
    let corpo: unknown = null;
    try {
      corpo = await r.json();
    } catch {
      corpo = null;
    }
    return { status: r.status, corpo };
  }, url);
}

/** Escolhe uma opção de um `CampoReferenciado`: digita, espera a lista do servidor, clica. */
async function escolherReferencia(page: Page, form: string, campo: CampoDoPercurso): Promise<void> {
  const raiz = `${form} [data-seletor]:has(input[type="hidden"][name="${campo.sel}"])`;
  await page.waitForSelector(`${raiz} input[role="combobox"]`, { timeout: 30000 });
  const combo = await page.$(`${raiz} input[role="combobox"]`);
  if (combo === null) throw new Error(`seletor referenciado "${campo.sel}" não encontrado`);
  await combo.click({ count: 3 });
  await page.keyboard.press("Backspace");
  if ((campo.busca ?? "") !== "") await combo.type(campo.busca ?? "", { delay: 10 });
  const opcao = campo.valor === "" ? `${raiz} [role="option"]` : `${raiz} [role="option"][data-valor="${campo.valor}"]`;
  await page.waitForSelector(opcao, { timeout: 20000 });
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    el?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  }, opcao);
  for (let i = 0; i < 20; i += 1) {
    const v = await page.$eval(`${raiz} input[type="hidden"][name="${campo.sel}"]`, (el) => (el as HTMLInputElement).value);
    if (v !== "") return;
    await espera(150);
  }
  throw new Error(`a escolha em "${campo.sel}" não chegou ao campo escondido`);
}

export async function preencherEEnviar(page: Page, acao: string, campos: readonly CampoDoPercurso[]): Promise<Resposta> {
  const form = acao.startsWith("form[") ? acao : `form[data-acao="${acao}"]`;
  await page.waitForSelector(form, { timeout: 30000 });
  for (const campo of campos) {
    if (campo.tipo === "referencia") {
      await escolherReferencia(page, form, campo);
      continue;
    }
    const seletor = `${form} ${campo.sel}`;
    await page.waitForSelector(seletor, { timeout: 30000 });
    const alvo = (await page.$$(seletor))[campo.indice ?? 0];
    if (alvo === undefined) throw new Error(`"${seletor}" não casou o elemento de índice ${campo.indice ?? 0}`);
    if (campo.tipo === "arquivo") {
      await (alvo as unknown as { uploadFile(p: string): Promise<void> }).uploadFile(campo.valor);
      continue;
    }
    if (campo.tipo === "marcar") {
      await page.evaluate((sel, i, marcar) => {
        const el = document.querySelectorAll(sel)[i];
        if (!(el instanceof HTMLInputElement)) return;
        el.checked = marcar === "sim";
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }, seletor, campo.indice ?? 0, campo.valor);
      continue;
    }
    if (campo.tipo === "select") {
      await alvo.select(campo.valor);
      await espera(300);
      continue;
    }
    if (campo.tipo === "data") {
      await page.evaluate((sel, i, valor) => {
        const el = document.querySelectorAll(sel)[i];
        if (!(el instanceof HTMLInputElement)) return;
        el.value = valor;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }, seletor, campo.indice ?? 0, campo.valor);
      continue;
    }
    await alvo.click({ count: 3 });
    await page.keyboard.press("Backspace");
    await alvo.type(campo.valor, { delay: 5 });
  }
  const temChave = (await page.$(`${form} input[name="__chave"]`)) !== null;
  if (temChave) await page.waitForSelector(`${form} input[name="__chave"][data-chave-de-comando="pronta"]`, { timeout: 30000 });
  const enviou = await page.evaluate((sel) => {
    const f = document.querySelector(sel);
    const botao = f?.querySelector('button[type="submit"]');
    if (!(botao instanceof HTMLButtonElement)) return false;
    botao.click();
    return true;
  }, form);
  if (!enviou) throw new Error(`não achei o botão de envio de "${acao}"`);
  let resposta: Resposta = { tipo: "silencio", texto: "" };
  for (let i = 0; i < 40 && resposta.tipo === "silencio"; i += 1) {
    await espera(500);
    resposta = await page.evaluate((sel) => {
      const f = document.querySelector(sel);
      const alerta = f?.querySelector('[role="alert"]');
      if (alerta !== null && alerta !== undefined && (alerta.textContent ?? "").trim() !== "") return { tipo: "erro" as const, texto: (alerta.textContent ?? "").trim() };
      const ps = Array.from(f?.querySelectorAll("p") ?? []);
      const bom = ps.find((x) => x.className.includes("status-ok"));
      return bom !== undefined ? { tipo: "ok" as const, texto: (bom.textContent ?? "").trim() } : { tipo: "silencio" as const, texto: "" };
    }, form);
  }
  return resposta;
}

/** O registro de passos de um percurso, com a saída que o pacote de evidências guarda. */
export function registroDePassos(): {
  readonly ok: (p: string) => void;
  readonly conferir: (p: string, c: boolean, d: string) => void;
  readonly falhou: (p: string, d: string) => void;
  readonly encerrar: () => never | void;
} {
  const passos: string[] = [];
  const falhas: string[] = [];
  const ok = (p: string): void => {
    passos.push(p);
    console.log(`[ok] ${p}`);
  };
  const falhou = (p: string, d: string): void => {
    falhas.push(`${p} — ${d}`);
    console.error(`[FALHA] ${p} — ${d}`);
  };
  return {
    ok,
    falhou,
    conferir: (p, c, d) => (c ? ok(p) : falhou(p, d)),
    encerrar: () => {
      console.log(`\n${passos.length} passo(s) ok, ${falhas.length} falha(s).`);
      if (falhas.length > 0) {
        console.error(falhas.map((f) => ` - ${f}`).join("\n"));
        process.exit(1);
      }
    },
  };
}
