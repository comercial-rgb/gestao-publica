import "dotenv/config";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "puppeteer";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { entrar, irPara, lancarNavegadorDoPercurso, type Navegador } from "./percursos-navegador.js";

/**
 * V37 — PERCURSO DA EXPORTAÇÃO DOS DEMONSTRATIVOS E DOS CAMPOS NOVOS:
 *   1. em cada um dos 22 relatórios que não exportavam (RGF 1 a 6, RREO 2, 3, 6, 7, 8, 10 a 14, consistência, balanço
 *      patrimonial, variações patrimoniais, eliminações, limite do Legislativo, balancete), "Exportar CSV" baixa um
 *      arquivo de verdade, com o BOM, ponto e vírgula e as linhas que a tela mostra (a primeira célula da primeira
 *      tabela da tela está no arquivo);
 *   2. ordem de compra: o fornecedor se acha pela busca (nome digitado), não por uma lista de 500;
 *   3. dedução da receita → "guias desta receita no mês" leva às guias com o recorte dito;
 *   4. ordem de serviço do contrato → "Empenhar por este contrato" chega ao empenho com o contrato escolhido.
 * Só lê.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 SEED_ADMIN_SENHA=... \
 *      npx tsx scripts/percurso-v37-exportacao-e-cadastros.mts
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação.");
const URL_BANCO = process.env["PERCURSO_BANCO"] ?? "";
if (!/\/gestao_publica_esperanca_ficticio(_[a-z]+)?(\?|$)/.test(URL_BANCO)) throw new Error("Recusado: PERCURSO_BANCO tem de ser a base fictícia que a BASE serve.");
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const prisma = criarPrismaClient(URL_BANCO);
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
const espera = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const RELATORIOS = [
  "rgf/anexo1", "rgf/anexo2", "rgf/anexo3", "rgf/anexo4", "rgf/anexo5", "rgf/anexo6",
  "rreo/anexo2", "rreo/anexo3", "rreo/anexo6", "rreo/anexo7", "rreo/anexo8", "rreo/anexo10", "rreo/anexo11", "rreo/anexo12", "rreo/anexo13", "rreo/anexo14",
  "consistencia", "demonstracoes/balanco-patrimonial", "demonstracoes/variacoes-patrimoniais", "eliminacoes-intra", "limite-do-legislativo", "livros/balancete",
];

async function baixarCsv(page: Page, pasta: string): Promise<string> {
  for (const f of readdirSync(pasta)) rmSync(join(pasta, f));
  // O botão chega no HTML antes de a página hidratar; um clique antes disso não faz nada. Até três cliques, 3 s cada.
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    await page.click("[data-exportar-tabelas]");
    for (let i = 0; i < 15; i++) {
      const prontos = readdirSync(pasta).filter((f) => f.endsWith(".csv"));
      if (prontos[0] !== undefined) return readFileSync(join(pasta, prontos[0]), "utf8");
      await espera(200);
    }
  }
  return "";
}

const pasta = mkdtempSync(join(tmpdir(), "csv-v37-"));
const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  // O aviso de "dados não salvos" do formulário em que o passo 2 digitou: sair dele é o que a pessoa confirmaria.
  page.on("dialog", (d) => void d.accept());
  const cdp = await page.createCDPSession();
  await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: pasta });
  await entrar(n, page, "admin@cg.pb.gov.br", senha);

  // ── 1. os 22 relatórios ──
  for (const r of RELATORIOS) {
    try {
      await irPara(n, page, `/relatorios/${r}?exercicio=2026`);
      await page.waitForSelector("[data-exportar-tabelas]");
      const primeira = await page.$eval("main table:not([data-chrome] table) tr", (tr) => ((tr.querySelector("th, td") as HTMLElement | null)?.innerText ?? "").replace(/\s+/g, " ").trim()).catch(() => "");
      const tabelas = await page.$$eval("main table", (ts) => ts.filter((t) => t.closest("[data-chrome]") === null).length);
      const csv = await baixarCsv(page, pasta);
      const linhas = csv.replace(/^\p{Cf}/u, "").split("\r\n").filter((l) => l !== "").length;
      // Sem quadro na tela, a tela tem de DIZER por quê (o aviso de vazio ou de erro), e o arquivo sai vazio.
      const aviso = tabelas > 0 ? "" : await page.$eval("main", (m) => (m.querySelector("[data-estado-vazio]")?.textContent ?? "").replace(/\s+/g, " ").trim()).catch(() => "");
      conferir(
        /^\p{Cf}/u.test(csv) && (tabelas === 0 ? linhas === 0 && aviso !== "" : linhas > 0 && csv.includes(primeira)),
        `${r}: ${String(tabelas)} quadro(s) na tela, ${String(linhas)} linha(s) no arquivo${tabelas > 0 ? `, com "${primeira.slice(0, 30)}"` : `; a tela diz: "${aviso.slice(0, 90)}"`}`
      );
    } catch (e) {
      conferir(false, `${r}: ${(e as Error).message.slice(0, 100)}`);
    }
  }

  // ── 2. fornecedor da ordem de compra pela busca ──
  const pessoa = await prisma.pessoa.findFirst({ orderBy: { documento: "desc" }, select: { id: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } });
  const nome = pessoa?.versoes[0]?.nome ?? "";
  if (pessoa === null || nome === "") {
    console.log("NAO EXECUTADO passo 2: sem pessoa com nome");
  } else {
    await irPara(n, page, "/licitacoes/ordens-de-compra");
    const raiz = 'form[data-acao="criar-ordem"] [data-seletor]:has(input[type="hidden"][name="fornecedorId"])';
    await page.waitForSelector(`${raiz} input[role="combobox"]`);
    const selectAntigo = await page.$('form[data-acao="criar-ordem"] select[name="fornecedorId"]');
    await page.type(`${raiz} input[role="combobox"]`, nome.slice(0, 12), { delay: 10 });
    await page.waitForSelector(`${raiz} [role="option"][data-valor="${pessoa.id}"]`, { timeout: 30000 }).catch(() => undefined);
    const achou = (await page.$(`${raiz} [role="option"][data-valor="${pessoa.id}"]`)) !== null;
    conferir(selectAntigo === null && achou, `ordem de compra: o fornecedor "${nome.slice(0, 30)}" (o último por documento) aparece pela busca, sem a lista de 500`);
    // A ficha e o processo, pela busca também: a última ficha de 2026 pelo número.
    const ficha = await prisma.fichaOrcamentaria.findFirst({ where: { exercicio: 2026 }, orderBy: { numero: "desc" }, select: { id: true, numero: true } });
    const selects = await page.$$eval('form[data-acao="criar-ordem"] select[name="fichaId"], form[data-acao="criar-ordem"] select[name="processoId"]', (xs) => xs.length);
    if (ficha !== null) {
      const raizFicha = 'form[data-acao="criar-ordem"] [data-seletor]:has(input[type="hidden"][name="fichaId"])';
      await page.type(`${raizFicha} input[role="combobox"]`, String(ficha.numero), { delay: 10 });
      await page.waitForSelector(`${raizFicha} [role="option"][data-valor="${ficha.id}"]`, { timeout: 30000 }).catch(() => undefined);
      const achouFicha = (await page.$(`${raizFicha} [role="option"][data-valor="${ficha.id}"]`)) !== null;
      conferir(selects === 0 && achouFicha, `ordem de compra: a ficha ${String(ficha.numero)} (a última de 2026) aparece pela busca do número; nenhum select de ficha ou processo na tela`);
    }
  }

  // ── 3. dedução → guias da receita no mês ──
  await irPara(n, page, "/receita/deducoes?exercicio=2026");
  const elo = await page.$eval('a[data-elo="guias-da-receita"]', (a) => a.getAttribute("href") ?? "").catch(() => "");
  if (elo === "") {
    console.log("NAO EXECUTADO passo 3: sem dedução em 2026");
  } else {
    await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), page.click('a[data-elo="guias-da-receita"]')]);
    const aviso = await page.$eval("[data-recorte-da-lista]", (e) => (e.textContent ?? "").replace(/\s+/g, " ").trim()).catch(() => "");
    conferir(/natureza=\d{8}&mes=\d{4}-\d{2}/.test(elo) && aviso.startsWith("Mostrando só as guias da receita"), `dedução → guias da receita no mês (${elo}; "${aviso.slice(0, 60)}")`);
  }

  // ── 4. ordem de serviço → empenhar pelo contrato ──
  const ordem = await prisma.ordemDeServicoDoContrato.findFirst({ where: { emissao: { isNot: null }, descarte: { is: null } }, select: { id: true, contratoId: true } });
  if (ordem === null) {
    console.log("NAO EXECUTADO passo 4: sem ordem de serviço emitida");
  } else {
    await irPara(n, page, `/licitacoes/contratos/${ordem.contratoId}/ordens/${ordem.id}`);
    await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), page.click('a[data-proximo-passo="empenhar"]')]);
    const raiz = 'form[data-acao="empenhar"] [data-seletor]:has(input[type="hidden"][name="contratoId"])';
    await page.waitForFunction((sel) => (document.querySelector(sel) as HTMLInputElement | null)?.value !== "", { timeout: 60000 }, `${raiz} input[type="hidden"][name="contratoId"]`).catch(() => undefined);
    const noCampo = await page.$eval(`${raiz} input[type="hidden"][name="contratoId"]`, (e) => (e as HTMLInputElement).value).catch(() => "");
    conferir(noCampo === ordem.contratoId, `ordem de serviço → "Empenhar por este contrato": o contrato chega escolhido (${page.url().replace(n.base, "")})`);
  }
} finally {
  await nav.close();
  await prisma.$disconnect();
  rmSync(pasta, { recursive: true, force: true });
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da exportação e dos campos novos completo.");
