import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { lerExtratoImportado } from "../modules/m09-tesouraria/extrato-importado.js";
import { formatarMoeda } from "../packages/contracts/index.js";
import { janelaCivilDoAno } from "../packages/datas/index.js";
import { entrar, irPara, lancarNavegadorDoPercurso, type Navegador } from "./percursos-navegador.js";
import type { Page } from "puppeteer";

/**
 * V36 — PERCURSO: OS EXTRATOS IMPORTADOS, PARA CONSULTA E IMPRESSÃO (/financeiro/conciliacao/extratos).
 *   1. a lista do exercício traz cada extrato da base, com a conta mascarada (o número cru não aparece na página);
 *   2. "Ver lançamentos" mostra as linhas e os totais IGUAIS aos do leitor do M09 sobre o banco servido;
 *   3. o PDF sai (200, application/pdf) e o extrato inexistente responde 404 com o motivo;
 *   4. quem não tem a leitura do financeiro é mandado para /sem-acesso nomeando a ação, e a rota do PDF responde 403.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 SEED_ADMIN_SENHA=... \
 *      npx tsx scripts/percurso-v36-extratos-importados.mts
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação.");
const URL_BANCO = process.env["PERCURSO_BANCO"] ?? "";
if (!/\/gestao_publica_esperanca_ficticio(\?|$)/.test(URL_BANCO)) throw new Error("Recusado: PERCURSO_BANCO tem de ser o banco fictício que a BASE serve.");
const usuario = process.env["PERCURSO_USUARIO"] ?? "admin@cg.pb.gov.br";
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const semFinanceiro = process.env["PERCURSO_SEM_FINANCEIRO"] ?? "atestador@ficticio.local";
const senhaFicticia = process.env["FICTICIO_SENHA"] ?? "Ficticio#2026";
const prisma = criarPrismaClient(URL_BANCO);
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};

async function pedir(page: Page, caminho: string): Promise<{ status: number; tipo: string; tamanho: number; texto: string }> {
  return page.evaluate(async (url) => {
    const r = await fetch(url, { credentials: "same-origin" });
    const tipo = r.headers.get("content-type") ?? "";
    const corpo = new Uint8Array(await r.arrayBuffer());
    return { status: r.status, tipo, tamanho: corpo.length, texto: tipo.includes("pdf") ? "" : new TextDecoder().decode(corpo) };
  }, caminho);
}

const ANO = 2026;
const nav = await lancarNavegadorDoPercurso();
try {
  const doAno = await prisma.extratoBancario.findMany({
    where: { periodoFim: { gte: janelaCivilDoAno(ANO).inicio, lt: janelaCivilDoAno(ANO + 1).inicio } },
    orderBy: [{ periodoFim: "desc" }, { criadoEm: "desc" }],
    select: { id: true, contaBancaria: { select: { codigo: true, conta: true } } },
  });
  if (doAno.length === 0) throw new Error(`A base não tem extrato importado em ${String(ANO)}; rode antes scripts/percurso-v36-importar-extrato.mts.`);

  const page = await nav.newPage();
  page.setDefaultTimeout(120000);
  await entrar(n, page, usuario, senha);

  await irPara(n, page, `/financeiro/conciliacao/extratos?exercicio=${String(ANO)}`);
  const naTela = await page.$$eval("[data-lista='extratos'] tr[data-extrato]", (trs) => trs.map((t) => t.getAttribute("data-extrato")));
  // O TEXTO VISÍVEL, não o HTML bruto: no modo de desenvolvimento o HTML carrega números de tempo do React, e seis
  // dígitos de uma conta fictícia já coincidiram com um deles (falso positivo medido em 06/10/2026).
  const html = await page.evaluate(() => document.body.innerText);
  const crus = doAno.map((e) => e.contaBancaria.conta).filter((c): c is string => c !== null && c.length >= 4);
  conferir(
    naTela.length === doAno.length && doAno.every((e, i) => naTela[i] === e.id) && crus.every((c) => !html.includes(c)),
    `a lista traz os ${String(doAno.length)} extrato(s) do exercício, na ordem do banco, sem o número cru da conta (na tela: ${naTela.join(",")}; cru presente: ${crus.filter((c) => html.includes(c)).map((c) => `${String(c.length)} dígitos, contexto "${html.slice(Math.max(0, html.indexOf(c) - 40), html.indexOf(c) + c.length + 10).replace(c, "<CRU>")}"`).join("; ") || "nenhum"})`
  );

  const alvo = doAno[0]!;
  await page.click(`tr[data-extrato='${alvo.id}'] a`);
  await page.waitForSelector(`[data-extrato-escolhido='${alvo.id}']`);
  const esperado = await lerExtratoImportado(prisma, alvo.id);
  const linhas = await page.$$eval("[data-lista='linhas-do-extrato'] tbody tr", (trs) => trs.map((t) => Array.from(t.querySelectorAll("td")).map((c) => (c.textContent ?? "").trim())));
  const total = (q: string): Promise<string> => page.$eval(`[data-total='${q}']`, (e) => (e.textContent ?? "").replace(/\s/g, ""));
  const brl = (v: string): string => formatarMoeda(v).texto.replace(/\s/g, "");
  const situacoes: Record<string, string> = { CONCILIADA: "conciliada", PARCIAL: "conciliada em parte", PENDENTE: "pendente" };
  const mesmasLinhas =
    esperado !== null &&
    linhas.length === esperado.linhas.length &&
    esperado.linhas.every((l, i) => linhas[i]![3] === l.fitid && linhas[i]![6] === situacoes[l.situacao]);
  conferir(mesmasLinhas, `as ${String(linhas.length)} linha(s) na ordem e com a situação do leitor do M09`);
  const [cred, deb, mov] = [await total("creditos"), await total("debitos"), await total("movimento")];
  conferir(
    esperado !== null && cred === brl(esperado.totalCreditos.toFixed(2)) && deb === brl(esperado.totalDebitos.toFixed(2)) && mov === brl(esperado.movimentoLiquido.toFixed(2)),
    `os totais são os do arquivo: créditos ${cred}, débitos ${deb}, movimento ${mov}`
  );

  const pdf = await pedir(page, `/financeiro/conciliacao/extratos/pdf?id=${encodeURIComponent(alvo.id)}`);
  const inexistente = await pedir(page, "/financeiro/conciliacao/extratos/pdf?id=nao-existe");
  conferir(
    pdf.status === 200 && pdf.tipo.includes("application/pdf") && pdf.tamanho > 2000 && inexistente.status === 404 && /não existe/.test(inexistente.texto),
    `PDF ${String(pdf.status)} ${pdf.tipo} ${String(pdf.tamanho)} bytes; inexistente ${String(inexistente.status)} "${inexistente.texto.slice(0, 60)}"`
  );

  const outra = await (await nav.createBrowserContext()).newPage();
  outra.setDefaultTimeout(120000);
  await entrar(n, outra, semFinanceiro, senhaFicticia);
  await outra.goto(`${n.base}/financeiro/conciliacao/extratos?exercicio=${String(ANO)}`, { waitUntil: "domcontentloaded" });
  const destino = new URL(outra.url());
  const rota = await pedir(outra, `/financeiro/conciliacao/extratos/pdf?id=${encodeURIComponent(alvo.id)}`);
  conferir(
    destino.pathname === "/sem-acesso" && destino.searchParams.get("acao") === "CONSULTAR_FINANCEIRO" && rota.status === 403 && !rota.tipo.includes("pdf"),
    `${semFinanceiro}: tela em ${destino.pathname}?acao=${destino.searchParams.get("acao") ?? ""}; PDF ${String(rota.status)} "${rota.texto.slice(0, 80)}"`
  );
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso dos extratos importados completo.");
