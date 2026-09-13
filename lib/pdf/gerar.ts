import puppeteer, { type Browser } from "puppeteer";
import {
  hashDoDocumento,
  nomeCanonico,
  renderizarCorpo,
  rodapeTemplate,
  type DocumentoPdf,
} from "./documento.js";

/**
 * O MOTOR DE PDF — o headless que transforma o corpo HTML (de `documento.ts`) em A4 (TR 7.5/5.120).
 *
 * ⚠️ O CHROMIUM NUNCA NAVEGA UMA ROTA. Ele recebe o HTML por `setContent` — o HTML nasce dos MESMOS
 * motores de relatório, server-side. Não há request HTTP ao app, logo NÃO HÁ sessão-de-serviço,
 * header interno nem bypass a proteger: não existe porta a abrir. A autenticação vive na camada que
 * dispara o download (a Server Action, atrás do shell autenticado).
 *
 * ⚠️ UM BROWSER, REUSADO. Lançar o Chromium custa ~alguns segundos; um por request seria caro. O
 * singleton preguiçoso é lançado uma vez e reusado. Em teste, `fecharBrowser()` no `afterAll` o
 * encerra — senão o processo do vitest não termina.
 */

let browserPromise: Promise<Browser> | null = null;
/** Renderizações em voo — o browser ocioso só fecha quando não há nenhuma. */
let emVoo = 0;
let fechamentoOcioso: ReturnType<typeof setTimeout> | null = null;
/**
 * ⚠️ V4 (§10): O BROWSER OCIOSO FECHA. O singleton segue reusado entre requests próximos, mas um
 * Chromium parado custa ~400 MB residentes — na máquina de 8 GB dos percursos era o que faltava
 * para o navegador do smoke travar em `Runtime.callFunctionOn`. Depois de `OCIOSIDADE_MS` sem
 * renderização, ele é encerrado; o próximo PDF paga o launch de novo (alguns segundos), nada mais.
 */
export const OCIOSIDADE_MS = 20_000;

async function obterBrowser(): Promise<Browser> {
  if (browserPromise === null) {
    // `--no-sandbox`: o processo já roda isolado (container/CI); o sandbox do Chromium exige
    // capacidades que ambientes headless costumam não ter, e sem ele o launch falha nomeando.
    browserPromise = puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  }
  return browserPromise;
}

function agendarFechamentoOcioso(): void {
  if (fechamentoOcioso !== null) clearTimeout(fechamentoOcioso);
  fechamentoOcioso = setTimeout(() => {
    fechamentoOcioso = null;
    if (emVoo === 0) void fecharBrowser().catch(() => undefined);
  }, OCIOSIDADE_MS);
  // Não segura o processo vivo (o vitest e o `next start` encerram sem esperar por ele).
  fechamentoOcioso.unref?.();
}

/** Encerra o browser reusado (o `afterAll` dos testes chama; a produção deixa vivo). */
export async function fecharBrowser(): Promise<void> {
  if (browserPromise !== null) {
    const b = await browserPromise;
    browserPromise = null;
    await b.close();
  }
}

export interface ResultadoPdf {
  readonly pdf: Uint8Array;
  /** SHA-256 do CONTEÚDO (estável para o mesmo demonstrativo). */
  readonly hash: string;
  readonly nomeArquivo: string;
}

/**
 * Gera o PDF de um demonstrativo. O `hash` do resultado é do conteúdo (estável); os BYTES carregam a
 * hora e por isso variam — é o hash impresso no rodapé que confere a integridade.
 */
export async function gerarPdfDoDemonstrativo(
  doc: DocumentoPdf,
  p: { readonly nomeBase: string; readonly geradoEm?: Date }
): Promise<ResultadoPdf> {
  const hash = hashDoDocumento(doc);
  const geradoEm = p.geradoEm ?? new Date();
  const corpo = renderizarCorpo(doc);
  const rodape = rodapeTemplate(hash, geradoEm);

  emVoo += 1;
  const browser = await obterBrowser();
  const page = await browser.newPage();
  try {
    // `load` (não `networkidle0`): o HTML é estático (sem rede a aguardar), e é o que o `setContent`
    // aceita — esperar "rede ociosa" num conteúdo sem rede seria esperar por nada.
    await page.setContent(corpo, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", bottom: "24mm", left: "14mm", right: "14mm" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: rodape,
    });
    return { pdf, hash, nomeArquivo: nomeCanonico(p.nomeBase, doc.periodo) };
  } finally {
    await page.close();
    emVoo -= 1;
    agendarFechamentoOcioso();
  }
}
