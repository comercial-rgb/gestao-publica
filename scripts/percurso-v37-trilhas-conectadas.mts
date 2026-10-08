import "dotenv/config";
import type { Page } from "puppeteer";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V37 — AS TRILHAS CONECTADAS: o servidor anda de uma tela para a seguinte pelo link da própria tela, sem voltar ao
 * menu. Cada passo CLICA no link (não digita a URL) e confere que a tela seguinte chegou com o registro já escolhido:
 *   1. QDD → número da ficha → ficha;
 *   2. ficha → "Empenhar com esta reserva" → formulário do empenho com a reserva e a ficha dela;
 *   3. dossiê do empenho → "Liquidar este empenho" → formulário da liquidação com o empenho;
 *   4. liquidações → "Pagar" → formulário do pagamento com a liquidação;
 *   5. documentos do pagamento → empenho do pagamento;
 *   6. contas bancárias → "Movimentação e saldo" → a movimentação daquela conta;
 *   7. receita mês a mês → a receita → as guias dela, com o recorte dito na tela e o total da receita.
 * Só lê, salvo uma reserva de 1,00 pela tela da ficha quando a base não tem reserva viva.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 SEED_ADMIN_SENHA=... \
 *      npx tsx scripts/percurso-v37-trilhas-conectadas.mts
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
const EX = 2026;

