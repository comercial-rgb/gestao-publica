import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V36 — PERCURSO DO RELATÓRIO DA CONCILIAÇÃO DO PERÍODO EM PDF.
 * Na conta FIC-PM-500 (com o extrato de exemplo de janeiro/2026 importado pelo percurso da importação):
 *   1. abrir o período de janeiro/2026 pela tela (ou usar o que já existe);
 *   2. a tela do período oferece o PDF; o PDF responde 200 quando a conciliação fecha, ou 409 COM O MOTIVO quando
 *      não fecha — e a tela diz a mesma coisa. Nunca um papel que afirme o que a tela recusa.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 SEED_ADMIN_SENHA=... \
 *      npx tsx scripts/percurso-v36-conciliacao-pdf.mts
 * GRAVA (o período). Recusa a 3010 e banco que não seja o fictício.
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação; este percurso grava.");
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

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  await entrar(n, page, usuario, senha);
  const conta = await prisma.contaBancaria.findUniqueOrThrow({ where: { codigo: "FIC-PM-500" }, select: { id: true } });
  let periodo = await prisma.conciliacaoBancaria.findFirst({ where: { contaBancariaId: conta.id }, select: { id: true } });
  if (periodo === null) {
    await irPara(n, page, `/financeiro/conciliacao/periodo?conta=${conta.id}`);
    const r = await preencherEEnviar(page, "abrir-conciliacao", [
      { sel: 'select[name="conta"]', valor: conta.id, tipo: "select" },
      { sel: 'input[name="inicio"]', valor: "2026-01-01", tipo: "data" },
      { sel: 'input[name="fim"]', valor: "2026-01-31", tipo: "data" },
    ]);
    conferir(r.tipo === "ok", `período de janeiro aberto pela tela (${r.texto.slice(0, 80)})`);
    periodo = await prisma.conciliacaoBancaria.findFirst({ where: { contaBancariaId: conta.id }, select: { id: true } });
  }
  const t = await irPara(n, page, `/financeiro/conciliacao/periodo?conta=${conta.id}&id=${periodo?.id ?? ""}`);
  const href = await page.evaluate(() => Array.from(document.querySelectorAll("a")).find((a) => (a.getAttribute("href") ?? "").startsWith("/financeiro/conciliacao/periodo/pdf"))?.getAttribute("href") ?? null);
  const naoFechaNaTela = /não fecha|nao fecha|diferença sem explicação/i.test(t);
  if (href === null) {
    conferir(naoFechaNaTela, "sem botão de PDF só quando a tela diz por quê");
  } else {
    const r = await page.evaluate(async (u) => {
      const x = await fetch(u);
      const tipo = x.headers.get("content-type") ?? "";
      return { status: x.status, tipo, corpo: tipo.includes("pdf") ? `${String((await x.arrayBuffer()).byteLength)} bytes` : await x.text() };
    }, `${n.base}${href}`);
    conferir(
      (r.status === 200 && r.tipo.includes("pdf") && !naoFechaNaTela) || (r.status === 409 && /não foi emitido/.test(r.corpo)),
      `o PDF do período responde como a tela: ${String(r.status)} ${r.tipo} ${r.corpo.slice(0, 120)}`
    );
  }
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso do PDF da conciliação completo.");
