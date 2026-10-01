import "dotenv/config";
import { mkdirSync } from "node:fs";
import puppeteer, { type Page } from "puppeteer";

/**
 * PERCURSO DE NAVEGADOR — V24: IR, INSS e ISS do fornecedor CALCULADOS no pagamento, pela tela.
 *
 * Uso: `npx tsx scripts/demonstracao/percurso-retencao-calculada.ts [base] [pasta] [liquidacao] [documento]`
 * (padrão http://localhost:3011, liquidação "10", fornecedor 98765432000198). GRAVA: troca a conta de
 * dois tipos de consignação, cadastra o IRRF, cadastra a pessoa, registra o perfil fiscal e paga.
 * Nunca contra a 3010 (o banco da apresentação): clone antes e sirva na 3011.
 *
 * Pré-condição do banco clonado: o município do ente é Esperança (a lista do ISS carregada é a dela).
 *
 * Criar pela tela → consultar → pagar → conferir o valor e o motivo; e as recusas com o motivo.
 */

const BASE = process.argv[2] ?? "http://localhost:3011";
const PASTA = process.argv[3] ?? "capturas-v24";
const LIQUIDACAO = process.argv[4] ?? "10";
const DOCUMENTO = process.argv[5] ?? "98765432000198";
if (/:3010\b/.test(BASE)) throw new Error("Recusado: a 3010 serve o banco da apresentação, e este percurso grava.");
const SENHA = process.env["SEED_ADMIN_SENHA"] ?? "";
if (SENHA === "") throw new Error("SEED_ADMIN_SENHA ausente.");

mkdirSync(PASTA, { recursive: true });
let passos = 0;
const falhas: string[] = [];
function afirmar(cond: boolean, oque: string): void {
  passos++;
  if (cond) console.log(`  ok   ${oque}`);
  else {
    console.log(`  FALHA ${oque}`);
    falhas.push(oque);
  }
}
const ir = (p: Page, rota: string): Promise<unknown> => p.goto(`${BASE}${rota}`, { waitUntil: "networkidle0", timeout: 180000 });
const texto = (p: Page): Promise<string> => p.evaluate(() => document.body.innerText);
const esperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Digita num campo dentro de `escopo` (seletor CSS de um form ou contêiner). */
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
async function enviar(p: Page, form: string): Promise<{ tipo: "ok" | "erro" | "silencio"; texto: string }> {
  await p.waitForSelector(`${form} input[name="__chave"][data-chave-de-comando="pronta"]`, { timeout: 30000 });
  await p.$eval(`${form} button[type="submit"]`, (b) => (b as HTMLButtonElement).click());
  await esperar(5000);
  return p.evaluate((sel) => {
    const f = document.querySelector(sel);
    const raiz = f?.parentElement ?? document.body;
    const alerta = f?.querySelector('[role="alert"]') ?? raiz.querySelector('[role="alert"]');
    if (alerta !== null && alerta !== undefined) return { tipo: "erro" as const, texto: (alerta.textContent ?? "").trim() };
    const ok = f?.querySelector('[role="status"]') ?? Array.from(f?.querySelectorAll("p") ?? []).find((x) => /status-ok/.test(x.className)) ?? null;
    return ok !== null && ok !== undefined ? { tipo: "ok" as const, texto: (ok.textContent ?? "").trim() } : { tipo: "silencio" as const, texto: "" };
  }, form);
}

