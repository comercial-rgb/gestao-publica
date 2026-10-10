import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { diaCivil } from "../packages/datas/index.js";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V39-R2 (R2-005 a 007) — PELA TELA: O IR RETIDO DE FORNECEDOR PESSOA FÍSICA.
 *   1. no pagamento, escolhe uma liquidação na fila cujo credor é pessoa física (CPF), liga o cálculo e pede a prévia:
 *      para pessoa física o cálculo não cobre (nenhuma alíquota inventada) e os tributos aparecem "Sem cálculo";
 *   2. informa IR, INSS e ISS com justificativa; a prévia mostra os valores informados;
 *   3. paga (registro contábil na base de demonstração; nenhum banco, nenhuma transmissão);
 *   4. no banco: o IR retido entra como IR de pessoa física (fato próprio, distinto do de pessoa jurídica), com a
 *      justificativa e o autor; a tela de retenções próprias mostra o fato com o rótulo de pessoa física.
 * GRAVA (base de demonstração ou ensaio, conferida pelo `entrar`): um pagamento e as retenções dele.
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação; este percurso grava.");
await exigirDestinoDoPercurso(n.base);
const prisma = criarPrismaClient(process.env["PERCURSO_BANCO"] ?? process.env["DATABASE_URL"] ?? "");
const usuario = process.env["PERCURSO_USUARIO"] ?? "admin@cg.pb.gov.br";
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
const F = 'form[data-acao="pagar"]';
const hoje = diaCivil(new Date());
const CONTA = process.env["PERCURSO_CONTA"] ?? "FIC-PM-500";
// O titular da conta que paga é o titular do Tesouro da decisão (o mesmo perímetro): lido da declaração dele, não fixado.
const TESOURO = (await prisma.declaracaoDeTitularDaConta.findFirst({ where: { contaBancaria: { codigo: CONTA } }, orderBy: { versao: "desc" }, select: { entidadeId: true } }))?.entidadeId ?? "";
const JUST = "Valor informado no ensaio V39-R2 conforme a nota do prestador pessoa física";

