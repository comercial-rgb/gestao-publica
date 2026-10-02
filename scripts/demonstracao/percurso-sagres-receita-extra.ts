import "dotenv/config";
import { mkdirSync } from "node:fs";
import puppeteer, { type Page } from "puppeteer";

/**
 * PERCURSO DE NAVEGADOR — V23: a RECEITA EXTRA no SAGRES, da tela ao arquivo.
 *
 * Uso: `npx tsx scripts/demonstracao/percurso-sagres-receita-extra.ts [base] [pasta-das-capturas]`
 * (padrão http://localhost:3011). GRAVA: um ingresso avulso e a importação do plano de contas do
 * Tribunal. ⚠️ Nunca contra a 3010 (o banco da apresentação): clone antes e sirva na 3011.
 *
 * Criar pela tela → consultar → exportar → conferir campo e origem; e as recusas com o motivo.
 */

const BASE = process.argv[2] ?? "http://localhost:3011";
const PASTA = process.argv[3] ?? "capturas-v23";
if (/:3010\b/.test(BASE)) throw new Error("Recusado: a 3010 serve o banco da apresentação, e este percurso grava.");
const SENHA = process.env["SEED_ADMIN_SENHA"] ?? "";
if (SENHA === "") throw new Error("SEED_ADMIN_SENHA ausente.");
const PLANILHA = "docs/oficial/tce-pb/Pcasp_2025.xlsx";

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

type Campo = readonly [string, string, "texto" | "data" | "select" | "primeira-opcao" | "arquivo"];
async function enviar(p: Page, acao: string, campos: readonly Campo[]): Promise<{ tipo: "ok" | "erro" | "silencio"; texto: string }> {
  const form = `form[data-acao="${acao}"]`;
  await p.waitForSelector(form, { timeout: 30000 });
  for (const [sel, valor, tipo] of campos) {
    const alvo = `${form} ${sel}`;
    await p.waitForSelector(alvo, { timeout: 20000 });
    if (tipo === "select") await p.select(alvo, valor);
    else if (tipo === "primeira-opcao") {
      const v = await p.$eval(alvo, (e) => Array.from((e as HTMLSelectElement).options).find((o) => o.value !== "" && o.textContent?.includes(e.getAttribute("data-x") ?? ""))?.value ?? "");
      await p.select(alvo, valor !== "" ? valor : v);
    } else if (tipo === "arquivo") {
      const h = await p.$(alvo);
      await (h as unknown as { uploadFile(c: string): Promise<void> }).uploadFile(valor);
    } else if (tipo === "data")
      await p.$eval(alvo, (e, v) => {
        (e as HTMLInputElement).value = v;
        e.dispatchEvent(new Event("input", { bubbles: true }));
        e.dispatchEvent(new Event("change", { bubbles: true }));
      }, valor);
    else {
      await p.$eval(alvo, (e) => {
        (e as HTMLInputElement).value = "";
        (e as HTMLElement).scrollIntoView({ block: "center" });
      });
      await p.focus(alvo);
      await p.keyboard.type(valor, { delay: 5 });
    }
  }
  await p.waitForSelector(`${form} input[name="__chave"][data-chave-de-comando="pronta"]`, { timeout: 30000 });
  await p.$eval(`${form} button[type="submit"]`, (b) => (b as HTMLButtonElement).click());
  await new Promise((r) => setTimeout(r, 4000));
  return p.evaluate((sel) => {
    const f = document.querySelector(sel);
    const alerta = f?.querySelector('[role="alert"]') ?? null;
    if (alerta !== null) return { tipo: "erro" as const, texto: (alerta.textContent ?? "").trim() };
    const bom = f?.querySelector('[role="status"]') ?? Array.from(f?.querySelectorAll("p") ?? []).find((x) => x.className.includes("status-ok")) ?? null;
    return bom !== null && bom !== undefined ? { tipo: "ok" as const, texto: (bom.textContent ?? "").trim() } : { tipo: "silencio" as const, texto: "" };
  }, form);
}

