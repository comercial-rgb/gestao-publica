import "dotenv/config";
import { mkdirSync } from "node:fs";
import puppeteer, { type Page } from "puppeteer";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { lerFatosReceitaOrcamentaria, lerFatosRetencao } from "../../adapters/tribunais/tce-pb/sagres/gerador.js";

/**
 * PERCURSO DE NAVEGADOR — V26: o IR e o ISS retidos pelo próprio município viram receita no pagamento.
 *
 * Uso: `DATABASE_URL=<clone gestao_publica_ensaio> npx tsx scripts/demonstracao/percurso-retencoes-proprias.ts [base] [pasta]`
 * (padrão http://localhost:3011). GRAVA pela tela: um pagamento com IR retido à moda antiga (o legado), as três
 * decisões do município, a regularização do legado, um pagamento de fornecedor com IR, INSS e ISS calculados e o
 * pagamento da folha de setembro com o IR do servidor. O banco é LIDO direto só para conferir (ente, IR do
 * contracheque, arquivos do SAGRES). Nunca contra a 3010: recusa a porta e recusa outro banco.
 *
 * Pré-condição: o clone preparado por `preparar-v26-retencoes.ts`.
 */

const BASE = process.argv[2] ?? "http://localhost:3011";
const PASTA = process.argv[3] ?? "capturas-v26";
if (/:3010\b/.test(BASE)) throw new Error("Recusado: a 3010 serve o banco da apresentação, e este percurso grava.");
const URL_BANCO = process.env["DATABASE_URL"] ?? "";
if (!/\/gestao_publica_ensaio(\?|$)/.test(URL_BANCO)) throw new Error("Recusado: o banco lido para conferir tem de ser o clone gestao_publica_ensaio.");
const SENHA = process.env["SEED_ADMIN_SENHA"] ?? "";
if (SENHA === "") throw new Error("SEED_ADMIN_SENHA ausente.");
const DOCUMENTO = "98765432000198";

mkdirSync(PASTA, { recursive: true });
let passos = 0;
const falhas: string[] = [];
const naoExecutados: string[] = [];
function afirmar(cond: boolean, oque: string): void {
  passos++;
  console.log(`  ${cond ? "ok  " : "FALHA"} ${oque}`);
  if (!cond) falhas.push(oque);
}
const ir = (p: Page, rota: string): Promise<unknown> => p.goto(`${BASE}${rota}`, { waitUntil: "networkidle0", timeout: 180000 });
const texto = (p: Page): Promise<string> => p.evaluate(() => document.body.innerText);
const esperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function digitar(p: Page, alvo: string, valor: string): Promise<void> {
  await p.waitForSelector(alvo, { timeout: 20000 });
  await p.$eval(alvo, (e) => {
    (e as HTMLInputElement).value = "";
    (e as HTMLElement).scrollIntoView({ block: "center" });
  });
  await p.focus(alvo);
  await p.keyboard.type(valor, { delay: 5 });
}
async function data(p: Page, alvo: string, valor: string): Promise<void> {
  await p.$eval(alvo, (e, v) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(e, v);
    e.dispatchEvent(new Event("input", { bubbles: true }));
    e.dispatchEvent(new Event("change", { bubbles: true }));
  }, valor);
}
/** Envia o formulário e devolve o alerta (erro), o status (ok) ou silêncio. */
async function enviar(p: Page, form: string): Promise<{ tipo: "ok" | "erro" | "silencio"; texto: string }> {
  await p.waitForSelector(`${form} input[name="__chave"][data-chave-de-comando="pronta"]`, { timeout: 30000 });
  await p.$eval(`${form} button[type="submit"]`, (b) => (b as HTMLButtonElement).click());
  await esperar(6000);
  return p.evaluate((sel) => {
    const f = document.querySelector(sel);
    const raiz = f?.parentElement ?? document.body;
    const alerta = f?.querySelector('[role="alert"]') ?? raiz.querySelector('[role="alert"]');
    if (alerta !== null && alerta !== undefined && (alerta.textContent ?? "").trim() !== "") return { tipo: "erro" as const, texto: (alerta.textContent ?? "").trim() };
    const ok = f?.querySelector('[role="status"]') ?? raiz.querySelector('[role="status"]') ?? Array.from(f?.querySelectorAll("p") ?? []).find((x) => /status-ok/.test(x.className)) ?? null;
    return ok !== null && ok !== undefined ? { tipo: "ok" as const, texto: (ok.textContent ?? "").trim() } : { tipo: "silencio" as const, texto: "" };
  }, form);
}
/** O resultado do formulário de pagamento: o parágrafo de erro ou de sucesso do próprio form. */
async function resultadoDoPagamento(p: Page, fpg: string): Promise<{ tipo: string; texto: string }> {
  return p.evaluate((sel) => {
    const f = document.querySelector(sel);
    const erro = f?.querySelector(':scope > p[role="alert"]');
    if (erro !== null && erro !== undefined) return { tipo: "erro", texto: (erro.textContent ?? "").trim() };
    const ok = Array.from(f?.querySelectorAll(":scope > p") ?? []).find((x) => /status-ok/.test(x.className));
    return ok === undefined ? { tipo: "silencio", texto: "" } : { tipo: "ok", texto: (ok.textContent ?? "").trim() };
  }, fpg);
}