// a liquidação: a primeira não paga cujo credor é pessoa física
const alvo = await prisma.liquidacao.findFirst({
  where: { estornoDeId: null, anulacaoParcialDeId: null, estornos: { none: {} }, pagamentos: { none: {} }, empenho: { credorCpfCnpj: { not: { contains: "ESTORNO" } } } },
  orderBy: { valor: "asc" },
  select: { id: true, numero: true, valor: true, empenho: { select: { credorCpfCnpj: true } } },
}).then(async (primeira) => {
  const todas = await prisma.liquidacao.findMany({ where: { estornoDeId: null, anulacaoParcialDeId: null, estornos: { none: {} }, pagamentos: { none: {} } }, orderBy: { valor: "asc" }, select: { id: true, numero: true, valor: true, empenho: { select: { credorCpfCnpj: true } } } });
  return todas.find((l) => /^\d{11}$/.test(l.empenho.credorCpfCnpj) && l.valor.greaterThanOrEqualTo(20)) ?? (primeira !== null && /^\d{11}$/.test(primeira.empenho.credorCpfCnpj) ? primeira : null);
});
if (alvo === null) throw new Error("Nenhuma liquidação não paga de credor pessoa física nesta base.");
const valor = alvo.valor.toFixed(2);
const [ir, inss, iss] = ["1.50", "2.20", "0.00"];

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(300000);
  page.on("dialog", (d) => void d.accept());
  await entrar(n, page, usuario, process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "");

  // 0. a decisão do ente sobre o IR de pessoa física, pela tela, se ainda não houver: a natureza do ementário oficial
  //    (docs/oficial/stn-sof/ementario-2026: 11130310 "Imposto sobre a Renda - Retido na Fonte - Trabalho", principal
  //    final 1), a consignação de IR (conta 2.1.8.8.1.01.04 do plano carregado) e a classificação da retenção própria.
  if ((await prisma.naturezaReceita.findUnique({ where: { codigo: "11130311" }, select: { id: true } })) === null) {
    await irPara(n, page, "/receita/naturezas");
    const r = await preencherEEnviar(page, "criar-naturezas-de-receita", [
      { sel: 'input[name="codigo"]', valor: "1.1.1.3.03.1.1" },
      { sel: 'input[name="descricao"]', valor: "Imposto sobre a Renda - Retido na Fonte - Trabalho - Principal" },
    ]);
    conferir(r.tipo === "ok", `natureza 1.1.1.3.03.1.1 cadastrada pela tela, do ementário STN 2026 (${r.texto.slice(0, 60)})`);
  } else conferir(true, "natureza 1.1.1.3.03.1.1 já cadastrada");
  if ((await prisma.tipoConsignacao.findFirst({ where: { codigo: "IRRF" }, select: { id: true } })) === null) {
    await irPara(n, page, "/financeiro/consignacoes");
    await page.evaluate(() => Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Cadastrar consignação")?.click());
    const r = await preencherEEnviar(page, "cadastrar-consignacao", [
      { sel: 'input[name="codigo"]', valor: "IRRF" },
      { sel: 'input[name="descricao"]', valor: "Imposto de renda retido na fonte" },
      { sel: 'select[name="contaPassivoCodigo"]', valor: "2.1.8.8.1.01.04", tipo: "select" },
      { sel: '[name="fundamento"]', valor: "IR retido pelo município nos pagamentos que faz (CF, art. 158, I), ensaio V39-R2" },
    ]);
    conferir(r.tipo === "ok", `consignação de IR cadastrada pela tela na conta 2.1.8.8.1.01.04 (${r.texto.slice(0, 60)})`);
  } else conferir(true, "consignação de IR já cadastrada");
  const vigente = await prisma.classificacaoDaRetencaoPropria.findFirst({ where: { fato: "IRRF_PESSOA_FISICA" }, orderBy: [{ vigenteDesde: "desc" }, { criadoEm: "desc" }], select: { entidadeTitularId: true } });
  if (vigente === null || vigente.entidadeTitularId !== TESOURO) {
    await irPara(n, page, "/financeiro/retencoes-proprias");
    await page.evaluate(() => Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Registrar decisão")?.click());
    await page.waitForSelector('form[data-acao="classificar-retencao-propria"]');
    const r = await preencherEEnviar(page, "classificar-retencao-propria", [
      { sel: 'select[name="fato"]', valor: "IRRF_PESSOA_FISICA", tipo: "select" },
      { sel: 'select[name="tipoConsignacaoCodigo"]', valor: "IRRF", tipo: "select" },
      { sel: 'select[name="naturezaReceitaCodigo"]', valor: "11130311", tipo: "select" },
      { sel: 'select[name="fonteCodigo"]', valor: "500", tipo: "select" },
      { sel: 'select[name="contaCreditoCodigo"]', valor: "1.1.2.1.1.01.01", tipo: "select" },
      { sel: 'select[name="contaVpaCodigo"]', valor: "4.1.1.2.1.03.01", tipo: "select" },
      { sel: 'select[name="entidadeTitularId"]', valor: TESOURO, tipo: "select" },
      { sel: 'input[name="vigenteDesde"]', valor: hoje, tipo: "data" },
      { sel: 'input[name="fundamento"]', valor: "CF, art. 158, I: o IR retido pelo município é receita dele; natureza do ementário STN 2026 (trabalho), ensaio V39-R2" },
    ], "classificar-retencao-propria");
    const c = await prisma.classificacaoDaRetencaoPropria.findFirst({ where: { fato: "IRRF_PESSOA_FISICA" }, orderBy: [{ vigenteDesde: "desc" }, { criadoEm: "desc" }], select: { criadoPor: true, entidadeTitularId: true } });
    conferir(r.tipo === "ok" && c?.criadoPor === usuario && c.entidadeTitularId === TESOURO, `decisão sobre o IR de pessoa física registrada pela tela (${r.texto.slice(0, 80)})`);
  } else conferir(true, "decisão sobre o IR de pessoa física já registrada");

  await irPara(n, page, "/despesa/pagamentos");
  await page.waitForSelector(`${F} input[name="__chave"][data-chave-de-comando="pronta"]`);
  const naFila = await page.$$eval(`${F} select[name="liquidacaoId"] option`, (os, id) => os.some((o) => o.getAttribute("value") === id), alvo.id);
  conferir(naFila, `a liquidação ${alvo.numero} (R$ ${valor}, credor pessoa física) está na fila de pagamento`);
  if (!naFila) throw new Error("fora da fila");
  await page.select(`${F} select[name="liquidacaoId"]`, alvo.id);
  await new Promise((r) => setTimeout(r, 800));
  const digitar = async (sel: string, v: string): Promise<void> => {
    await page.$eval(sel, (e) => { (e as HTMLInputElement).value = ""; (e as HTMLElement).scrollIntoView({ block: "center" }); });
    await page.focus(sel);
    await page.keyboard.type(v, { delay: 5 });
  };
  const data = async (sel: string, v: string): Promise<void> => {
    await page.$eval(sel, (e, x) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      set?.call(e, x);
      e.dispatchEvent(new Event("input", { bubbles: true }));
      e.dispatchEvent(new Event("change", { bubbles: true }));
    }, v);
  };
  const numero = `8${String(Date.now()).slice(-6)}`;
  await digitar(`${F} input[name="numero"]`, numero);
  await digitar(`${F} input[data-mascara="valor"]:has(+ input[name="valor"])`, valor.replace(".", ","));
  await data(`${F} input[name="data"]`, hoje);
  // A conta do Tesouro (a da Prefeitura), pelo código. Nunca a primeira da lista: outra conta pode estar fora desta rodada.
  const contaBanco = await page.$eval(`${F} select[name="contaBancaria"]`, (s, c) => Array.from((s as HTMLSelectElement).options).find((o) => (o.textContent ?? "").includes(c as string))?.value ?? "", CONTA);
  if (contaBanco === "") throw new Error(`A conta ${CONTA} não está entre as do pagamento.`);
  await page.select(`${F} select[name="contaBancaria"]`, contaBanco);
  const escolhida = await page.$eval(`${F} select[name="contaBancaria"]`, (s) => ((s as HTMLSelectElement).selectedOptions[0]?.textContent ?? ""));
  if (!escolhida.includes(CONTA)) throw new Error(`A conta escolhida não é a ${CONTA}: ${escolhida}`);
  await digitar(`${F} input[name="historico"]`, "Pagamento a prestador pessoa física com IR informado (ensaio V39-R2)");
  await page.$eval(`${F} input[name="retencaoCalculada"]`, (e) => { if (!(e as HTMLInputElement).checked) (e as HTMLInputElement).click(); });
  await page.waitForSelector(`${F} [data-valor-informado]`);
  await page.$eval(`${F} [data-valor-informado]`, (d) => { (d as HTMLDetailsElement).open = true; });
  for (const [t, v] of [["IRRF", ir], ["INSS", inss], ["ISS", iss]] as const) {
    await digitar(`${F} input[data-mascara="valor"]:has(+ input[name="rcInformado${t}"])`, v.replace(".", ","));
    await digitar(`${F} input[name="rcJustificativa${t}"]`, JUST);
  }
  await page.$eval(`${F} button[data-acao="calcular-retencoes"]`, (b) => (b as HTMLButtonElement).click());
  await page.waitForFunction((f) => document.querySelector(`${f} [data-previa-das-retencoes] tr[data-tributo]`) !== null || Array.from(document.querySelectorAll(`${f} [role="alert"]`)).some((e) => (e.textContent ?? "").trim() !== ""), { timeout: 120000 }, F);
  const alerta = await page.$$eval(`${F} [role="alert"]`, (es) => es.map((e) => (e.textContent ?? "").trim()).filter((x) => x !== "").join(" | "));
  if (alerta !== "") console.log(`   aviso na tela: ${alerta.slice(0, 300)}`);
  const previa = await page.$$eval(`${F} [data-previa-das-retencoes] tr[data-tributo]`, (trs) => trs.map((tr) => [tr.getAttribute("data-tributo") ?? "", tr.querySelector("[data-valor]")?.getAttribute("data-valor") ?? "", (tr.textContent ?? "").replace(/\s+/g, " ")] as const));
  console.log(`   prévia: ${previa.map((p) => `${p[0]}=${p[1]}`).join(", ")}`);
  const doTributo = (t: string): string => previa.find((p) => p[0] === t)?.[1] ?? "";
  conferir(doTributo("IRRF") === ir && doTributo("INSS") === inss && doTributo("ISS") === iss, `a prévia mostra os valores informados: IR ${doTributo("IRRF")}, INSS ${doTributo("INSS")}, ISS ${doTributo("ISS")}`);

  // 3. pagar
  const foraDaOrdem = await page.$(`${F} select[name="hipotese"]`);
  if (foraDaOrdem !== null) {
    await page.select(`${F} select[name="hipotese"]`, "V_ATIVIDADE_FINALISTICA");
    await digitar(`${F} input[name="autorizadoPor"]`, "Secretário de Finanças (ensaio)");
    await digitar(`${F} textarea[name="justificativa"]`, "Serviço essencial prestado por pessoa física, ensaio V39-R2 na base de demonstração");
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
  conferir(pg.tipo === "ok", `o pagamento foi registrado (${pg.texto.slice(0, 120)})`);

  // 4. o fato no banco e na tela
  const pagamento = await prisma.pagamento.findFirst({ where: { liquidacaoId: alvo.id, numero }, select: { id: true } });
  const fatos = pagamento === null ? [] : await prisma.retencaoPropriaDoPagamento.findMany({ where: { pagamentoId: pagamento.id }, select: { fato: true, valor: true } });
  console.log(`   fatos próprios do pagamento: ${fatos.map((f) => `${f.fato}=${f.valor.toFixed(2)}`).join(", ") || "(nenhum)"}`);
  conferir(fatos.some((f) => f.fato === "IRRF_PESSOA_FISICA" && f.valor.toFixed(2) === ir) && !fatos.some((f) => f.fato === "IRRF_FORNECEDOR_PJ"), "o IR retido entrou como IR de pessoa física, e nada como IR de pessoa jurídica");
  // A memória do tributo retido como receita própria fica no elo da retenção própria (V26), não em CalculoDaRetencao.
  const memoria = pagamento === null ? null : await prisma.retencaoPropriaDoPagamento.findFirst({ where: { pagamentoId: pagamento.id, fato: "IRRF_PESSOA_FISICA" }, select: { base: true, valor: true, fundamento: true, criadoPor: true } });
  conferir(memoria !== null && memoria.base === null && memoria.valor.toFixed(2) === ir && (memoria.fundamento ?? "").includes("V39-R2") && memoria.criadoPor === usuario, `a memória do IR (no elo da retenção própria) guarda o valor informado sem base nem alíquota, a justificativa e o autor (${memoria?.criadoPor ?? "?"})`);
  await irPara(n, page, "/financeiro/retencoes-proprias");
  const tela = await page.evaluate(() => document.body.innerText);
  conferir(/pessoa f[ií]sica/i.test(tela), "a tela de retenções próprias mostra o IR retido de fornecedor pessoa física");
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso do IR de pessoa física completo.");