/** A linha do arquivo `entidade` na prévia monoespaçada (sem o prefixo "  1 | "). */
async function linhaDoArquivo(p: Page, entidade: string): Promise<string | null> {
  return p.evaluate((ent) => {
    for (const card of Array.from(document.querySelectorAll("strong"))) {
      if (card.textContent?.trim() !== ent) continue;
      // O cartão do arquivo: o título está num div de cabeçalho, e o bloco monoespaçado é irmão dele.
      const pre = card.parentElement?.parentElement?.querySelector(":scope > div > pre");
      if (pre === null || pre === undefined) continue;
      const l = pre?.textContent?.split("\n").find((x) => /^\s*1 \| /.test(x));
      return l === undefined ? null : l.replace(/^\s*1 \| /, "");
    }
    return null;
  }, entidade);
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

    console.log("2. o ingresso avulso pede o CPF/CNPJ de quem entregou, e confere o dígito");
    const ingresso = (doc: string): readonly Campo[] => [
      ['select[name="tipoConsignacao"]', "ISS", "select"],
      ['input[name="credorConsignatario"]', "Construtora Modelo Ltda", "texto"],
      ['input[name="documentoDoContribuinte"]', doc, "texto"],
      ['select[name="contaBancaria"]', "", "primeira-opcao"],
      ['input[inputmode="decimal"]', "250,00", "texto"],
      ['input[name="data"]', "2026-09-25", "data"],
      ['input[name="historico"]', "Deposito de terceiro para demonstracao", "texto"],
    ];
    await ir(p, "/financeiro/extraorcamentario");
    const errado = await enviar(p, "registrar-ingresso-extra", ingresso("11.222.333/0001-00"));
    afirmar(errado.tipo === "erro" && /não é válido/.test(errado.texto), `documento com dígito errado: recusado com o motivo (${errado.texto.slice(0, 120)})`);
    await ir(p, "/financeiro/extraorcamentario");
    const certo = await enviar(p, "registrar-ingresso-extra", ingresso("11.222.333/0001-81"));
    afirmar(certo.tipo === "ok" && /registrado/.test(certo.texto), `o ingresso foi registrado (${certo.texto.slice(0, 120)})`);

    console.log("3. sem o plano do Tribunal, a receita extra fica fora do pacote, com o motivo");
    await ir(p, "/integracoes/sagres?dia=2026-09-14&mes=2026-09");
    const antes = await texto(p);
    afirmar(/Receita extra fora do pacote/.test(antes) && /plano de contas do Tribunal para 2026 não foi importado/.test(antes), "a prévia nomeia a falta do plano");
    afirmar(/42 de 58/.test(antes), "a tabela do leiaute mostra 42 de 58 tabelas geradas");

    console.log("4. importar a planilha do Tribunal, dizendo qual ano vale e por quê");
    const imp = await enviar(p, "importar-plano-do-tribunal", [
      ['input[name="arquivo"]', PLANILHA, "arquivo"],
      ['input[name="exercicio"]', "2026", "texto"],
      ['input[name="anoDaTabela"]', "2024", "texto"],
      ['textarea[name="fundamento"]', "A planilha indicada para 2026 traz as exigencias de 2025 zeradas; adota-se a tabela de 2024 ate nova publicacao.", "texto"],
    ]);
    afirmar(imp.tipo === "ok" && /42 exigem o vínculo com a retenção e 68 com a receita extra/.test(imp.texto), `a planilha foi importada (${imp.texto.slice(0, 160)})`);

    console.log("5. a retenção de 14/09 sai na receita extra, com a conta, o credor e o vínculo");
    await ir(p, "/integracoes/sagres?dia=2026-09-14&mes=2026-09");
    const depois = await texto(p);
    afirmar(/importado/.test(depois) && /tabela de 2024/.test(depois), "a tela mostra o plano importado, com o ano da tabela");
    const l = await linhaDoArquivo(p, "ReceitaExtra");
    afirmar(l !== null && l.length === 643, `o arquivo ReceitaExtra tem a linha de 643 posições (${String(l?.length)})`);
    if (l !== null) {
      afirmar(l.slice(13, 22) === "218810200", `a conta do passivo é a que a retenção creditou (${l.slice(13, 22)})`);
      afirmar(/^\d{14}$/.test(l.slice(30, 44)) && l.slice(30, 44) !== "00000000000000", `o CPF/CNPJ é o do credor do empenho (${l.slice(30, 44)})`);
      afirmar(l.slice(587, 595) === "10000014", "o código da receita extra é Consignações");
      afirmar(l.slice(599, 629).trim() !== "" && l.slice(628, 629) === "1", `o vínculo com a retenção está preenchido, tipo ISS (${l.slice(599, 629)})`);
    }
    await p.screenshot({ path: `${PASTA}/sagres-receita-extra.png`, fullPage: true });

    console.log("6. o ingresso avulso numa conta que exige retenção é recusado, nomeando a conta");
    await ir(p, "/integracoes/sagres?dia=2026-09-25&mes=2026-09");
    const avulso = await texto(p);
    afirmar(/a conta 218810200 exige o vínculo com a retenção/.test(avulso), "a prévia diz que a conta exige retenção e o ingresso não nasceu de pagamento");

    console.log(`\n${String(passos - falhas.length)}/${String(passos)} passos`);
    if (falhas.length > 0) process.exitCode = 1;
  } finally {
    await navegador.close();
  }
}

await main();
