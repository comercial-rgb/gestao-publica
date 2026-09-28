import "dotenv/config";
import { writeFileSync } from "node:fs";
import puppeteer, { type Page } from "puppeteer";
import { ROTEIRO } from "./roteiro-da-apresentacao.js";

/**
 * AS AÇÕES DAS TELAS DO ROTEIRO (V22) — o conferidor de telas prova que cada tela ABRE; este prova
 * que o que cada tela OFERECE responde. Em cada tela do roteiro, logado como administrador:
 *
 * - todo LINK dentro do conteúdo (fora do menu) é seguido: página tem de responder 200, sem a
 *   página de erro do Next e sem mandar para a entrada; ARQUIVO (PDF, planilha, CSV, XML, TXT,
 *   ZIP) tem de responder 200, com o tipo de arquivo e com corpo não vazio;
 * - todo botão que abre JANELA (`aria-haspopup="dialog"`) é clicado: o `<dialog>` tem de abrir
 *   com conteúdo, e o Esc tem de fechá-lo;
 * - todo formulário de FILTRO (`method="get"`) é enviado como está: a tela que volta tem de abrir
 *   com título e sem erro.
 *
 * ⚠️ SOMENTE LEITURA. Formulário que grava (ação do servidor, `method="post"`) NÃO é enviado
 * aqui — emitir, anular e autorizar se provam no percurso da execução da despesa, que desfaz o que
 * fez. Botão de imprimir abre a caixa do navegador e também não é clicado.
 *
 * Uso: `npx tsx scripts/demonstracao/conferir-acoes-das-telas.ts [base] [arquivo-de-resultado]`.
 */

const BASE = process.argv[2] ?? "http://localhost:3011";
const SAIDA = process.argv[3] ?? "acoes-das-telas.txt";
/** Opcional: rotas avulsas separadas por vírgula, no lugar do roteiro (para provar que o conferidor acusa). */
const AVULSAS = process.argv[4];
const TELAS: readonly (readonly [string, string])[] =
  AVULSAS === undefined ? ROTEIRO : AVULSAS.split(",").map((r) => [`avulsa ${r}`, r] as const);
const SENHA = process.env["SEED_ADMIN_SENHA"] ?? "";
if (SENHA === "") throw new Error("SEED_ADMIN_SENHA ausente.");

/** Links demais numa tela (listas longas): segue os primeiros de cada tipo, e diz quantos pulou. */
const LIMITE_DE_PAGINAS_POR_TELA = 12;
const LIMITE_DE_ARQUIVOS_POR_TELA = 12;

// ⚠️ SÓ O TEXTO VISÍVEL (`innerText`), nunca o `textContent` do body: o Next embute nos scripts da
// página o modelo da tela "This page could not be found", e o `textContent` o lê em TODA página —
// a primeira corrida deu 44 falhas falsas por isso.
const ERRO_DE_PAGINA = /Application error|Unhandled Runtime Error|This page could not be found|Internal Server Error|Página não encontrada/;
/** No HTML baixado (sem renderizar), o erro do Next se reconhece pelo título e pelo cabeçalho dele. */
const ERRO_NO_HTML = /<title>(404|500)[^<]*<\/title>|class="next-error-h1"/;
const TIPO_DE_ARQUIVO = /pdf|spreadsheet|excel|csv|zip|xml|octet-stream|text\/plain|json/;

interface Resultado {
  readonly tela: string;
  readonly verificados: number;
  readonly falhas: string[];
  readonly pulados: number;
}

