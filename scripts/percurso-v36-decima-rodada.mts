import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { borderoDosMovimentos } from "../modules/m09-tesouraria/bordero-de-movimentos.js";
import { fimDoDiaCivil, inicioDoDiaCivil } from "../packages/datas/index.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V36 — PERCURSO DA DÉCIMA RODADA:
 *   1. filtros da consulta de pagamentos (TR 5.10.2.4): "com documento" e "assinados" no relatório de pagamentos
 *      efetuados; a tela lista exatamente os pagamentos que o banco diz ter documento / assinatura no período.
 *   2. borderô dos movimentos bancários (TR 5.10.2.22): dois rendimentos registrados pela tela; o borderô da conta no
 *      dia sai em PDF e relaciona os dois, com o total de entradas; quem não lê o financeiro não emite.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 npx tsx scripts/percurso-v36-decima-rodada.mts
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
const marca = String(Date.now()).slice(-6);
const HOJE = "2026-10-06";

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  await entrar(n, page, "admin@cg.pb.gov.br", senha);

  // ── 1. filtros da consulta de pagamentos ──
  const doPeriodo = { data: { gte: inicioDoDiaCivil("2026-01-01"), lte: fimDoDiaCivil("2026-12-31") }, estornoDeId: null, anulacaoParcialDeId: null };
  const comDoc = (await prisma.pagamento.findMany({ where: { ...doPeriodo, anexos: { some: {} } }, select: { numero: true } })).map((p) => p.numero).sort();
  const assinados = (
    await prisma.pagamento.findMany({
      where: { ...doPeriodo, OR: [{ anexos: { some: { assinaturas: { some: {} } } } }, { ordemDePagamento: { anexos: { some: { assinaturas: { some: {} } } } } }] },
      select: { numero: true },
    })
  ).map((p) => p.numero).sort();
  const total = await prisma.pagamento.count({ where: doPeriodo });
  const naTela = async (q: string): Promise<string[]> => {
    await irPara(n, page, `/relatorios/pagamentos?exercicio=2026&desde=2026-01-01&ate=2026-12-31${q}`);
    return (await page.$$eval("table[data-lista='pagamentos-efetuados'] tbody tr", (trs) => trs.map((t) => t.getAttribute("data-pagamento") ?? ""))).sort();
  };
  const telaComDoc = await naTela("&anexo=sim");
  const telaSemDoc = await naTela("&anexo=nao");
  conferir(
    comDoc.length > 0 && JSON.stringify(telaComDoc) === JSON.stringify(comDoc) && telaSemDoc.length === total - comDoc.length && !telaSemDoc.some((x) => comDoc.includes(x)),
    `com documento: a tela lista ${String(telaComDoc.length)} (${telaComDoc.join(", ")}), o banco diz ${String(comDoc.length)}; sem documento ${String(telaSemDoc.length)} de ${String(total)}`
  );
  const telaAssinados = await naTela("&assinatura=sim");
  const telaNaoAssinados = await naTela("&assinatura=nao");
  conferir(
    JSON.stringify(telaAssinados) === JSON.stringify(assinados) && telaNaoAssinados.length === total - assinados.length,
    `assinados: a tela lista ${String(telaAssinados.length)}, o banco diz ${String(assinados.length)}; não assinados ${String(telaNaoAssinados.length)} de ${String(total)}`
  );
  const coluna = await page.$$eval("[data-documentos]", (els) => els.length);
  const csv = await page.evaluate(() => [...document.querySelectorAll("a")].some((a) => (a.getAttribute("href") ?? "").includes("assinatura=nao")));
  conferir(coluna === telaNaoAssinados.length && coluna > 0, `coluna Documentos em cada linha (${String(coluna)}); o filtro segue nos links da página: ${csv ? "sim" : "não"}`);

  // ── 2. borderô dos movimentos bancários ──
  const conta = await prisma.contaBancaria.findFirstOrThrow({ where: { codigo: "FIC-PM-500" }, select: { id: true } });
  const contra = await prisma.contaPcasp.findFirstOrThrow({ where: { codigo: "4.4.5.1.1.00.00" }, select: { id: true } });
  const registrar = async (valor: string, historico: string): Promise<string> => {
    await irPara(n, page, `/financeiro/movimentacao?conta=${conta.id}`);
    await page.select("form[data-acao='registrar-movimento-bancario'] select[name='conta']", conta.id);
    await new Promise((r) => setTimeout(r, 500));
    const fonte = await page.$eval("form[data-acao='registrar-movimento-bancario'] select[name='fonte']", (s) => [...(s as HTMLSelectElement).options].find((o) => o.value !== "")?.value ?? "");
    const r = await preencherEEnviar(page, "registrar-movimento-bancario", [
      { sel: 'select[name="fonte"]', valor: fonte, tipo: "select" },
      { sel: 'select[name="tipo"]', valor: "RENDIMENTO", tipo: "select" },
      { sel: 'input[data-mascara="valor"]', valor },
      { sel: 'input[name="dia"]', valor: HOJE, tipo: "data" },
      { sel: 'select[name="contrapartida"]', valor: contra.id, tipo: "select" },
      { sel: '[name="historico"]', valor: historico },
    ]);
    return r.texto;
  };
  const r1 = await registrar("12,34", `Rendimento fictício A ${marca}`);
  const r2 = await registrar("1.000,01", `Rendimento fictício B ${marca}`);
  const gravados = await prisma.movimentoBancario.findMany({ where: { historico: { contains: marca } }, select: { valor: true } });
  conferir(gravados.length === 2, `dois rendimentos registrados pela tela (${String(gravados.length)}): "${r1.trim().slice(0, 50)}" / "${r2.trim().slice(0, 50)}"`);

  await irPara(n, page, `/financeiro/movimentacao?conta=${conta.id}`);
  const temForm = (await page.$("form[data-form-bordero] select[name='conta']")) !== null;
  const b = await borderoDosMovimentos(prisma, { contaBancariaId: conta.id, de: inicioDoDiaCivil(HOJE), ate: fimDoDiaCivil(HOJE) });
  const nossos = (b?.linhas ?? []).filter((l) => l.historico.includes(marca)).map((l) => l.valor.toFixed(2)).sort();
  const pdf = await page.evaluate(async (u) => {
    const r = await fetch(u);
    return { status: r.status, tipo: r.headers.get("content-type") ?? "", bytes: (await r.arrayBuffer()).byteLength };
  }, `${n.base}/financeiro/movimentacao/bordero?conta=${conta.id}&desde=${HOJE}&ate=${HOJE}`);
  conferir(
    temForm && JSON.stringify(nossos) === JSON.stringify(["1000.01", "12.34"]) && pdf.status === 200 && pdf.tipo.includes("application/pdf"),
    `borderô do dia: formulário na tela; relaciona os dois (${nossos.join(" e ")}), entradas ${b?.entradas.toFixed(2) ?? "-"}; PDF ${String(pdf.status)} ${pdf.tipo} ${String(pdf.bytes)} bytes`
  );
  const ruim = await page.evaluate(async (u) => (await fetch(u)).status, `${n.base}/financeiro/movimentacao/bordero?conta=${conta.id}&desde=${HOJE}&ate=2026-01-01`);
  conferir(ruim === 400, `período invertido recusado (${String(ruim)})`);

  const outra = await (await nav.createBrowserContext()).newPage();
  outra.setDefaultTimeout(120000);
  await entrar(n, outra, "atestador@ficticio.local", "Ficticio#2026");
  await irPara(n, outra, "/");
  const negado = await outra.evaluate(async (u) => {
    const r = await fetch(u);
    return { status: r.status, texto: (await r.text()).slice(0, 200) };
  }, `${n.base}/financeiro/movimentacao/bordero?conta=${conta.id}&desde=${HOJE}&ate=${HOJE}`);
  conferir(negado.status === 403 && /financeiro|acesso|permiss/i.test(negado.texto), `sem leitura do financeiro: ${String(negado.status)} ("${negado.texto.replace(/\s+/g, " ").slice(0, 100)}")`);
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da décima rodada completo.");