async function main(): Promise<void> {
  const navegador = await puppeteer.launch({ headless: true, args: ["--lang=pt-BR"] });
  try {
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

    console.log("2. as consignações de IR, INSS e ISS nas contas analíticas do plano oficial");
    for (const [codigo, conta] of [["INSS", "2.1.8.8.1.01.02"], ["ISS", "2.1.8.8.1.01.08"]] as const) {
      await ir(p, "/financeiro/consignacoes");
      const linhaAntes = await p.$eval(`tr[data-teste="consignacao-${codigo}"]`, (tr) => tr.textContent ?? "").catch(() => "");
      if (linhaAntes.includes(conta)) {
        afirmar(true, `${codigo}: já está na conta ${conta}`);
        continue;
      }
      const abriu = await p.evaluate((cod) => {
        const tr = document.querySelector(`tr[data-teste="consignacao-${cod}"]`);
        const botao = Array.from(tr?.querySelectorAll("button") ?? []).find((x) => x.textContent?.includes("Trocar a conta"));
        if (tr === null || botao === undefined) return false;
        botao.click();
        return true;
      }, codigo);
      afirmar(abriu, `${codigo}: a tela oferece trocar a conta`);
      const form = `tr[data-teste="consignacao-${codigo}"] form[data-acao="redefinir-consignacao"]`;
      await p.waitForSelector(form, { timeout: 20000 });
      await p.select(`${form} select[name="contaPassivoCodigo"]`, conta);
      await digitar(p, `${form} input[name="fundamento"]`, `Conta analitica do PCASP oficial para ${codigo} retido, em vez da conta de agrupamento`);
      const r = await enviar(p, form);
      afirmar(r.tipo !== "erro", `${codigo}: a troca não foi recusada (${r.texto.slice(0, 100)})`);
      await ir(p, "/financeiro/consignacoes");
      const linha = await p.$eval(`tr[data-teste="consignacao-${codigo}"]`, (tr) => tr.textContent ?? "");
      afirmar(linha.includes(conta), `${codigo}: depois de recarregar, a linha mostra a conta ${conta}`);
    }
    await ir(p, "/financeiro/consignacoes");
    const cad = 'form[data-acao="cadastrar-consignacao"]';
    if ((await p.$('tr[data-teste="consignacao-IRRF"]')) === null) {
      await p.evaluate(() => Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Cadastrar consignação")?.click());
      await digitar(p, `${cad} input[name="codigo"]`, "IRRF");
      await digitar(p, `${cad} input[name="descricao"]`, "Imposto de renda retido na fonte");
      await p.select(`${cad} select[name="contaPassivoCodigo"]`, "2.1.8.8.1.01.04");
      await digitar(p, `${cad} [name="fundamento"]`, "IR retido pelo municipio nos pagamentos a fornecedores, IN RFB 1.234/2012 art. 2o-A");
      const rIr = await enviar(p, cad);
      afirmar(rIr.tipo !== "erro", `IRRF: o cadastro não foi recusado (${rIr.texto.slice(0, 100)})`);
      await ir(p, "/financeiro/consignacoes");
    }
    const linhaIr = await p.$eval('tr[data-teste="consignacao-IRRF"]', (tr) => tr.textContent ?? "").catch(() => "");
    afirmar(linhaIr.includes("2.1.8.8.1.01.04"), "IRRF aparece na lista com a conta 2.1.8.8.1.01.04");

    console.log("3. o fornecedor no cadastro de pessoas, com os dados fiscais");
    await ir(p, "/cadastros/pessoas");
    const fp = 'form[data-acao="cadastrar-pessoa"]';
    await digitar(p, `${fp} input[data-mascara="cpf-cnpj"]`, DOCUMENTO);
    await digitar(p, `${fp} input[name="nome"]`, "Limpeza Modelo Servicos Ltda");
    const rp = await enviar(p, fp);
    afirmar(rp.tipo !== "erro", `o cadastro da pessoa não foi recusado (${rp.texto.slice(0, 100)})`);
    await ir(p, `/cadastros/pessoas?busca=${DOCUMENTO}`);
    const href = await p.evaluate((doc) => {
      const fmt = doc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
      for (const a of Array.from(document.querySelectorAll("a"))) {
        const linha = a.closest("tr")?.textContent ?? "";
        if (linha.includes(fmt) && a.getAttribute("href")?.startsWith("/cadastros/pessoas/")) return a.getAttribute("href");
      }
      return null;
    }, DOCUMENTO);
    afirmar(href !== null, "a pessoa aparece na lista com o CNPJ");
    await ir(p, href ?? "/cadastros/pessoas");
    afirmar(/Nenhum dado fiscal registrado/.test(await texto(p)), "sem dados fiscais, a página diz que o cálculo fica sem perfil");

    const ff = 'form[data-acao="registrar-perfil-fiscal"]';
    await data(p, `${ff} input[name="vigenteDesde"]`, "2026-01-01");
    await digitar(p, `${ff} input[name="municipioDoEstabelecimento"]`, "2504009");
    await digitar(p, `${ff} input[name="dispensaDoIR"]`, "XXX");
    await digitar(p, `${ff} input[name="fundamento"]`, "Consulta ao Portal do Simples Nacional em 30/09/2026: nao optante");
    const recusa = await enviar(p, ff);
    afirmar(recusa.tipo === "erro" && /I a XXII/.test(recusa.texto), `inciso inexistente é recusado com o motivo (${recusa.texto.slice(0, 90)})`);
    // O formulário volta limpo depois de cada envio: recarrega e preenche de novo, sem a dispensa.
    await ir(p, href ?? "/cadastros/pessoas");
    await data(p, `${ff} input[name="vigenteDesde"]`, "2026-01-01");
    await digitar(p, `${ff} input[name="municipioDoEstabelecimento"]`, "2504009");
    await digitar(p, `${ff} input[name="fundamento"]`, "Consulta ao Portal do Simples Nacional em 30/09/2026: nao optante");
    const rf = await enviar(p, ff);
    afirmar(rf.tipo === "ok", `perfil fiscal registrado (${rf.texto.slice(0, 80)})`);
    await ir(p, href ?? "/cadastros/pessoas");
    afirmar(/01\/01\/2026/.test(await texto(p)) && /Portal do Simples/.test(await texto(p)), "o histórico mostra a vigência de 01/01/2026 e a comprovação");

    console.log("4. a prévia do cálculo no pagamento");
    await ir(p, "/despesa/pagamentos");
    const fpg = 'form[data-acao="pagar"]';
    const liqId = await p.$eval(`${fpg} select[name="liquidacaoId"]`, (s, n) => Array.from((s as HTMLSelectElement).options).find((o) => o.textContent?.includes(` · ${n} · `))?.value ?? "", LIQUIDACAO);
    afirmar(liqId !== "", `a liquidação ${LIQUIDACAO} está na fila`);
    await p.select(`${fpg} select[name="liquidacaoId"]`, liqId);
    await digitar(p, `${fpg} input[name="numero"]`, "9024001");
    await digitar(p, `${fpg} input[inputmode="decimal"]`, "8000,00");
    await data(p, `${fpg} input[name="data"]`, "2026-09-25");
    const contaBanco = await p.$eval(`${fpg} select[name="contaBancaria"]`, (s) => Array.from((s as HTMLSelectElement).options).find((o) => o.value !== "")?.value ?? "");
    await p.select(`${fpg} select[name="contaBancaria"]`, contaBanco);
    await digitar(p, `${fpg} input[name="historico"]`, "Pagamento de servicos de limpeza com retencoes calculadas");
    await p.$eval(`${fpg} input[name="retencaoCalculada"]`, (c) => (c as HTMLInputElement).click());
    await p.waitForSelector(`${fpg} select[name="rcNaturezaIR"]`, { timeout: 20000 });
    await p.select(`${fpg} select[name="rcNaturezaIR"]`, "6190");
    await p.select(`${fpg} select[name="rcInssServico"]`, "111-I");
    await p.select(`${fpg} select[name="rcInssModalidade"]`, "CESSAO_DE_MAO_DE_OBRA");
    const opcao1705 = await p.$eval("datalist", (d) => Array.from(d.querySelectorAll("option")).find((o) => o.value.startsWith("17.05 "))?.value ?? "");
    await digitar(p, `${fpg} input[name="rcIssSubitem"]`, opcao1705);
    await p.$eval('button[data-acao="calcular-retencoes"]', (b) => (b as HTMLButtonElement).click());
    await p.waitForSelector("[data-previa-das-retencoes]", { timeout: 60000 }).catch(() => undefined);
    const previa = await p.evaluate(() =>
      Object.fromEntries(Array.from(document.querySelectorAll("[data-previa-das-retencoes] tr[data-tributo]")).map((tr) => [tr.getAttribute("data-tributo"), tr.querySelector("[data-valor]")?.getAttribute("data-valor") ?? ""]))
    );
    afirmar(previa["IRRF"] === "384.00", `prévia: IR 4,8% de 8.000,00 = 384,00 (${previa["IRRF"]})`);
    afirmar(previa["INSS"] === "880.00", `prévia: INSS 11% de 8.000,00 = 880,00 (${previa["INSS"]})`);
    afirmar(previa["ISS"] === "400.00", `prévia: ISS 5% de 8.000,00 = 400,00, devido no tomador (${previa["ISS"]})`);
    const camposAindaPreenchidos = await p.$eval(`${fpg} input[name="historico"]`, (i) => (i as HTMLInputElement).value);
    afirmar(camposAindaPreenchidos.startsWith("Pagamento de servicos"), "a prévia não apaga o que foi digitado");
    await p.screenshot({ path: `${PASTA}/previa-das-retencoes.png`, fullPage: true });

    console.log("5. pagar: o servidor recalcula e grava");
    const foraDaOrdem = await p.$(`${fpg} select[name="hipotese"]`);
    if (foraDaOrdem !== null) {
      await p.select(`${fpg} select[name="hipotese"]`, "V_ATIVIDADE_FINALISTICA");
      await digitar(p, `${fpg} input[name="autorizadoPor"]`, "Secretario de Financas");
      await digitar(p, `${fpg} textarea[name="justificativa"]`, "Servico essencial de limpeza das escolas, sem o qual as aulas param");
    }
    // O resultado do pagamento é o parágrafo de sucesso do próprio formulário (a prévia também é um "status").
    await p.waitForSelector(`${fpg} input[name="__chave"][data-chave-de-comando="pronta"]`, { timeout: 30000 });
    await p.$eval(`${fpg} button[type="submit"]`, (b) => (b as HTMLButtonElement).click());
    await esperar(6000);
    const pg = await p.evaluate((sel) => {
      const f = document.querySelector(sel);
      const erro = f?.querySelector(":scope > p[role=\"alert\"]");
      if (erro !== null && erro !== undefined) return { tipo: "erro", texto: (erro.textContent ?? "").trim() };
      const ok = Array.from(f?.querySelectorAll(":scope > p") ?? []).find((x) => /status-ok/.test(x.className));
      return ok === undefined ? { tipo: "silencio", texto: "" } : { tipo: "ok", texto: (ok.textContent ?? "").trim() };
    }, fpg);
    afirmar(pg.tipo === "ok" && /registrado/.test(pg.texto), `o pagamento foi registrado (${pg.texto.slice(0, 120)})`);

    console.log("6. o razão do consignatário e a memória");
    await ir(p, "/financeiro/extraorcamentario");
    const t = await texto(p);
    afirmar(/384,00/.test(t) && /880,00/.test(t) && /400,00/.test(t), "os três ingressos aparecem no extraorçamentário");
    await p.screenshot({ path: `${PASTA}/extraorcamentario.png`, fullPage: true });

    console.log(`\n${String(passos - falhas.length)}/${String(passos)} passos`);
    if (falhas.length > 0) process.exitCode = 1;
  } finally {
    await navegador.close();
  }
}

await main();
