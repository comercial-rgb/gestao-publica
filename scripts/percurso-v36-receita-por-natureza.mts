import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { listarArrecadacoes } from "../modules/m04-receita/consultas.js";
import { toMoney, type Money } from "../packages/contracts/index.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";
import type { Page } from "puppeteer";

/**
 * V36 — PERCURSO DO DEMONSTRATIVO DA RECEITA MÊS A MÊS POR NATUREZA (TR 5.10.2.59), em /relatorios/receita-mensal:
 *   0. (N=2) sem duas receitas arrecadadas em 2026, registra duas guias pela tela, de duas receitas previstas;
 *   1. o total do demonstrativo de 2026 bate com `listarArrecadacoes` (outra leitura do M04, que não compartilha o laço);
 *   2. a soma das linhas de receita e a soma do resumo por fonte são o total;
 *   3. sem a opção, nenhuma linha de fonte; com "Listar as fontes de cada receita" marcada pela tela, cada receita
 *      ganha as fontes, e as fontes de cada receita somam a receita.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 SEED_ADMIN_SENHA=... \
 *      npx tsx scripts/percurso-v36-receita-por-natureza.mts
 * Grava só as duas guias do passo 0, quando faltam.
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação.");
const URL_BANCO = process.env["PERCURSO_BANCO"] ?? "";
if (!/\/gestao_publica_esperanca_ficticio(\?|$)/.test(URL_BANCO)) throw new Error("Recusado: PERCURSO_BANCO tem de ser o banco fictício que a BASE serve.");
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const prisma = criarPrismaClient(URL_BANCO);
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
/** "R$ 1.234,56" ou "-R$ 7,00" → Money. */
const dinheiro = (t: string): Money => {
  const negativo = /^\s*[-−]/.test(t) || /\(.*\)/.test(t);
  const limpo = t.replace(/[^\d,]/g, "").replace(",", ".");
  return toMoney(`${negativo ? "-" : ""}${limpo === "" ? "0" : limpo}`);
};
const somar = (vs: readonly Money[]): Money => vs.reduce((s, v) => toMoney(s.plus(v)), toMoney("0.00"));
const totaisDe = (page: Page, sel: string): Promise<string[]> =>
  page.$$eval(sel, (rs) => rs.map((r) => (r.querySelector("td:last-child")?.textContent ?? "").trim()));

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(120000);
  await entrar(n, page, "admin@cg.pb.gov.br", senha);

  // 0. N=2: sem duas receitas arrecadadas em 2026, duas guias pela tela de arrecadação (a cópia de uma guia existente,
  //    trocando a natureza e a fonte) — duas receitas previstas cuja conta da DVP a contabilidade já declarou.
  const naturezas2026 = await prisma.receitaArrecadada.findMany({ where: { exercicio: 2026 }, distinct: ["naturezaReceitaId"], select: { naturezaReceitaId: true } });
  if (naturezas2026.length < 2) {
    const guia = await prisma.receitaArrecadada.findFirstOrThrow({ where: { exercicio: 2026, tipo: "ARRECADACAO" }, select: { id: true, naturezaReceitaId: true } });
    const prefixos = (await prisma.contaDaReceitaPorNatureza.findMany({ select: { naturezaPrefixo: true } })).map((c) => c.naturezaPrefixo);
    const previstas = await prisma.receitaPrevista.findMany({
      where: { exercicio: 2026, naturezaReceitaId: { not: guia.naturezaReceitaId }, OR: prefixos.map((p) => ({ naturezaReceita: { codigo: { startsWith: p } } })) },
      select: { naturezaReceitaId: true, naturezaReceita: { select: { codigo: true } }, fonte: { select: { codigo: true } } },
      orderBy: { naturezaReceita: { codigo: "asc" } },
    });
    const alvos = previstas.filter((p, i) => previstas.findIndex((q) => q.naturezaReceitaId === p.naturezaReceitaId) === i).slice(0, 2);
    if (alvos.length < 2 || prefixos.length === 0) throw new Error("a base não tem duas receitas previstas em 2026 com a conta da DVP declarada");
    const marca = String(Date.now()).slice(-6);
    for (const [i, a] of alvos.entries()) {
      await irPara(n, page, `/receita/arrecadacoes?exercicio=2026&duplicar=${guia.id}`);
      const r = await preencherEEnviar(page, "registrar-guia", [
        { sel: 'input[name="natureza"]', valor: a.naturezaReceita.codigo },
        { sel: 'input[name="fonte"]', valor: a.fonte.codigo },
        { sel: 'input[name="data"]', valor: "2026-03-10", tipo: "data" },
        { sel: 'input[data-mascara="valor"]', valor: i === 0 ? "1.234,56" : "765,44" },
        { sel: 'input[name="numeroReceita"]', valor: `PRN${marca}${String(i)}` },
      ]);
      conferir(r.tipo === "ok", `guia da receita ${a.naturezaReceita.codigo} na fonte ${a.fonte.codigo} registrada pela tela (${r.texto.slice(0, 70)})`);
    }
  }

  // 1.
  const do2026 = await listarArrecadacoes(prisma, { exercicio: 2026 });
  await irPara(n, page, "/relatorios/receita-mensal?exercicio=2026");
  await page.waitForSelector('[data-lista="receita-por-natureza"]');
  const total = dinheiro(await page.$eval("[data-total-geral] td:last-child", (e) => (e.textContent ?? "").trim()));
  conferir(total.equals(do2026.total), `total do demonstrativo de 2026 ${total.toFixed(2)}; lista das arrecadações ${do2026.total.toFixed(2)}`);

  // 2.
  const naturezas = (await totaisDe(page, "tr[data-natureza]")).map(dinheiro);
  const fontes = (await totaisDe(page, "tr[data-resumo-fonte]")).map(dinheiro);
  conferir(naturezas.length > 1 && somar(naturezas).equals(total), `${String(naturezas.length)} receita(s) somam ${somar(naturezas).toFixed(2)}`);
  conferir(fontes.length > 0 && somar(fontes).equals(total), `${String(fontes.length)} fonte(s) no resumo somam ${somar(fontes).toFixed(2)}`);

  // 3.
  const semFontes = await page.$$("tr[data-fonte-da-natureza]");
  conferir(semFontes.length === 0, `sem a opção, ${String(semFontes.length)} linha(s) de fonte`);
  await page.click('input[name="fontes"]');
  await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), page.click('form[data-acao="opcoes-do-demonstrativo"] button[type="submit"]')]);
  await page.waitForSelector("tr[data-fonte-da-natureza]");
  conferir(page.url().includes("fontes=1") && page.url().includes("exercicio=2026"), `a opção vai na URL e mantém o exercício (${page.url().replace(n.base, "")})`);
  const porNatureza = await page.$$eval("tr[data-natureza], tr[data-fonte-da-natureza]", (rs) =>
    rs.map((r) => ({ natureza: r.getAttribute("data-natureza"), fonte: r.getAttribute("data-fonte-da-natureza"), total: (r.querySelector("td:last-child")?.textContent ?? "").trim() }))
  );
  const divergentes: string[] = [];
  let receitas = 0;
  for (let i = 0; i < porNatureza.length; i++) {
    const linha = porNatureza[i];
    if (linha?.natureza === null || linha === undefined) continue;
    receitas += 1;
    const filhas: Money[] = [];
    for (let j = i + 1; j < porNatureza.length && porNatureza[j]?.fonte !== null; j++) filhas.push(dinheiro(porNatureza[j]?.total ?? ""));
    if (filhas.length === 0 || !somar(filhas).equals(dinheiro(linha.total))) divergentes.push(`${linha.natureza}: ${linha.total} x ${somar(filhas).toFixed(2)} (${String(filhas.length)})`);
  }
  conferir(receitas > 1 && divergentes.length === 0, `com as fontes listadas, as fontes de cada uma das ${String(receitas)} receita(s) somam a receita${divergentes.length > 0 ? `: ${divergentes.slice(0, 3).join("; ")}` : ""}`);
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso do demonstrativo da receita por natureza completo.");
