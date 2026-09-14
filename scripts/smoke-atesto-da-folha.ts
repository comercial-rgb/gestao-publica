import "dotenv/config";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { apresentacaoDoAto, retirarVersao } from "./percursos-disponibilidade.js";

/**
 * SMOKE DO ATESTO E DA LIQUIDAÇÃO DA FOLHA (M33, V6.1) — navegador real, CINCO papéis.
 *
 * O administrador vincula a conta do atestador à pessoa do cadastro → o RH abre e CALCULA a folha
 * → a contabilidade FECHA, garante as contas do grupo e APROPRIA → o atestador tenta certificar
 * SEM designação e é recusado nomeando o que falta → o administrador cadastra a DESIGNAÇÃO pelo
 * ato do ente → o atestador CERTIFICA, e o painel mostra o manifesto com o sha256 → o liquidante
 * LIQUIDA, e cada empenho passa a mostrar a data e o responsável pelo atesto → liquidar de novo
 * NÃO duplica → e cada papel é barrado no ato do outro.
 *
 * ⚠️ O QUE ESTE PERCURSO EXISTE PARA IMPEDIR: que "certificada" apareça sem designação, que
 * "liquidada" apareça sem atesto, que quem atesta liquide, e que a folha pela metade seja
 * apresentada como liquidada.
 *
 * ⚠️ A COMPETÊNCIA É DE 2026: o empenho só entra em exercício ABERTO, e o banco dos percursos
 * tem 2026. A data dos empenhos é o último dia da competência.
 *
 * ⚠️ A FICHA DOS PERCURSOS É DE SERVIÇOS DE TERCEIROS (339039) — a folha real usaria 319011. O
 * percurso exercita o MECANISMO (atesto, obrigação, razão), não a classificação; a pendência é do
 * banco de demonstração (`FICHA-DE-PESSOAL-NOS-PERCURSOS`), não do código.
 */
const BASE = process.argv[2] ?? "http://localhost:3010";
// O percurso é do PAPEL, e são CINCO: o administrador designa, o RH calcula, a contabilidade
// fecha e apropria, o designado certifica e o liquidante liquida — cada um barrado no ato do
// outro (scripts/percursos-usuarios-por-papel.ts).
const USUARIO = process.argv[3] ?? "admin@cg.pb.gov.br";
const SENHA = process.argv[4] ?? (USUARIO.endsWith("@percursos.local") ? (process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026") : (process.env["SEED_ADMIN_SENHA"] ?? ""));
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
      // V6.2 (PROD-015) — o ato que se torna não aplicável SAI da barra, e o resultado dele fica em
      // `[data-resultado-da-acao]`. Sem este ramo, "fechar" gravaria e o percurso leria silêncio.
      if (f === null) {
        const nome = /data-acao="([^"]+)"/.exec(sel)?.[1] ?? "";
        const r = document.querySelector(`[data-resultado-da-acao="${nome}"]`);
        if (r !== null) return { tipo: r.getAttribute("role") === "alert" ? "erro" : "ok", texto: (r.textContent ?? "").trim() };
        return { tipo: "silencio", texto: "" };
      }
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
const RH = "rh@percursos.local";
const ATESTADOR = "atestador@percursos.local";
const LIQUIDANTE = "liquidante@percursos.local";
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



/** O último dia civil da competência (AAAA-MM) — o calendário é o mesmo em qualquer fuso. */
function ultimoDiaDaCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split("-").map(Number) as [number, number];
  const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
  const dias = mes === 2 ? (bissexto ? 29 : 28) : [4, 6, 9, 11].includes(mes) ? 30 : 31;
  return `${competencia}-${String(dias).padStart(2, "0")}`;
}

/** A primeira competência de 2026 (o exercício ABERTO) que ainda não tem folha. */
async function competenciaLivreDe2026(page: Page): Promise<string> {
  const usadas = new Set<string>();
  for (let pagina = 1; pagina <= 5; pagina += 1) {
    await irPara(page, `/folha/folhas?pagina=${pagina}`);
    const linhas = await page.evaluate(() => Array.from(document.querySelectorAll("tbody tr")).map((tr) => (tr.textContent ?? "").trim()));
    if (linhas.length === 0) break;
    for (const l of linhas) {
      const m = /(20\d\d-\d\d)/.exec(l);
      if (m !== null) usadas.add(m[1] as string);
    }
    if (linhas.length < 20) break;
  }
  // ⚠️ DE DEZEMBRO PARA TRÁS: os servidores dos percursos foram admitidos ao longo de 2026, e uma
  // competência do começo do ano não tem vínculo vivo nenhum — a folha recusa com
  // FOLHA-SEM-VINCULOS, que é comportamento certo e percurso errado.
  for (let mes = 12; mes >= 1; mes -= 1) {
    const c = `2026-${String(mes).padStart(2, "0")}`;
    if (!usadas.has(c)) return c;
  }
  throw new Error("as doze competências de 2026 já têm folha — o banco dos percursos precisa de limpeza");
}



