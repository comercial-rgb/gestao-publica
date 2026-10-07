import "dotenv/config";
import type { Page } from "puppeteer";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V36 — PERCURSO DOS CHEQUES (TR 5.10.2.42):
 *   empenho e liquidação pelas telas; o pagamento pela tela com o número do cheque; a consulta de cheques mostra o
 *   cheque do pagamento com o valor e o credor; um cheque avulso registrado pela tela aparece na mesma consulta; o
 *   mesmo número na mesma conta é recusado com o motivo; o avulso cancelado com motivo muda de situação; quem não
 *   consulta a tesouraria não abre a tela.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 npx tsx scripts/percurso-v36-cheques.mts
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
const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());

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

  // ── 1. empenho e liquidação pelas telas ──
  const pessoa = await prisma.pessoa.findFirst({ orderBy: { documento: "asc" }, where: { documento: { not: { startsWith: "0" } } }, select: { documento: true } });
  // A tela de pagamento paga pela fonte PRINCIPAL da conta: a ficha tem de ser de uma fonte que alguma conta tem.
  const fontesDasContas = (await prisma.contaBancaria.findMany({ where: { contaContabilId: { not: null } }, select: { fonte: { select: { codigo: true } } } })).map((c) => c.fonte.codigo);
  await irPara(n, page, "/despesa/empenhos?exercicio=2026");
  const ficha = await page.evaluate((fontes) => {
    const s = document.querySelector('form[data-acao="empenhar"] select[name="fichaId"]');
    if (!(s instanceof HTMLSelectElement)) return "";
    let melhor = { v: "", saldo: 0 };
    for (const o of Array.from(s.options)) {
      if (o.value === "" || o.disabled) continue;
      const t = (o.textContent ?? "").trim();
      if (!/—\s*339039/.test(t)) continue;
      if (!fontes.includes(/fonte (\S+)/.exec(t)?.[1] ?? "")) continue;
      const m = /disponível R\$\s*([\d.]+,\d{2})\s*$/.exec(t);
      const saldo = m === null ? 0 : Number((m[1] ?? "0").replace(/\./g, "").replace(",", "."));
      if (saldo > melhor.saldo) melhor = { v: o.value, saldo };
    }
    return melhor.v;
  }, fontesDasContas);
  await texto(page, 'form[data-acao="empenhar"]', "historico", `Serviço pago por cheque ${marca} (percurso)`);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('form[data-acao="empenhar"] button')].find((x) => /Credor sem cadastro/i.test(x.textContent ?? ""));
    (b as HTMLButtonElement | undefined)?.click();
  });
  await preencherEEnviar(page, "empenhar", [
    { sel: 'select[name="fichaId"]', valor: ficha, tipo: "select" },
    { sel: '[data-mascara="cpf-cnpj"]', valor: pessoa?.documento ?? "" },
    { sel: '[data-mascara="valor"]', valor: "1.000,00" },
    { sel: 'input[name="data"]', valor: hoje, tipo: "data" },
    { sel: 'select[name="categoria"]', valor: "PRESTACAO_SERVICOS", tipo: "select" },
  ]);
  const empenho = await prisma.empenho.findFirst({
    where: { historico: `Serviço pago por cheque ${marca} (percurso)` },
    select: { id: true, numero: true, credorCpfCnpj: true, ficha: { select: { fonteId: true } } },
  });
  conferir(empenho !== null, `empenho de R$ 1.000,00 emitido pela tela (${empenho?.numero ?? "nenhum"})`);
  if (empenho === null) throw new Error("sem empenho, o percurso não segue");

  await irPara(n, page, "/despesa/liquidacoes?exercicio=2026");
  await texto(page, 'form[data-acao="liquidar"]', "historico", `Liquidação do serviço ${marca}`);
  await preencherEEnviar(page, "liquidar", [
    { sel: 'select[name="empenhoId"]', valor: empenho.id, tipo: "select" },
    { sel: '[data-mascara="valor"]', valor: "1.000,00" },
    { sel: 'input[name="data"]', valor: hoje, tipo: "data" },
    { sel: 'input[name="atesto"]', valor: "Servidor fictício do atesto" },
  ]);
  const liq = await prisma.liquidacao.findFirst({ where: { empenhoId: empenho.id, estornoDeId: null }, select: { id: true, numero: true } });
  conferir(liq !== null, `liquidação pela tela (${liq?.numero ?? "nenhuma"})`);
  if (liq === null) throw new Error("sem liquidação, o percurso não segue");

  // ── 2. pagamento pela tela com o número do cheque ──
  const conta = await prisma.contaBancaria.findFirst({ where: { fonteId: empenho.ficha.fonteId, contaContabilId: { not: null } }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true } });
  if (conta === null) throw new Error("a base não tem conta bancária da fonte da ficha");
  const cheque = `9${marca}`;
  await irPara(n, page, "/despesa/pagamentos?exercicio=2026");
  await texto(page, 'form[data-acao="pagar"]', "historico", `Pagamento por cheque ${marca}`);
  // Uma liquidação de rodada anterior que ficou sem pagamento passa à frente na fila (art. 141): a tela pede então a
  // justificativa da quebra da ordem, e o percurso a preenche como o operador faria.
  await page.select('form[data-acao="pagar"] select[name="liquidacaoId"]', liq.id);
  const pedeJustificativa = (await page.$('form[data-acao="pagar"] select[name="hipotese"]')) !== null;
  const justificativa: Parameters<typeof preencherEEnviar>[2][number][] = [];
  if (pedeJustificativa) {
    const hipotese = await page.$eval('form[data-acao="pagar"] select[name="hipotese"]', (s) => Array.from((s as HTMLSelectElement).options).find((o) => o.value !== "")?.value ?? "");
    await texto(page, 'form[data-acao="pagar"]', "justificativa", "Pagamento do percurso de teste antes de liquidação deixada por rodada anterior.");
    justificativa.push({ sel: 'select[name="hipotese"]', valor: hipotese, tipo: "select" }, { sel: 'input[name="autorizadoPor"]', valor: "Secretário de Finanças (fictício)" });
  }
  const rp = await preencherEEnviar(page, "pagar", [
    ...justificativa,
    { sel: 'select[name="liquidacaoId"]', valor: liq.id, tipo: "select" },
    { sel: 'input[name="numero"]', valor: marca.slice(-6) },
    { sel: '[data-mascara="valor"]', valor: "1.000,00" },
    { sel: 'input[name="data"]', valor: hoje, tipo: "data" },
    { sel: 'select[name="contaBancaria"]', valor: conta.codigo, tipo: "select" },
    { sel: 'input[name="numeroDoCheque"]', valor: cheque },
  ]);
  if (rp.tipo === "silencio") {
    const invalidos = await page.$$eval('form[data-acao="pagar"] :invalid', (els) => els.map((e) => `${e.getAttribute("name") ?? e.tagName}: ${(e as HTMLInputElement).validationMessage}`));
    const naFila = await page.$$eval('form[data-acao="pagar"] select[name="liquidacaoId"] option', (os, id) => os.some((o) => (o as HTMLOptionElement).value === id), liq.id);
    console.log(`   pagamento sem resposta; liquidação na fila: ${String(naFila)}; inválidos: ${invalidos.join(" | ")}`);
  }
  const doPagamento = await prisma.cheque.findFirst({ where: { numero: cheque, contaBancariaId: conta.id }, select: { origem: true, valor: true, pagamento: { select: { liquidacaoId: true } } } });
  conferir(
    doPagamento !== null && doPagamento.origem === "PAGAMENTO" && doPagamento.pagamento?.liquidacaoId === liq.id && /com o cheque/i.test(rp.texto),
    `pagamento pela tela com o cheque ${cheque} ("${rp.texto.trim().slice(0, 80)}"), valor de face ${doPagamento?.valor.toFixed(2) ?? "-"}`
  );

  // ── 3. a consulta mostra o cheque do pagamento ──
  const consulta = `/financeiro/cheques?de=${hoje}&ate=${hoje}&conta=${conta.id}`;
  await irPara(n, page, consulta);
  const linhaPag = await page.$eval(`[data-cheque="${cheque}"]`, (e) => (e as HTMLElement).innerText).catch(() => "");
  conferir(/pagamento/i.test(linhaPag) && linhaPag.includes("1.000,00") && /emitido/i.test(linhaPag) && linhaPag.toLowerCase().includes(`empenho ${empenho.numero}`.toLowerCase()), `consulta: cheque do pagamento com valor, empenho e situação ("${linhaPag.replace(/\s+/g, " ").slice(0, 120)}")`);

  // ── 4. avulso pela tela, e o número repetido recusado ──
  const avulso = `8${marca}`;
  const registrar = async (numero: string): Promise<string> => {
    await irPara(n, page, consulta);
    return (await preencherEEnviar(page, "form[data-form-cheque-avulso]", [
      { sel: 'select[name="conta"]', valor: conta.id, tipo: "select" },
      { sel: 'input[name="numero"]', valor: numero },
      { sel: 'input[name="dia"]', valor: hoje, tipo: "data" },
      { sel: '[data-mascara="valor"]', valor: "250,00" },
      { sel: 'input[name="favorecido"]', valor: "Fornecedor Fictício da Devolução" },
      { sel: 'input[name="finalidade"]', valor: "devolução de caução (percurso)" },
    ])).texto;
  };
  const r1 = await registrar(avulso);
  const r2 = await registrar(cheque);
  const avulsos = await prisma.cheque.count({ where: { contaBancariaId: conta.id, numero: { in: [avulso, cheque] }, origem: "AVULSO" } });
  conferir(/registrado/i.test(r1) && new RegExp(`O cheque ${cheque} já foi emitido`).test(r2) && avulsos === 1, `avulso registrado ("${r1.trim().slice(0, 50)}"); o número do cheque do pagamento recusado ("${r2.trim().slice(0, 70)}")`);
  await irPara(n, page, consulta);
  const ambos = await page.$$eval("[data-cheque]", (ls) => ls.map((l) => l.getAttribute("data-cheque")));
  conferir(ambos.includes(cheque) && ambos.includes(avulso), `a mesma consulta lista o de pagamento e o avulso (${ambos.join(", ")})`);

  // ── 5. cancelamento do avulso ──
  const rc = await preencherEEnviar(page, `form[aria-label="Cancelar o cheque ${avulso}"]`, [{ sel: 'input[name="motivo"]', valor: "cheque preenchido errado" }]);
  await irPara(n, page, `${consulta}&situacao=CANCELADO`);
  const cancelados = await page.$$eval("[data-cheque]", (ls) => ls.map((l) => `${l.getAttribute("data-cheque")}:${(l as HTMLElement).innerText.replace(/\s+/g, " ")}`));
  // A linha cancelada perde o formulário (não há mais o que cancelar): a prova é a linha recarregada, não a mensagem.
  console.log(`   cancelamento: ${rc.tipo} — ${rc.texto.trim().slice(0, 100)}`);
  const desta = cancelados.find((c) => c.startsWith(`${avulso}:`)) ?? "";
  conferir(/cheque preenchido errado/i.test(desta) && cancelados.every((c) => /cancelado/i.test(c)), `avulso cancelado com motivo e filtrado como cancelado (${cancelados.join(" | ").slice(0, 120)})`);

  // ── 6. negação ──
  const outra = await (await nav.createBrowserContext()).newPage();
  outra.setDefaultTimeout(120000);
  await entrar(n, outra, "atestador@ficticio.local", "Ficticio#2026");
  await outra.goto(`${n.base}${consulta}`, { waitUntil: "domcontentloaded" });
  const t = await outra.evaluate(() => document.body.innerText);
  const motivo = (/[^.\n]*(acesso|permiss)[^.\n]*/i.exec(t)?.[0] ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  conferir(!t.includes(avulso) && !t.includes("Fornecedor Fictício da Devolução") && motivo !== "", `sem consulta da tesouraria: a tela não abre ("${motivo}")`);
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso dos cheques completo.");