async function clicar(page: Page, seletor: string): Promise<string> {
  await page.waitForSelector(seletor);
  await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), page.click(seletor)]);
  return page.url().replace(n.base, "");
}
const valorDe = (page: Page, sel: string): Promise<string> => page.$eval(sel, (e) => (e as HTMLInputElement | HTMLSelectElement).value).catch(() => "(ausente)");

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  await entrar(n, page, "admin@cg.pb.gov.br", senha);

  // ── 1. QDD → ficha ──
  const ficha = await prisma.fichaOrcamentaria.findFirst({ where: { exercicio: EX }, orderBy: { numero: "asc" }, select: { id: true, numero: true } });
  if (ficha === null) throw new Error(`sem ficha em ${String(EX)}`);
  await irPara(n, page, `/planejamento/qdd?exercicio=${String(EX)}`);
  const u1 = await clicar(page, `a[href="/planejamento/fichas/${ficha.id}"]`);
  conferir(u1 === `/planejamento/fichas/${ficha.id}`, `QDD → ficha ${String(ficha.numero)} pelo número na linha (${u1})`);

  // ── 2. ficha → empenhar com a reserva ──
  const reservas = await prisma.reservaDotacao.findMany({
    where: { ficha: { exercicio: EX }, estornoDeId: null, estornos: { none: {} }, itemDaPrevia: { is: null } },
    select: { id: true, fichaId: true, valor: true, empenhos: { select: { empenho: { select: { valor: true } } } } },
    orderBy: { criadoEm: "desc" },
    take: 50,
  });
  let viva: { id: string; fichaId: string } | undefined = reservas.find((r) => r.empenhos.reduce((s, e) => s.plus(e.empenho.valor), r.valor.minus(r.valor)).lessThan(r.valor));
  if (viva === undefined) {
    // Sem reserva viva na base: uma pela tela da ficha (a única gravação do percurso), de 1,00.
    await irPara(n, page, `/planejamento/fichas/${ficha.id}`);
    const marca = String(Date.now()).slice(-6);
    const r = await preencherEEnviar(page, "reservar-dotacao", [
      { sel: 'input[name="valor"]', valor: "1,00" },
      { sel: 'input[name="historico"]', valor: `Reserva do percurso das trilhas ${marca}` },
    ]);
    const criada = await prisma.reservaDotacao.findFirst({ where: { historico: `Reserva do percurso das trilhas ${marca}` }, select: { id: true, fichaId: true } });
    conferir(r.tipo === "ok" && criada !== null, `reserva de 1,00 na ficha ${String(ficha.numero)} pela tela (${r.texto.slice(0, 60)})`);
    viva = criada ?? undefined;
  }
  if (viva === undefined) {
    console.log("NAO EXECUTADO passo 2: a base fictícia não tem reserva de 2026 com saldo");
  } else {
    await irPara(n, page, `/planejamento/fichas/${viva.fichaId}`);
    const u2 = await clicar(page, `a[data-proximo-passo="empenhar"][href*="${viva.id}"]`);
    await page.waitForFunction((f) => (document.querySelector('form[data-acao="empenhar"] select[name="fichaId"]') as HTMLSelectElement | null)?.value === f, { timeout: 60000 }, viva.fichaId).catch(() => undefined);
    const reservaNoForm = await valorDe(page, 'form[data-acao="empenhar"] [name="reservaId"]');
    const fichaNoForm = await valorDe(page, 'form[data-acao="empenhar"] select[name="fichaId"]');
    conferir(u2.includes(`reservaId=${viva.id}`) && reservaNoForm === viva.id && fichaNoForm === viva.fichaId, `ficha → "Empenhar com esta reserva": o formulário chega com a reserva e a ficha dela (${u2})`);
  }

  // ── 3. dossiê do empenho → liquidar ──
  const empenhos = await prisma.empenho.findMany({
    where: { ficha: { exercicio: EX }, estornoDeId: null, anulacaoParcialDeId: null, estornos: { none: {} }, tipo: "ORDINARIO" },
    select: { id: true, numero: true, valor: true, liquidacoes: { where: { estornoDeId: null }, select: { valor: true } } },
    take: 200,
  });
  const aLiquidar = empenhos.find((e) => e.liquidacoes.length === 0);
  if (aLiquidar === undefined) {
    console.log("NAO EXECUTADO passo 3: sem empenho ordinário de 2026 sem liquidação");
  } else {
    await irPara(n, page, `/despesa/empenhos/${aLiquidar.id}`);
    const u3 = await clicar(page, 'a[data-proximo-passo="liquidar"]');
    const empenhoNoForm = await valorDe(page, 'form[data-acao="liquidar"] select[name="empenhoId"]');
    conferir(u3.includes(`empenho=${aLiquidar.id}`) && empenhoNoForm === aLiquidar.id, `empenho ${aLiquidar.numero} → "Liquidar este empenho": o formulário chega com o empenho (${u3})`);
  }

  // ── 4. liquidações → pagar ──
  await irPara(n, page, `/despesa/liquidacoes?exercicio=${String(EX)}`);
  const linkPagar = await page.$eval('a[data-proximo-passo="pagar"]', (a) => a.getAttribute("href") ?? "").catch(() => "");
  if (linkPagar === "") {
    console.log("NAO EXECUTADO passo 4: nenhuma liquidação de 2026 com saldo a pagar na lista");
  } else {
    const liq = /liquidacao=([^&]+)/.exec(linkPagar)?.[1] ?? "";
    const u4 = await clicar(page, 'a[data-proximo-passo="pagar"]');
    await page.waitForSelector('form[data-acao="pagar"]').catch(() => undefined);
    const liqNoForm = await valorDe(page, 'form[data-acao="pagar"] [name="liquidacaoId"]');
    conferir(u4.includes(`liquidacao=${liq}`) && liqNoForm === liq, `liquidações → "Pagar": o formulário do pagamento chega com a liquidação (${u4}; no campo: ${liqNoForm})`);
  }

  // ── 5. documentos do pagamento → empenho ──
  const pag = await prisma.pagamento.findFirst({ where: { estornoDeId: null, anulacaoParcialDeId: null }, orderBy: { data: "desc" }, select: { id: true, liquidacao: { select: { empenhoId: true } } } });
  if (pag === null) {
    console.log("NAO EXECUTADO passo 5: sem pagamento");
  } else {
    await irPara(n, page, `/despesa/pagamentos/${pag.id}`);
    const u5 = await clicar(page, `a[href="/despesa/empenhos/${pag.liquidacao.empenhoId}"]`);
    conferir(u5 === `/despesa/empenhos/${pag.liquidacao.empenhoId}`, `documentos do pagamento → o empenho dele (${u5})`);
  }

  // ── 6. contas bancárias → movimentação da conta ──
  const conta = await prisma.contaBancaria.findFirst({ orderBy: { codigo: "asc" }, select: { id: true, codigo: true } });
  if (conta !== null) {
    await irPara(n, page, "/financeiro/contas-bancarias");
    const u6 = await clicar(page, `a[href="/financeiro/movimentacao?conta=${conta.id}"]`);
    const contaNoFiltro = await valorDe(page, 'form[data-form-bordero] select[name="conta"]');
    const contaNoFormulario = await valorDe(page, 'form[data-acao="registrar-movimento-bancario"] select[name="conta"]');
    conferir(contaNoFiltro === conta.id && contaNoFormulario === conta.id, `contas bancárias → "Movimentação e saldo" da conta ${conta.codigo}: a movimentação e o formulário de novo movimento abrem nela (${u6})`);
  }

  // ── 7. receita mês a mês → as guias da receita ──
  await irPara(n, page, `/relatorios/receita-mensal?exercicio=${String(EX)}`);
  const primeira = await page.$eval("tr[data-natureza]", (tr) => ({ cod: tr.getAttribute("data-natureza") ?? "", total: (tr.querySelector("td:last-child")?.textContent ?? "").trim() })).catch(() => null);
  if (primeira === null) {
    console.log("NAO EXECUTADO passo 7: sem receita arrecadada");
  } else {
    const u7 = await clicar(page, `tr[data-natureza="${primeira.cod}"] td:first-child a`);
    const aviso = await page.$eval("[data-recorte-da-lista]", (e) => (e.textContent ?? "").replace(/\s+/g, " ").trim()).catch(() => "");
    const corpo = await page.$eval("body", (b) => b.textContent ?? "");
    conferir(u7.includes(`natureza=${primeira.cod}`) && aviso.includes(primeira.cod) && corpo.includes(primeira.total), `receita mês a mês → as guias da receita ${primeira.cod}: recorte dito ("${aviso.slice(0, 60)}") e o total ${primeira.total} na lista`);
  }
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso das trilhas conectadas completo.");