async function seguirLinks(p: Page, rota: string): Promise<{ verificados: number; falhas: string[]; pulados: number }> {
  const hrefs = await p.evaluate(() => {
    const main = document.querySelector("main");
    if (main === null) return [] as string[];
    return [...main.querySelectorAll<HTMLAnchorElement>("a[href]")]
      .map((a) => a.href)
      .filter((h) => h.startsWith(location.origin) && !h.includes("#") && !h.startsWith(`${location.origin}/login`));
  });
  const unicos = [...new Set(hrefs)].filter((h) => h !== `${BASE}${rota}`);
  const eArquivo = (h: string): boolean => /\/(pdf|csv|xlsx|xml|txt|zip|arquivo|download|exportar)(\/|\?|$)|[?&]formato=/.test(h);
  const arquivos = unicos.filter(eArquivo).slice(0, LIMITE_DE_ARQUIVOS_POR_TELA);
  const paginas = unicos.filter((h) => !eArquivo(h)).slice(0, LIMITE_DE_PAGINAS_POR_TELA);
  const pulados = unicos.length - arquivos.length - paginas.length;
  const falhas: string[] = [];
  for (const href of [...arquivos, ...paginas]) {
    const r = await p.evaluate(async (u: string) => {
      const resp = await fetch(u, { credentials: "include", redirect: "follow" });
      const tipo = resp.headers.get("content-type") ?? "";
      const corpo = await resp.arrayBuffer();
      const html = tipo.includes("text/html") ? new TextDecoder().decode(corpo) : "";
      return { status: resp.status, url: resp.url, tipo, tamanho: corpo.byteLength, html };
    }, href);
    const curto = href.slice(BASE.length);
    if (r.status !== 200) falhas.push(`link ${curto}: HTTP ${r.status}`);
    else if (new URL(r.url).pathname.startsWith("/login")) falhas.push(`link ${curto}: mandou para a entrada`);
    else if (r.tipo.includes("text/html")) {
      const erro = ERRO_NO_HTML.exec(r.html)?.[0];
      if (erro !== undefined) falhas.push(`link ${curto}: "${erro}"`);
    } else if (!TIPO_DE_ARQUIVO.test(r.tipo)) falhas.push(`link ${curto}: tipo inesperado "${r.tipo}"`);
    else if (r.tamanho === 0) falhas.push(`link ${curto}: arquivo vazio`);
  }
  return { verificados: arquivos.length + paginas.length, falhas, pulados };
}