/**
 * O nome do designado deste percurso — sintético, e identificado como tal.
 *
 * ⚠️ MUTÁVEL porque a execução pode REUSAR a pessoa já vinculada de uma execução anterior. A
 * primeira versão comparava a tela com o nome de HOJE e falhava na segunda execução — o percurso
 * afirmava uma coisa e o banco tinha outra, e o defeito era do percurso, não do produto.
 */
let NOME_ATESTADOR = `Atestadora do Percurso ${SUF}`;
const ATO = `Portaria ${SUF}/2026 (percurso sintético)`;

async function main(): Promise<void> {
  if (SENHA === "") throw new Error("senha ausente (SEED_ADMIN_SENHA para o admin, PERCURSOS_SENHA_PAPEIS para os papéis).");
  let navegador: Browser | undefined;
  try {
    navegador = await puppeteer.launch({
      headless: true,
      protocolTimeout: 180000,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-extensions", "--disable-background-networking", "--renderer-process-limit=1", "--js-flags=--max-old-space-size=256"],
    });
    const page = await navegador.newPage();
    page.setDefaultTimeout(120000);

    // ══ 1. O ADMINISTRADOR liga a conta do atestador à PESSOA do cadastro ══
    // ⚠️ É O PRÉ-REQUISITO DA DESIGNAÇÃO, e não um detalhe: sem ele, o atesto ficaria assinado
    // por um nome e praticado por outro. O vínculo é explícito e auditável, e NÃO concede poder.
    await entrar(page);
    ok("1.0 o administrador entra");
    const documentoDoAtestador = await (async (): Promise<string> => {
      await irPara(page, "/administracao/usuarios");
      const ja = await page.evaluate((ident) => {
        const f = Array.from(document.querySelectorAll("form[data-usuario]")).find((x) => x.getAttribute("data-usuario") === ident);
        return f?.getAttribute("data-acao") === "desvincular-pessoa" ? (f.textContent ?? "") : "";
      }, ATESTADOR);
      if (ja !== "") {
        const limpo = ja.replace(/\s+/g, " ");
        const doc = /\(([\d.\-/]{11,18})\)/.exec(limpo);
        const nome = /Pessoa vinculada:\s*(.+?)\s*\(/.exec(limpo);
        if (nome !== null) NOME_ATESTADOR = (nome[1] as string).trim();
        ok(`1.1 a conta do atestador já está vinculada a "${NOME_ATESTADOR}" (execução anterior) — reusada`);
        return (doc?.[1] ?? "").replace(/\D/g, "");
      }
      const cpf = cpfFicticio(`${(Date.now() + 7919) % 1_000_000_000}`);
      await irPara(page, "/cadastros/pessoas");
      const rPessoa = await preencherEEnviar(page, "cadastrar-pessoa", [
        // ⚠️ O CAMPO VISÍVEL DO CPF NÃO TEM `name`: ele é mascarado, e quem carrega o `name` é um
        // input HIDDEN (não clicável, não digitável). O percurso digita onde o operador digita.
        { sel: 'input[data-mascara="cpf-cnpj"]', valor: cpf },
        { sel: 'input[name="nome"]', valor: NOME_ATESTADOR },
      ]);
      conferir("1.1 o administrador cadastra a pessoa do designado", rPessoa.tipo === "ok", `${rPessoa.tipo}: ${rPessoa.texto.slice(0, 200)}`);
      await irPara(page, "/administracao/usuarios");
      // ⚠️ A RESPOSTA DESTE FORMULÁRIO NÃO VEM PELO AVISO, e isso é o produto certo: ao vincular,
      // a tela RE-RENDERIZA e o formulário vira "desvincular-pessoa" — o seletor do envio deixa de
      // casar, e o helper leria "silêncio". A prova aqui é a PERSISTÊNCIA: recarregar e ver a
      // pessoa vinculada. Um toast que some não provaria que gravou.
      await preencherEEnviar(page, `form[data-acao="vincular-pessoa"][data-usuario="${ATESTADOR}"]`, [
        { sel: 'input[name="documento"]', valor: cpf },
        { sel: 'input[name="motivo"]', valor: "e a pessoa designada para o atesto da folha (percurso)" },
      ]);
      await irPara(page, "/administracao/usuarios");
      const vinculado = await page.evaluate((ident) => {
        const f = Array.from(document.querySelectorAll("form[data-usuario]")).find((x) => x.getAttribute("data-usuario") === ident);
        return { acao: f?.getAttribute("data-acao") ?? "", texto: (f?.textContent ?? "").replace(/\s+/g, " ") };
      }, ATESTADOR);
      conferir(
        "1.2 a conta do atestador passa a APONTAR para essa pessoa — conferido por RECARGA, não por aviso",
        vinculado.acao === "desvincular-pessoa" && vinculado.texto.includes(NOME_ATESTADOR),
        `acao=${vinculado.acao} texto=${vinculado.texto.slice(0, 200)}`
      );
      return cpf;
    })();

    // ══ 2. O RH abre e calcula a folha ══
    await sair(page);
    await entrar(page, RH, SENHA_PAPEIS);
    ok("2.0 o RH entra");
    // ⚠️ RETOMADA DECLARADA (V6.2): o banco dos percursos esgotou as competências livres de 2026 (o único
    // exercício aberto com dotação). `ATESTO_COMPETENCIA=AAAA-MM` retoma uma folha já preparada: os passos
    // que ela já cumpriu são REGISTRADOS como retomados — não como verdes — e o resto corre inteiro.
    const RETOMAR = process.env["ATESTO_COMPETENCIA"];
    const COMP = RETOMAR ?? (await competenciaLivreDe2026(page));
    console.log(`      [competência ${COMP} · empenhos e liquidações a partir de ${ultimoDiaDaCompetencia(COMP)}]`);
    if (RETOMAR === undefined) {
    const rAbrir = await preencherEEnviar(page, "criar-folhas", [
      { sel: 'input[name="competencia"]', valor: COMP },
      { sel: 'select[name="tipo"]', valor: "MENSAL", tipo: "select" },
    ]);
    conferir(`2.1 folha ${COMP} aberta`, rAbrir.tipo === "ok", rAbrir.texto.slice(0, 200));
    } else {
      console.log(`      [RETOMADA de ${COMP}: 2.1 (abrir) não executado nesta passada — a folha já existe]`);
    }
    await irPara(page, `/folha/folhas?q=${COMP}`);
    const hrefFolha = await hrefDoRegistro(page, COMP);
    if (hrefFolha === null) throw new Error("sem folha para seguir");
    // ⚠️ O LAÇO DA CARGA DO REGIME é condição REAL do banco dos percursos, não enfeite: os vínculos
    // legados foram importados sem regime previdenciário, e o cálculo RECUSA nomeando a matrícula
    // (comportamento certo). O RH informa o regime pela tela e tenta de novo — é o que ele faria.
    await irPara(page, hrefFolha);
    const jaFechada = RETOMAR !== undefined && (await apresentacaoDoAto(page, "calcular")).estado === "nao-aplicavel";
    if (jaFechada) console.log(`      [RETOMADA: 2.2 (calcular) não executado nesta passada — a folha já está fechada]`);
    else {
    let rCalc = { tipo: "silencio", texto: "" };
    for (let tentativa = 0; tentativa < 8; tentativa += 1) {
      await irPara(page, hrefFolha);
      rCalc = await preencherEEnviar(page, "calcular", [{ sel: 'input[name="motivo"]', valor: `folha do percurso do atesto ${SUF}` }]);
      const semRegime = /VINCULO-SEM-REGIME-PREVIDENCIARIO: a matrícula (\S+)/.exec(rCalc.texto);
      if (semRegime === null) break;
      const matricula = semRegime[1] as string;
      await irPara(page, `/pessoal/servidores?q=${encodeURIComponent(matricula)}`);
      const href = await page.evaluate(() => (document.querySelector('tbody a[href^="/pessoal/servidores/"]') as HTMLAnchorElement | null)?.getAttribute("href") ?? "");
      if (href === "") break;
      await irPara(page, href);
      const alvo = await opcaoQueCasa(page, 'form[data-acao="informar-regime"] select[name="vinculoRegimeId"]', matricula);
      if (alvo === null) {
        falhou("2.2 o RH calcula a folha", `a matrícula ${matricula} não aparece na lista da carga do regime — nada a fazer pela tela.`);
        break;
      }
      for (const data of [ultimoDiaDaCompetencia(COMP), `${COMP}-01`]) {
        const r = await preencherEEnviar(page, "informar-regime", [
          { sel: 'select[name="vinculoRegimeId"]', valor: alvo.valor, tipo: "select" },
          { sel: 'input[name="data"]', valor: data, tipo: "data" },
          { sel: 'select[name="regimePrevidenciario"]', valor: "RGPS", tipo: "select" },
          { sel: 'input[name="motivo"]', valor: "carga do regime previdenciário do vínculo legado (percurso)" },
        ]);
        if (r.tipo === "ok") break;
        await irPara(page, href);
      }
    }
    if (!falhas.some((f) => f.startsWith("2.2"))) conferir("2.2 o RH calcula a folha", rCalc.tipo === "ok", `${rCalc.tipo}: ${rCalc.texto.slice(0, 250)}`);
    if (rCalc.tipo !== "ok") throw new Error("cálculo da folha não passou — sem cálculo não há fechamento, atesto nem liquidação");

    }
    // ⚠️ NEGATIVA DO RH, ANTES DE TUDO: ele não vê certificar nem liquidar.
    await irPara(page, hrefFolha);
    const rhVeCertificar = (await page.$('form[data-acao="certificar"]')) !== null;
    const rhVeLiquidar = (await page.$('form[data-acao="liquidar"]')) !== null;
    conferir("2.3 NEGATIVA: o RH não vê CERTIFICAR nem LIQUIDAR — quem prepara não atesta", !rhVeCertificar && !rhVeLiquidar, `certificar=${String(rhVeCertificar)} liquidar=${String(rhVeLiquidar)}`);

    // ══ 3. A contabilidade fecha, garante as contas do grupo e apropria ══
    await sair(page);
    await entrar(page, CONTABILIDADE, SENHA_PAPEIS);
    ok("3.0 a contabilidade entra");
    await irPara(page, hrefFolha);
    if (jaFechada) console.log("      [RETOMADA: 3.1 (fechar) não executado nesta passada]");
    else {
      const rFechar = await preencherEEnviar(page, "fechar", []);
      conferir("3.1 a contabilidade fecha a folha — e o resultado continua na tela depois de FECHAR sair da barra", rFechar.tipo === "ok" && /fechada sobre o cálculo/i.test(rFechar.texto), `${rFechar.tipo}: ${rFechar.texto.slice(0, 200)}`);
    }

    // O grupo de empenho: reusa o que existir; se ele não tiver as contas da liquidação, define-as
    // pela tela — é o caminho dos grupos cadastrados antes desta entrega.
    await irPara(page, "/folha/grupos-de-empenho");
    const grupoHref = await page.evaluate(() => (document.querySelector('tbody a[href^="/folha/grupos-de-empenho/"]') as HTMLAnchorElement | null)?.getAttribute("href") ?? "");
    if (grupoHref === "") {
      const marcaveis = await page.evaluate(() =>
        Array.from(document.querySelectorAll('form[data-acao="criar-grupo-de-empenho"] input[type="checkbox"][name^="rubricas."]'))
          .filter((el) => !(el as HTMLInputElement).disabled)
          .map((el) => (el as HTMLInputElement).name)
      );
      const ficha = await page.evaluate(() => {
        const opcoes = Array.from(document.querySelectorAll('form[data-acao="criar-grupo-de-empenho"] select[name="fichaId"] option'))
          .map((o) => ({ valor: (o as HTMLOptionElement).value, rotulo: o.textContent ?? "" }))
          .filter((o) => o.valor !== "");
        const saldo = (r: string): number => Number((/disponível\s+([\d.]+)/.exec(r)?.[1] ?? "0").replace(/\./g, ""));
        return opcoes.sort((a, b) => saldo(b.rotulo) - saldo(a.rotulo))[0] ?? null;
      });
      const vpd = await primeiraOpcao(page, 'form[data-acao="criar-grupo-de-empenho"] select[name="contaVariacaoId"]');
      const obr = await primeiraOpcao(page, 'form[data-acao="criar-grupo-de-empenho"] select[name="contaObrigacaoId"]');
      conferir("3.2 a ilha do grupo oferece as DUAS contas da liquidação, recortadas do plano", vpd !== null && obr !== null, `vpd=${String(vpd?.rotulo)} obrigacao=${String(obr?.rotulo)}`);
      const r = await preencherEEnviar(page, "criar-grupo-de-empenho", [
        { sel: 'input[name="codigo"]', valor: `FOLHA-${SUF}` },
        { sel: 'input[name="descricao"]', valor: "Vencimentos e demais proventos (percurso)" },
        { sel: 'input[name="serie"]', valor: "FP" },
        ...(ficha === null ? [] : [{ sel: 'select[name="fichaId"]', valor: ficha.valor, tipo: "select" as const }]),
        { sel: 'select[name="tipoEmpenho"]', valor: "ORDINARIO", tipo: "select" },
        { sel: 'select[name="categoriaOrdemCronologica"]', valor: "PRESTACAO_SERVICOS", tipo: "select" },
        ...(vpd === null ? [] : [{ sel: 'select[name="contaVariacaoId"]', valor: vpd.valor, tipo: "select" as const }]),
        ...(obr === null ? [] : [{ sel: 'select[name="contaObrigacaoId"]', valor: obr.valor, tipo: "select" as const }]),
        ...marcaveis.map((name) => ({ sel: `input[name="${name}"]`, valor: "sim", tipo: "marcar" as const })),
      ]);
      conferir("3.3 grupo de empenho cadastrado com as contas da liquidação", r.tipo === "ok", r.texto.slice(0, 220));
    } else {
      const detalheGrupo = await irPara(page, grupoHref);
      const semContas = !detalheGrupo.includes("variação patrimonial") || detalheGrupo.includes("não declarada");
      ok(`3.2 grupo de empenho já cadastrado (execução anterior) — reusado`);
      if (semContas || (await page.$('form[data-acao="definir-contas"]')) !== null) {
        const vpd = await primeiraOpcao(page, 'form[data-acao="definir-contas"] select[name="contaVariacaoId"]');
        const obr = await primeiraOpcao(page, 'form[data-acao="definir-contas"] select[name="contaObrigacaoId"]');
        const r = await preencherEEnviar(page, "definir-contas", [
          ...(vpd === null ? [] : [{ sel: 'select[name="contaVariacaoId"]', valor: vpd.valor, tipo: "select" as const }]),
          ...(obr === null ? [] : [{ sel: 'select[name="contaObrigacaoId"]', valor: obr.valor, tipo: "select" as const }]),
        ]);
        conferir("3.3 as contas da liquidação são definidas pela tela, e o aviso diz que as liquidações já gravadas NÃO mudam", r.tipo === "ok" && /já gravadas não mudam/i.test(r.texto), `${r.tipo}: ${r.texto.slice(0, 220)}`);
      }
    }

    await irPara(page, hrefFolha);
    const apropriarNaTela = await apresentacaoDoAto(page, "apropriar");
    const rApropriar = RETOMAR !== undefined && apropriarNaTela.estado === "nao-aplicavel"
      ? { tipo: "retomada", texto: "" }
      : await preencherEEnviar(page, "apropriar", [{ sel: 'input[name="dataDoEmpenho"]', valor: ultimoDiaDaCompetencia(COMP), tipo: "data" }]);
    const interrompida = /APROPRIACAO-INTERROMPIDA/.test(rApropriar.texto);
    if (rApropriar.tipo === "retomada") {
      console.log("      [RETOMADA: 3.4 (apropriar) não executado nesta passada — os empenhos já existem]");
    } else if (interrompida) {
      conferir("3.4 a apropriação PARA por saldo e diz onde parou — retomável", /CONTINUAM válidos/.test(rApropriar.texto), rApropriar.texto.slice(0, 300));
      console.log("      [a ficha do grupo não comporta a folha inteira no banco dos percursos — pendência FICHA-DE-PESSOAL-NOS-PERCURSOS]");
    } else {
      conferir("3.4 a apropriação grava e diz quantos empenhos, em qual ficha e quanto", rApropriar.tipo === "ok" && /empenho\(s\)/.test(rApropriar.texto), `${rApropriar.tipo}: ${rApropriar.texto.slice(0, 300)}`);
    }
    await irPara(page, hrefFolha);
    const empenhosGravados = await page.evaluate(() => document.querySelectorAll("[data-empenho]").length);
    console.log(`      [${empenhosGravados} empenho(s) gravado(s) nesta competência]`);

    // ⚠️ NEGATIVA DA CONTABILIDADE: ela fecha e apropria, mas NÃO certifica nem liquida a folha.
    const contabVeCertificar = (await page.$('form[data-acao="certificar"]')) !== null;
    const contabVeLiquidar = (await page.$('form[data-acao="liquidar"]')) !== null;
    conferir("3.5 NEGATIVA: a contabilidade não vê CERTIFICAR nem LIQUIDAR A FOLHA — são atos de outros", !contabVeCertificar && !contabVeLiquidar, `certificar=${String(contabVeCertificar)} liquidar=${String(contabVeLiquidar)}`);

    // ══ 4. O designado tenta certificar SEM designação ══
    await sair(page);
    await entrar(page, ATESTADOR, SENHA_PAPEIS);
    ok("4.0 o atestador entra");
    const telaAntes = await irPara(page, hrefFolha);
    conferir(
      "4.1 o painel do atesto diz PENDENTE e manda cadastrar a designação — não repete 'pendente' sem dizer o que fazer",
      telaAntes.includes("certificação (atesto)") && telaAntes.includes("pendente de atesto") && telaAntes.includes("designação") && telaAntes.includes("ato administrativo"),
      telaAntes.slice(0, 700)
    );
    // ⚠️ V6.2 (PROD-015): SEM DESIGNAÇÃO, CERTIFICAR APARECE TRAVADO — sem formulário para enviar —,
    // com o motivo como texto e a providência. A recusa do SERVIDOR para quem não tem designação
    // continua provada em m33-certificacao (4) e (4c, paridade).
    const semDesignacao = await apresentacaoDoAto(page, "certificar");
    conferir(
      "4.2 ⚠️ NEGATIVA CENTRAL: sem designação vigente, CERTIFICAR aparece TRAVADO, sem formulário, dizendo o que falta e quem providencia",
      semDesignacao.estado === "bloqueada" && /designação vigente/i.test(semDesignacao.texto) && /administrador cadastra a designação/i.test(semDesignacao.texto),
      JSON.stringify(semDesignacao)
    );
    // ⚠️ E O CRACHÁ ESTAVA LÁ: sem CERTIFICAR_FOLHA a tela diria "não tem a permissão" e não mostraria
    // motivo de estado nenhum. A trava veio da designação, não da permissão.
    conferir(
      "4.3 e a trava é da DESIGNAÇÃO, não da permissão — o botão existe, focável, com aria-disabled e o motivo associado",
      (await page.evaluate(() => {
        const b = document.querySelector('section[data-acao="certificar"] button');
        const d = b?.getAttribute("aria-describedby") ?? "";
        return b !== null && b.getAttribute("aria-disabled") === "true" && !(b as HTMLButtonElement).disabled && d !== "" && (document.getElementById(d)?.textContent ?? "").length > 20;
      })) && !(await texto(page)).includes("não tem a permissão necessária para certificar"),
      "o botão travado não está acessível, ou a tela disse falta de permissão"
    );
    const atestadorVeLiquidar = (await page.$('form[data-acao="liquidar"]')) !== null;
    conferir("4.4 NEGATIVA: o atestador não vê LIQUIDAR — quem certifica não liquida", !atestadorVeLiquidar, "o formulário de liquidar apareceu para o atestador");

    // ══ 5. O administrador cadastra a DESIGNAÇÃO ══
    await sair(page);
    await entrar(page);
    ok("5.0 o administrador volta");
    await irPara(page, "/folha/designacoes");
    const pessoaOpcao = await opcaoQueCasa(page, 'form[data-acao="criar-designacoes"] select[name="pessoaId"]', documentoDoAtestador.slice(0, 3));
    const contaOpcao = await opcaoQueCasa(page, 'form[data-acao="criar-designacoes"] select[name="usuarioIdentificador"]', ATESTADOR);
    conferir("5.1 o formulário só oferece pessoas com conta vinculada e ATIVA — o atestador está lá", contaOpcao !== null, "a conta do atestador não apareceu entre as opções");
    const rDesignar = await preencherEEnviar(page, "criar-designacoes", [
      { sel: 'select[name="atribuicao"]', valor: "CERTIFICAR_FOLHA", tipo: "select" },
      ...(pessoaOpcao === null ? [] : [{ sel: 'select[name="pessoaId"]', valor: pessoaOpcao.valor, tipo: "select" as const }]),
      ...(contaOpcao === null ? [] : [{ sel: 'select[name="usuarioIdentificador"]', valor: contaOpcao.valor, tipo: "select" as const }]),
      { sel: 'input[name="atoDesignacao"]', valor: ATO },
      { sel: 'input[name="vigenciaInicio"]', valor: `${COMP}-01`, tipo: "data" },
    ]);
    conferir(
      "5.2 designação cadastrada — e a mensagem diz que ela NÃO concede poder sozinha",
      rDesignar.tipo === "ok" && /não concede poder sozinha/i.test(rDesignar.texto),
      `${rDesignar.tipo}: ${rDesignar.texto.slice(0, 260)}`
    );
    const listaDesignacoes = await irPara(page, "/folha/designacoes");
    conferir("5.3 a lista mostra a designação com o ato e a vigência derivada de HOJE", listaDesignacoes.includes(ATO.toLowerCase()) && listaDesignacoes.includes("vigente"), listaDesignacoes.slice(0, 500));

    // ══ 6. O designado CERTIFICA ══
    await sair(page);
    await entrar(page, ATESTADOR, SENHA_PAPEIS);
    await irPara(page, hrefFolha);
    // ⚠️ A SEGUNDA ABA, aberta ANTES do atesto e com o formulário de certificar na tela. Ela é a
    // prova do "registro alterado em outra aba" e da chamada direta, no passo 6.4.
    const abaVelha = await navegador.newPage();
    await abaVelha.setViewport({ width: 1366, height: 900 });
    await irPara(abaVelha, hrefFolha);
    conferir("6.0 designado, CERTIFICAR passa a aparecer como formulário (a mesma tela do passo 4, agora disponível)", (await apresentacaoDoAto(page, "certificar")).estado === "formulario", JSON.stringify(await apresentacaoDoAto(page, "certificar")));
    const rCertificar = await preencherEEnviar(page, "certificar", [{ sel: 'input[name="data"]', valor: ultimoDiaDaCompetencia(COMP), tipo: "data" }]);
    conferir(
      "6.1 o designado CERTIFICA, e a mensagem traz o sha256 do manifesto e o próximo passo",
      rCertificar.tipo === "ok" && /CERTIFICADA/.test(rCertificar.texto) && /sha256/i.test(rCertificar.texto) && /quem certificou não liquida/i.test(rCertificar.texto),
      `${rCertificar.tipo}: ${rCertificar.texto.slice(0, 320)}`
    );
    const telaDepois = await irPara(page, hrefFolha);
    conferir("6.2 o detalhe mostra a certificação DERIVADA e separada da apropriação e da liquidação", telaDepois.includes("certificação (derivada)") && telaDepois.includes("certificada"), telaDepois.slice(0, 800));
    const shaNaTela = await page.evaluate(() => /sha256 do manifesto: ([0-9a-f]{64})/.exec(document.body.innerText)?.[1] ?? "");
    conferir("6.3 o painel do atesto traz o manifesto com o sha256 INTEIRO e o responsável designado", shaNaTela.length === 64 && telaDepois.includes(NOME_ATESTADOR.toLowerCase()) && telaDepois.includes(ATO.toLowerCase()), `sha="${shaNaTela}"`);
    const depoisDoAtesto = await apresentacaoDoAto(page, "certificar");
    conferir("6.4 ⚠️ certificada, CERTIFICAR SAI DA BARRA e aparece como estado ('já está certificada') — sem botão", depoisDoAtesto.estado === "nao-aplicavel" && /já está certificada/i.test(depoisDoAtesto.texto), JSON.stringify(depoisDoAtesto));
    const rAbaVelha = await preencherEEnviar(abaVelha, "certificar", [{ sel: 'input[name="data"]', valor: ultimoDiaDaCompetencia(COMP), tipo: "data" }]);
    conferir("6.5 a ABA VELHA envia o formulário antigo: a porta recusa dizendo que a folha MUDOU em outra aba", rAbaVelha.tipo === "erro" && /REGISTRO-MUDOU/.test(rAbaVelha.texto) && /outra aba/i.test(rAbaVelha.texto), `${rAbaVelha.tipo}: ${rAbaVelha.texto.slice(0, 260)}`);
    // ⚠️ A CHAMADA DIRETA: o MESMO formulário da aba velha, SEM a versão — a forma de um comando que
    // não veio da tela lida. Agora quem responde é o caso de uso, pelo estado, e nada é gravado.
    const retirou = await retirarVersao(abaVelha, "certificar");
    const rDireta = await preencherEEnviar(abaVelha, "certificar", [{ sel: 'input[name="data"]', valor: ultimoDiaDaCompetencia(COMP), tipo: "data" }]);
    conferir("6.6 ⚠️ CHAMADA DIRETA sem versão: o caso de uso recusa FOLHA-JA-CERTIFICADA — a guarda do servidor não depende da tela", retirou && rDireta.tipo === "erro" && /FOLHA-JA-CERTIFICADA/.test(rDireta.texto), `retirou=${String(retirou)} ${rDireta.tipo}: ${rDireta.texto.slice(0, 220)}`);
    const historicoDoAtesto = await irPara(abaVelha, `${hrefFolha}?aba=historico`);
    conferir("6.7 e o histórico tem UMA certificação — as duas tentativas não gravaram nada", (historicoDoAtesto.match(/certificação por/g) ?? []).length === 1, historicoDoAtesto.slice(0, 600));
    await abaVelha.close();

    // ══ 7. O liquidante LIQUIDA ══
    await sair(page);
    await entrar(page, LIQUIDANTE, SENHA_PAPEIS);
    ok("7.0 o liquidante entra");
    const antesDeLiquidar = await irPara(page, hrefFolha);
    const abaDoLiquidante = await navegador.newPage();
    await abaDoLiquidante.setViewport({ width: 1366, height: 900 });
    await irPara(abaDoLiquidante, hrefFolha);
    const liquidarNaTela = await apresentacaoDoAto(page, "liquidar");
    if (empenhosGravados === 0) {
      conferir("7.1 sem empenho, LIQUIDAR aparece TRAVADO dizendo que falta a apropriação — não se reconhece obrigação sem crédito", liquidarNaTela.estado === "bloqueada" && /não tem empenho nenhum/i.test(liquidarNaTela.texto) && /aproprie a folha/i.test(liquidarNaTela.texto), JSON.stringify(liquidarNaTela));
      console.log("      [7.2+ não se aplicam: nenhum empenho nesta competência — o caminho com liquidação está provado em m33-certificacao.test.ts]");
    } else {
      conferir("7.1 o liquidante vê LIQUIDAR como formulário — e NÃO vê certificar", liquidarNaTela.estado === "formulario" && (await apresentacaoDoAto(page, "certificar")).estado !== "formulario", JSON.stringify(liquidarNaTela));
      conferir("7.2 antes do ato, a tabela dos empenhos diz PENDENTE em cada linha", (await page.evaluate(() => document.querySelectorAll('[data-liquidacao="pendente"]').length)) === empenhosGravados, antesDeLiquidar.slice(0, 400));
      const rLiquidar = await preencherEEnviar(page, "liquidar", [{ sel: 'input[name="data"]', valor: ultimoDiaDaCompetencia(COMP), tipo: "data" }]);
      conferir(
        "7.3 a folha CERTIFICADA é liquidada, e a mensagem separa liquidada de PAGA",
        rLiquidar.tipo === "ok" && /liquidação\(ões\)/.test(rLiquidar.texto) && /não é paga/i.test(rLiquidar.texto),
        `${rLiquidar.tipo}: ${rLiquidar.texto.slice(0, 320)}`
      );
      const depoisDeLiquidar = await irPara(page, hrefFolha);
      const liquidadas = await page.evaluate(() => document.querySelectorAll('[data-liquidacao="liquidado"]').length);
      conferir("7.4 cada empenho passa a mostrar a liquidação com a data e o RESPONSÁVEL PELO ATESTO", liquidadas === empenhosGravados && depoisDeLiquidar.includes(`atesto: ${NOME_ATESTADOR.toLowerCase()}`), `${liquidadas} de ${empenhosGravados} linha(s) liquidada(s)`);
      conferir("7.5 e o detalhe mostra a liquidação como dimensão PRÓPRIA, com a ressalva de que liquidada não é paga", depoisDeLiquidar.includes("liquidação (derivada)") && depoisDeLiquidar.includes("liquidada não é paga"), depoisDeLiquidar.slice(0, 900));
      const liquidada = await apresentacaoDoAto(page, "liquidar");
      conferir("7.6 liquidada por inteiro, LIQUIDAR sai da barra e aparece como estado", liquidada.estado === "nao-aplicavel" && /já estão liquidados/i.test(liquidada.texto), JSON.stringify(liquidada));
      const rVelha = await preencherEEnviar(abaDoLiquidante, "liquidar", [{ sel: 'input[name="data"]', valor: ultimoDiaDaCompetencia(COMP), tipo: "data" }]);
      conferir("7.7 a aba aberta ANTES envia: a porta recusa REGISTRO-MUDOU — o envio não chegou a ser executado", rVelha.tipo === "erro" && /REGISTRO-MUDOU/.test(rVelha.texto), `${rVelha.tipo}: ${rVelha.texto.slice(0, 220)}`);
      // ⚠️ A CHAMADA DIRETA: o mesmo formulário SEM a versão. É o caso de uso quem responde, e ele é
      // IDEMPOTENTE — reconhece as liquidações que já existem e não grava nenhuma.
      const retirouV = await retirarVersao(abaDoLiquidante, "liquidar");
      const rDiretaLiq = await preencherEEnviar(abaDoLiquidante, "liquidar", [{ sel: 'input[name="data"]', valor: ultimoDiaDaCompetencia(COMP), tipo: "data" }]);
      conferir(
        "7.8 ⚠️ CHAMADA DIRETA sem versão: o caso de uso NÃO duplica — reconhece as que já existem e grava zero",
        retirouV && rDiretaLiq.tipo === "ok" && /já existiam/.test(rDiretaLiq.texto) && /0 liquidação\(ões\) nova\(s\)/.test(rDiretaLiq.texto),
        `retirou=${String(retirouV)} ${rDiretaLiq.tipo}: ${rDiretaLiq.texto.slice(0, 260)}`
      );
      await irPara(page, hrefFolha);
      const depoisDaSegunda = await page.evaluate(() => document.querySelectorAll('[data-liquidacao="liquidado"]').length);
      conferir("7.9 e a tabela continua do mesmo tamanho — nenhuma liquidação a mais", depoisDaSegunda === liquidadas, `antes ${liquidadas}, depois ${depoisDaSegunda}`);
    }
    await abaDoLiquidante.close();

    // ══ 8. A revogação é fato, e o atesto já praticado continua com lastro ══
    await sair(page);
    await entrar(page);
    await irPara(page, "/folha/designacoes");
    // ⚠️ A DESIGNAÇÃO **DESTA EXECUÇÃO**, achada pelo ATO — e não a primeira da lista. A primeira
    // versão pegava a primeira linha e caía em DESIGNACAO-JA-REVOGADA: era a designação da
    // execução ANTERIOR, já revogada. O defeito era do percurso, e a recusa do produto estava
    // certa — que é exatamente o tipo de falso vermelho que se investiga antes de "corrigir" código.
    const hrefDesignacao = await page.evaluate((ato) => {
      const linha = Array.from(document.querySelectorAll("tbody tr")).find((tr) => (tr.textContent ?? "").includes(ato));
      return (linha?.querySelector('a[href^="/folha/designacoes/"]') as HTMLAnchorElement | null)?.getAttribute("href") ?? "";
    }, ATO);
    if (hrefDesignacao !== "") {
      await irPara(page, hrefDesignacao);
      const rRevogar = await preencherEEnviar(page, "revogar", [
        { sel: 'input[name="dataEfeito"]', valor: `${COMP}-28`, tipo: "data" },
        { sel: 'input[name="motivo"]', valor: "fim da designação do percurso (sintético)" },
      ]);
      conferir("8.1 revogar é FATO: a designação continua no histórico e os atestos praticados sob ela continuam com lastro", rRevogar.tipo === "ok" && /continuam com lastro/i.test(rRevogar.texto), `${rRevogar.tipo}: ${rRevogar.texto.slice(0, 250)}`);
      const detalheDesignacao = await irPara(page, hrefDesignacao);
      conferir("8.2 o detalhe mostra a revogação e a vigência de hoje passa a 'não'", detalheDesignacao.includes("revogada a partir de") && detalheDesignacao.includes("vigente hoje (derivada) não"), detalheDesignacao.slice(0, 600));
    }
    const folhaFinal = await irPara(page, hrefFolha);
    conferir("8.3 e a folha CONTINUA certificada depois da revogação — revogar em maio não apaga o atesto de março", folhaFinal.includes("certificada"), folhaFinal.slice(0, 600));
    conferir("8.4 nenhum identificador de cláusula na tela", !/\bTR\s*\d+\.\d+/.test(await texto(page)), "apareceu rótulo de catálogo");
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
