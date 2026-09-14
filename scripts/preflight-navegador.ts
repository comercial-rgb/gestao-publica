import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import puppeteer, { type Browser } from "puppeteer";

/**
 * PREFLIGHT DO NAVEGADOR — o mesmo para os percursos e para o gerador de PDF (V7 M1 U0).
 *
 * Confere, nesta ordem, e para no primeiro que falha COM O DIAGNÓSTICO:
 *   1. a versão que o `puppeteer` instalado exige e o executável que ele resolve (pelo
 *      `.puppeteerrc.cjs` do projeto — o mesmo arquivo que o `next start` lê);
 *   2. o executável existe no disco;
 *   3. ele inicia;
 *   4. carrega uma página local (sem rede) e
 *   5. gera um PDF mínimo que começa com `%PDF`;
 *   6. o processo encerra.
 *
 * ⚠️ NÃO BAIXA NADA. Binário ausente é diagnóstico com o comando de reposição, nunca um download
 * automático nem um laço de reinstalação. A causa de um sumiço pode seguir desconhecida.
 *
 * Uso: `npx tsx scripts/preflight-navegador.ts` (exit 0 = pronto). Também exportado para os percursos.
 */
export interface ResultadoDoPreflight {
  readonly ok: boolean;
  readonly versaoEsperada: string;
  readonly executavel: string;
  readonly diagnostico: string;
}

export const REPOSICAO = "npx puppeteer browsers install chrome   (no diretório do projeto; usa o puppeteer do package-lock e o .puppeteerrc.cjs)";

export async function preflightDoNavegador(): Promise<ResultadoDoPreflight> {
  // A revisão vem do puppeteer-core INSTALADO (package-lock), não de "stable/latest".
  let versaoEsperada = "desconhecida";
  try {
    const arquivo = createRequire(import.meta.url).resolve("puppeteer-core/package.json").replace(/package\.json$/, "lib/puppeteer/revisions.js");
    versaoEsperada = /chrome:\s*'([^']+)'/.exec(readFileSync(arquivo, "utf8"))?.[1] ?? "desconhecida";
  } catch {
    // segue "desconhecida": o executável resolvido abaixo ainda é conferido
  }
  let executavel = "";
  try {
    executavel = await Promise.resolve(puppeteer.executablePath());
  } catch (e) {
    return { ok: false, versaoEsperada, executavel, diagnostico: `o Puppeteer não resolveu o executável: ${e instanceof Error ? e.message : String(e)}. Reposição: ${REPOSICAO}` };
  }
  if (!existsSync(executavel)) {
    return { ok: false, versaoEsperada, executavel, diagnostico: `NAVEGADOR AUSENTE: ${executavel} não existe. Nenhum percurso foi iniciado. Reposição: ${REPOSICAO}` };
  }
  const inicio = Date.now();
  let navegador: Browser;
  try {
    navegador = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  } catch (e) {
    return { ok: false, versaoEsperada, executavel, diagnostico: `o navegador existe e NÃO INICIOU: ${e instanceof Error ? e.message : String(e)}` };
  }
  try {
    const page = await navegador.newPage();
    await page.setContent("<!doctype html><html><body><h1>preflight</h1><p>Gestão Pública</p></body></html>", { waitUntil: "load" });
    const titulo = await page.$eval("h1", (h: Element) => h.textContent ?? "");
    if (titulo !== "preflight") return { ok: false, versaoEsperada, executavel, diagnostico: `a página local não carregou (h1 = "${titulo}")` };
    const pdf = await page.pdf({ format: "A4" });
    const cabecalho = Buffer.from(pdf.subarray(0, 4)).toString("latin1");
    if (cabecalho !== "%PDF") return { ok: false, versaoEsperada, executavel, diagnostico: `o PDF mínimo não começou com %PDF (${cabecalho})` };
    return { ok: true, versaoEsperada, executavel, diagnostico: `pronto: iniciou, carregou página local e gerou PDF de ${pdf.byteLength} bytes em ${Date.now() - inicio} ms` };
  } finally {
    await navegador.close();
  }
}

if (process.argv[1]?.includes("preflight-navegador")) {
  const r = await preflightDoNavegador();
  console.log(`[navegador] versão exigida pelo puppeteer instalado: ${r.versaoEsperada}`);
  console.log(`[navegador] executável: ${r.executavel}`);
  console.log(`[navegador] ${r.ok ? "OK" : "FALHA"} — ${r.diagnostico}`);
  process.exit(r.ok ? 0 : 1);
}
