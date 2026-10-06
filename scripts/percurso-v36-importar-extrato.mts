import "dotenv/config";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { entrar, irPara, lancarNavegadorDoPercurso, type Navegador } from "./percursos-navegador.js";
import type { Page } from "puppeteer";

/**
 * V36 — PERCURSO DA IMPORTAÇÃO DO EXTRATO OFX PELA TELA DA CONCILIAÇÃO.
 *   1. importar o arquivo de exemplo do leitor (packages/ofx/corpus/01-basico.ofx) na conta FIC-PM-500: a tela diz
 *      quantos lançamentos entraram, e o banco tem o extrato com essas linhas;
 *   2. importar o MESMO arquivo de novo: "já tinha sido importado", nenhuma linha a mais;
 *   3. um arquivo que não é OFX é recusado com o motivo, e nada é gravado.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 SEED_ADMIN_SENHA=... \
 *      npx tsx scripts/percurso-v36-importar-extrato.mts
 * GRAVA (um extrato). Recusa a 3010 e banco que não seja o fictício.
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação; este percurso grava.");
const URL_BANCO = process.env["PERCURSO_BANCO"] ?? "";
if (!/\/gestao_publica_esperanca_ficticio(\?|$)/.test(URL_BANCO)) throw new Error("Recusado: PERCURSO_BANCO tem de ser o banco fictício que a BASE serve.");
const usuario = process.env["PERCURSO_USUARIO"] ?? "admin@cg.pb.gov.br";
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const prisma = criarPrismaClient(URL_BANCO);
const CONTA = "FIC-PM-500";
const OFX = resolve(import.meta.dirname, "../packages/ofx/corpus/01-basico.ofx");
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};

async function importar(page: Page, arquivo: string): Promise<{ tipo: string; texto: string }> {
  await irPara(n, page, "/financeiro/conciliacao?exercicio=2026");
  const form = 'form[data-acao="importar-extrato"]';
  await page.select(`${form} select[name="contaBancaria"]`, CONTA);
  const input = await page.$(`${form} input[type="file"]`);
  if (input === null) throw new Error("A tela não tem o campo do arquivo.");
  await (input as unknown as { uploadFile: (p: string) => Promise<void> }).uploadFile(arquivo);
  await page.waitForSelector(`${form} input[name="__chave"][data-chave-de-comando="pronta"]`);
  await page.click(`${form} button[type="submit"]`);
  await page.waitForSelector(`${form} [data-resultado-da-acao="importar-extrato"]`, { timeout: 120000 });
  return page.$eval(`${form} [data-resultado-da-acao="importar-extrato"]`, (e) => ({ tipo: e.getAttribute("role") === "alert" ? "erro" : "ok", texto: e.textContent ?? "" }));
}

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(120000);
  await entrar(n, page, usuario, senha);
  const conta = await prisma.contaBancaria.findUniqueOrThrow({ where: { codigo: CONTA }, select: { id: true } });
  const linhasAntes = await prisma.lancamentoExtrato.count({ where: { contaBancariaId: conta.id } });

  const r1 = await importar(page, OFX);
  const linhasDepois = await prisma.lancamentoExtrato.count({ where: { contaBancariaId: conta.id } });
  const jaEstava = /já tinha sido importado/.test(r1.texto);
  conferir(r1.tipo === "ok" && (jaEstava || (/lançamento\(s\) novo/.test(r1.texto) && linhasDepois > linhasAntes)), `primeira importação: ${r1.texto} (linhas ${String(linhasAntes)} → ${String(linhasDepois)})`);

  const r2 = await importar(page, OFX);
  const linhasDeNovo = await prisma.lancamentoExtrato.count({ where: { contaBancariaId: conta.id } });
  conferir(r2.tipo === "ok" && /já tinha sido importado/.test(r2.texto) && linhasDeNovo === linhasDepois, `o mesmo arquivo de novo não duplica: ${r2.texto}`);

  const ruim = join(tmpdir(), `nao-e-ofx-${String(Date.now())}.ofx`);
  writeFileSync(ruim, "isto não é um extrato OFX\n");
  const extratosAntes = await prisma.extratoBancario.count();
  const r3 = await importar(page, ruim);
  conferir(r3.tipo === "erro" && r3.texto.length > 10 && (await prisma.extratoBancario.count()) === extratosAntes, `arquivo inválido recusado com o motivo, nada gravado: ${r3.texto.slice(0, 120)}`);
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da importação do extrato completo.");
