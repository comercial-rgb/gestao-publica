import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { entrar, irPara, lancarNavegadorDoPercurso, type Navegador } from "./percursos-navegador.js";
import type { Page } from "puppeteer";

/**
 * V36 — PERCURSO DO CADASTRO DE CONTA BANCÁRIA PELA TELA (Financeiro › Contas bancárias).
 *   1. o administrador cadastra uma conta nova: a tela confirma, o banco tem a conta com a conta contábil, a fonte
 *      padrão e o rol nascendo com ela, e a lista recarregada a mostra;
 *   2. a mesma conta física sob outro código é recusada com o motivo, e nada é gravado;
 *   3. a tesoureira fictícia, sem a permissão, não vê o formulário (a recusa no servidor está no teste do domínio).
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 SEED_ADMIN_SENHA=... \
 *      [FICTICIO_SENHA=...] npx tsx scripts/percurso-v36-conta-bancaria.mts
 * GRAVA (uma conta). Recusa a 3010 e banco que não seja o fictício.
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação; este percurso grava.");
const URL_BANCO = process.env["PERCURSO_BANCO"] ?? "";
if (!/\/gestao_publica_esperanca_ficticio(\?|$)/.test(URL_BANCO)) throw new Error("Recusado: PERCURSO_BANCO tem de ser o banco fictício que a BASE serve.");
const usuario = process.env["PERCURSO_USUARIO"] ?? "admin@cg.pb.gov.br";
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const senhaFicticia = process.env["FICTICIO_SENHA"] ?? "Ficticio#2026";
const prisma = criarPrismaClient(URL_BANCO);
const FORM = 'form[data-acao="cadastrar-conta-bancaria"]';
const RESULTADO = '[data-resultado-da-acao="cadastrar-conta-bancaria"]';
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};

interface Campos {
  readonly codigo: string;
  readonly agencia: string;
  readonly conta: string;
}

async function cadastrar(page: Page, c: Campos): Promise<{ tipo: string; texto: string }> {
  await irPara(n, page, "/financeiro/contas-bancarias");
  const antes = await page.$eval(RESULTADO, (e) => e.getAttribute("data-resultado-seq")).catch(() => null);
  await page.type(`${FORM} input[name="codigo"]`, c.codigo);
  await page.type(`${FORM} input[name="descricao"]`, "Conta de percurso (fictícia)");
  await page.type(`${FORM} input[name="banco"]`, "001");
  await page.type(`${FORM} input[name="agencia"]`, c.agencia);
  await page.type(`${FORM} input[name="digitoAgencia"]`, "7");
  await page.type(`${FORM} input[name="conta"]`, c.conta);
  await page.type(`${FORM} input[name="digitoConta"]`, "x");
  await page.select(`${FORM} select[name="contaContabil"]`, "1.1.1.1.1.19.00");
  await page.select(`${FORM} select[name="fonte"]`, "500");
  await page.waitForSelector(`${FORM} input[name="__chave"][data-chave-de-comando="pronta"]`);
  await page.click(`${FORM} button[type="submit"]`);
  await page.waitForFunction(
    (sel: string, a: string | null) => {
      const e = document.querySelector(sel);
      return e !== null && e.getAttribute("data-resultado-seq") !== a;
    },
    { timeout: 120000 },
    RESULTADO,
    antes
  );
  return page.$eval(RESULTADO, (e) => ({ tipo: e.getAttribute("role") === "alert" ? "erro" : "ok", texto: e.textContent ?? "" }));
}

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(120000);
  await entrar(n, page, usuario, senha);

  const sufixo = String(Date.now()).slice(-6);
  const nova: Campos = { codigo: `FIC-PERC-${sufixo}`, agencia: sufixo.slice(0, 4), conta: `9${sufixo}` };
  const r1 = await cadastrar(page, nova);
  const gravada = await prisma.contaBancaria.findUnique({
    where: { codigo: nova.codigo },
    select: {
      banco: true, agencia: true, conta: true, digitoConta: true,
      fonte: { select: { codigo: true } }, contaContabil: { select: { codigo: true } },
      fontesPermitidas: { select: { fonte: { select: { codigo: true } } } },
    },
  });
  conferir(
    r1.tipo === "ok" && /cadastrada/.test(r1.texto) && gravada !== null && gravada.contaContabil?.codigo === "1.1.1.1.1.19.00" &&
      gravada.fonte.codigo === "500" && gravada.digitoConta === "X" && gravada.fontesPermitidas.map((f) => f.fonte.codigo).join() === "500",
    `conta nova cadastrada com conta contábil, fonte e rol: ${r1.texto}`
  );
  await irPara(n, page, "/financeiro/contas-bancarias");
  conferir((await page.$(`li[data-conta="${nova.codigo}"]`)) !== null, "a lista recarregada mostra a conta nova");

  const contasAntes = await prisma.contaBancaria.count();
  const r2 = await cadastrar(page, { ...nova, codigo: `FIC-DUP-${sufixo}` });
  conferir(
    r2.tipo === "erro" && /já está cadastrada como/.test(r2.texto) && (await prisma.contaBancaria.count()) === contasAntes,
    `a mesma conta física sob outro código é recusada, nada gravado: ${r2.texto.slice(0, 140)}`
  );

  // Outro contexto do navegador: a sessão do administrador não vaza para a tesoureira.
  const contexto = await nav.createBrowserContext();
  const outra = await contexto.newPage();
  outra.setDefaultTimeout(120000);
  await entrar(n, outra, "tesoureiro@ficticio.local", senhaFicticia);
  await irPara(n, outra, "/financeiro/contas-bancarias");
  const temLista = (await outra.$('[data-papel="lista-de-contas"]')) !== null;
  conferir(temLista && (await outra.$(FORM)) === null, "a tesoureira vê as contas e não vê o formulário de cadastro");
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso do cadastro de conta bancária completo.");
