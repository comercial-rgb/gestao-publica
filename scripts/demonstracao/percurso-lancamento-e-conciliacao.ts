import "dotenv/config";
import { mkdirSync } from "node:fs";
import puppeteer, { type Page } from "puppeteer";

/**
 * PERCURSO DE NAVEGADOR — o LANÇAMENTO CONTÁBIL MANUAL e o VÍNCULO NA CONCILIAÇÃO (V22 rodada 7).
 *
 * Uso: `npx tsx scripts/demonstracao/percurso-lancamento-e-conciliacao.ts [base] [pasta-das-capturas]`
 * (padrão http://localhost:3011). GRAVA: um lançamento manual, o estorno dele, um vínculo e o desfazer
 * do vínculo. ⚠️ Nunca contra a 3010 (o banco da apresentação): clone antes e sirva na 3011.
 *
 * Cada passo afirma o EFEITO depois de recarregar, e as recusas afirmam o MOTIVO.
 */

const BASE = process.argv[2] ?? "http://localhost:3011";
const PASTA = process.argv[3] ?? "capturas-v22";
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
const texto = (p: Page): Promise<string> => p.evaluate(() => document.body.innerText);
const ir = (p: Page, rota: string): Promise<unknown> => p.goto(`${BASE}${rota}`, { waitUntil: "networkidle0", timeout: 180000 });

/** Preenche campos por seletor e envia o formulário `data-acao`; devolve a mensagem do servidor. */
async function enviar(p: Page, acao: string, campos: readonly (readonly [string, string, "texto" | "data" | "select"])[]): Promise<{ tipo: "ok" | "erro" | "silencio"; texto: string }> {
  const form = `form[data-acao="${acao}"]`;
  await p.waitForSelector(form, { timeout: 30000 });
  for (const [sel, valor, tipo] of campos) {
    const alvo = `${form} ${sel}`;
    await p.waitForSelector(alvo, { timeout: 20000 });
    if (tipo === "select") await p.select(alvo, valor);
    else if (tipo === "data")
      await p.$eval(alvo, (e, v) => {
        (e as HTMLInputElement).value = v;
        e.dispatchEvent(new Event("input", { bubbles: true }));
        e.dispatchEvent(new Event("change", { bubbles: true }));
      }, valor);
    else {
      await p.click(alvo, { count: 3 });
      await p.keyboard.press("Backspace");
      await p.type(alvo, valor, { delay: 5 });
    }
  }
  await p.waitForSelector(`${form} input[name="__chave"][data-chave-de-comando="pronta"]`, { timeout: 30000 });
  await p.$eval(`${form} button[type="submit"]`, (b) => (b as HTMLButtonElement).click());
  await new Promise((r) => setTimeout(r, 3500));
  return p.evaluate((sel) => {
    const f = document.querySelector(sel);
    const alerta = f?.querySelector('[role="alert"]') ?? null;
    if (alerta !== null) return { tipo: "erro" as const, texto: (alerta.textContent ?? "").trim() };
    const bom = Array.from(f?.querySelectorAll("p") ?? []).find((x) => x.className.includes("status-ok"));
    return bom !== undefined ? { tipo: "ok" as const, texto: (bom.textContent ?? "").trim() } : { tipo: "silencio" as const, texto: "" };
  }, form);
}

