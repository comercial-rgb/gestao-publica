import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { diaCivil, inicioDoDiaCivil, fimDoDiaCivil } from "../packages/datas/index.js";
import { listarArrecadacoes } from "../modules/m04-receita/consultas.js";
import { pagamentosEfetuados, totaisDosPagamentos } from "../modules/m05-despesa/pagamentos-efetuados.js";
import { entrar, irPara, lancarNavegadorDoPercurso, type Navegador } from "./percursos-navegador.js";
import type { Page } from "puppeteer";

/**
 * V36 — PERCURSO DA RECEITA MÊS A MÊS E DO MOVIMENTO DIÁRIO.
 *   1. receita mês a mês: o total de 2026 na tela bate com `listarArrecadacoes` (outra leitura do M04, pelo exercício
 *      da guia) — a concordância de duas somas que não compartilham o laço;
 *   2. movimento diário: no dia com mais pagamentos da base, o pago da tela bate com `pagamentosEfetuados` no dia;
 *      no dia de uma arrecadação, a receita da tela bate com `listarArrecadacoes` na janela do dia;
 *   3. o PDF do dia sai (200, application/pdf), e o dia malformado é 400.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 SEED_ADMIN_SENHA=... \
 *      npx tsx scripts/percurso-v36-receita-e-diario.mts
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
const br = (v: string): string => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const texto = (page: Page, sel: string): Promise<string> => page.$eval(sel, (e) => (e.textContent ?? "").trim()).catch(() => "(ausente)");

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(120000);
  await entrar(n, page, usuario, senha);

  // 1.
  const do2026 = await listarArrecadacoes(prisma, { exercicio: 2026 });
  await irPara(n, page, "/relatorios/receita-mensal?exercicio=2026");
  const naTela = await texto(page, '[data-total-do-ano="2026"]');
  conferir(naTela.includes(br(do2026.total.toFixed(2))), `receita 2026: tela ${naTela}, lista das arrecadações R$ ${br(do2026.total.toFixed(2))}`);
  const linhas = await page.$$eval('[data-lista="receita-mes-a-mes"] tbody tr', (rs) => rs.length).catch(() => 0);
  conferir(linhas > 0, `a tabela tem ${String(linhas)} linha(s) fonte × ano`);

  // 2. o dia com mais pagamentos.
  const pags = await prisma.pagamento.findMany({ where: { estornoDeId: null, anulacaoParcialDeId: null }, select: { data: true } });
  const porDia = new Map<string, number>();
  for (const p of pags) porDia.set(diaCivil(p.data), (porDia.get(diaCivil(p.data)) ?? 0) + 1);
  const dia = [...porDia.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (dia === undefined) throw new Error("Nenhum pagamento na base fictícia.");
  const esperado = totaisDosPagamentos(await pagamentosEfetuados(prisma, { de: inicioDoDiaCivil(dia), ate: fimDoDiaCivil(dia) }));
  await irPara(n, page, `/relatorios/movimento-diario?dia=${dia}`);
  const pago = await texto(page, '[data-total="pago"]');
  conferir(pago.includes(br(esperado.pagoVivo.toFixed(2))), `pago em ${dia}: tela ${pago}, domínio R$ ${br(esperado.pagoVivo.toFixed(2))}`);

  const guia = await prisma.receitaArrecadada.findFirst({ where: { tipo: "ARRECADACAO" }, orderBy: { dataArrecadacao: "asc" }, select: { dataArrecadacao: true, exercicio: true } });
  if (guia !== null) {
    const diaDaGuia = diaCivil(guia.dataArrecadacao);
    const doDia = await listarArrecadacoes(prisma, { exercicio: guia.exercicio, inicio: inicioDoDiaCivil(diaDaGuia), fim: fimDoDiaCivil(diaDaGuia) });
    await irPara(n, page, `/relatorios/movimento-diario?dia=${diaDaGuia}`);
    const rec = await texto(page, '[data-total="receita"]');
    conferir(rec.includes(br(doDia.total.toFixed(2))), `receita em ${diaDaGuia}: tela ${rec}, lista das arrecadações R$ ${br(doDia.total.toFixed(2))}`);
  }

  // 3. o PDF, pelo mesmo navegador autenticado.
  const pdf = await page.evaluate(async (d: string) => {
    const r = await fetch(`/relatorios/movimento-diario/pdf?dia=${d}`);
    const ruim = await fetch("/relatorios/movimento-diario/pdf?dia=ontem");
    return { status: r.status, tipo: r.headers.get("content-type") ?? "", ruim: ruim.status };
  }, dia);
  conferir(pdf.status === 200 && pdf.tipo.includes("application/pdf") && pdf.ruim === 400, `PDF do dia ${String(pdf.status)} ${pdf.tipo}; dia malformado ${String(pdf.ruim)}`);
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da receita mês a mês e do movimento diário completo.");
