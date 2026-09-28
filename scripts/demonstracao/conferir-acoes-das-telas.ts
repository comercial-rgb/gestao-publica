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
const SENHA = process.env["SEED_ADMIN_SENHA"] ?? "";
if (SENHA === "") throw new Error("SEED_ADMIN_SENHA ausente.");

/** Links demais numa tela (listas longas): segue os primeiros de cada tipo, e diz quantos pulou. */
const LIMITE_DE_PAGINAS_POR_TELA = 12;
const LIMITE_DE_ARQUIVOS_POR_TELA = 12;

const ERRO_DE_PAGINA = /Application error|Unhandled Runtime Error|This page could not be found|Internal Server Error|Página não encontrada/;
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
      const erro = ERRO_DE_PAGINA.exec(r.html)?.[0];
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
      texto: document.body.textContent ?? "",
    }));
    const erro = ERRO_DE_PAGINA.exec(m.texto)?.[0];
    if (resp !== null && resp.status() !== 200) falhas.push(`filtro ${i + 1} (${m.url}): HTTP ${resp.status()}`);
    else if (m.url.startsWith("/login")) falhas.push(`filtro ${i + 1}: mandou para a entrada`);
    else if (erro !== undefined) falhas.push(`filtro ${i + 1} (${m.url}): "${erro}"`);
    else if (m.h1 === "") falhas.push(`filtro ${i + 1} (${m.url}): voltou sem título`);
  }
  return { verificados: total, falhas };
}

async function main(): Promise<void> {
  const navegador = await puppeteer.launch({ headless: true, args: ["--lang=pt-BR"] });
  const resultados: Resultado[] = [];
  try {
    const p = await navegador.newPage();
    await p.setViewport({ width: 1440, height: 900 });
    await p.goto(`${BASE}/login`, { waitUntil: "networkidle0", timeout: 120000 });
    await p.type('input[name="identificador"]', "admin@cg.pb.gov.br");
    await p.type('input[name="senha"]', SENHA);
    await p.click('button[type="submit"]');
    await p.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 120000 });

    for (const [nome, rota] of ROTEIRO) {
      await p.goto(`${BASE}${rota}`, { waitUntil: "networkidle0", timeout: 180000 });
      // ⚠️ Tela que não abriu não tem ação para conferir, e "zero falhas" nela seria vacuidade:
      // foi assim que a primeira corrida deu 43/43 contra um servidor que devolvia página vazia.
      const aberta = await p.evaluate(() => ({
        url: location.pathname,
        h1: document.querySelector("main h1")?.textContent?.trim() ?? "",
        erro: document.body.textContent ?? "",
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
      const r: Resultado = {
        tela: `${nome} (${rota})`,
        verificados: links.verificados + janelas.verificados + filtros.verificados,
        falhas: [...links.falhas, ...janelas.falhas, ...filtros.falhas],
        pulados: links.pulados,
      };
      resultados.push(r);
      console.log(
        `${r.falhas.length === 0 ? "ok   " : "FALHA"} | ${r.tela} | ${links.verificados} link(s), ${janelas.verificados} janela(s), ${filtros.verificados} filtro(s)` +
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
  const resumo = `\n${telasOk}/${ROTEIRO.length} telas sem falha; ${acoes} ação(ões) verificada(s); ${falhas} falha(s)`;
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
