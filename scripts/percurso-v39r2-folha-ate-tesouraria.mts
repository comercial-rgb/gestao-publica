import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import { entrar, irPara, lancarNavegadorDoPercurso, type Navegador } from "./percursos-navegador.js";

/**
 * V39-R2 (fluxos existentes) — PELA TELA: A FOLHA ATÉ A TESOURARIA.
 *   1. a folha apropriada aparece na tela da folha (o empenho e a liquidação já feitos pela tela da folha);
 *   2. a liquidação de uma folha, ainda não paga, está na fila de pagamento;
 *   3. o pagamento pela tela calcula as retenções (o IR dos servidores e os descontos por consignação declarada) e grava;
 *   4. no banco: o pagamento, os descontos dos contracheques retidos nele e a liquidação fora da fila.
 * GRAVA na base de demonstração ou ensaio (conferida pelo `entrar`), na conta PERCURSO_CONTA (padrão FIC-PM-500), nunca a
 * primeira da lista. Não roda em produção sem PERCURSO_DESTINO_AUTORIZADO.
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação; este percurso grava.");
await exigirDestinoDoPercurso(n.base);
const prisma = criarPrismaClient(process.env["PERCURSO_BANCO"] ?? process.env["DATABASE_URL"] ?? "");
const CONTA = process.env["PERCURSO_CONTA"] ?? "FIC-PM-500";
const F = 'form[data-acao="pagar"]';
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};

// A liquidação de uma folha (empenho de folha) ainda não paga, a menor primeiro.
const empenhosDaFolha = await prisma.empenhoDaFolha.findMany({ select: { empenhoId: true } });
const alvo = await prisma.liquidacao.findFirst({
  where: { empenhoId: { in: empenhosDaFolha.map((e) => e.empenhoId) }, estornoDeId: null, anulacaoParcialDeId: null, estornos: { none: {} }, pagamentos: { none: {} } },
  orderBy: { valor: "asc" },
  select: { id: true, numero: true, valor: true, data: true },
});
if (alvo === null) throw new Error("Não há liquidação de folha por pagar nesta base.");
const valor = alvo.valor.toFixed(2);
const hoje = new Date().toISOString().slice(0, 10);

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(300000);
  page.on("dialog", (d) => void d.accept());
  await entrar(n, page, process.env["PERCURSO_USUARIO"] ?? "admin@cg.pb.gov.br", process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "");

  // 1. a folha na tela
  const tf = await irPara(n, page, "/folha/folhas");
  conferir(!/Application error|Não foi possível carregar/i.test(tf) && (await page.$$("a[href^='/folha/folhas/']")).length > 0, "a tela das folhas abre com as folhas da base");

  // 2. a fila de pagamento
  await irPara(n, page, "/despesa/pagamentos");
  await page.waitForSelector(`${F} input[name="__chave"][data-chave-de-comando="pronta"]`);
  const naFila = await page.$$eval(`${F} select[name="liquidacaoId"] option`, (os, id) => os.some((o) => o.getAttribute("value") === id), alvo.id);
  conferir(naFila, `a liquidação ${alvo.numero} da folha (R$ ${valor}) está na fila de pagamento`);
  if (!naFila) throw new Error("fora da fila");

  // 3. pagar pela tela
  await page.select(`${F} select[name="liquidacaoId"]`, alvo.id);
  await new Promise((r) => setTimeout(r, 800));
  const digitar = async (sel: string, v: string): Promise<void> => {
    await page.$eval(sel, (e) => { (e as HTMLInputElement).value = ""; (e as HTMLElement).scrollIntoView({ block: "center" }); });
    await page.focus(sel);
    await page.keyboard.type(v, { delay: 5 });
  };
  const numero = `9${String(Date.now()).slice(-6)}`;
  await digitar(`${F} input[name="numero"]`, numero);
  await digitar(`${F} input[data-mascara="valor"]:has(+ input[name="valor"])`, valor.replace(".", ","));
  await page.$eval(`${F} input[name="data"]`, (e, x) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    set?.call(e, x);
    e.dispatchEvent(new Event("input", { bubbles: true }));
    e.dispatchEvent(new Event("change", { bubbles: true }));
  }, hoje);
  const contaBanco = await page.$eval(`${F} select[name="contaBancaria"]`, (s, c) => Array.from((s as HTMLSelectElement).options).find((o) => (o.textContent ?? "").includes(c as string))?.value ?? "", CONTA);
  if (contaBanco === "") throw new Error(`A conta ${CONTA} não está entre as do pagamento.`);
  await page.select(`${F} select[name="contaBancaria"]`, contaBanco);
  await digitar(`${F} input[name="historico"]`, "Pagamento da folha (ensaio)");
  const calcular = await page.$(`${F} button[data-acao="calcular-retencoes"]`);
  if (calcular !== null) {
    await page.$eval(`${F} input[name="retencaoCalculada"]`, (e) => { if (!(e as HTMLInputElement).checked) (e as HTMLInputElement).click(); }).catch(() => undefined);
    await page.$eval(`${F} button[data-acao="calcular-retencoes"]`, (b) => (b as HTMLButtonElement).click());
    await page.waitForFunction((f) => document.querySelector(`${f} [data-previa-das-retencoes]`) !== null || Array.from(document.querySelectorAll(`${f} [role="alert"]`)).some((e) => (e.textContent ?? "").trim() !== ""), { timeout: 120000 }, F).catch(() => undefined);
  }
  const previa = await page.$$eval(`${F} [data-previa-das-retencoes] tr[data-tributo]`, (trs) => trs.map((tr) => `${tr.getAttribute("data-tributo") ?? ""}=${tr.querySelector("[data-valor]")?.getAttribute("data-valor") ?? ""}`)).catch(() => [] as string[]);
  console.log(`   prévia das retenções: ${previa.join(", ") || "(nenhuma)"}`);
  const foraDaOrdem = await page.$(`${F} select[name="hipotese"]`);
  if (foraDaOrdem !== null) {
    await page.select(`${F} select[name="hipotese"]`, "V_ATIVIDADE_FINALISTICA");
    await digitar(`${F} input[name="autorizadoPor"]`, "Secretário de Finanças (ensaio)");
    await digitar(`${F} textarea[name="justificativa"]`, "Folha de pessoal, ensaio na base de demonstração");
  }
  await page.$eval(`${F} button[type="submit"]`, (b) => (b as HTMLButtonElement).click());
  await page.waitForFunction((f) => {
    const form = document.querySelector(f);
    return Array.from(form?.querySelectorAll(":scope > p") ?? []).some((x) => /status-ok/.test(x.className) || x.getAttribute("role") === "alert");
  }, { timeout: 120000 }, F).catch(() => undefined);
  const pg = await page.evaluate((sel) => {
    const f = document.querySelector(sel);
    const erro = f?.querySelector(':scope > p[role="alert"]');
    if (erro !== null && erro !== undefined) return { tipo: "erro", texto: (erro.textContent ?? "").trim() };
    const ok = Array.from(f?.querySelectorAll(":scope > p") ?? []).find((x) => /status-ok/.test(x.className));
    return ok === undefined ? { tipo: "silencio", texto: "" } : { tipo: "ok", texto: (ok.textContent ?? "").trim() };
  }, F);
  conferir(pg.tipo === "ok", `o pagamento da folha foi registrado pela tela (${pg.texto.slice(0, 120)})`);

  // 4. no banco
  const pagamento = await prisma.pagamento.findFirst({ where: { liquidacaoId: alvo.id, numero }, select: { id: true, valor: true } });
  const descontos = pagamento === null ? 0 : await prisma.descontoDoContrachequeRetido.count({ where: { pagamentoId: pagamento.id } });
  conferir(pagamento !== null && pagamento.valor.toFixed(2) === valor, `o pagamento ${numero} está gravado com o valor da liquidação (${pagamento?.valor.toFixed(2) ?? "nada"})`);
  console.log(`   descontos dos contracheques retidos no pagamento: ${String(descontos)}`);
  const aindaNaFila = await prisma.liquidacao.count({ where: { id: alvo.id, pagamentos: { none: {} } } });
  conferir(aindaNaFila === 0, "a liquidação da folha saiu da fila de pagamento");
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da folha até a tesouraria completo.");
