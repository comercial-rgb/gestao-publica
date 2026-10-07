import "dotenv/config";
import type { Page } from "puppeteer";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { lerSubempenhosDoEmpenho } from "../modules/m05-despesa/subempenho.js";
import { diaCivil } from "../packages/datas/index.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V36 — PERCURSO DO SUBEMPENHO (TR 5.10.1.7), sobre um empenho ESTIMATIVO de serviço (339039) do exercício aberto:
 *   o administrador emite dois subempenhos pela tela do empenho (N=2, numerados 1 e 2 em seguida); o que não cabe no livre
 *   é recusado com o motivo; pelo "Liquidar" da linha do subempenho, a tela de liquidação abre com ele escolhido e a
 *   liquidação grava o subempenho; o saldo do segundo é anulado; quem só consulta a despesa vê o quadro, sem os formulários.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 npx tsx scripts/percurso-v36-subempenho.mts
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
// O dia civil do ENTE, pela régua de `packages/datas`.
const hoje = diaCivil(new Date());

async function texto(page: Page, form: string, nome: string, valor: string): Promise<void> {
  await page.$eval(`${form} [name='${nome}']`, (el, v) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, valor);
}

// O empenho: estimativo, de serviço, do exercício aberto, sem anulação, com ao menos 200,00 livres.
const candidatos = await prisma.empenho.findMany({
  where: { tipo: "ESTIMATIVO", estornoDeId: null, anulacaoParcialDeId: null, estornos: { none: {} }, ficha: { exercicio: Number(hoje.slice(0, 4)), naturezaDespesa: { codigoCompleto: { startsWith: "339039" } } } },
  orderBy: { numero: "asc" },
  select: { id: true, numero: true },
});
let alvo: { id: string; numero: string } | undefined;
for (const c of candidatos) {
  if ((await lerSubempenhosDoEmpenho(prisma, c.id)).livre.greaterThanOrEqualTo(200)) {
    alvo = c;
    break;
  }
}
if (alvo === undefined) throw new Error("a base não tem empenho estimativo de serviço com 200,00 livres no exercício");
const tela = `/despesa/empenhos/${alvo.id}`;

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  await entrar(n, page, "admin@cg.pb.gov.br", senha);

  const antes = await lerSubempenhosDoEmpenho(prisma, alvo.id);
  const emitir = async (valor: string, historico: string) => {
    await irPara(n, page, tela);
    return preencherEEnviar(page, "emitir-subempenho", [
      { sel: '[data-mascara="valor"]', valor },
      { sel: 'input[name="data"]', valor: hoje, tipo: "data" },
      { sel: 'input[name="historico"]', valor: historico },
    ]);
  };

  // ── 1. dois subempenhos, numerados em seguida ──
  const r1 = await emitir("100,00", `Parcela A ${marca} (percurso)`);
  const r2 = await emitir("50,00", `Parcela B ${marca} (percurso)`);
  const subs = await prisma.subempenho.findMany({ where: { empenhoId: alvo.id }, orderBy: { numero: "desc" }, take: 2, select: { id: true, numero: true, valor: true, historico: true } });
  const [s2, s1] = subs;
  conferir(
    r1.tipo === "ok" && r2.tipo === "ok" && s1 !== undefined && s2 !== undefined && s2.numero === s1.numero + 1 && s1.valor.toFixed(2) === "100.00" && s2.valor.toFixed(2) === "50.00" && s2.historico.includes(marca),
    `dois subempenhos emitidos pela tela (${r1.texto.slice(0, 60)} | ${r2.texto.slice(0, 60)})`
  );
  if (s1 === undefined || s2 === undefined) throw new Error("sem os dois subempenhos, o percurso não segue");

  // ── 2. o excesso é recusado com o motivo ──
  const livre = (await lerSubempenhosDoEmpenho(prisma, alvo.id)).livre;
  const excesso = livre.plus(1).toFixed(2).replace(".", ",");
  const r3 = await emitir(excesso, `Parcela C ${marca} (percurso)`);
  const contagem = await prisma.subempenho.count({ where: { empenhoId: alvo.id } });
  conferir(r3.tipo === "erro" && /não cabe no saldo livre do empenho/.test(r3.texto) && contagem === antes.subempenhos.length + 2, `o subempenho acima do livre é recusado com o motivo, nada gravado (${r3.texto.slice(0, 100)})`);

  // ── 3. a liquidação pelo "Liquidar" da linha ──
  await irPara(n, page, tela);
  const href = await page.$eval(`tr[data-subempenho="${alvo.numero}/${String(s1.numero)}"] a`, (a) => (a as HTMLAnchorElement).getAttribute("href") ?? "").catch(() => "");
  await irPara(n, page, `${href}&exercicio=${hoje.slice(0, 4)}`);
  const escolhido = await page.$eval('form[data-acao="liquidar"] select[name="subempenhoId"]', (s) => (s as HTMLSelectElement).value).catch(() => "(sem campo)");
  await texto(page, 'form[data-acao="liquidar"]', "historico", `Liquidação da parcela A ${marca} (percurso)`);
  const r4 = await preencherEEnviar(page, "liquidar", [
    { sel: '[data-mascara="valor"]', valor: "60,00" },
    { sel: 'input[name="data"]', valor: hoje, tipo: "data" },
    { sel: 'input[name="atesto"]', valor: "Servidor fictício do atesto" },
  ]);
  const liq = await prisma.liquidacao.findFirst({ where: { subempenhoId: s1.id }, select: { numero: true, valor: true } });
  conferir(escolhido === s1.id && r4.tipo !== "erro" && liq?.valor.toFixed(2) === "60.00", `a tela de liquidação abre com o subempenho escolhido e grava a liquidação nele (${liq?.numero ?? "nenhuma"}; ${r4.texto.slice(0, 80)})`);

  // ── 4. a anulação do saldo do segundo ──
  await irPara(n, page, tela);
  const r5 = await preencherEEnviar(page, "anular-subempenho", [
    { sel: 'select[name="subempenhoId"]', valor: s2.id, tipo: "select" },
    { sel: '[data-mascara="valor"]', valor: "50,00" },
    { sel: 'input[name="data"]', valor: hoje, tipo: "data" },
    { sel: 'input[name="motivo"]', valor: "Parcela não realizada (percurso)" },
  ]);
  const q = await lerSubempenhosDoEmpenho(prisma, alvo.id);
  const qs1 = q.subempenhos.find((s) => s.id === s1.id);
  const qs2 = q.subempenhos.find((s) => s.id === s2.id);
  conferir(
    r5.tipo === "ok" && qs2?.saldo.toFixed(2) === "0.00" && qs1?.saldo.toFixed(2) === "40.00" && q.livre.toFixed(2) === antes.livre.minus(100).toFixed(2),
    `saldo do subempenho 2 anulado; subempenho 1 com 40,00; livre ${q.livre.toFixed(2)} (${r5.texto.slice(0, 80)})`
  );

  // ── 5. a tela mostra o quadro ──
  await irPara(n, page, tela);
  const linha = await page.$eval(`tr[data-subempenho="${alvo.numero}/${String(s1.numero)}"] td[data-saldo]`, (e) => (e as HTMLElement).innerText).catch(() => "");
  conferir(/40,00/.test(linha), `a linha do subempenho 1 mostra o saldo de 40,00 ("${linha}")`);

  // ── 6. quem só consulta a despesa ──
  const outra = await (await nav.createBrowserContext()).newPage();
  outra.setDefaultTimeout(120000);
  await entrar(n, outra, "tesoureiro@ficticio.local", "Ficticio#2026");
  await outra.goto(`${n.base}${tela}`, { waitUntil: "domcontentloaded" });
  await outra.waitForSelector("[data-quadro-subempenhos]");
  const formularios = await outra.$$('form[data-acao="emitir-subempenho"], form[data-acao="anular-subempenho"]');
  conferir(formularios.length === 0, "quem só consulta a despesa vê o quadro dos subempenhos, sem os formulários (a recusa no servidor está no teste do domínio)");
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso do subempenho completo.");