const FPG = 'form[data-acao="pagar"]';
/** Preenche o formulário de pagamento até antes das retenções. `rotulo` acha a liquidação na lista. */
async function prepararPagamento(p: Page, achar: (texto: string) => boolean, numero: string, valor: string, dia: string, historico: string): Promise<boolean> {
  await ir(p, "/despesa/pagamentos");
  const opcoes = await p.$eval(`${FPG} select[name="liquidacaoId"]`, (s) => Array.from((s as HTMLSelectElement).options).map((o) => [o.value, o.textContent ?? ""] as const));
  const alvo = opcoes.find(([v, t]) => v !== "" && achar(t));
  if (alvo === undefined) return false;
  await p.select(`${FPG} select[name="liquidacaoId"]`, alvo[0]);
  await digitar(p, `${FPG} input[name="numero"]`, numero);
  await digitar(p, `${FPG} input[inputmode="decimal"]`, valor);
  await data(p, `${FPG} input[name="data"]`, dia);
  const contaBanco = await p.$eval(`${FPG} select[name="contaBancaria"]`, (s) => Array.from((s as HTMLSelectElement).options).find((o) => o.value !== "")?.value ?? "");
  await p.select(`${FPG} select[name="contaBancaria"]`, contaBanco);
  await digitar(p, `${FPG} input[name="historico"]`, historico);
  return true;
}
async function quebraDeOrdemSeHouver(p: Page): Promise<void> {
  if ((await p.$(`${FPG} select[name="hipotese"]`)) !== null) {
    await p.select(`${FPG} select[name="hipotese"]`, "V_ATIVIDADE_FINALISTICA");
    await digitar(p, `${FPG} input[name="autorizadoPor"]`, "Secretario de Financas");
    await digitar(p, `${FPG} textarea[name="justificativa"]`, "Servico essencial do municipio, sem o qual o atendimento para");
  }
}
async function pagarAgora(p: Page): Promise<{ tipo: string; texto: string }> {
  await p.waitForSelector(`${FPG} input[name="__chave"][data-chave-de-comando="pronta"]`, { timeout: 30000 });
  await p.$eval(`${FPG} button[type="submit"]`, (b) => (b as HTMLButtonElement).click());
  await esperar(7000);
  return resultadoDoPagamento(p, FPG);
}

