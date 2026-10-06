import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { fimDoDiaCivil, inicioDoDiaCivil } from "../packages/datas/index.js";
import { dispendiosEfetuados, totalDosDispendios } from "../modules/m07-extraorcamentario/dispendios-efetuados.js";
import { entrar, irPara, lancarNavegadorDoPercurso, type Navegador } from "./percursos-navegador.js";

/**
 * V36 — PERCURSO DOS DISPÊNDIOS EXTRAORÇAMENTÁRIOS NO RELATÓRIO DE PAGAMENTOS EFETUADOS.
 *   1. registrar um recolhimento a consignatário pela tela do extraorçamentário (o caminho de quem opera);
 *   2. o relatório de pagamentos efetuados mostra a seção dos dispêndios com a linha nova e o total igual ao do
 *      domínio, sem somá-la ao total dos pagamentos;
 *   3. com recorte por unidade orçamentária, a seção diz por que não está ali.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 SEED_ADMIN_SENHA=... \
 *      npx tsx scripts/percurso-v36-dispendios-extra.mts
 * GRAVA (um recolhimento). Recusa a 3010 e banco que não seja o fictício.
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação; este percurso grava.");
const URL_BANCO = process.env["PERCURSO_BANCO"] ?? "";
if (!/\/gestao_publica_esperanca_ficticio(\?|$)/.test(URL_BANCO)) throw new Error("Recusado: PERCURSO_BANCO tem de ser o banco fictício que a BASE serve.");
const usuario = process.env["PERCURSO_USUARIO"] ?? "admin@cg.pb.gov.br";
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const DIA = process.env["PERCURSO_DIA"] ?? "2026-10-06";
const prisma = criarPrismaClient(URL_BANCO);
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(120000);
  await entrar(n, page, usuario, senha);

  // 1. o recolhimento pela tela: a primeira obrigação com retenção a recolher.
  await irPara(n, page, "/financeiro/extraorcamentario/recolher");
  const link = await page.$eval('a[href*="/financeiro/extraorcamentario/recolher?tipo="]', (a) => a.getAttribute("href") ?? "").catch(() => "");
  if (link === "") throw new Error("Nenhuma obrigação com retenção a recolher na base fictícia.");
  await irPara(n, page, link);
  const FORM = 'form[data-acao="recolher-com-composicao"]';
  const contas = await page.$$eval(`${FORM} select[name="contaBancaria"] option`, (os) => os.map((o) => (o as HTMLOptionElement).value).filter((v) => v !== ""));
  await page.select(`${FORM} select[name="contaBancaria"]`, contas.includes("FIC-PM-500") ? "FIC-PM-500" : (contas[0] ?? ""));
  await page.$eval(`${FORM} input[name="data"]`, (e, d) => {
    (e as HTMLInputElement).value = d as string;
  }, DIA);
  await page.type(`${FORM} input[name="historico"]`, "Recolhimento de retenção (percurso, fictício)");
  await page.type(`${FORM} input[placeholder="00.000.000/0000-00"]`, "11222333000181");
  await page.type(`${FORM} input[name="parcela"]`, "10,00");
  await page.waitForSelector(`${FORM} input[name="__chave"][data-chave-de-comando="pronta"]`);
  const antes = await prisma.movimentoExtraorcamentario.count({ where: { tipo: "DISPENDIO" } });
  await page.click(`${FORM} button[type="submit"]`);
  await page.waitForSelector('[data-resultado-da-acao="recolher-com-composicao"]', { timeout: 120000 });
  const r1 = await page.$eval('[data-resultado-da-acao="recolher-com-composicao"]', (e) => ({ tipo: e.getAttribute("role"), texto: e.textContent ?? "" }));
  const depois = await prisma.movimentoExtraorcamentario.count({ where: { tipo: "DISPENDIO" } });
  conferir(r1.tipo === "status" && depois === antes + 1, `recolhimento registrado pela tela: ${r1.texto.slice(0, 140)}`);

  // 2. o relatório.
  const dominio = await dispendiosEfetuados(prisma, { de: inicioDoDiaCivil("2026-01-01"), ate: fimDoDiaCivil("2026-12-31") });
  await irPara(n, page, "/relatorios/pagamentos?exercicio=2026");
  const linhasNaTela = await page.$$eval('[data-lista="dispendios-extra"] tbody tr', (rs) => rs.length);
  const totalNaTela = await page.$eval('[data-total="extra"]', (e) => e.textContent ?? "").catch(() => "");
  const esperado = Number(totalDosDispendios(dominio).toFixed(2)).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  conferir(linhasNaTela === dominio.length && totalNaTela.includes(esperado), `a seção mostra ${String(linhasNaTela)} dispêndio(s) e o total ${totalNaTela} (domínio: ${String(dominio.length)}, R$ ${esperado})`);
  const pagoNaTela = await page.$eval('[data-total="pago"]', (e) => e.textContent ?? "");
  conferir(!pagoNaTela.includes(esperado) || esperado === "0,00", `o total dos pagamentos (${pagoNaTela}) não absorveu o extra`);

  // 3. o recorte por unidade.
  const ug = await prisma.unidadeOrcamentaria.findFirst({ orderBy: { codigo: "asc" }, select: { codigo: true } });
  await irPara(n, page, `/relatorios/pagamentos?exercicio=2026&ug=${ug?.codigo ?? ""}`);
  const motivo = await page.$eval("[data-extra-indisponivel]", (e) => e.textContent ?? "").catch(() => "");
  conferir(/não se recortam por unidade orçamentária/.test(motivo), `com unidade escolhida, a seção diz o motivo: ${motivo}`);
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso dos dispêndios extraorçamentários completo.");
