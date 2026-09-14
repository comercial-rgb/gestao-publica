import "dotenv/config";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { apresentacaoDoAto } from "./percursos-disponibilidade.js";

/**
 * SMOKE DA FOLHA DE PAGAMENTO (M33, V6 P2.3) — navegador real contra o servidor.
 *
 * As TABELAS DO ENTE (contribuição RGPS, IRRF, salário-família) e as rubricas pela tela → servidor
 * admitido com regime previdenciário e salário → horas extras lançadas na competência → folha
 * aberta → CALCULAR RECUSA nomeando a matrícula legada sem regime, e o RH a informa por FATO
 * DATADO → cálculo grava um contracheque por vínculo vivo → a memória mostra as faixas percorridas,
 * os cenários do imposto e a fundamentação de cada tabela → o RH NÃO fecha (é da contabilidade) →
 * a contabilidade fecha → recalcular é recusado.
 *
 * ⚠️ ELE NÃO LIMPA O BANCO. As tabelas do ente são únicas por vigência: a primeira execução as
 * cadastra, as seguintes as REUSAM (e dizem isso). A competência é escolhida entre as que ainda
 * não têm folha. Helpers do smoke do pessoal.
 *
 * ⚠️ OS VALORES DAS TABELAS SÃO SINTÉTICOS, redondos para conferir à mão — não são a norma.
 */
