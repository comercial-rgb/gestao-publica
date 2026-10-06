import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";
import type { Page } from "puppeteer";

/**
 * V36 — PERCURSO: DUPLICAR NAS ROTINAS DE RECEITA, DEDUÇÃO, TRANSFERÊNCIA, PAGAMENTO E MOVIMENTO (TR 5.10.2.5).
 * Para cada uma: o link "Duplicar" da lista abre o formulário preenchido com o registro; informada a data (e o número,
 * quando há), a action de sempre grava um registro NOVO com os campos do original e o valor informado.
 *   - receita, dedução e transferência: gravadas e conferidas no banco;
 *   - pagamento: o preenchimento é conferido (conta, valor, histórico, aviso); não se paga no percurso, porque os
 *     pagamentos da base fictícia quitaram as liquidações e pagar outra exigiria escolher a liquidação da fila;
 *   - movimento bancário: a base fictícia não tem movimento, e registrar um exige a conta de contrapartida, decisão
 *     do ente; o passo não é medido;
 *   - negações: id inexistente é dito na tela; quem não lê a receita vai a /sem-acesso.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 npx tsx scripts/percurso-v36-duplicar-registros.mts
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação.");
const URL_BANCO = process.env["PERCURSO_BANCO"] ?? "";
if (!/\/gestao_publica_esperanca_ficticio(_[a-z]+)?(\?|$)/.test(URL_BANCO)) throw new Error("Recusado: PERCURSO_BANCO tem de ser a base fictícia que a BASE serve.");
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const senhaFicticia = process.env["FICTICIO_SENHA"] ?? "Ficticio#2026";
const prisma = criarPrismaClient(URL_BANCO);
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
const marca = String(Date.now()).slice(-6);
const valorDe = (page: Page, form: string, nome: string): Promise<string> =>
  page.$eval(`form[data-acao='${form}'] [name='${nome}']`, (e) => (e as HTMLInputElement).value).catch(() => "(sem campo)");

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  await entrar(n, page, "admin@cg.pb.gov.br", senha);

  // ── 1. receita ──
  const guia = await prisma.receitaArrecadada.findFirstOrThrow({
    where: { tipo: "ARRECADACAO", contaBancariaId: { not: null }, exercicio: 2026 },
    select: { id: true, numeroReceita: true, naturezaReceitaId: true, fonteId: true, contaBancariaId: true, naturezaReceita: { select: { codigo: true } } },
  });
  await irPara(n, page, "/receita/arrecadacoes?exercicio=2026");
  const elo = await page.$eval(`a[data-elo='duplicar'][href*='${guia.id}']`, (a) => a.getAttribute("href") ?? "").catch(() => "");
  await irPara(n, page, elo);
  const natureza = await valorDe(page, "registrar-guia", "natureza");
  const numeroGuia = `PERC${marca}`;
  await preencherEEnviar(page, "registrar-guia", [
    { sel: 'input[name="data"]', valor: "2026-10-06", tipo: "data" },
    { sel: 'input[data-mascara="valor"]', valor: "1,00" },
    { sel: 'input[name="numeroReceita"]', valor: numeroGuia },
  ]);
  const nova = await prisma.receitaArrecadada.findFirst({ where: { numeroReceita: numeroGuia }, select: { naturezaReceitaId: true, fonteId: true, contaBancariaId: true, valor: true } });
  conferir(
    elo !== "" && natureza === guia.naturezaReceita.codigo && nova !== null && nova.naturezaReceitaId === guia.naturezaReceitaId && nova.fonteId === guia.fonteId && nova.contaBancariaId === guia.contaBancariaId && nova.valor.toFixed(2) === "1.00",
    `receita: guia ${guia.numeroReceita} duplicada como ${numeroGuia} (${nova === null ? "nada gravado" : "natureza, fonte e conta do original, valor 1,00"})`
  );

  // ── 2. dedução ──
  const ded = await prisma.deducaoDaReceitaRealizada.findFirstOrThrow({ where: { estornoDeId: null, exercicio: 2026 }, select: { id: true, naturezaReceitaId: true, fonteId: true, contaBancariaId: true, documento: true } });
  const antesD = await prisma.deducaoDaReceitaRealizada.count();
  await irPara(n, page, `/receita/deducoes?exercicio=2026&duplicar=${ded.id}`);
  const aviso = await page.$eval("[data-copia-de]", (p) => p.textContent ?? "").catch(() => "");
  await preencherEEnviar(page, "registrar-deducao", [
    { sel: 'input[name="dia"]', valor: "2026-10-06", tipo: "data" },
    { sel: 'input[name="valor"]', valor: "0,01" },
  ]);
  const novaD = await prisma.deducaoDaReceitaRealizada.findFirst({ where: { estornoDeId: null }, orderBy: { criadoEm: "desc" }, select: { naturezaReceitaId: true, fonteId: true, contaBancariaId: true, documento: true, valor: true } });
  conferir(
    aviso.includes("Preenchido a partir da") && (await prisma.deducaoDaReceitaRealizada.count()) === antesD + 1 && novaD !== null && novaD.naturezaReceitaId === ded.naturezaReceitaId && novaD.fonteId === ded.fonteId && novaD.contaBancariaId === ded.contaBancariaId && novaD.documento === ded.documento && novaD.valor.toFixed(2) === "0.01",
    "dedução: duplicada com natureza, fonte, conta e documento do original, valor 0,01"
  );

  // ── 3. transferência ──
  const tr = await prisma.transferenciaEntreUgs.findFirstOrThrow({ where: { estornoDeId: null }, select: { id: true, tipo: true, ugOrigemId: true, ugDestinoId: true, vinculo: true, data: true } });
  const antesT = await prisma.transferenciaEntreUgs.count();
  await irPara(n, page, `/financeiro/transferencias-entre-ugs?ano=${String(tr.data.getUTCFullYear())}`);
  const eloT = await page.$eval(`a[data-elo='duplicar'][href*='${tr.id}']`, (a) => a.getAttribute("href") ?? "").catch(() => "");
  await irPara(n, page, eloT);
  await preencherEEnviar(page, "registrar-transferencia-entre-ugs", [
    { sel: 'input[name="data"]', valor: "2026-10-06", tipo: "data" },
    { sel: 'input[data-mascara="valor"]', valor: "1,00" },
  ]);
  const novaT = await prisma.transferenciaEntreUgs.findFirst({ where: { estornoDeId: null }, orderBy: { criadoEm: "desc" }, select: { tipo: true, ugOrigemId: true, ugDestinoId: true, vinculo: true, valor: true } });
  conferir(
    eloT !== "" && (await prisma.transferenciaEntreUgs.count()) === antesT + 1 && novaT !== null && novaT.tipo === tr.tipo && novaT.ugOrigemId === tr.ugOrigemId && novaT.ugDestinoId === tr.ugDestinoId && novaT.vinculo === tr.vinculo && novaT.valor.toFixed(2) === "1.00",
    "transferência: duplicada com tipo, unidades e ato do original, valor 1,00"
  );

  // ── 4. pagamento (preenchimento) ──
  const pg = await prisma.pagamento.findFirstOrThrow({ where: { estornoDeId: null, anulacaoParcialDeId: null }, select: { id: true, numero: true, contaBancaria: true, valor: true } });
  await irPara(n, page, `/despesa/pagamentos?duplicar=${pg.id}`);
  const avisoP = await page.$eval("[data-copia-de]", (p) => p.textContent ?? "").catch(() => "");
  const contaP = await valorDe(page, "pagar", "contaBancaria");
  const valorP = await valorDe(page, "pagar", "valor");
  conferir(
    avisoP.includes(`pagamento ${pg.numero}`) && contaP === pg.contaBancaria && valorP === pg.valor.toFixed(2),
    `pagamento: formulário preenchido a partir do ${pg.numero} (conta ${contaP}, valor ${valorP}); aviso: "${avisoP.trim()}"`
  );

  // ── 5. movimento bancário ──
  if ((await prisma.movimentoBancario.count()) === 0) console.log("(não medido: a base não tem movimento bancário; registrar um exige a conta de contrapartida do ente)");

  // ── 5b. lote de deduções (TR 5.10.2.11) ──
  const nat = await prisma.naturezaReceita.findUniqueOrThrow({ where: { id: ded.naturezaReceitaId }, select: { codigo: true } });
  const fon = await prisma.fonteRecurso.findUniqueOrThrow({ where: { id: ded.fonteId }, select: { codigo: true } });
  const cb = await prisma.contaBancaria.findUniqueOrThrow({ where: { id: ded.contaBancariaId }, select: { codigo: true } });
  const documentoLote = `Demonstrativo do percurso ${marca}, lote de deduções`;
  const linhasDoLote = async (valores: readonly [string, string]): Promise<void> => {
    await irPara(n, page, "/receita/deducoes?exercicio=2026");
    await page.$eval("form[data-acao='registrar-lote-de-deducoes']", (f) => f.closest("details")?.setAttribute("open", ""));
    await page.$$eval("form[data-acao='registrar-lote-de-deducoes'] select[name='naturezaReceita']", (ss, v) => ss.forEach((s) => { (s as HTMLSelectElement).value = v; }), nat.codigo);
    await page.$$eval("form[data-acao='registrar-lote-de-deducoes'] select[name='fonte']", (ss, v) => ss.forEach((s) => { (s as HTMLSelectElement).value = v; }), fon.codigo);
    await page.$$eval("form[data-acao='registrar-lote-de-deducoes'] input[name='valor']", (is, vs) => is.forEach((i, k) => { (i as HTMLInputElement).value = vs[k] ?? ""; }), [...valores]);
    await preencherEEnviar(page, "registrar-lote-de-deducoes", [
      { sel: 'input[name="dia"]', valor: "2026-10-06", tipo: "data" },
      { sel: 'select[name="contaBancaria"]', valor: cb.codigo, tipo: "select" },
      { sel: 'input[name="documento"]', valor: documentoLote },
    ]);
  };
  await linhasDoLote(["0,01", "0,02"]);
  const doLote = await prisma.deducaoDaReceitaRealizada.findMany({ where: { documento: documentoLote }, orderBy: { valor: "asc" }, select: { valor: true, contaBancariaId: true } });
  conferir(
    doLote.map((d) => d.valor.toFixed(2)).join(",") === "0.01,0.02" && doLote.every((d) => d.contaBancariaId === ded.contaBancariaId),
    `lote de deduções: ${String(doLote.length)} gravadas na conta ${cb.codigo} com o mesmo documento`
  );
  await linhasDoLote(["0,01", "99999999,00"]);
  const erroLote = await page.$eval("[data-resultado-da-acao='registrar-lote-de-deducoes']", (p) => p.textContent ?? "").catch(() => "");
  conferir(
    /Linha 2 do lote/.test(erroLote) && (await prisma.deducaoDaReceitaRealizada.count({ where: { documento: documentoLote } })) === 2,
    `lote com uma linha que não cabe: nada gravado, e a tela diz "${erroLote.trim().slice(0, 90)}…"`
  );

  // ── 6. negações ──
  await irPara(n, page, "/receita/arrecadacoes?exercicio=2026&duplicar=nao-existe");
  const recusa = await page.$eval("[data-duplicacao='recusada']", (p) => p.textContent ?? "").catch(() => "");
  conferir(recusa.includes("Não há o que duplicar"), `id inexistente: "${recusa.trim()}"`);
  const outra = await (await nav.createBrowserContext()).newPage();
  outra.setDefaultTimeout(120000);
  await entrar(n, outra, "atestador@ficticio.local", senhaFicticia);
  await outra.goto(`${n.base}/receita/arrecadacoes?duplicar=${guia.id}`, { waitUntil: "domcontentloaded" });
  const destino = new URL(outra.url());
  conferir(destino.pathname === "/sem-acesso" && destino.searchParams.get("acao") === "CONSULTAR_RECEITA", `atestador ao duplicar uma guia: ${destino.pathname}?acao=${destino.searchParams.get("acao") ?? ""}`);
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso de duplicar registros completo.");
