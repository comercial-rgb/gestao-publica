import "dotenv/config";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";
import type { Page } from "puppeteer";

/**
 * V36 — PERCURSO: ANEXOS NO REGISTRO DE PAGAMENTO E NO MOVIMENTO BANCÁRIO.
 *   1. da lista de pagamentos, o link "documentos" abre a página do pagamento; o PDF anexado fica gravado e aparece
 *      na lista depois de recarregar, e o download responde com o arquivo;
 *   2. o mesmo na página de um movimento bancário (pelo link da movimentação);
 *   3. o contador, sem a leitura do financeiro, é levado a /sem-acesso na página do movimento.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 SEED_ADMIN_SENHA=... \
 *      npx tsx scripts/percurso-v36-anexos-do-pagamento.mts
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação.");
const URL_BANCO = process.env["PERCURSO_BANCO"] ?? "";
if (!/\/gestao_publica_esperanca_ficticio(_[a-z]+)?(\?|$)/.test(URL_BANCO)) throw new Error("Recusado: PERCURSO_BANCO tem de ser a base fictícia que a BASE serve.");
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const senhaFicticia = process.env["FICTICIO_SENHA"] ?? "Ficticio#2026";
const prisma = criarPrismaClient(URL_BANCO);
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};

const marca = String(Date.now());
const pdf = (nome: string): string => {
  const caminho = join(tmpdir(), `${nome}-${marca}.pdf`);
  writeFileSync(caminho, `%PDF-1.4\n% documento fictício de percurso ${nome}\n`);
  return caminho;
};

async function baixa(page: Page, href: string): Promise<{ status: number; tipo: string }> {
  return page.evaluate(async (u) => {
    const r = await fetch(u, { credentials: "same-origin" });
    return { status: r.status, tipo: r.headers.get("content-type") ?? "" };
  }, href);
}

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  await entrar(n, page, "admin@cg.pb.gov.br", senha);

  // ── 1. pagamento, pelo link da lista ──
  await irPara(n, page, "/despesa/pagamentos?exercicio=2026");
  const href = await page.$eval("a[data-elo='documentos-do-pagamento']", (a) => a.getAttribute("href") ?? "");
  const pagamentoId = href.split("/").pop() ?? "";
  await irPara(n, page, href);
  const antesP = await prisma.anexo.count({ where: { pagamentoId } });
  const arquivoP = pdf("comprovante-do-pagamento");
  await preencherEEnviar(page, "anexar", [{ sel: 'input[name="arquivo"]', valor: arquivoP, tipo: "arquivo" }]);
  await irPara(n, page, href);
  const nomes = await page.$$eval("a[href^='/documentos/anexos/']", (as) => as.map((a) => ({ texto: a.textContent ?? "", href: a.getAttribute("href") ?? "" })));
  const doArquivo = nomes.find((a) => a.texto.includes(`comprovante-do-pagamento-${marca}`));
  const dl = doArquivo === undefined ? { status: 0, tipo: "" } : await baixa(page, doArquivo.href);
  conferir(
    (await prisma.anexo.count({ where: { pagamentoId } })) === antesP + 1 && doArquivo !== undefined && dl.status === 200 && dl.tipo.includes("pdf"),
    `pagamento ${pagamentoId.slice(0, 8)}…: anexo gravado e listado depois de recarregar; download ${String(dl.status)} ${dl.tipo}`
  );

  // ── 2. movimento bancário, pelo link da movimentação ──
  const mov = await prisma.movimentoBancario.findFirst({ where: { estornoDeId: null }, orderBy: { data: "desc" }, select: { id: true, contaBancariaId: true } });
  // ⚠️ SEM MOVIMENTO NA BASE, O PASSO NÃO É MEDIDO — e não se cria um aqui: registrar o movimento exige escolher a
  // conta contábil de contrapartida, que é decisão do ente. O domínio está provado em m22-anexo-do-pagamento-e-do-movimento.
  if (mov === null) console.log("(não medido: a base não tem movimento bancário; registrar um exige a conta de contrapartida do ente)");
  else {
    await irPara(n, page, `/financeiro/movimentacao/${mov.id}`);
    const antesM = await prisma.anexo.count({ where: { movimentoBancarioId: mov.id } });
    await preencherEEnviar(page, "anexar", [{ sel: 'input[name="arquivo"]', valor: pdf("aviso-do-banco"), tipo: "arquivo" }]);
    await irPara(n, page, `/financeiro/movimentacao/${mov.id}`);
    const listado = await page.$eval("a[href^='/documentos/anexos/']", (as) => as.some((a) => (a.textContent ?? "").includes("aviso-do-banco")));
    conferir((await prisma.anexo.count({ where: { movimentoBancarioId: mov.id } })) === antesM + 1 && listado, `movimento ${mov.id.slice(0, 8)}…: anexo gravado e listado`);
  }

  // ── 3. negação ──
  const outra = await (await nav.createBrowserContext()).newPage();
  outra.setDefaultTimeout(120000);
  await entrar(n, outra, "contador@ficticio.local", senhaFicticia);
  await outra.goto(`${n.base}/financeiro/movimentacao/${mov?.id ?? "qualquer"}`, { waitUntil: "domcontentloaded" });
  const destino = new URL(outra.url());
  conferir(destino.pathname === "/sem-acesso" && destino.searchParams.get("acao") === "CONSULTAR_FINANCEIRO", `contador na página do movimento: ${destino.pathname}?acao=${destino.searchParams.get("acao") ?? ""}`);
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso dos anexos do pagamento e do movimento completo.");