const BASE = process.argv[2] ?? "http://localhost:3010";
// O percurso é do PAPEL: o servidor do RH CALCULA, a contabilidade FECHA — e cada um é barrado no
// ato do outro (scripts/percursos-usuarios-por-papel.ts).
const USUARIO = process.argv[3] ?? "rh@percursos.local";
const SENHA = process.argv[4] ?? (USUARIO === "rh@percursos.local" ? (process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026") : (process.env["SEED_ADMIN_SENHA"] ?? ""));
const SUF = String(Date.now()).slice(-6);

const falhas: string[] = [];
const passos: string[] = [];
function ok(passo: string): void {
  passos.push(passo);
  console.log(`[ok] ${passo}`);
}
function falhou(passo: string, detalhe: string): void {
  falhas.push(`${passo} — ${detalhe}`);
  console.error(`[FALHA] ${passo} — ${detalhe}`);
}
function conferir(passo: string, condicao: boolean, detalhe: string): void {
  if (condicao) ok(passo);
  else falhou(passo, detalhe);
}

async function entrar(page: Page, usuario = USUARIO, senha = SENHA): Promise<void> {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('button[type="submit"]', { timeout: 60000 });
  await page.type('input[name="identificador"]', usuario);
  await page.type('input[name="senha"]', senha);
  const enviou = await page.evaluate(() => {
    const f = document.querySelector("form");
    if (!(f instanceof HTMLFormElement)) return "não achei o formulário de login";
    if (!f.checkValidity()) return "o formulário de login não passou na validação do navegador";
    f.requestSubmit();
    return "";
  });
  if (enviou !== "") throw new Error(enviou);
  for (let i = 0; i < 120; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    if (!page.url().includes("/login")) return;
  }
  throw new Error(`login não passou (ainda em ${page.url()}). Confira SEED_ADMIN_SENHA.`);
}
async function texto(page: Page): Promise<string> {
  const bruto = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
  return bruto.toLowerCase();
}
async function irPara(page: Page, rota: string): Promise<string> {
  // O `next dev` reinicia sozinho ao se aproximar do teto de memória ("Server is approaching
  // the used memory threshold, restarting"), e a navegação daquele instante volta com
  // ERR_CONNECTION_RESET. Três tentativas com pausa cobrem o reinício; o resto sobe.
  let resposta = null;
  for (let tentativa = 1; ; tentativa += 1) {
    try {
      resposta = await page.goto(`${BASE}${rota}`, { waitUntil: "networkidle2" });
      break;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (tentativa >= 3 || !/ERR_CONNECTION_RESET|ERR_CONNECTION_REFUSED|ERR_EMPTY_RESPONSE/.test(msg)) throw e;
      console.log(`      [servidor reiniciando? ${msg.slice(0, 60)} — tentativa ${tentativa + 1} em 8 s]`);
      await new Promise((r) => setTimeout(r, 8000));
    }
  }
  let status = resposta?.status() ?? 0;
  // A PRIMEIRA renderização de uma rota recém-compilada pelo `next dev` desta máquina devolveu
  // 500 intermitente ("frame.join is not a function" no log do servidor — o erro real fica
  // mascarado pelo overlay do dev); a segunda requisição da mesma rota responde 200. Duas
  // retentativas com pausa; um 500 persistente sobe como veio.
  for (let tentativa = 1; status === 500 && tentativa <= 2; tentativa += 1) {
    console.log(`      [${rota} respondeu 500 na renderização recém-compilada — tentativa ${tentativa + 1} em 5 s]`);
    await new Promise((r) => setTimeout(r, 5000));
    const denovo = await page.goto(`${BASE}${rota}`, { waitUntil: "networkidle2" });
    status = denovo?.status() ?? 0;
  }
  if (status !== 200) throw new Error(`${rota} respondeu ${status}`);
  if (page.url().includes("/login")) throw new Error(`${rota} devolveu ao login`);
  return texto(page);
}
interface CampoDoSmoke {
  readonly sel: string;
  readonly valor: string;
  readonly tipo?: "select" | "data" | "marcar";
  /** Qual dos elementos casados (um formulário com nove campos de dinheiro tem nove `data-mascara="valor"`). */
  readonly indice?: number;
}
async function preencherEEnviar(page: Page, acao: string, campos: readonly CampoDoSmoke[]): Promise<{ readonly tipo: string; readonly texto: string }> {
  // `acao` pode ser o nome (`form[data-acao="..."]`) ou um seletor completo começando por "form[",
  // para páginas com um formulário POR REGISTRO (a lista de usuários tem um por usuário).
  const form = acao.startsWith("form[") ? acao : `form[data-acao="${acao}"]`;
  await page.waitForSelector(form, { timeout: 30000 });
  // Formulário dentro de `<details>` fechado (as ações por usuário): os campos não recebem foco
  // nem digitação, e o `required` do navegador segura o envio em silêncio. Abrir é o passo que
  // o operador daria ("Gerenciar").
  await page.evaluate((sel) => {
    let el: Element | null = document.querySelector(sel);
    while (el !== null) {
      const d = el.closest("details");
      if (d === null) break;
      d.open = true;
      el = d.parentElement;
    }
  }, form);
  for (const campo of campos) {
    const seletor = `${form} ${campo.sel}`;
    await page.waitForSelector(seletor, { timeout: 30000 });
    const alvo = (await page.$$(seletor))[campo.indice ?? 0];
    if (alvo === undefined) throw new Error(`"${seletor}" não casou o elemento de índice ${campo.indice ?? 0}`);
    if (campo.tipo === "marcar") {
      // ⚠️ `click()` num checkbox ALTERNA — e o helper clica três vezes para selecionar texto.
      // Aqui o estado se declara, não se alterna: marcar duas vezes deixaria desmarcado.
      await page.evaluate((sel, i, marcar) => {
        const el = document.querySelectorAll(sel)[i];
        if (!(el instanceof HTMLInputElement)) return;
        el.checked = marcar === "sim";
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }, seletor, campo.indice ?? 0, campo.valor);
      continue;
    }
    if (campo.tipo === "select") {
      await alvo.select(campo.valor);
      await new Promise((r) => setTimeout(r, 300));
      continue;
    }
    if (campo.tipo === "data") {
      await page.evaluate(
        (sel, valor) => {
          const el = document.querySelector(sel);
          if (!(el instanceof HTMLInputElement)) return;
          el.value = valor;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        },
        seletor,
        campo.valor
      );
      continue;
    }
    await alvo.click({ count: 3 });
    await page.keyboard.press("Backspace");
    await alvo.type(campo.valor, { delay: 5 });
  }
  // V4: a chave de comando nasce depois da hidratação; enviar antes dela é recusado pelo servidor.
  await page.waitForSelector(`${form} input[name="__chave"][data-chave-de-comando="pronta"]`, { timeout: 30000 });
  const enviou = await page.evaluate((sel) => {
    const f = document.querySelector(sel);
    const botao = f?.querySelector('button[type="submit"]');
    if (!(botao instanceof HTMLButtonElement)) return false;
    botao.click();
    return true;
  }, form);
  if (!enviou) throw new Error(`não achei o botão de envio de "${acao}"`);
  // A resposta chega quando a Server Action volta — sob `next dev` e swap isso pode passar de
  // três segundos. Espera até 20 s por um alerta ou um "ok"; "silêncio" só depois disso.
  let resposta = { tipo: "silencio", texto: "" };
  for (let i = 0; i < 40 && resposta.tipo === "silencio"; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    resposta = await page.evaluate((sel) => {
      const f = document.querySelector(sel);
      const alerta = f?.querySelector('[role="alert"]');
      if (alerta !== null && alerta !== undefined) return { tipo: "erro", texto: (alerta.textContent ?? "").trim() };
      const ps = Array.from(f?.querySelectorAll("p") ?? []);
      const bom = ps.find((x) => x.className.includes("status-ok"));
      return bom !== undefined ? { tipo: "ok", texto: (bom.textContent ?? "").trim() } : { tipo: "silencio", texto: "" };
    }, form);
  }
  if (resposta.tipo === "erro") console.log(`      [servidor recusou "${acao}"] ${resposta.texto.slice(0, 400)}`);
  return resposta;
}
/** Baixa o PDF com a sessão do navegador (base64) e extrai o texto com o pdf.js — leitor INDEPENDENTE do gerador. */
async function textoDoPdf(page: Page, url: string): Promise<string> {
  const obtido = await page.evaluate(async (u) => {
    const r = await fetch(u);
    if (r.status !== 200) return { status: r.status, b64: "" };
    const bytes = new Uint8Array(await r.arrayBuffer());
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return { status: r.status, b64: btoa(bin) };
  }, url);
  if (obtido.b64 === "") return `[http ${String(obtido.status)}]`;
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(Buffer.from(obtido.b64, "base64")), useSystemFonts: true }).promise;
  const partes: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const pagina = await doc.getPage(i);
    const conteudo = await pagina.getTextContent();
    partes.push(conteudo.items.map((it) => ("str" in it ? it.str : "")).join(" "));
  }
  return partes.join("\n");
}
async function opcaoQueCasa(page: Page, seletor: string, pedaco: string): Promise<{ readonly valor: string; readonly rotulo: string } | null> {
  return page.evaluate(
    (sel, p) => {
      const s = document.querySelector(sel);
      if (!(s instanceof HTMLSelectElement)) return null;
      const util = Array.from(s.options).find((o) => o.value !== "" && !o.disabled && (o.textContent ?? "").includes(p));
      return util === undefined ? null : { valor: util.value, rotulo: (util.textContent ?? "").trim() };
    },
    seletor,
    pedaco
  );
}
async function primeiraOpcao(page: Page, seletor: string): Promise<{ readonly valor: string; readonly rotulo: string } | null> {
  return page.evaluate((sel) => {
    const s = document.querySelector(sel);
    if (!(s instanceof HTMLSelectElement)) return null;
    const util = Array.from(s.options).find((o) => o.value !== "" && !o.disabled);
    return util === undefined ? null : { valor: util.value, rotulo: (util.textContent ?? "").trim() };
  }, seletor);
}
async function hrefDoRegistro(page: Page, texto: string): Promise<string | null> {
  return page.evaluate((t) => {
    const a = Array.from(document.querySelectorAll("a")).find((x) => (x.textContent ?? "").includes(t));
    if (a === undefined) return null;
    const u = new URL(a.href);
    return `${u.pathname}${u.search}`;
  }, texto);
}
async function atributo(page: Page, seletor: string, nome: string): Promise<string | null> {
  return page.evaluate((sel, n) => document.querySelector(sel)?.getAttribute(n) ?? null, seletor, nome);
}
async function hrefsDoHistorico(page: Page, rotuloDoLink: string): Promise<readonly string[]> {
  return page.evaluate((t) => Array.from(document.querySelectorAll("a")).filter((a) => (a.textContent ?? "").trim() === t).map((a) => new URL(a.href).pathname), rotuloDoLink);
}



