import "dotenv/config";
import { copyFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { entrar, irPara, lancarNavegadorDoPercurso, type Navegador } from "./percursos-navegador.js";
import type { Page } from "puppeteer";

/**
 * V36 — PERCURSO: O EXTRATO DE UMA CONTA NÃO ENTRA EM OUTRA, E O .ofc COM CONTEÚDO OFX É LIDO.
 *   1. o arquivo do banco 033 na conta FIC-PM-500 (banco 001): recusado nomeando os dois bancos;
 *   2. o arquivo já importado na FIC-PM-500, pedido na FIC-CM-500: recusado nomeando onde ele está (antes respondia
 *      "já tinha sido importado" e nomeava a conta errada);
 *   3. o mesmo arquivo com a extensão .ofc, na FIC-PM-500: lido (idempotente, "já tinha sido importado");
 *   4. um arquivo no leiaute OFC (raiz <OFC>): recusado nomeando o formato.
 * Nenhum passo grava extrato novo; o banco é conferido depois de cada recusa.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 SEED_ADMIN_SENHA=... \
 *      npx tsx scripts/percurso-v36-extrato-da-conta-certa.mts
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação.");
const URL_BANCO = process.env["PERCURSO_BANCO"] ?? "";
if (!/\/gestao_publica_esperanca_ficticio(\?|$)/.test(URL_BANCO)) throw new Error("Recusado: PERCURSO_BANCO tem de ser o banco fictício que a BASE serve.");
const usuario = process.env["PERCURSO_USUARIO"] ?? "admin@cg.pb.gov.br";
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const prisma = criarPrismaClient(URL_BANCO);
const CORPUS = resolve(import.meta.dirname, "../packages/ofx/corpus");
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};

async function importar(page: Page, conta: string, arquivo: string): Promise<{ tipo: string; texto: string }> {
  await irPara(n, page, "/financeiro/conciliacao?exercicio=2026");
  const form = 'form[data-acao="importar-extrato"]';
  await page.select(`${form} select[name="contaBancaria"]`, conta);
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
  const extratos = (): Promise<number> => prisma.extratoBancario.count();
  // O passo 2 depende de o 01-basico já estar na FIC-PM-500 (percurso-v36-importar-extrato.mts o importou).
  const antes = await extratos();

  const r1 = await importar(page, "FIC-PM-500", join(CORPUS, "02-sem-checknum-e-memo-longo.ofx"));
  conferir(r1.tipo === "erro" && /banco 033 e a conta FIC-PM-500 está cadastrada no banco 001/.test(r1.texto) && (await extratos()) === antes, `outro banco: ${r1.texto.slice(0, 130)}`);

  const r2 = await importar(page, "FIC-CM-500", join(CORPUS, "01-basico.ofx"));
  conferir(r2.tipo === "erro" && /já foi importado na conta FIC-PM-500, não na FIC-CM-500/.test(r2.texto) && (await extratos()) === antes, `mesmo arquivo em outra conta: ${r2.texto.slice(0, 130)}`);

  const ofc = join(tmpdir(), `extrato-${String(Date.now())}.ofc`);
  copyFileSync(join(CORPUS, "01-basico.ofx"), ofc);
  const r3 = await importar(page, "FIC-PM-500", ofc);
  conferir(r3.tipo === "ok" && /já tinha sido importado/.test(r3.texto), `.ofc com conteúdo OFX é lido: ${r3.texto.slice(0, 120)}`);

  const leiauteOfc = join(tmpdir(), `leiaute-${String(Date.now())}.ofc`);
  writeFileSync(leiauteOfc, "<OFC>\n<ACCTSTMT>\n<STMTRS>\n</STMTRS>\n</ACCTSTMT>\n</OFC>\n");
  const r4 = await importar(page, "FIC-PM-500", leiauteOfc);
  conferir(r4.tipo === "erro" && /leiaute OFC, que o sistema ainda não lê/.test(r4.texto) && (await extratos()) === antes, `leiaute OFC recusado nomeando o formato: ${r4.texto.slice(0, 130)}`);
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso do extrato da conta certa completo.");