const partida = (i: number, conta: string, tipo: "DEBITO" | "CREDITO", valor: string): readonly (readonly [string, string, "texto" | "data" | "select"])[] => [
  [`input[name="partidas.${i}.conta"]`, conta, "texto"],
  [`select[name="partidas.${i}.tipo"]`, tipo, "select"],
  [`input[aria-label="Valor da partida ${i + 1}"]`, valor, "texto"],
];

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

    const sufixo = String(Date.now()).slice(-5);
    const numero = `AJ-${sufixo}`;
    const cabecalho = [
      ['input[name="dia"]', "2026-09-20", "data"],
      ['input[name="numeroControle"]', numero, "texto"],
      ['input[name="historico"]', "Ajuste de demonstração: reclassificação de receita", "texto"],
    ] as const;

    console.log("2. o lançamento manual — as recusas dizem o motivo");
    await ir(p, "/contabilidade/lancamentos");
    afirmar((await p.$('form[data-acao="registrar-lancamento-manual"]')) !== null, "a tela de lançamentos oferece o lançamento manual");
    const desbalanceado = await enviar(p, "registrar-lancamento-manual", [...cabecalho, ...partida(0, "1.1.1.1.1.19.00", "DEBITO", "70,00"), ...partida(1, "4.9.1.1.1.01.00", "CREDITO", "60,00")]);
    afirmar(desbalanceado.tipo === "erro" && /débito|crédito|DEBITO|CREDITO/i.test(desbalanceado.texto), `débitos diferentes dos créditos: recusado com o motivo (${desbalanceado.texto.slice(0, 140)})`);
    await ir(p, "/contabilidade/lancamentos");
    const sintetica = await enviar(p, "registrar-lancamento-manual", [...cabecalho, ...partida(0, "1.1.1.1.1.00.00", "DEBITO", "70,00"), ...partida(1, "4.9.1.1.1.01.00", "CREDITO", "70,00")]);
    afirmar(sintetica.tipo === "erro" && /sintética/i.test(sintetica.texto), `conta sintética: recusada nomeando a conta (${sintetica.texto.slice(0, 140)})`);

    console.log("3. o lançamento que fecha é registrado e aparece no razão");
    await ir(p, "/contabilidade/lancamentos");
    const certo = await enviar(p, "registrar-lancamento-manual", [...cabecalho, ...partida(0, "1.1.1.1.1.19.00", "DEBITO", "70,00"), ...partida(1, "4.9.1.1.1.01.00", "CREDITO", "70,00")]);
    afirmar(certo.tipo === "ok" && certo.texto.includes(numero), `o lançamento ${numero} foi registrado (${certo.texto})`);
    await ir(p, "/contabilidade/lancamentos?desde=2026-09-01&ate=2026-09-30&origem=MANUAL");
    const lista = await texto(p);
    afirmar(lista.includes(numero), "depois de recarregar, o lançamento está na lista, com a origem manual");
    await p.screenshot({ path: `${PASTA}/lancamento-01-registrado.png`, fullPage: true });

    console.log("4. a conciliação da conta do extrato nomeia o ajuste como lançamento sem conta bancária");
    await ir(p, "/financeiro/conciliacao");
    const conc = await texto(p);
    afirmar(/Lançamentos na conta contábil sem conta bancária/.test(conc) && conc.includes(numero), "o ajuste na contábil compartilhada aparece à parte, nomeado, fora da identidade");
    afirmar(/diferença explicada/.test(conc), "e a conciliação continua fechando");

    console.log("5. o vínculo entre o extrato e o sistema, pela tela");
    const form = 'form[data-acao="vincular-conciliacao"]';
    afirmar((await p.$(form)) !== null, "a conciliação oferece o vínculo");
    const opcoes = await p.evaluate((f) => {
      const ops = (n: string) => Array.from(document.querySelectorAll(`${f} select[name="${n}"] option`)).map((o) => ({ v: (o as HTMLOptionElement).value, t: o.textContent ?? "" })).filter((o) => o.v !== "");
      return { linhas: ops("linhaDoExtrato"), registros: ops("registroDoSistema") };
    }, form);
    // o par óbvio da massa: a linha do extrato de 80.000,00 e a arrecadação de 80.000,00
    const linha = opcoes.linhas.find((o) => /80\.000,00|80000\.00/.test(o.t));
    const registro = opcoes.registros.find((o) => /80\.000,00|80000\.00/.test(o.t) && /arrecada/i.test(o.t));
    afirmar(linha !== undefined && registro !== undefined, `a lista oferece o par de 80.000,00 (${linha?.t.slice(0, 60)} × ${registro?.t.slice(0, 60)})`);
    if (linha !== undefined && registro !== undefined) {
      await p.select(`${form} select[name="linhaDoExtrato"]`, linha.v);
      await p.select(`${form} select[name="registroDoSistema"]`, registro.v);
      const valor = await p.$eval(`${form} input[name="valor"]`, (e) => (e as HTMLInputElement).value);
      afirmar(valor === "80000.00", `o valor vem sugerido pelo menor residual (${valor})`);
      await p.waitForSelector(`${form} input[name="__chave"][data-chave-de-comando="pronta"]`, { timeout: 30000 });
      await p.$eval(`${form} button[type="submit"]`, (b) => (b as HTMLButtonElement).click());
      await new Promise((r) => setTimeout(r, 3500));
      await ir(p, "/financeiro/conciliacao");
      const depois = await texto(p);
      afirmar(/Correspondências entre o extrato e os registros do sistema/.test(depois) && !/Nenhuma linha do extrato foi conciliada/.test(depois), "depois de recarregar, a correspondência aparece (o vínculo feito depois do fim do extrato conta)");
      afirmar(/diferença explicada/.test(depois), "e a conciliação continua fechando");
      await p.screenshot({ path: `${PASTA}/conciliacao-01-vinculado.png`, fullPage: true });

      console.log("6. desfazer o vínculo, com motivo");
      const desfazer = await enviar(p, "desfazer-vinculo", [['input[name="motivo"]', "Vínculo de demonstração desfeito no percurso", "texto"]]);
      afirmar(desfazer.tipo === "ok" || desfazer.tipo === "silencio", `o vínculo foi desfeito (${desfazer.tipo}: ${desfazer.texto})`);
    }

    console.log("7. o estorno do lançamento manual");
    await ir(p, "/contabilidade/lancamentos");
    const opEst = await p.$$eval('form[data-acao="estornar-lancamento-manual"] select[name="lancamentoId"] option', (os) => os.map((o) => ({ v: (o as HTMLOptionElement).value, t: o.textContent ?? "" })));
    const alvo = opEst.find((o) => o.t.includes(numero));
    afirmar(alvo !== undefined, "o estorno oferece o lançamento manual");
    afirmar(!opEst.some((o) => /EMPENHO|PAGAMENTO|ARRECADACAO/.test(o.t)), "e não oferece lançamento de empenho, pagamento ou arrecadação");
    if (alvo !== undefined) {
      const est = await enviar(p, "estornar-lancamento-manual", [
        ['select[name="lancamentoId"]', alvo.v, "select"],
        ['input[name="numeroControle"]', `EST-${sufixo}`, "texto"],
        ['input[name="dia"]', "2026-09-21", "data"],
      ]);
      afirmar(est.tipo === "ok" || est.tipo === "silencio", `o estorno foi registrado (${est.tipo}: ${est.texto})`);
      await ir(p, "/contabilidade/lancamentos?desde=2026-09-01&ate=2026-09-30");
      const l2 = await texto(p);
      afirmar(l2.includes(numero) && l2.includes(`EST-${sufixo}`), "depois de recarregar, o original continua e o estorno está ao lado dele");
    }
  } finally {
    await navegador.close();
  }
  console.log(`\n${passos - falhas.length}/${passos} passos`);
  if (falhas.length > 0) {
    console.log("FALHAS:\n" + falhas.map((f) => `  - ${f}`).join("\n"));
    process.exitCode = 1;
  }
}

await main();