async function abrirJanelas(p: Page): Promise<{ verificados: number; falhas: string[] }> {
  const total = await p.$$eval('main button[aria-haspopup="dialog"]', (bs) => bs.length);
  // Uma janela basta por tela: todas saem do mesmo componente; o que varia é o conteúdo, que é
  // do servidor e já foi medido pela abertura da própria tela.
  if (total === 0) return { verificados: 0, falhas: [] };
  const falhas: string[] = [];
  const botao = (await p.$$('main button[aria-haspopup="dialog"]'))[0];
  if (botao === undefined) return { verificados: 0, falhas: [] };
  const rotulo = (await botao.evaluate((b) => b.getAttribute("aria-label") ?? b.textContent ?? "")).trim();
  await botao.click();
  const aberta = await p
    .waitForFunction(() => {
      const d = document.querySelector("dialog[open]");
      return d !== null && (d.textContent ?? "").trim().length > 20;
    }, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!aberta) falhas.push(`janela "${rotulo}": não abriu com conteúdo`);
  else {
    await p.keyboard.press("Escape");
    const fechou = await p
      .waitForFunction(() => document.querySelector("dialog[open]") === null, { timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (!fechou) falhas.push(`janela "${rotulo}": Esc não fechou`);
  }
  return { verificados: 1, falhas };
}

async function enviarFiltros(p: Page, rota: string): Promise<{ verificados: number; falhas: string[] }> {
  const total = await p.$$eval('main form[method="get" i]', (fs) => fs.length);
  const falhas: string[] = [];
  for (let i = 0; i < total; i++) {
    await p.goto(`${BASE}${rota}`, { waitUntil: "networkidle0", timeout: 180000 });
    const form = (await p.$$('main form[method="get" i]'))[i];
    if (form === undefined) continue;
    const [resp] = await Promise.all([
      p.waitForNavigation({ waitUntil: "networkidle0", timeout: 180000 }).catch(() => null),
      form.evaluate((f) => (f as HTMLFormElement).requestSubmit()),
    ]);
    const m = await p.evaluate(() => ({
      url: location.pathname + location.search,
      h1: document.querySelector("main h1")?.textContent?.trim() ?? "",
      texto: document.body.innerText ?? "",
    }));
    const erro = ERRO_DE_PAGINA.exec(m.texto)?.[0];
    if (resp !== null && resp.status() !== 200) falhas.push(`filtro ${i + 1} (${m.url}): HTTP ${resp.status()}`);
    else if (m.url.startsWith("/login")) falhas.push(`filtro ${i + 1}: mandou para a entrada`);
    else if (erro !== undefined) falhas.push(`filtro ${i + 1} (${m.url}): "${erro}"`);
    else if (m.h1 === "") falhas.push(`filtro ${i + 1} (${m.url}): voltou sem título`);
  }
  return { verificados: total, falhas };
}

/**
 * OS SELETORES QUE TROCAM A URL SEM FORMULÁRIO — a data de corte com "Aplicar" dos demonstrativos
 * e os seletores de exercício/bimestre/quadrimestre dos anexos fiscais. Eles fazem `router.push`
 * no navegador, e o `requestSubmit` dos filtros não os alcança. Aqui cada um é acionado com um
 * valor DIFERENTE do atual, e a tela que volta tem de ter mudado de URL, ter título e não ter erro.
 */
async function acionarSeletores(p: Page, rota: string): Promise<{ verificados: number; falhas: string[] }> {
  const falhas: string[] = [];
  let verificados = 0;
  const alvos = await p.evaluate(() => {
    const main = document.querySelector("main");
    if (main === null) return [] as { tipo: "data" | "select"; indice: number }[];
    const fora = (el: Element): boolean => el.closest("form") === null;
    const datas = [...main.querySelectorAll<HTMLInputElement>('input[type="date"]')].filter(fora);
    // Só os seletores de PERÍODO (pelo rótulo): um select fora de formulário que não navega
    // (ordenação local, por exemplo) daria falha falsa de "a URL não mudou".
    const dePeriodo = (s: HTMLSelectElement): boolean => {
      const rotulo = [
        s.getAttribute("aria-label") ?? "",
        s.name,
        s.closest("label")?.textContent ?? "",
        s.previousElementSibling?.textContent ?? "",
        s.parentElement?.previousElementSibling?.textContent ?? "",
      ].join(" ");
      return /exerc|bimestre|quadrimestre|per[ií]odo|m[eê]s|compet/i.test(rotulo);
    };
    const selects = [...main.querySelectorAll<HTMLSelectElement>("select")].filter(fora).filter((s) => s.options.length > 1).filter(dePeriodo);
    return [
      ...datas.map((_, indice) => ({ tipo: "data" as const, indice })),
      ...selects.map((_, indice) => ({ tipo: "select" as const, indice })),
    ];
  });
  for (const alvo of alvos) {
    await p.goto(`${BASE}${rota}`, { waitUntil: "networkidle0", timeout: 180000 });
    const antes = await p.evaluate(() => location.pathname + location.search);
    const acionou = await p.evaluate((a) => {
      const main = document.querySelector("main");
      if (main === null) return "";
      const fora = (el: Element): boolean => el.closest("form") === null;
      if (a.tipo === "data") {
        const el = [...main.querySelectorAll<HTMLInputElement>('input[type="date"]')].filter(fora)[a.indice];
        if (el === undefined) return "";
        const novo = el.value === "2026-06-30" ? "2026-05-31" : "2026-06-30";
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        set?.call(el, novo);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        const botao = [...(el.parentElement?.parentElement ?? main).querySelectorAll("button")].find((b) => /aplicar/i.test(b.textContent ?? ""));
        botao?.click();
        return botao === undefined ? "" : `data ${novo}`;
      }
      const dePeriodo = (x: HTMLSelectElement): boolean =>
        /exerc|bimestre|quadrimestre|per[ií]odo|m[eê]s|compet/i.test(
          [
            x.getAttribute("aria-label") ?? "",
            x.name,
            x.closest("label")?.textContent ?? "",
            x.previousElementSibling?.textContent ?? "",
            x.parentElement?.previousElementSibling?.textContent ?? "",
          ].join(" ")
        );
      const s = [...main.querySelectorAll<HTMLSelectElement>("select")].filter(fora).filter((x) => x.options.length > 1).filter(dePeriodo)[a.indice];
      if (s === undefined) return "";
      const outra = [...s.options].find((o) => o.value !== s.value && !o.disabled);
      if (outra === undefined) return "";
      const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      set?.call(s, outra.value);
      s.dispatchEvent(new Event("change", { bubbles: true }));
      // Filtro que só navega no "Aplicar" (ex.: restos a pagar): clica, como a pessoa faria. O
      // bloco do filtro é o ancestral mais próximo (até três níveis) que tem o botão.
      let bloco: Element | null = s.parentElement;
      for (let n = 0; n < 3 && bloco !== null; n++, bloco = bloco.parentElement) {
        const aplicar = [...bloco.querySelectorAll("button")].find((b) => /aplicar/i.test(b.textContent ?? ""));
        if (aplicar !== undefined) {
          aplicar.click();
          break;
        }
      }
      return `${s.getAttribute("aria-label") ?? s.name ?? "seletor"} = ${outra.value}`;
    }, alvo);
    if (acionou === "") continue;
    verificados++;
    const mudou = await p
      .waitForFunction((a: string) => location.pathname + location.search !== a, { timeout: 30000 }, antes)
      .then(() => true)
      .catch(() => false);
    await p.waitForNetworkIdle({ timeout: 60000 }).catch(() => undefined);
    const m = await p.evaluate(() => ({
      url: location.pathname + location.search,
      h1: document.querySelector("main h1")?.textContent?.trim() ?? "",
      texto: document.body.innerText ?? "",
    }));
    const erro = ERRO_DE_PAGINA.exec(m.texto)?.[0];
    if (!mudou) falhas.push(`seletor (${acionou}): a URL não mudou`);
    else if (erro !== undefined) falhas.push(`seletor (${acionou}) -> ${m.url}: "${erro}"`);
    else if (m.h1 === "") falhas.push(`seletor (${acionou}) -> ${m.url}: voltou sem título`);
  }
  return { verificados, falhas };
}

async function main(): Promise<void> {
  const navegador = await puppeteer.launch({ headless: true, args: ["--lang=pt-BR"] });
  const resultados: Resultado[] = [];
  try {
    const p = await navegador.newPage();
    // O tsx compila as funções nomeadas de dentro do `evaluate` com o auxiliar `__name`, que não
    // existe no navegador ("__name is not defined"). Define-se a identidade antes de qualquer página.
    await p.evaluateOnNewDocument("globalThis.__name = (f) => f;");
    await p.setViewport({ width: 1440, height: 900 });
    await p.goto(`${BASE}/login`, { waitUntil: "networkidle0", timeout: 120000 });
    await p.type('input[name="identificador"]', "admin@cg.pb.gov.br");
    await p.type('input[name="senha"]', SENHA);
    await p.click('button[type="submit"]');
    await p.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 120000 });

    for (const [nome, rota] of TELAS) {
      await p.goto(`${BASE}${rota}`, { waitUntil: "networkidle0", timeout: 180000 });
      // ⚠️ Tela que não abriu não tem ação para conferir, e "zero falhas" nela seria vacuidade:
      // foi assim que a primeira corrida deu 43/43 contra um servidor que devolvia página vazia.
      const aberta = await p.evaluate(() => ({
        url: location.pathname,
        h1: document.querySelector("main h1")?.textContent?.trim() ?? "",
        erro: document.body.innerText ?? "",
      }));
      const erroAoAbrir = ERRO_DE_PAGINA.exec(aberta.erro)?.[0];
      if (aberta.url.startsWith("/login") || aberta.h1 === "" || erroAoAbrir !== undefined) {
        const motivo = aberta.url.startsWith("/login") ? "mandou para a entrada" : aberta.h1 === "" ? "abriu sem título" : `"${erroAoAbrir}"`;
        resultados.push({ tela: `${nome} (${rota})`, verificados: 0, falhas: [`a tela não abriu: ${motivo}`], pulados: 0 });
        console.log(`FALHA | ${nome} (${rota}) | a tela não abriu: ${motivo}`);
        continue;
      }
      const links = await seguirLinks(p, rota);
      const janelas = await abrirJanelas(p);
      const filtros = await enviarFiltros(p, rota);
      const seletores = await acionarSeletores(p, rota);
      const r: Resultado = {
        tela: `${nome} (${rota})`,
        verificados: links.verificados + janelas.verificados + filtros.verificados + seletores.verificados,
        falhas: [...links.falhas, ...janelas.falhas, ...filtros.falhas, ...seletores.falhas],
        pulados: links.pulados,
      };
      resultados.push(r);
      console.log(
        `${r.falhas.length === 0 ? "ok   " : "FALHA"} | ${r.tela} | ${links.verificados} link(s), ${janelas.verificados} janela(s), ${filtros.verificados} filtro(s), ${seletores.verificados} seletor(es) de período` +
          (r.pulados > 0 ? ` | ${r.pulados} link(s) além do limite não seguidos` : "")
      );
      for (const f of r.falhas) console.log(`        - ${f}`);
    }
  } finally {
    await navegador.close();
  }
  const acoes = resultados.reduce((s, r) => s + r.verificados, 0);
  const falhas = resultados.reduce((s, r) => s + r.falhas.length, 0);
  const telasOk = resultados.filter((r) => r.falhas.length === 0).length;
  const resumo = `\n${telasOk}/${TELAS.length} telas sem falha; ${acoes} ação(ões) verificada(s); ${falhas} falha(s)`;
  console.log(resumo);
  writeFileSync(
    SAIDA,
    resultados.map((r) => `${r.falhas.length === 0 ? "ok" : "FALHA"} | ${r.tela} | ${r.verificados}${r.falhas.map((f) => `\n  - ${f}`).join("")}`).join("\n") + `${resumo}\n`
  );
  if (falhas > 0 || acoes === 0) process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