async function main(): Promise<void> {
  const prisma = criarPrismaClient(URL_BANCO);
  const navegador = await puppeteer.launch({ headless: true, args: ["--lang=pt-BR"] });
  try {
    const ente = await prisma.enteConfig.findFirstOrThrow({ select: { nome: true, cnpj: true } });
    const p = await navegador.newPage();
    await p.evaluateOnNewDocument("globalThis.__name = (f) => f;");
    await p.setViewport({ width: 1440, height: 900 });

    console.log("1. entrada");
    await ir(p, "/login");
    await p.type('input[name="identificador"]', "admin@cg.pb.gov.br");
    await p.type('input[name="senha"]', SENHA);
    await p.click('button[type="submit"]');
    await p.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 120000 }).catch(() => undefined);
    afirmar(!p.url().includes("/login"), "a sessão abriu");

    console.log("2. sem decisão, a tela diz o que falta");
    await ir(p, "/financeiro/retencoes-proprias");
    const t0 = await texto(p);
    afirmar(/Sem decisão vigente/.test(t0) && /IR retido na folha/.test(t0) && /ISS retido/.test(t0), "a tela nomeia os três impostos sem decisão");
    await p.screenshot({ path: `${PASTA}/1-sem-decisao.png`, fullPage: true });

    console.log("3. o legado: um pagamento antigo com o IR do município retido como consignação");
    const tipoIr = await prisma.tipoConsignacao.findUniqueOrThrow({ where: { codigo: "IRRF" }, select: { id: true } });
    if (await prepararPagamento(p, (x) => x.includes(" · 11 · "), "9026001", "4500,00", "2026-09-22", "Pagamento com IR retido como consignacao (legado)")) {
      await p.evaluate(() => Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Acrescentar retenção")?.click());
      await esperar(800);
      const temLinha = (await p.$(`${FPG} select[name="retencaoTipo"]`)) !== null;
      if (temLinha) {
        await p.select(`${FPG} select[name="retencaoTipo"]`, tipoIr.id);
        await digitar(p, `${FPG} input[name="retencaoCredor"]`, ente.nome);
        await digitar(p, `${FPG} fieldset input[inputmode="decimal"]`, "67,50");
        await quebraDeOrdemSeHouver(p);
        const r = await pagarAgora(p);
        afirmar(r.tipo === "ok", `o pagamento antigo, com IR como consignação, foi registrado antes da decisão (${r.texto.slice(0, 100)})`);
      } else {
        naoExecutados.push("a tela não ofereceu a linha de retenção manual");
      }
    } else naoExecutados.push("a liquidação 11 não está na fila");

    console.log("4. as três decisões do município, pela tela");
    const decisoes = [
      { fato: "IRRF_FORNECEDOR_PJ", tipo: "IRRF", natureza: "11130341", credito: "1.1.2.1.1.01.01", vpa: "4.1.1.2.1.03.02", fundamento: "MCASP 11a ed. Parte I 3.6.2: IR retido de PJ e receita do municipio; ementario STN 2026" },
      { fato: "ISS", tipo: "ISS", natureza: "11145111", credito: "1.1.2.1.1.01.07", vpa: "4.1.1.3.1.02.00", fundamento: "ISS retido de prestador no municipio e imposto municipal; ementario STN 2026" },
      { fato: "IRRF_FOLHA", tipo: "IRRF", natureza: "11130311", credito: "1.1.2.1.1.01.01", vpa: "4.1.1.2.1.03.01", fundamento: "IR retido do servidor (CF art. 158, I); ementario STN 2026, trabalho" },
    ];
    for (const d of decisoes) {
      await ir(p, "/financeiro/retencoes-proprias");
      await p.evaluate(() => Array.from(document.querySelectorAll('button[type="button"]')).find((b) => b.textContent?.trim() === "Registrar decisão")?.click());
      const f = 'form[data-acao="classificar-retencao-propria"]';
      await p.waitForSelector(f, { timeout: 20000 });
      await p.select(`${f} select[name="fato"]`, d.fato);
      await esperar(300);
      await p.select(`${f} select[name="tipoConsignacaoCodigo"]`, d.tipo);
      await p.select(`${f} select[name="naturezaReceitaCodigo"]`, d.natureza);
      await p.select(`${f} select[name="fonteCodigo"]`, "500");
      await p.select(`${f} select[name="contaCreditoCodigo"]`, d.credito);
      await p.select(`${f} select[name="contaVpaCodigo"]`, d.vpa);
      await data(p, `${f} input[name="vigenteDesde"]`, "2026-01-01");
      await digitar(p, `${f} input[name="fundamento"]`, d.fundamento);
      const r = await enviar(p, f);
      afirmar(r.tipo === "ok", `${d.fato}: decisão registrada (${r.texto.slice(0, 90)})`);
    }
    await ir(p, "/financeiro/retencoes-proprias");
    const vigentes = await p.$$eval('tr[data-retencao-propria][data-vigente="sim"]', (trs) => trs.map((t) => t.getAttribute("data-retencao-propria")));
    afirmar(vigentes.length === 3, `depois de recarregar, três decisões vigentes (${vigentes.join(", ")})`);
    afirmar(!/Sem decisão vigente/.test(await texto(p)), "o aviso de imposto sem decisão sumiu");

    console.log("5. recolher o IR do município com saída de banco é recusado");
    await ir(p, `/financeiro/extraorcamentario/recolher?tipo=IRRF&credor=${encodeURIComponent(ente.nome)}`);
    const fr = 'form:has(input[name="parcela"])';
    if ((await p.$(fr)) !== null) {
      const conta = await p.$eval(`${fr} select[name="contaBancaria"]`, (s) => Array.from((s as HTMLSelectElement).options).find((o) => o.value !== "")?.value ?? "");
      await p.select(`${fr} select[name="contaBancaria"]`, conta);
      await data(p, `${fr} input[name="data"]`, "2026-09-23");
      await digitar(p, `${fr} input[name="historico"]`, "Recolhimento do IR retido");
      // O favorecido do recolhimento: o CNPJ do ente quando cadastrado; no clone sem ele, um CNPJ válido de demonstração.
      await digitar(p, `${fr} input[data-mascara="cpf-cnpj"]`, ente.cnpj ?? "11222333000181");
      await digitar(p, `${fr} input[name="parcela"]`, "67,50");
      const r = await enviar(p, fr);
      afirmar(r.tipo === "erro" && /imposto do próprio município/.test(r.texto), `recusado, com o motivo (${r.texto.slice(0, 110)})`);
    } else naoExecutados.push("o recolhimento do IR do município não teve formulário (sem saldo listado)");

    console.log("6. a regularização do legado como receita");
    await ir(p, "/financeiro/retencoes-proprias");
    const linha = await p.$('tr[data-retencao-antiga] form[data-acao="regularizar-retencao-antiga"]');
    if (linha !== null) {
      const t6 = await texto(p);
      afirmar(/a regularizar 67,50/.test(t6), "a retenção antiga aparece com 67,50 a regularizar");
      const f = 'tr[data-retencao-antiga] form[data-acao="regularizar-retencao-antiga"]';
      await digitar(p, `${f} input[name="motivo"]`, "IR do municipio retido como consignacao antes da decisao de 2026");
      const r = await enviar(p, f);
      afirmar(r.tipo !== "erro", `a regularização não foi recusada (${r.texto.slice(0, 110)})`);
      const ap = await prisma.apropriacaoDaConsignacaoPropria.findFirst({ select: { valor: true, receitaArrecadada: { select: { numeroReceita: true, naturezaReceita: { select: { codigo: true } } } } } });
      afirmar(ap !== null && ap.valor.toFixed(2) === "67.50" && ap.receitaArrecadada.naturezaReceita.codigo === "11130341", `virou a guia ${ap?.receitaArrecadada.numeroReceita ?? "?"} de 67,50 no IR de fornecedor (${ap?.receitaArrecadada.naturezaReceita.codigo ?? "?"})`);
      await ir(p, "/financeiro/retencoes-proprias");
      afirmar((await p.$("tr[data-retencao-antiga]")) === null, "depois de recarregar, não há retenção antiga a regularizar");
    } else naoExecutados.push("nenhuma retenção antiga listada (o passo 3 não criou o legado)");

    console.log("7. o fornecedor com IR, INSS e ISS calculados");
    for (const [codigo, conta] of [["INSS", "2.1.8.8.1.01.02"], ["ISS", "2.1.8.8.1.01.08"]] as const) {
      await ir(p, "/financeiro/consignacoes");
      const linhaAntes = await p.$eval(`tr[data-teste="consignacao-${codigo}"]`, (tr) => tr.getAttribute("data-conta") ?? "").catch(() => "");
      if (linhaAntes === conta) continue;
      await p.evaluate((cod) => Array.from(document.querySelector(`tr[data-teste="consignacao-${cod}"]`)?.querySelectorAll("button") ?? []).find((x) => x.textContent?.includes("Trocar a conta"))?.click(), codigo);
      const form = `tr[data-teste="consignacao-${codigo}"] form[data-acao="redefinir-consignacao"]`;
      await p.waitForSelector(form, { timeout: 20000 });
      await p.select(`${form} select[name="contaPassivoCodigo"]`, conta);
      await digitar(p, `${form} input[name="fundamento"]`, `Conta analitica do PCASP oficial para ${codigo} retido, em vez da conta de agrupamento`);
      const r = await enviar(p, form);
      afirmar(r.tipo !== "erro", `${codigo}: passivo na analítica ${conta} (${r.texto.slice(0, 80)})`);
    }
    await ir(p, `/cadastros/pessoas?busca=${DOCUMENTO}`);
    const jaTemPessoa = await p.evaluate((doc) => document.body.innerText.includes(doc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")), DOCUMENTO);
    if (!jaTemPessoa) {
      await ir(p, "/cadastros/pessoas");
      const fp = 'form[data-acao="cadastrar-pessoa"]';
      await digitar(p, `${fp} input[data-mascara="cpf-cnpj"]`, DOCUMENTO);
      await digitar(p, `${fp} input[name="nome"]`, "Limpeza Modelo Servicos Ltda");
      await enviar(p, fp);
      await ir(p, `/cadastros/pessoas?busca=${DOCUMENTO}`);
    }
    const href = await p.evaluate(() => Array.from(document.querySelectorAll('a[href^="/cadastros/pessoas/"]')).map((a) => a.getAttribute("href"))[0] ?? null);
    if (href !== null) {
      await ir(p, href);
      if (/Nenhum dado fiscal registrado/.test(await texto(p))) {
        const ff = 'form[data-acao="registrar-perfil-fiscal"]';
        await data(p, `${ff} input[name="vigenteDesde"]`, "2026-01-01");
        await digitar(p, `${ff} input[name="municipioDoEstabelecimento"]`, "2504009");
        await digitar(p, `${ff} input[name="fundamento"]`, "Consulta ao Portal do Simples Nacional em 30/09/2026: nao optante");
        const rf = await enviar(p, ff);
        afirmar(rf.tipo === "ok", `perfil fiscal do fornecedor registrado (${rf.texto.slice(0, 70)})`);
      }
    }
    if (await prepararPagamento(p, (x) => x.includes(" · 10 · "), "9026002", "8000,00", "2026-09-25", "Pagamento de servicos de limpeza com retencoes calculadas")) {
      await p.$eval(`${FPG} input[name="retencaoCalculada"]`, (c) => (c as HTMLInputElement).click());
      await p.waitForSelector(`${FPG} select[name="rcNaturezaIR"]`, { timeout: 20000 });
      await p.select(`${FPG} select[name="rcNaturezaIR"]`, "6190");
      await p.select(`${FPG} select[name="rcInssServico"]`, "111-I");
      await p.select(`${FPG} select[name="rcInssModalidade"]`, "CESSAO_DE_MAO_DE_OBRA");
      const opcao1705 = await p.$eval("datalist", (d) => Array.from(d.querySelectorAll("option")).find((o) => o.value.startsWith("17.05 "))?.value ?? "");
      await digitar(p, `${FPG} input[name="rcIssSubitem"]`, opcao1705);
      await p.$eval('button[data-acao="calcular-retencoes"]', (b) => (b as HTMLButtonElement).click());
      await p.waitForSelector("[data-previa-das-retencoes]", { timeout: 60000 }).catch(() => undefined);
      const tp = await p.$eval("[data-previa-das-retencoes]", (e) => e.textContent ?? "").catch(() => "");
      afirmar(/entra como receita no próprio pagamento/.test(tp), "a prévia avisa que o IR e o ISS entram como receita");
      await p.screenshot({ path: `${PASTA}/2-previa.png`, fullPage: true });
      await quebraDeOrdemSeHouver(p);
      const r = await pagarAgora(p);
      afirmar(r.tipo === "ok", `pagamento do fornecedor registrado (${r.texto.slice(0, 100)})`);
      // Reenvio do mesmo número: recusado, nada duplica.
      const antes = await prisma.receitaArrecadada.count();
      if (await prepararPagamento(p, (x) => x.includes(" · 10 · "), "9026002", "100,00", "2026-09-25", "reenvio")) {
        await quebraDeOrdemSeHouver(p);
        const r2 = await pagarAgora(p);
        afirmar(r2.tipo === "erro", `reenviar o mesmo número é recusado (${r2.texto.slice(0, 80)})`);
      } else afirmar(true, "a liquidação quitada saiu da fila: não há como pagar de novo");
      afirmar((await prisma.receitaArrecadada.count()) === antes, "o reenvio não criou receita");
    } else naoExecutados.push("a liquidação 10 não está na fila");
    await ir(p, "/financeiro/extraorcamentario");
    const t7 = await texto(p);
    afirmar(/880,00/.test(t7), "o INSS (terceiro) está no extraorçamentário");
    afirmar(!/384,00/.test(t7), "o IR do município NÃO está no extraorçamentário");
    await p.screenshot({ path: `${PASTA}/3-extraorcamentario.png`, fullPage: true });

    console.log("8. a folha de setembro: o IR do servidor no pagamento");
    const irDoContracheque = await prisma.linhaDoContracheque.findFirst({
      where: { rubrica: { natureza: "IMPOSTO_DE_RENDA" }, valor: { gt: 0 }, contracheque: { vinculo: { matricula: "DEMO-0003" } } },
      select: { valor: true, contracheque: { select: { totalProventos: true } } },
    });
    if (irDoContracheque === null) naoExecutados.push("a folha de setembro com IR não foi preparada");
    else {
      const bruto = irDoContracheque.contracheque.totalProventos.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      const ok = await prepararPagamento(p, (x) => x.includes(bruto) && /Daniela|DEMO-0003|517\.246/.test(x), "9026003", bruto.replace(/\./g, ""), "2026-09-30", "Folha de setembro - DEMO-0003");
      if (!ok) {
        // A lista mostra a liquidação pelo credor e valor; sem o nome, cai para o valor.
        const ok2 = await prepararPagamento(p, (x) => x.includes(bruto), "9026003", bruto.replace(/\./g, ""), "2026-09-30", "Folha de setembro - DEMO-0003");
        if (!ok2) naoExecutados.push(`a liquidação da folha de ${bruto} não está na fila`);
      }
      if ((await p.$eval(`${FPG} input[name="numero"]`, (i) => (i as HTMLInputElement).value).catch(() => "")) === "9026003") {
        await quebraDeOrdemSeHouver(p);
        const r = await pagarAgora(p);
        afirmar(r.tipo === "ok", `folha do servidor paga (${r.texto.slice(0, 100)})`);
        const elo = await prisma.retencaoPropriaDoPagamento.findFirst({ where: { fato: "IRRF_FOLHA" }, select: { valor: true, receitaArrecadada: { select: { numeroReceita: true } } } });
        afirmar(elo !== null && elo.valor.equals(irDoContracheque.valor), `o IR do contracheque (${irDoContracheque.valor.toFixed(2)}) virou a guia de receita ${elo?.receitaArrecadada.numeroReceita ?? "?"}`);
      }
    }

    console.log("9. o que vai ao Tribunal: retenção e receita do mesmo fato");
    const dia = new Date(Date.UTC(2026, 8, 25));
    const ret = await lerFatosRetencao(prisma, { codUnidadeGestora: "999001", dia });
    const tiposRet = ret.filter((x) => x.numPagamento === "9026002").map((x) => `${x.tipoConsignacaoCodigo} ${x.valor.toFixed(2)}`).sort();
    afirmar(tiposRet.join("; ") === "INSS 880.00; IRRF 384.00; ISS 400.00", `SAGRES Retencao do pagamento: ${tiposRet.join("; ")}`);
    const conta = await prisma.contaBancaria.findFirst({ where: { banco: { not: null } }, select: { codigo: true } });
    if (conta !== null) {
      const rec = await lerFatosReceitaOrcamentaria(prisma, { codUnidadeGestora: "999001", cnpjGerenciadora: ente.cnpj ?? "00000000000000", codContaArrecadadora: conta.codigo, dia });
      const naturezas = rec.map((x) => `${x.codReceitaOrcamentaria} ${x.valor.toFixed(2)}`).sort();
      afirmar(naturezas.includes("11130341 384.00") && naturezas.includes("11145111 400.00"), `SAGRES ReceitaOrcamentaria do dia: ${naturezas.join("; ")}`);
    } else naoExecutados.push("nenhuma conta bancária com banco/agência para o leitor da receita");

    await ir(p, "/financeiro/retencoes-proprias");
    await p.screenshot({ path: `${PASTA}/4-decisoes-e-quadro.png`, fullPage: true });
    const t9 = await texto(p);
    afirmar(/Previsto na LOA e arrecadado/.test(t9) && /11130341/.test(t9), "o quadro previsto × arrecadado mostra a natureza do IR retido");

    console.log(`\n${String(passos - falhas.length)}/${String(passos)} passos${naoExecutados.length > 0 ? `; não executados: ${naoExecutados.join(" | ")}` : ""}`);
    if (falhas.length > 0) process.exitCode = 1;
  } finally {
    await navegador.close();
    await prisma.$disconnect();
  }
}

await main();