const CONTABILIDADE = "contabilidade@percursos.local";
const SENHA_PAPEIS = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";
const RESTRITO = "operador.poc@cg.pb.gov.br";
const SENHA_RESTRITO = process.env["POC_SENHA_RESTRITO"] ?? "OperadorPOC#2026";
/** CPF FICTÍCIO com dígitos verificadores corretos (módulo 11), derivado do instante — o M19 confere o DV. */
function cpfFicticio(semente: string): string {
  const base = `${semente.replace(/\D/g, "")}000000000`.slice(0, 9).split("").map(Number);
  const dv = (ds: readonly number[], peso: number): number => {
    const soma = ds.reduce((acc, d, i) => acc + d * (peso - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(base, 10);
  const d2 = dv([...base, d1], 11);
  return `${base.join("")}${d1}${d2}`;
}
const CPF = cpfFicticio(`${Date.now() % 1_000_000_000}`);

async function sair(page: Page): Promise<void> {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
  await page.evaluate(() => {
    const f = Array.from(document.querySelectorAll("form")).find((x) => x.querySelector('button[title="Sair"]'));
    f?.requestSubmit();
  });
  for (let i = 0; i < 60; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    if (page.url().includes("/login")) return;
  }
  throw new Error("sair não voltou ao login");
}
async function barrado(page: Page, rota: string): Promise<{ readonly barrado: boolean; readonly url: string; readonly status: number }> {
  const r = await page.goto(`${BASE}${rota}`, { waitUntil: "networkidle2" });
  const url = page.url();
  const corpo = await texto(page);
  const recusaNaTela = /acesso negado|não tem a ação|sem acesso/.test(corpo);
  return { barrado: url.includes("/sem-acesso") || url.includes("/login") || recusaNaTela, url, status: r?.status() ?? 0 };
}
function dados(page: Page): Promise<string> {
  return page.evaluate(() => (document.body.innerText ?? "").replace(/\s+/g, " "));
}



/** A competência de trabalho: a primeira de 2027 que ainda não tem folha aberta. */
/** O último dia civil da competência (AAAA-MM) — o calendário é o mesmo em qualquer fuso. */
function ultimoDiaDaCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split("-").map(Number) as [number, number];
  const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
  const dias = mes === 2 ? (bissexto ? 29 : 28) : [4, 6, 9, 11].includes(mes) ? 30 : 31;
  return `${competencia}-${String(dias).padStart(2, "0")}`;
}

async function competenciaLivre(page: Page): Promise<string> {
  const usadas = new Set<string>();
  for (let pagina = 1; pagina <= 5; pagina += 1) {
    await irPara(page, `/folha/folhas?pagina=${pagina}`);
    const linhas = await page.evaluate(() => Array.from(document.querySelectorAll("tbody tr")).map((tr) => (tr.textContent ?? "").trim()));
    if (linhas.length === 0) break;
    for (const l of linhas) {
      // ⚠️ SEM `\b` NO FIM: a célula da competência cola na seguinte ("2027-01MENSAL..."), e entre
      // "1" e "M" não há fronteira de palavra. Com ela, a varredura não achava competência nenhuma
      // e o smoke reabria a mesma folha da execução anterior.
      const m = /(20\d\d-\d\d)/.exec(l);
      if (m !== null) usadas.add(m[1] as string);
    }
    if (linhas.length < 20) break;
  }
  for (let ano = 2027; ano <= 2029; ano += 1) {
    for (let mes = 1; mes <= 12; mes += 1) {
      const c = `${ano}-${String(mes).padStart(2, "0")}`;
      if (!usadas.has(c)) return c;
    }
  }
  throw new Error("nenhuma competência livre entre 2027 e 2029 — o banco dos percursos precisa de limpeza");
}

async function main(): Promise<void> {
  if (SENHA === "") throw new Error("senha ausente (PERCURSOS_SENHA_PAPEIS ou SEED_ADMIN_SENHA).");
  let navegador: Browser | undefined;
  try {
    navegador = await puppeteer.launch({
      headless: true,
      protocolTimeout: 180000,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-extensions", "--disable-background-networking", "--renderer-process-limit=1", "--js-flags=--max-old-space-size=256"],
    });
    const page = await navegador.newPage();
    page.setDefaultTimeout(120000);
    await entrar(page);
    ok("login como RH");

    const landing = await irPara(page, "/folha");
    conferir("0.1 a landing da folha abre com folhas, rubricas, lançamentos e tabelas", landing.includes("folhas") && landing.includes("rubricas") && landing.includes("lançamentos") && landing.includes("tabelas"), landing.slice(0, 200));

    // ── 1. as tabelas do ente (reusa as que já vigoram) ──
    const COMP = await competenciaLivre(page);
    console.log(`      [competência de trabalho: ${COMP}]`);
    // ⚠️ A EXISTÊNCIA SE LÊ NAS LINHAS DA LISTA, NUNCA NO TEXTO DA PÁGINA. A primeira versão
    // procurava "irrf" no corpo inteiro — e o corpo tem a descrição do cadastro, o filtro e o
    // menu. Resultado: o smoke concluiu que as três tabelas já existiam, não criou nenhuma, e o
    // cálculo caiu no `TABELA-AUSENTE` que ele mesmo deveria ter evitado. Guarda que procura em
    // tudo acha em tudo.
    await irPara(page, "/folha/tabelas");
    // ⚠️ E A COMPARAÇÃO É POR CÉLULA INTEIRA, não por trecho da linha: a coluna "incide em" da
    // rubrica contém a palavra "IRRF", e procurar "irrf" na linha do VENCIMENTO dava a rubrica de
    // imposto como existente — o cálculo depois recusava por `RUBRICA-AUSENTE`. Duas vezes o mesmo
    // erro de forma: procurar num texto maior do que a pergunta.
    const celulas = async (): Promise<readonly (readonly string[])[]> =>
      page.evaluate(() => Array.from(document.querySelectorAll("tbody tr")).map((tr) => Array.from(tr.querySelectorAll("td")).map((td) => (td.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase())));
    const linhasTabelas = await celulas();
    const temTabela = (rotulo: string): boolean => linhasTabelas.some((cs) => cs.includes(rotulo.toLowerCase()) && cs.includes("vigente"));
    const temRgps = temTabela("contribuição previdenciária — rgps");
    const temIrrf = temTabela("irrf");
    const temSf = temTabela("salário-família");
    console.log(`      [tabelas já vigentes: RGPS=${temRgps} IRRF=${temIrrf} salário-família=${temSf}]`);

    if (!temRgps) {
      const r = await preencherEEnviar(page, "criar-tabela", [
        { sel: 'select[name="tipo"]', valor: "CONTRIBUICAO_RGPS", tipo: "select" },
        { sel: 'input[name="competenciaInicio"]', valor: "2026-01" },
        { sel: 'input[name="fundamentacaoLegal"]', valor: "Tabela sintética do percurso — não é a portaria vigente" },
        { sel: 'input[name="teto"]', valor: "8.000,00" },
        { sel: 'input[name="aliquotaPatronal"]', valor: "22" },
        { sel: 'input[name="faixas.0.ate"]', valor: "1.000,00" },
        { sel: 'input[name="faixas.0.aliquota"]', valor: "7,5" },
        { sel: 'input[name="faixas.1.ate"]', valor: "3.000,00" },
        { sel: 'input[name="faixas.1.aliquota"]', valor: "9" },
        { sel: 'input[name="faixas.2.aliquota"]', valor: "14" },
      ]);
      conferir("1.1 tabela de contribuição RGPS cadastrada com três faixas e teto", r.tipo === "ok", r.texto.slice(0, 200));
    } else {
      ok("1.1 tabela de contribuição RGPS já vigora (execução anterior) — reusada");
    }
    if (!temIrrf) {
      await irPara(page, "/folha/tabelas");
      const r = await preencherEEnviar(page, "criar-tabela", [
        { sel: 'select[name="tipo"]', valor: "IRRF", tipo: "select" },
        { sel: 'input[name="competenciaInicio"]', valor: "2026-01" },
        { sel: 'input[name="fundamentacaoLegal"]', valor: "Tabela sintética do percurso — não é a tabela da Receita" },
        { sel: 'input[name="deducaoPorDependente"]', valor: "200,00" },
        { sel: 'input[name="descontoSimplificado"]', valor: "600,00" },
        { sel: 'input[name="faixas.0.ate"]', valor: "2.000,00" },
        { sel: 'input[name="faixas.0.aliquota"]', valor: "0" },
        { sel: 'input[name="faixas.1.ate"]', valor: "3.000,00" },
        { sel: 'input[name="faixas.1.aliquota"]', valor: "15" },
        { sel: 'input[name="faixas.1.parcelaADeduzir"]', valor: "300,00" },
        { sel: 'input[name="faixas.2.aliquota"]', valor: "27,5" },
        { sel: 'input[name="faixas.2.parcelaADeduzir"]', valor: "675,00" },
      ]);
      conferir("1.2 tabela de IRRF cadastrada com faixas e desconto simplificado", r.tipo === "ok", r.texto.slice(0, 200));
    } else {
      ok("1.2 tabela de IRRF já vigora (execução anterior) — reusada");
    }
    if (!temSf) {
      await irPara(page, "/folha/tabelas");
      const r = await preencherEEnviar(page, "criar-tabela", [
        { sel: 'select[name="tipo"]', valor: "SALARIO_FAMILIA", tipo: "select" },
        { sel: 'input[name="competenciaInicio"]', valor: "2026-01" },
        { sel: 'input[name="fundamentacaoLegal"]', valor: "Tabela sintética do percurso" },
        { sel: 'input[name="rendaMaxima"]', valor: "2.000,00" },
        { sel: 'input[name="valorPorDependente"]', valor: "60,00" },
        { sel: 'input[name="idadeLimite"]', valor: "14" },
      ]);
      conferir("1.3 tabela de salário-família cadastrada", r.tipo === "ok", r.texto.slice(0, 200));
    } else {
      ok("1.3 tabela de salário-família já vigora (execução anterior) — reusada");
    }
    const tabelasDepois = await irPara(page, "/folha/tabelas");
    conferir("1.4 as três tabelas aparecem VIGENTES, com a fundamentação e o resumo das faixas", tabelasDepois.includes("vigente") && tabelasDepois.includes("faixa"), tabelasDepois.slice(0, 300));

    // ── 2. as rubricas ──
    // ⚠️ A EXISTÊNCIA É PELA NATUREZA, não pelo código: as sistêmicas existem UMA vez cada, e é a
    // natureza que o servidor recusa duplicar. Duas rubricas de vencimento-base com códigos
    // diferentes são o mesmo conflito.
    await irPara(page, "/folha/rubricas?pagina=1");
    const linhasRubricas = await celulas();
    const temNatureza = (natureza: string): boolean => linhasRubricas.some((cs) => cs.includes(natureza.toLowerCase()));
    const criarRubrica = async (campos: readonly { readonly sel: string; readonly valor: string; readonly tipo?: "select" | "marcar" }[], rotulo: string, natureza: string): Promise<void> => {
      if (temNatureza(natureza)) {
        ok(`${rotulo} — já existe rubrica desta natureza (execução anterior), reusada`);
        return;
      }
      await irPara(page, "/folha/rubricas");
      const r = await preencherEEnviar(page, "criar-rubricas", campos);
      conferir(rotulo, r.tipo === "ok", r.texto.slice(0, 200));
    };
    await criarRubrica([
      { sel: 'input[name="codigo"]', valor: "VENC" },
      { sel: 'input[name="descricao"]', valor: "Vencimento base" },
      { sel: 'select[name="tipo"]', valor: "PROVENTO", tipo: "select" },
      { sel: 'select[name="natureza"]', valor: "VENCIMENTO_BASE", tipo: "select" },
      { sel: 'input[name="ordem"]', valor: "1" },
      { sel: 'input[name="incideContribuicao"]', valor: "sim", tipo: "marcar" },
      { sel: 'input[name="incideIrrf"]', valor: "sim", tipo: "marcar" },
      { sel: 'input[name="proporcionalAosDias"]', valor: "sim", tipo: "marcar" },
      { sel: 'input[name="fundamentacaoLegal"]', valor: "Lei do quadro de pessoal (percurso)" },
    ], "2.1 rubrica VENC (vencimento-base, proporcional aos dias) cadastrada", "vencimento-base");
    await criarRubrica([
      { sel: 'input[name="codigo"]', valor: "HEXT" },
      { sel: 'input[name="descricao"]', valor: "Horas extras" },
      { sel: 'select[name="tipo"]', valor: "PROVENTO", tipo: "select" },
      { sel: 'select[name="natureza"]', valor: "VALOR_INFORMADO", tipo: "select" },
      { sel: 'input[name="ordem"]', valor: "3" },
      { sel: 'input[name="incideContribuicao"]', valor: "sim", tipo: "marcar" },
      { sel: 'input[name="incideIrrf"]', valor: "sim", tipo: "marcar" },
      { sel: 'input[name="proporcionalAosDias"]', valor: "nao", tipo: "marcar" },
      { sel: 'input[name="fundamentacaoLegal"]', valor: "Estatuto dos servidores (percurso)" },
    ], "2.2 rubrica HEXT (valor informado) cadastrada", "valor informado");
    await criarRubrica([
      { sel: 'input[name="codigo"]', valor: "PREV" },
      { sel: 'input[name="descricao"]', valor: "Contribuicao previdenciaria" },
      { sel: 'select[name="tipo"]', valor: "DESCONTO", tipo: "select" },
      { sel: 'select[name="natureza"]', valor: "CONTRIBUICAO_PREVIDENCIARIA", tipo: "select" },
      { sel: 'input[name="ordem"]', valor: "90" },
      { sel: 'input[name="incideContribuicao"]', valor: "nao", tipo: "marcar" },
      { sel: 'input[name="incideIrrf"]', valor: "nao", tipo: "marcar" },
      { sel: 'input[name="proporcionalAosDias"]', valor: "nao", tipo: "marcar" },
      { sel: 'input[name="fundamentacaoLegal"]', valor: "Lei 8.212/91 e tabela vigente (percurso)" },
    ], "2.3 rubrica PREV (contribuição pela tabela) cadastrada", "contribuição previdenciária");
    await criarRubrica([
      { sel: 'input[name="codigo"]', valor: "IRRF" },
      { sel: 'input[name="descricao"]', valor: "Imposto de renda retido" },
      { sel: 'select[name="tipo"]', valor: "DESCONTO", tipo: "select" },
      { sel: 'select[name="natureza"]', valor: "IMPOSTO_DE_RENDA", tipo: "select" },
      { sel: 'input[name="ordem"]', valor: "91" },
      { sel: 'input[name="incideContribuicao"]', valor: "nao", tipo: "marcar" },
      { sel: 'input[name="incideIrrf"]', valor: "nao", tipo: "marcar" },
      { sel: 'input[name="proporcionalAosDias"]', valor: "nao", tipo: "marcar" },
      { sel: 'input[name="fundamentacaoLegal"]', valor: "Tabela do IRRF vigente (percurso)" },
    ], "2.4 rubrica IRRF cadastrada", "irrf");
    await irPara(page, "/folha/rubricas");
    const rDup = await preencherEEnviar(page, "criar-rubricas", [
      { sel: 'input[name="codigo"]', valor: `VENC-BIS-${SUF}` },
      { sel: 'input[name="descricao"]', valor: "Outro vencimento base" },
      { sel: 'select[name="tipo"]', valor: "PROVENTO", tipo: "select" },
      { sel: 'select[name="natureza"]', valor: "VENCIMENTO_BASE", tipo: "select" },
      { sel: 'input[name="ordem"]', valor: "2" },
      { sel: 'input[name="incideContribuicao"]', valor: "sim", tipo: "marcar" },
      { sel: 'input[name="incideIrrf"]', valor: "sim", tipo: "marcar" },
      { sel: 'input[name="proporcionalAosDias"]', valor: "sim", tipo: "marcar" },
      { sel: 'input[name="fundamentacaoLegal"]', valor: "tentativa do percurso" },
    ]);
    conferir("2.5 NEGATIVA: a SEGUNDA rubrica de vencimento-base é recusada nomeando a que já existe", rDup.tipo === "erro" && /RUBRICA-SISTEMICA-DUPLICADA/.test(rDup.texto), `${rDup.tipo}: ${rDup.texto.slice(0, 200)}`);

    // ── 3. o servidor que a folha vai pagar ──
    const CPF = cpfFicticio(`${Date.now() % 1_000_000_000}`);
    await irPara(page, "/cadastros/pessoas");
    const rPessoa = await preencherEEnviar(page, "cadastrar-pessoa", [
      { sel: 'input[data-mascara="cpf-cnpj"]', valor: CPF },
      { sel: 'input[name="nome"]', valor: `Folha do Percurso ${SUF}` },
    ]);
    conferir("3.1 pessoa física criada no cadastro único", rPessoa.tipo === "ok", rPessoa.texto.slice(0, 200));
    await irPara(page, "/pessoal/cargos");
    const cargoJa = (await texto(page)).includes(`folha-${SUF}`);
    if (!cargoJa) {
      const r = await preencherEEnviar(page, "criar-cargos", [
        { sel: 'input[name="codigo"]', valor: `FOLHA-${SUF}` },
        { sel: 'input[name="denominacao"]', valor: `Cargo da folha ${SUF}` },
        { sel: 'select[name="tipo"]', valor: "EFETIVO", tipo: "select" },
        { sel: 'input[name="vagasFixadas"]', valor: "5" },
        { sel: 'input[name="leiAutorizativa"]', valor: "Lei Municipal 1.234/2010 (percurso)" },
        { sel: 'input[name="dataPublicacaoLei"]', valor: "2010-05-01", tipo: "data" },
      ]);
      conferir("3.2 cargo do percurso criado", r.tipo === "ok", r.texto.slice(0, 200));
    } else {
      ok("3.2 cargo do percurso já existe — reusado");
    }
    await irPara(page, "/pessoal/servidores");
    const pessoa = await opcaoQueCasa(page, 'form[data-acao="criar-servidores"] select[name="pessoaId"]', `Folha do Percurso ${SUF}`);
    conferir("3.3 a ficha oferece a pessoa recém-criada", pessoa !== null, "pessoa não ofertada");
    if (pessoa === null) throw new Error("sem pessoa para seguir");
    const rServ = await preencherEEnviar(page, "criar-servidores", [
      { sel: 'select[name="pessoaId"]', valor: pessoa.valor, tipo: "select" },
      { sel: 'input[name="dataNascimento"]', valor: "1985-07-20", tipo: "data" },
      { sel: 'select[name="sexo"]', valor: "FEMININO", tipo: "select" },
    ]);
    conferir("3.4 ficha do servidor criada", rServ.tipo === "ok", rServ.texto.slice(0, 200));
    await irPara(page, `/pessoal/servidores?q=${encodeURIComponent(`Folha do Percurso ${SUF}`)}`);
    const hrefServ = await hrefDoRegistro(page, `Folha do Percurso ${SUF}`);
    if (hrefServ === null) throw new Error("sem servidor para seguir");
    await irPara(page, hrefServ);
    const cargo = await opcaoQueCasa(page, 'form[data-acao="admitir"] select[name="cargoId"]', `FOLHA-${SUF}`);
    const lot = await opcaoQueCasa(page, 'form[data-acao="admitir"] select[name="lotacaoId"]', "-");
    const MAT = `FOL-${SUF}`;
    const rAdm = await preencherEEnviar(page, "admitir", [
      { sel: 'input[name="matricula"]', valor: MAT },
      { sel: 'select[name="tipo"]', valor: "EFETIVO", tipo: "select" },
      { sel: 'input[name="regimeJuridico"]', valor: "Estatutário" },
      { sel: 'select[name="regimePrevidenciario"]', valor: "RGPS", tipo: "select" },
      { sel: 'input[name="dataAdmissao"]', valor: "2026-02-01", tipo: "data" },
      ...(cargo === null ? [] : [{ sel: 'select[name="cargoId"]', valor: cargo.valor, tipo: "select" as const }]),
      ...(lot === null ? [] : [{ sel: 'select[name="lotacaoId"]', valor: lot.valor, tipo: "select" as const }]),
      { sel: 'input[data-mascara="valor"]', valor: "3.000,00" },
    ]);
    conferir("3.5 admissão com REGIME PREVIDENCIÁRIO declarado (é ele que escolhe a tabela)", rAdm.tipo === "ok", rAdm.texto.slice(0, 200));
    const detServ = await irPara(page, hrefServ);
    conferir("3.6 o detalhe deriva a previdência do vínculo — RGPS", detServ.includes("previdência: rgps"), detServ.slice(0, 400));

    // ── 4. o lançamento variável da competência ──
    await irPara(page, "/folha/lancamentos");
    const vinc = await opcaoQueCasa(page, 'form[data-acao="criar-lancamentos-da-folha"] select[name="vinculoId"]', MAT);
    const rubHext = await opcaoQueCasa(page, 'form[data-acao="criar-lancamentos-da-folha"] select[name="rubricaId"]', "HEXT");
    conferir("4.1 o lançamento oferece a matrícula viva e SÓ as rubricas de valor informado", vinc !== null && rubHext !== null, `vinc=${vinc?.rotulo ?? "-"} rubrica=${rubHext?.rotulo ?? "-"}`);
    const rLanc = await preencherEEnviar(page, "criar-lancamentos-da-folha", [
      ...(vinc === null ? [] : [{ sel: 'select[name="vinculoId"]', valor: vinc.valor, tipo: "select" as const }]),
      ...(rubHext === null ? [] : [{ sel: 'select[name="rubricaId"]', valor: rubHext.valor, tipo: "select" as const }]),
      { sel: 'select[name="tipo"]', valor: "VARIAVEL", tipo: "select" },
      { sel: 'input[name="competenciaInicio"]', valor: COMP },
      { sel: 'input[data-mascara="valor"]', valor: "250,00" },
      { sel: 'input[name="observacao"]', valor: "20 horas extras apuradas no ponto (percurso)" },
    ]);
    conferir("4.2 horas extras lançadas na competência", rLanc.tipo === "ok", rLanc.texto.slice(0, 200));

    // ── 5. a folha: abrir e calcular ──
    await irPara(page, "/folha/folhas");
    const rAbrir = await preencherEEnviar(page, "criar-folhas", [
      { sel: 'input[name="competencia"]', valor: COMP },
      { sel: 'select[name="tipo"]', valor: "MENSAL", tipo: "select" },
    ]);
    conferir(`5.1 folha ${COMP} aberta`, rAbrir.tipo === "ok", rAbrir.texto.slice(0, 200));
    await irPara(page, `/folha/folhas?q=${COMP}`);
    const hrefFolha = await hrefDoRegistro(page, COMP);
    conferir("5.2 a folha aparece na lista SEM CÁLCULO", hrefFolha !== null && (await texto(page)).includes("sem cálculo"), (await texto(page)).slice(0, 300));
    if (hrefFolha === null) throw new Error("sem folha para seguir");

    // ⚠️ O VÍNCULO LEGADO SEM REGIME: a folha recusa nomeando a matrícula, e o RH a informa por
    // FATO DATADO. Na primeira execução há um (os vínculos nasceram antes da folha existir); nas
    // seguintes, nenhum — e o percurso diz qual dos dois aconteceu.
    let corrigidas = 0;
    let rCalc = { tipo: "silencio", texto: "" };
    for (let tentativa = 0; tentativa < 6; tentativa += 1) {
      await irPara(page, hrefFolha);
      rCalc = await preencherEEnviar(page, "calcular", [{ sel: 'input[name="motivo"]', valor: `cálculo do percurso ${SUF}` }]);
      const semRegime = /VINCULO-SEM-REGIME-PREVIDENCIARIO: a matrícula (\S+)/.exec(rCalc.texto);
      if (semRegime === null) break;
      const matricula = semRegime[1] as string;
      if (corrigidas === 0) ok(`5.3 NEGATIVA: o cálculo RECUSA a matrícula legada sem regime previdenciário (${matricula}) — e nomeia qual é`);
      await irPara(page, `/pessoal/servidores?q=${encodeURIComponent(matricula)}`);
      const href = await page.evaluate(() => (document.querySelector('tbody a[href^="/pessoal/servidores/"]') as HTMLAnchorElement | null)?.getAttribute("href") ?? "");
      if (href === "") { falhou("5.3 correção do legado", `não achei o servidor da matrícula ${matricula}`); break; }
      await irPara(page, href);
      const alvo = await opcaoQueCasa(page, 'form[data-acao="movimentar"] select[name="vinculoId"]', matricula);
      const rMov = await preencherEEnviar(page, "movimentar", [
        ...(alvo === null ? [] : [{ sel: 'select[name="vinculoId"]', valor: alvo.valor, tipo: "select" as const }]),
        { sel: 'select[name="tipo"]', valor: "MUDANCA_REGIME_PREVIDENCIARIO", tipo: "select" },
        // ⚠️ A DATA É O ÚLTIMO DIA DA COMPETÊNCIA, e não uma data antiga qualquer: o evento não
        // pode ser anterior à admissão (o domínio recusa, e recusa certo), e precisa estar vigente
        // no fim do mês que a folha calcula. Qualquer vínculo vivo na competência foi admitido
        // antes desse dia.
        { sel: 'input[name="data"]', valor: ultimoDiaDaCompetencia(COMP), tipo: "data" },
        { sel: 'select[name="regimePrevidenciario"]', valor: "RGPS", tipo: "select" },
        { sel: 'input[name="motivo"]', valor: "carga do regime previdenciário do vínculo legado (percurso)" },
      ]);
      if (rMov.tipo !== "ok") { falhou("5.3 correção do legado", `${matricula}: ${rMov.texto.slice(0, 160)}`); break; }
      corrigidas += 1;
    }
    // ⚠️ SÓ SE AFIRMA O QUE SE VIU: "não restou vínculo sem regime" vale quando o cálculo PASSOU.
    // Se ele caiu por outro motivo (tabela ausente, por exemplo), o percurso não chegou a olhar
    // para os vínculos — e dizer que estavam todos certos seria atestar pelo silêncio.
    if (corrigidas > 0) ok(`5.4 o regime informado como FATO DATADO em ${corrigidas} matrícula(s) legada(s) destravou o cálculo`);
    else if (rCalc.tipo === "ok") ok("5.3 não restou vínculo sem regime (execução anterior já os informou) — a recusa está provada em m33-folha.test.ts");
    else console.log(`      [5.3/5.4 não avaliados: o cálculo parou antes dos vínculos — ${rCalc.texto.slice(0, 120)}]`);
    conferir("5.5 o cálculo grava e diz quantos contracheques e o líquido", rCalc.tipo === "ok" && /contracheque/i.test(rCalc.texto), `${rCalc.tipo}: ${rCalc.texto.slice(0, 240)}`);

    const detFolha = await irPara(page, hrefFolha);
    conferir("5.6 a folha passa a CALCULADA, com o número do cálculo e o sha256 do conjunto", detFolha.includes("calculada") && detFolha.includes("sha256"), detFolha.slice(0, 400));
    conferir("5.7 os contracheques aparecem no detalhe, com a matrícula do percurso", detFolha.includes(MAT.toLowerCase()), detFolha.slice(0, 400));

    // ── 6. o contracheque e a memória de cálculo ──
    const hrefContra = await page.evaluate((mat) => {
      const linha = Array.from(document.querySelectorAll("[data-contracheque]")).find((tr) => (tr.textContent ?? "").includes(mat));
      return (linha?.querySelector('a[href*="/contracheque/"]') as HTMLAnchorElement | null)?.getAttribute("href") ?? "";
    }, MAT);
    conferir("6.1 a linha do contracheque leva à memória de cálculo", hrefContra !== "", "sem link");
    if (hrefContra !== "") {
      const cc = await irPara(page, hrefContra);
      // VENC 3.000,00 integral (admitido em fevereiro, competência de 2027) + HEXT 250,00 = 3.250,00.
      // PREV pelas faixas: 1000x7,5% + 2000x9% + 250x14% = 75 + 180 + 35 = 290,00.
      conferir("6.2 o vencimento entra integral e as horas extras somam (3.250,00 de proventos)", cc.includes("3.000,00") && cc.includes("250,00") && cc.includes("3.250,00"), cc.slice(0, 500));
      conferir("6.3 a contribuição sai das FAIXAS da tabela do ente e a memória as mostra (290,00)", cc.includes("290,00") && cc.includes("faixa 1") && cc.includes("faixa 2"), cc.slice(0, 600));
      conferir("6.4 a memória nomeia a fundamentação legal de cada tabela", cc.includes("tabela sintética do percurso"), cc.slice(0, 600));
      conferir("6.5 os três cenários do imposto aparecem, com o motivo de cada inaplicável", cc.includes("deducoes_legais") && cc.includes("desconto_simplificado") && cc.includes("cenário escolhido"), cc.slice(0, 800));
      const sha = await page.evaluate(() => document.querySelector("[data-sha256]")?.getAttribute("data-sha256") ?? "");
      conferir("6.6 o contracheque leva o sha256 da própria memória (64 hexadecimais)", /^[0-9a-f]{64}$/.test(sha), sha);
      conferir("6.7 nenhum identificador de cláusula na tela", !/\bTR\s*\d+\.\d+/.test(await dados(page)), "apareceu rótulo de catálogo");
    }

    // ── 7. recalcular é o PRÓXIMO NÚMERO, e o hash não muda se nada mudou ──
    await irPara(page, hrefFolha);
    const rRecalc = await preencherEEnviar(page, "calcular", [{ sel: 'input[name="motivo"]', valor: "conferência do percurso" }]);
    conferir("7.1 recalcular grava o cálculo nº 2 — o anterior continua no histórico", rRecalc.tipo === "ok" && /nº 2/.test(rRecalc.texto), `${rRecalc.tipo}: ${rRecalc.texto.slice(0, 200)}`);
    const hist = await irPara(page, `${hrefFolha}?aba=historico`);
    conferir("7.2 o histórico traz os dois cálculos com autor e motivo", hist.includes("cálculo nº 1") && hist.includes("cálculo nº 2"), hist.slice(0, 400));
    await irPara(page, hrefFolha);
    const rCancel = await preencherEEnviar(page, "cancelar-calculo", [{ sel: 'input[name="motivo"]', valor: "substituído — conferência encerrada (percurso)" }]);
    conferir("7.3 cancelar o último cálculo é um FATO com motivo", rCancel.tipo === "ok" && /nº 2/.test(rCancel.texto), `${rCancel.tipo}: ${rCancel.texto.slice(0, 200)}`);
    const histDepois = await irPara(page, `${hrefFolha}?aba=historico`);
    conferir("7.4 o cálculo cancelado continua no histórico, marcado — nada foi apagado", histDepois.includes("cancelamento do cálculo nº 2"), histDepois.slice(0, 500));

    // ── 8. quem calcula não fecha ──
    await irPara(page, hrefFolha);
    const temFechar = (await page.$('form[data-acao="fechar"]')) !== null;
    conferir("8.1 NEGATIVA: o RH não vê o formulário de FECHAR (a ação é da contabilidade)", !temFechar, "o formulário de fechar apareceu para quem não tem a ação");
    const naDespesa = await barrado(page, "/despesa/empenhos");
    conferir("8.2 NEGATIVA: o RH não abre os empenhos", naDespesa.barrado, `${naDespesa.url} ${naDespesa.status}`);

    await sair(page);
    await entrar(page, CONTABILIDADE, SENHA_PAPEIS);
    ok("8.3 contabilidade entra");
    const noPessoal = await barrado(page, "/pessoal/servidores");
    conferir("8.4 NEGATIVA: a contabilidade não abre o cadastro de pessoal (sem CONSULTAR_PESSOAL)", noPessoal.barrado, `${noPessoal.url} ${noPessoal.status}`);
    await irPara(page, hrefFolha);
    const temCalcular = (await page.$('form[data-acao="calcular"]')) !== null;
    conferir("8.5 NEGATIVA: a contabilidade não vê o formulário de CALCULAR", !temCalcular, "o formulário de calcular apareceu para quem não tem a ação");
    const rFechar = await preencherEEnviar(page, "fechar", []);
    conferir("8.6 a contabilidade FECHA a folha sobre o cálculo vivo", rFechar.tipo === "ok" && /nº 1/.test(rFechar.texto), `${rFechar.tipo}: ${rFechar.texto.slice(0, 200)}`);
    const fechada = await irPara(page, hrefFolha);
    conferir("8.7 a folha passa a FECHADA e diz sobre qual cálculo", fechada.includes("fechada") && fechada.includes("cálculo fechado"), fechada.slice(0, 400));

    // ── 9. folha fechada não se recalcula ──
    await sair(page);
    await entrar(page);
    await irPara(page, hrefFolha);
    // ⚠️ V6.2 (PROD-015): fechada, CALCULAR e CANCELAR O CÁLCULO saem da barra e aparecem como estado.
    // A recusa do caso de uso (FOLHA-FECHADA, CALCULO-FECHADO) para a chamada direta está em
    // m33-certificacao (4c, paridade) e m33-folha.
    const calcularFechada = await apresentacaoDoAto(page, "calcular");
    conferir("9.1 NEGATIVA: fechada, RECALCULAR sai da barra e a tela diz que não se recalcula", calcularFechada.estado === "nao-aplicavel" && /está fechada; não se recalcula/i.test(calcularFechada.texto), JSON.stringify(calcularFechada));
    const cancelarFechada = await apresentacaoDoAto(page, "cancelar-calculo");
    conferir("9.2 NEGATIVA: o cálculo que fechou a folha não se cancela — a ação sai da barra dizendo por quê", cancelarFechada.estado === "nao-aplicavel" && /não se cancela/i.test(cancelarFechada.texto), JSON.stringify(cancelarFechada));

    // ── 10. o operador restrito não alcança a folha ──
    await sair(page);
    await entrar(page, RESTRITO, SENHA_RESTRITO).catch((e) => console.log(`      [restrito não entrou: ${e instanceof Error ? e.message : String(e)}]`));
    if (!page.url().includes("/login")) {
      const b = await barrado(page, "/folha/folhas");
      conferir("10.1 NEGATIVA: o operador restrito (sem CONSULTAR_FOLHA) não abre a folha", b.barrado, `${b.url} ${b.status}`);
    }
  } catch (e) {
    falhou("execução", e instanceof Error ? e.message : String(e));
  } finally {
    await navegador?.close();
  }
  console.log(`\n${passos.length} passo(s) ok, ${falhas.length} falha(s).`);
  if (falhas.length > 0) {
    console.error(falhas.map((f) => ` - ${f}`).join("\n"));
    process.exit(1);
  }
}


main().catch((e) => {
  console.error(e);
  process.exit(1);
});
