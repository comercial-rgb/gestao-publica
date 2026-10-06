import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";
import type { Page } from "puppeteer";

/**
 * V36 — PERCURSO DOS VÍNCULOS ATÉ O LANÇAMENTO E O DOSSIÊ, e do ingresso avulso com estorno pela tela.
 *
 * Na base fictícia de Esperança (com a etapa financeira do semeador):
 *   1. /despesa/pagamentos: a linha leva ao lançamento do pagamento e ao empenho na seção do pagamento;
 *   2. o dossiê do empenho: cada linha do histórico leva ao lançamento;
 *   3. /financeiro/extraorcamentario: um ingresso avulso registrado pela tela aparece na lista nova, abre o
 *      lançamento, é estornado pela tela e a linha passa a dizer "estornado" (no banco, o ESTORNO_INGRESSO);
 *   4. /receita/deducoes e /financeiro/transferencias-entre-ugs: os links abrem os lançamentos.
 * Cada link é seguido de fato: a página de destino tem de ser "Lançamento <número>", não a de erro.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 SEED_ADMIN_SENHA=... \
 *      npx tsx scripts/percurso-v36-elos.mts
 * GRAVA (um ingresso e o estorno dele). Recusa a 3010 e banco que não seja o fictício.
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação; este percurso grava.");
const URL_BANCO = process.env["PERCURSO_BANCO"] ?? "";
if (!/\/gestao_publica_esperanca_ficticio(\?|$)/.test(URL_BANCO)) throw new Error("Recusado: PERCURSO_BANCO tem de ser o banco fictício que a BASE serve.");
const usuario = process.env["PERCURSO_USUARIO"] ?? "admin@cg.pb.gov.br";
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const prisma = criarPrismaClient(URL_BANCO);
const sufixo = String(Date.now()).slice(-6);

const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
const hrefs = (page: Page, sel: string): Promise<string[]> => page.$$eval(sel, (as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""));
async function abreLancamento(page: Page, href: string | undefined, oque: string): Promise<void> {
  if (href === undefined || href === "") {
    conferir(false, `${oque}: não há link para o lançamento`);
    return;
  }
  const t = await irPara(n, page, href);
  conferir(/^\/contabilidade\/lancamentos\/[^/]+$/.test(href) && /lançamento /i.test(t) && !/não foi possível ler o lançamento/i.test(t), `${oque}: o link abre o lançamento (${href})`);
}

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(120000);
  await entrar(n, page, usuario, senha);

  console.log("1. pagamentos");
  await irPara(n, page, "/despesa/pagamentos?exercicio=2026");
  const lancPag = await hrefs(page, 'a[data-elo="lancamento"]');
  const empPag = await hrefs(page, 'a[href^="/despesa/empenhos/"][href*="#pagamento-"]');
  conferir(lancPag.length > 0 && empPag.length > 0, `a lista de pagamentos tem ${String(lancPag.length)} links de lançamento e ${String(empPag.length)} de empenho`);
  await abreLancamento(page, lancPag[0], "pagamento");

  console.log("2. o histórico do dossiê");
  const dossie = await irPara(n, page, (empPag[0] ?? "").split("#")[0] ?? "");
  const lancHist = await hrefs(page, 'li a[data-elo="lancamento"]');
  conferir(/histórico/i.test(dossie) && lancHist.length > 0, `o histórico do dossiê tem ${String(lancHist.length)} links de lançamento`);
  await abreLancamento(page, lancHist[lancHist.length - 1], "linha do histórico");

  console.log("3. o ingresso avulso, pela tela, e o estorno");
  const historico = `Caução do percurso ${sufixo}`;
  await irPara(n, page, "/financeiro/extraorcamentario?exercicio=2026");
  const r1 = await preencherEEnviar(page, "registrar-ingresso-extra", [
    { sel: 'select[name="tipoConsignacao"]', valor: "CAUCAO", tipo: "select" },
    { sel: 'input[name="credorConsignatario"]', valor: "Fornecedor do percurso" },
    { sel: 'input[name="documentoDoContribuinte"]', valor: "11222333000181" },
    { sel: 'select[name="contaBancaria"]', valor: "FIC-PM-500", tipo: "select" },
    { sel: 'input[inputmode="decimal"]', valor: "10,00" },
    { sel: 'input[name="data"]', valor: "2026-10-05", tipo: "data" },
    { sel: 'input[name="historico"]', valor: historico },
  ]);
  conferir(r1.tipo === "ok", `ingresso registrado pela tela (${r1.texto.slice(0, 80)})`);
  const mov = await prisma.movimentoExtraorcamentario.findFirst({ where: { historico, tipo: "INGRESSO" }, select: { id: true } });
  const lista = await irPara(n, page, "/financeiro/extraorcamentario?exercicio=2026");
  conferir(mov !== null && lista.includes(historico.toLowerCase()), "o ingresso aparece na lista de ingressos avulsos");
  const lancIng = mov === null ? [] : await hrefs(page, `tr[data-ingresso="${mov.id}"] a[data-elo="lancamento"]`);
  await abreLancamento(page, lancIng[0], "ingresso avulso");
  await irPara(n, page, "/financeiro/extraorcamentario?exercicio=2026");
  const r2 = await preencherEEnviar(page, `form[data-acao="estornar-ingresso"][data-movimento="${mov?.id ?? ""}"]`, [
    { sel: 'input[name="data"]', valor: "2026-10-05", tipo: "data" },
    { sel: 'input[name="motivo"]', valor: "Caução lançada em duplicidade no percurso" },
  ], "estornar-ingresso");
  conferir(r2.tipo === "ok", `estorno do ingresso pela tela (${r2.texto.slice(0, 80)})`);
  const estorno = mov === null ? 0 : await prisma.movimentoExtraorcamentario.count({ where: { estornoDeId: mov.id, tipo: "ESTORNO_INGRESSO" } });
  conferir(estorno === 1, "no banco, um ESTORNO_INGRESSO aponta o ingresso");
  await irPara(n, page, "/financeiro/extraorcamentario?exercicio=2026");
  const situacao = mov === null ? "" : await page.$eval(`tr[data-ingresso="${mov.id}"]`, (tr) => (tr.textContent ?? "").toLowerCase());
  conferir(situacao.includes("estornado") && !situacao.includes("confirmar estorno"), "recarga: a linha diz 'estornado' e não oferece estornar de novo");

  console.log("4. dedução e transferência");
  await irPara(n, page, "/receita/deducoes?exercicio=2026");
  await abreLancamento(page, (await hrefs(page, 'a[data-elo="lancamento"]'))[0], "dedução do FUNDEB");
  await irPara(n, page, "/financeiro/transferencias-entre-ugs?de=2026-01-01&ate=2026-12-31");
  await abreLancamento(page, (await hrefs(page, 'a[data-elo="lancamento-concedida"]'))[0], "transferência, lado da concessão");
  await irPara(n, page, "/financeiro/transferencias-entre-ugs?de=2026-01-01&ate=2026-12-31");
  await abreLancamento(page, (await hrefs(page, 'a[data-elo="lancamento-recebida"]'))[0], "transferência, lado do recebimento");
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso dos vínculos completo.");
