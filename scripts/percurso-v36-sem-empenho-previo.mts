import "dotenv/config";
import type { Page } from "puppeteer";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { diaCivil } from "../packages/datas/index.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V36 — PERCURSO DA DESPESA SEM EMPENHO PRÉVIO (TR 5.10.1.30):
 *   empenho pela tela; liquidação pela tela com a caixa "despesa realizada sem empenho prévio" marcada; a lista mostra a
 *   marca na linha e o recorte "só as despesas sem empenho prévio" traz a liquidação; uma segunda liquidação sem a caixa
 *   fica fora do recorte.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 npx tsx scripts/percurso-v36-sem-empenho-previo.mts
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
// O dia civil do ENTE, pela régua de `packages/datas` (nunca um fuso cravado aqui).
const hoje = diaCivil(new Date());

async function texto(page: Page, form: string, nome: string, valor: string): Promise<void> {
  await page.$eval(`${form} [name='${nome}']`, (el, v) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, valor);
}

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  page.on("dialog", (d) => void d.accept());
  await entrar(n, page, "admin@cg.pb.gov.br", senha);

  const pessoa = await prisma.pessoa.findFirst({ orderBy: { documento: "asc" }, where: { documento: { not: { startsWith: "0" } } }, select: { documento: true } });
  const empenhar = async (historico: string): Promise<{ id: string; numero: string } | null> => {
    await irPara(n, page, "/despesa/empenhos?exercicio=2026");
    const ficha = await page.evaluate(() => {
      const s = document.querySelector('form[data-acao="empenhar"] select[name="fichaId"]');
      if (!(s instanceof HTMLSelectElement)) return "";
      let melhor = { v: "", saldo: 0 };
      for (const o of Array.from(s.options)) {
        if (o.value === "" || o.disabled) continue;
        const t = (o.textContent ?? "").trim();
        if (!/—\s*339039/.test(t)) continue;
        const m = /disponível R\$\s*([\d.]+,\d{2})\s*$/.exec(t);
        const saldo = m === null ? 0 : Number((m[1] ?? "0").replace(/\./g, "").replace(",", "."));
        if (saldo > melhor.saldo) melhor = { v: o.value, saldo };
      }
      return melhor.v;
    });
    await texto(page, 'form[data-acao="empenhar"]', "historico", historico);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('form[data-acao="empenhar"] button')].find((x) => /Credor sem cadastro/i.test(x.textContent ?? ""));
      (b as HTMLButtonElement | undefined)?.click();
    });
    await preencherEEnviar(page, "empenhar", [
      { sel: 'select[name="fichaId"]', valor: ficha, tipo: "select" },
      { sel: '[data-mascara="cpf-cnpj"]', valor: pessoa?.documento ?? "" },
      { sel: '[data-mascara="valor"]', valor: "120,00" },
      { sel: 'input[name="data"]', valor: hoje, tipo: "data" },
      { sel: 'select[name="categoria"]', valor: "PRESTACAO_SERVICOS", tipo: "select" },
    ]);
    return prisma.empenho.findFirst({ where: { historico }, select: { id: true, numero: true } });
  };
  const liquidar = async (empenhoId: string, semEmpenhoPrevio: boolean): Promise<{ id: string; numero: string; despesaSemEmpenhoPrevio: boolean } | null> => {
    await irPara(n, page, "/despesa/liquidacoes?exercicio=2026");
    await texto(page, 'form[data-acao="liquidar"]', "historico", `Liquidação ${marca} (percurso)`);
    if (semEmpenhoPrevio) await page.$eval('form[data-acao="liquidar"] input[name="despesaSemEmpenhoPrevio"]', (c) => (c as HTMLInputElement).click());
    await preencherEEnviar(page, "liquidar", [
      { sel: 'select[name="empenhoId"]', valor: empenhoId, tipo: "select" },
      { sel: '[data-mascara="valor"]', valor: "120,00" },
      { sel: 'input[name="data"]', valor: hoje, tipo: "data" },
      { sel: 'input[name="atesto"]', valor: "Servidor fictício do atesto" },
    ]);
    return prisma.liquidacao.findFirst({ where: { empenhoId, estornoDeId: null }, select: { id: true, numero: true, despesaSemEmpenhoPrevio: true } });
  };

  // ── 1. a liquidação marcada ──
  const e1 = await empenhar(`Serviço prestado antes do empenho ${marca} (percurso)`);
  const l1 = e1 === null ? null : await liquidar(e1.id, true);
  conferir(l1 !== null && l1.despesaSemEmpenhoPrevio, `liquidação pela tela com a caixa marcada grava a marca (${l1?.numero ?? "nenhuma"})`);

  // ── 2. a outra, sem a caixa ──
  const e2 = await empenhar(`Serviço com empenho prévio ${marca} (percurso)`);
  const l2 = e2 === null ? null : await liquidar(e2.id, false);
  conferir(l2 !== null && !l2.despesaSemEmpenhoPrevio, `liquidação sem a caixa fica sem a marca (${l2?.numero ?? "nenhuma"})`);
  if (l1 === null || l2 === null) throw new Error("sem as duas liquidações, o percurso não segue");

  // ── 3. a lista mostra a marca, e o recorte separa ──
  await irPara(n, page, "/despesa/liquidacoes?exercicio=2026");
  const marcadas = await page.$$eval("[data-sem-empenho-previo]", (els) => els.length);
  await page.$$eval('[data-recorte-sem-empenho] a', (as) => (as.find((a) => /sem empenho prévio/i.test(a.textContent ?? "")) as HTMLAnchorElement | undefined)?.click());
  await page.waitForFunction(() => location.search.includes("semEmpenhoPrevio=1"));
  await page.waitForSelector("table");
  const corpo = await page.evaluate(() => document.querySelector("table")?.innerText ?? "");
  const temL1 = new RegExp(`(^|\\s)${l1.numero}(\\s|$)`, "m").test(corpo);
  const temL2 = new RegExp(`(^|\\s)${l2.numero}(\\s|$)`, "m").test(corpo);
  conferir(marcadas >= 1 && temL1 && !temL2 && /sem empenho prévio/i.test(corpo), `a lista marca a linha (${String(marcadas)} marcada(s)) e o recorte traz a ${l1.numero} e deixa a ${l2.numero} de fora`);
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da despesa sem empenho prévio completo.");
