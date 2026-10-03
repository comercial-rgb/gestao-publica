import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import type { Page } from "puppeteer";
import type { PrismaClient } from "../prisma/generated/client/client.js";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { entrar, irPara, lancarNavegadorDoPercurso, registroDePassos, sair, type Navegador } from "./percursos-navegador.js";

/**
 * V33 — AS CADEIAS DA RECEITA, DA FOLHA E DO PATRIMÔNIO, E OS DOCUMENTOS, PELO NAVEGADOR (somente leitura).
 *
 *   R. O CONTADOR na receita: da lista à arrecadação; dela, a classificação, a entidade, a conta (razão), a
 *      conciliação (dita quando falta), o lançamento — e o lançamento volta à MESMA arrecadação.
 *   F. O CONTADOR na folha: os empenhos da folha com a liquidação (link) e a situação do pagamento; o empenho
 *      volta à folha que o gerou.
 *   P. O CONTADOR no bem: a conta do ativo no razão e o último lançamento de valor.
 *   D. Os DOCUMENTOS: A pagar em PDF (o motor único) e a impressão da tela pelo navegador com o cabeçalho do papel.
 *
 * Não grava nada. Uso: DATABASE_URL=<ensaio> npx tsx scripts/percurso-v33-cadeias.ts http://localhost:3011
 */

