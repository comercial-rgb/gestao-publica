import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { entrar, irPara, lancarNavegadorDoPercurso, type Navegador } from "./percursos-navegador.js";
import type { Page } from "puppeteer";

/**
 * V36 — PERCURSO DA FICHA DO CREDOR (Relatórios › Ficha do credor). A propriedade conferida é a CONCORDÂNCIA: cada
 * bloco da ficha tem de dizer o mesmo que a tela própria dele com o mesmo credor no filtro.
 *   1. o credor com mais pagamentos na base fictícia: a ficha abre com o nome e o documento;
 *   2. pagamentos: o número de linhas e o líquido batem com /relatorios/pagamentos?credor=;
 *   3. a pagar: os dois totais batem com /despesa/a-pagar?credor=;
 *   4. empenhos: o número de linhas bate com o banco (empenhos do exercício do credor);
 *   5. o nome do credor na tela do a pagar leva à ficha.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 SEED_ADMIN_SENHA=... \
 *      npx tsx scripts/percurso-v36-ficha-do-credor.mts
 * SÓ LÊ.
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
const URL_BANCO = process.env["PERCURSO_BANCO"] ?? "";
if (!/\/gestao_publica_esperanca_ficticio(\?|$)/.test(URL_BANCO)) throw new Error("Recusado: PERCURSO_BANCO tem de ser o banco fictício que a BASE serve.");
const usuario = process.env["PERCURSO_USUARIO"] ?? "admin@cg.pb.gov.br";
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const prisma = criarPrismaClient(URL_BANCO);
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
const texto = (page: Page, sel: string): Promise<string> => page.$eval(sel, (e) => (e.textContent ?? "").trim()).catch(() => "(ausente)");
const linhas = (page: Page, sel: string): Promise<number> => page.$$eval(`${sel} tbody tr`, (rs) => rs.length).catch(() => 0);

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(120000);
  await entrar(n, page, usuario, senha);

  const porCredor = await prisma.pagamento.findMany({
    where: { estornoDeId: null, anulacaoParcialDeId: null },
    select: { liquidacao: { select: { empenho: { select: { credorCpfCnpj: true } } } } },
  });
  const contagem = new Map<string, number>();
  for (const p of porCredor) {
    const d = p.liquidacao.empenho.credorCpfCnpj;
    contagem.set(d, (contagem.get(d) ?? 0) + 1);
  }
  const doc = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (doc === undefined) throw new Error("Nenhum pagamento na base fictícia.");

  await irPara(n, page, `/relatorios/credor?exercicio=2026&documento=${doc}`);
  conferir((await page.$(`[data-ficha-do-credor="${doc}"]`)) !== null, `a ficha abre para o credor ${doc}`);
  const ficha = {
    pagamentos: await linhas(page, '[data-lista="pagamentos-do-credor"]'),
    liquido: await texto(page, '[data-total="liquido-pago"]'),
    aLiquidar: await texto(page, '[data-total="a-liquidar"]'),
    aPagar: await texto(page, '[data-total="a-pagar"]'),
    empenhos: await linhas(page, '[data-lista="empenhos-do-credor"]'),
  };

  await irPara(n, page, `/relatorios/pagamentos?exercicio=2026&credor=${doc}`);
  const pg = { linhas: await linhas(page, '[data-lista="pagamentos-efetuados"]'), liquido: await texto(page, '[data-total="liquido"]') };
  conferir(ficha.pagamentos === pg.linhas && ficha.liquido === pg.liquido, `pagamentos: ficha ${String(ficha.pagamentos)} linhas, ${ficha.liquido}; relatório ${String(pg.linhas)} linhas, ${pg.liquido}`);

  await irPara(n, page, `/despesa/a-pagar?exercicio=2026&credor=${doc}`);
  const ap = { aLiquidar: await texto(page, '[data-total="a-liquidar"]'), aPagar: await texto(page, '[data-total="liquidado-a-pagar"]') };
  conferir(ficha.aLiquidar === ap.aLiquidar && ficha.aPagar === ap.aPagar, `a pagar: ficha ${ficha.aLiquidar} / ${ficha.aPagar}; tela do a pagar ${ap.aLiquidar} / ${ap.aPagar}`);

  // Os empenhos originais (a anulação total e a parcial são linhas próprias que apontam o original).
  const noBanco = await prisma.empenho.count({ where: { credorCpfCnpj: doc, ficha: { exercicio: 2026 }, estornoDeId: null, anulacaoParcialDeId: null } });
  conferir(ficha.empenhos === noBanco, `empenhos: ficha ${String(ficha.empenhos)}, banco ${String(noBanco)}`);

  await irPara(n, page, "/despesa/a-pagar?exercicio=2026");
  const elo = await page.$eval('[data-elo="ficha-do-credor"]', (a) => a.getAttribute("href") ?? "").catch(() => "");
  if (elo !== "") await irPara(n, page, elo);
  conferir(elo !== "" && (await page.$("[data-ficha-do-credor]")) !== null, `o nome do credor no a pagar leva à ficha (${elo})`);
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da ficha do credor completo.");