const BASE = process.argv[2] ?? "http://localhost:3011";
const SENHA_PAPEIS = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";
const N: Navegador = { base: BASE };
const textoDe = (page: Page, sel: string): Promise<string> => page.evaluate((s) => document.querySelector(s)?.textContent ?? "", sel);
const href = (page: Page, sel: string): Promise<string | null> => page.evaluate((s) => (document.querySelector(s) as HTMLAnchorElement | null)?.getAttribute("href") ?? null, sel);

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"] ?? "";
  if (url === "") throw new Error("DATABASE_URL é obrigatória.");
  const prisma = criarPrismaClient(url) as unknown as PrismaClient;
  const R = registroDePassos();
  const navegador = await lancarNavegadorDoPercurso();
  try {
    const page = await navegador.newPage();
    page.setDefaultTimeout(120000);
    await entrar(N, page, "contabilidade@percursos.local", SENHA_PAPEIS);

    // ══ R. RECEITA ══
    const arr = await prisma.receitaArrecadada.findFirst({ where: { estornoDeId: null, exercicio: 2026 }, orderBy: { dataArrecadacao: "asc" }, select: { id: true, numeroReceita: true, lancamentoId: true } });
    if (arr === null) throw new Error("O ensaio não tem arrecadação em 2026.");
    await irPara(N, page, "/receita/arrecadacoes?exercicio=2026");
    const linkArr = await href(page, `a[href="/receita/arrecadacoes/${arr.id}"]`);
    R.conferir("R.1 o número da arrecadação na lista abre o registro", linkArr !== null, String(linkArr));
    await irPara(N, page, `/receita/arrecadacoes/${arr.id}`);
    const cadeia = await textoDe(page, "[data-cadeia-da-receita]");
    R.conferir(
      "R.2 a arrecadação mostra a cadeia: classificação, entidade, conta, conciliação (dita quando falta) e lançamento",
      /natureza/.test(cadeia) && /fonte/.test(cadeia) && (await page.$('[data-elo="entidade"]')) !== null && (await page.$('[data-elo="conta"]')) !== null && /conciliada|\d{2}\/\d{2}\/\d{4}/.test(await textoDe(page, '[data-elo="conciliacao"]')),
      cadeia.slice(0, 300)
    );
    const linkLanc = await href(page, '[data-elo="lancamento"]');
    R.conferir("R.3 a arrecadação abre o próprio lançamento", linkLanc === `/contabilidade/lancamentos/${arr.lancamentoId}`, String(linkLanc));
    await irPara(N, page, `/contabilidade/lancamentos/${arr.lancamentoId}`);
    const volta = await href(page, "[data-origem-do-lancamento] a");
    R.conferir("R.4 e o lançamento volta à MESMA arrecadação (não à lista)", volta === `/receita/arrecadacoes/${arr.id}`, String(volta));

    // ══ F. FOLHA ══
    const folha = await prisma.folhaDePagamento.findFirst({ where: { apropriacao: { isNot: null } }, select: { id: true } });
    if (folha === null) {
      R.conferir("F.0 o ensaio tem folha apropriada", false, "nenhuma folha apropriada");
    } else {
      await irPara(N, page, `/folha/folhas/${folha.id}?aba=dados`);
      const linhas = await page.$$eval("tr[data-empenho]", (trs) =>
        trs.map((tr) => ({
          liq: (tr.querySelector('[data-liquidacao] a') as HTMLAnchorElement | null)?.getAttribute("href") ?? null,
          pag: tr.querySelector("[data-pagamento]")?.getAttribute("data-pagamento") ?? null,
          emp: (tr.querySelector('a[href^="/despesa/empenhos/"]') as HTMLAnchorElement | null)?.getAttribute("href") ?? null,
        }))
      );
      R.conferir(
        "F.1 cada empenho da folha mostra a liquidação (link à âncora) e a situação do pagamento",
        linhas.length > 0 && linhas.every((l) => l.pag !== null && (l.pag === "sem-liquidacao" || (l.liq !== null && /#liquidacao-/.test(l.liq)))),
        JSON.stringify(linhas)
      );
      const emp = linhas.find((l) => l.emp !== null)?.emp ?? null;
      if (emp !== null) {
        await irPara(N, page, emp);
        const aFolha = await href(page, "[data-folha-do-empenho]");
        R.conferir("F.2 o empenho volta à folha que o gerou", aFolha === `/folha/folhas/${folha.id}#empenhos`, String(aFolha));
      }
    }

    // ══ P. BEM ══
    const bem = await prisma.bemPatrimonial.findFirst({ select: { id: true } });
    if (bem !== null) {
      await irPara(N, page, `/patrimonio/bens-patrimoniais/${bem.id}`);
      const razao = await page.evaluate(() => [...document.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "").filter((h) => h.startsWith("/relatorios/livros/razao?conta=") || h.startsWith("/contabilidade/lancamentos/")));
      R.conferir("P.1 o bem abre a conta do ativo no razão e o último lançamento de valor", razao.some((h) => h.startsWith("/relatorios/livros/razao")) && razao.some((h) => h.startsWith("/contabilidade/lancamentos/")), JSON.stringify(razao));
    }

    // ══ D. DOCUMENTOS ══
    const pdf = await page.evaluate(async (u: string) => {
      const r = await fetch(u);
      const b = new Uint8Array(await r.arrayBuffer());
      let base64 = "";
      for (let i = 0; i < b.length; i += 8192) base64 += String.fromCharCode(...b.slice(i, i + 8192));
      return { status: r.status, tipo: r.headers.get("content-type") ?? "", inicio: String.fromCharCode(...b.slice(0, 5)), tamanho: b.length, binario: btoa(base64) };
    }, `${BASE}/despesa/a-pagar/pdf?exercicio=2026&fase=LIQUIDADO_A_PAGAR`);
    const saida = process.env["PERCURSO_SAIDA"] ?? ".registro-de-execucao/percursos/v33-papel";
    mkdirSync(saida, { recursive: true });
    writeFileSync(`${saida}/a-pagar-rota.pdf`, Buffer.from(pdf.binario, "base64"));
    R.conferir("D.1 A pagar em PDF sai do motor único (application/pdf, %PDF-)", pdf.status === 200 && pdf.tipo.includes("application/pdf") && pdf.inicio === "%PDF-" && pdf.tamanho > 1000, `${String(pdf.status)} ${pdf.tipo} ${String(pdf.tamanho)} bytes`);
    await irPara(N, page, "/despesa/a-pagar?exercicio=2026");
    await page.emulateMediaType("print");
    const papel = await page.evaluate(() => {
      const c = document.querySelector("[data-cabecalho-de-impressao]");
      const menu = document.querySelector("aside, nav[aria-label]");
      return {
        cabecalho: c === null ? "" : (getComputedStyle(c).display !== "none" ? (c.textContent ?? "") : "(oculto)"),
        menuVisivel: menu !== null && getComputedStyle(menu).display !== "none",
        alturaDoMain: document.querySelector("main")?.scrollHeight ?? 0,
        alturaVisivel: (document.querySelector("main") as HTMLElement | null)?.clientHeight ?? 0,
      };
    });
    R.conferir(
      "D.2 no papel: o cabeçalho diz ente, exercício e emissão, o menu some e a moldura não corta o conteúdo",
      /Exercício 2026/.test(papel.cabecalho) && /emitido em/.test(papel.cabecalho) && !papel.menuVisivel && papel.alturaVisivel >= papel.alturaDoMain,
      JSON.stringify(papel)
    );
    const impresso = await page.pdf({ format: "A4", printBackground: true });
    writeFileSync(`${saida}/a-pagar-impressao-da-tela.pdf`, impresso);
    R.conferir("D.3 a impressão da tela gera papel", impresso.length > 1000, `${String(impresso.length)} bytes`);
    await page.emulateMediaType("screen");
    await sair(N, page).catch(() => undefined);
  } finally {
    await navegador.close();
    await prisma.$disconnect();
  }
  R.encerrar();
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});
