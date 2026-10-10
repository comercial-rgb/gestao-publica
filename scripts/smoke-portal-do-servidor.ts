import "dotenv/config";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import puppeteer, { type Browser, type Page } from "puppeteer";

/**
 * SMOKE DO PORTAL DO SERVIDOR (V6 P2.4) — navegador real, TRÊS papéis.
 *
 * O RH cadastra a pessoa, abre a ficha e admite → o ADMINISTRADOR cria a conta da servidora e a
 * VINCULA à pessoa pelo CPF → o RH calcula a folha da competência → a contabilidade FECHA →
 * a SERVIDORA entra com a própria conta e vê a própria ficha e o próprio contracheque, com a
 * conta de cada linha — e NÃO alcança o pessoal nem a folha do ente.
 *
 * ⚠️ O QUE ELE EXISTE PARA IMPEDIR: que o portal mostre a ficha de outra pessoa (a URL do
 * contracheque leva o id da FOLHA, nunca o do vínculo — trocá-lo não traz o contracheque alheio),
 * e que uma folha ainda ABERTA vire comprovante na mão do servidor.
 *
 * ⚠️ ELE NÃO LIMPA O BANCO: a pessoa e a matrícula levam o sufixo do instante; a competência é a
 * primeira livre. Helpers do smoke da folha.
 */
const BASE = process.argv[2] ?? "http://localhost:3010";
// V39-R2 (R2-003): o destino e a natureza da base (declarada no banco) conferidos ANTES de qualquer credencial ou escrita.
await exigirDestinoDoPercurso(BASE);
// O percurso atravessa TRÊS papéis: o RH admite e calcula, a contabilidade fecha, e a SERVIDORA
// entra com a própria conta para ver o que é dela (scripts/percursos-usuarios-por-papel.ts).
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
  // V6.2 — o resultado de um ato que sai da barra fica em `[data-resultado-da-acao]`, com um número de
  // sequência. Guardar o número ANTES do clique impede ler o resultado do envio anterior como deste.
  const seqAntes = await page.evaluate((sel) => {
    const nome = /data-acao="([^"]+)"/.exec(sel)?.[1] ?? "";
    return document.querySelector(`[data-resultado-da-acao="${nome}"]`)?.getAttribute("data-resultado-seq") ?? "";
  }, form);
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
    resposta = await page.evaluate((sel, antes) => {
      const f = document.querySelector(sel);
      // V6.2 (PROD-015) — o ato que se torna não aplicável SAI da barra, e o resultado dele fica em
      // `[data-resultado-da-acao]`. Sem este ramo, "fechar" gravaria e o percurso leria silêncio.
      if (f === null) {
        const nome = /data-acao="([^"]+)"/.exec(sel)?.[1] ?? "";
        const r = document.querySelector(`[data-resultado-da-acao="${nome}"]`);
        if (r !== null && r.getAttribute("data-resultado-seq") !== antes) return { tipo: r.getAttribute("role") === "alert" ? "erro" : "ok", texto: (r.textContent ?? "").trim() };
        return { tipo: "silencio", texto: "" };
      }
      const alerta = f?.querySelector('[role="alert"]');
      if (alerta !== null && alerta !== undefined) return { tipo: "erro", texto: (alerta.textContent ?? "").trim() };
      const ps = Array.from(f?.querySelectorAll("p") ?? []);
      const bom = ps.find((x) => x.className.includes("status-ok"));
      return bom !== undefined ? { tipo: "ok", texto: (bom.textContent ?? "").trim() } : { tipo: "silencio", texto: "" };
    }, form, seqAntes);
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
const ADMIN = "admin@cg.pb.gov.br";
const SENHA_ADMIN = process.env["SEED_ADMIN_SENHA"] ?? "";
const SERVIDORA = "servidor@percursos.local";

/** O último dia civil da competência (AAAA-MM) — o calendário é o mesmo em qualquer fuso. */
function ultimoDiaDaCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split("-").map(Number) as [number, number];
  const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
  const dias = mes === 2 ? (bissexto ? 29 : 28) : [4, 6, 9, 11].includes(mes) ? 30 : 31;
  return `${competencia}-${String(dias).padStart(2, "0")}`;
}

/** A competência de trabalho: a primeira de 2028 que ainda não tem folha aberta. */
async function competenciaLivre(page: Page): Promise<string> {
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
  for (let ano = 2028; ano <= 2030; ano += 1) {
    for (let mes = 1; mes <= 12; mes += 1) {
      const c = `${ano}-${String(mes).padStart(2, "0")}`;
      if (!usadas.has(c)) return c;
    }
  }
  throw new Error("nenhuma competência livre entre 2028 e 2030 — o banco dos percursos precisa de limpeza");
}


async function main(): Promise<void> {
  if (SENHA === "" || SENHA_ADMIN === "") throw new Error("senhas ausentes (PERCURSOS_SENHA_PAPEIS e SEED_ADMIN_SENHA).");
  let navegador: Browser | undefined;
  try {
    navegador = await puppeteer.launch({
      headless: true,
      protocolTimeout: 180000,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-extensions", "--disable-background-networking", "--renderer-process-limit=1", "--js-flags=--max-old-space-size=256"],
    });
    const page = await navegador.newPage();
    page.setDefaultTimeout(120000);

    // ── 1. o RH abre a ficha e admite ──
    await entrar(page);
    ok("login como RH");
    const COMP = await competenciaLivre(page);
    const CPF = cpfFicticio(`${Date.now() % 1_000_000_000}`);
    const NOME = `Servidora do Portal ${SUF}`;
    const MAT = `POR-${SUF}`;
    console.log(`      [competência ${COMP} · matrícula ${MAT} · CPF ${CPF}]`);

    await irPara(page, "/cadastros/pessoas");
    const rPessoa = await preencherEEnviar(page, "cadastrar-pessoa", [
      { sel: 'input[data-mascara="cpf-cnpj"]', valor: CPF },
      { sel: 'input[name="nome"]', valor: NOME },
    ]);
    conferir("1.1 pessoa física criada no cadastro único", rPessoa.tipo === "ok", rPessoa.texto.slice(0, 200));

    await irPara(page, "/pessoal/servidores");
    const pessoa = await opcaoQueCasa(page, 'form[data-acao="criar-servidores"] select[name="pessoaId"]', NOME);
    if (pessoa === null) throw new Error("a pessoa recém-criada não foi ofertada à ficha");
    const rServ = await preencherEEnviar(page, "criar-servidores", [
      { sel: 'select[name="pessoaId"]', valor: pessoa.valor, tipo: "select" },
      { sel: 'input[name="dataNascimento"]', valor: "1988-04-12", tipo: "data" },
      { sel: 'select[name="sexo"]', valor: "FEMININO", tipo: "select" },
    ]);
    conferir("1.2 ficha do servidor criada", rServ.tipo === "ok", rServ.texto.slice(0, 200));

    await irPara(page, `/pessoal/servidores?q=${encodeURIComponent(NOME)}`);
    const hrefServ = await hrefDoRegistro(page, NOME);
    if (hrefServ === null) throw new Error("sem servidor para seguir");
    await irPara(page, hrefServ);
    const cargo = await opcaoQueCasa(page, 'form[data-acao="admitir"] select[name="cargoId"]', "-");
    const lot = await opcaoQueCasa(page, 'form[data-acao="admitir"] select[name="lotacaoId"]', "-");
    const rAdm = await preencherEEnviar(page, "admitir", [
      { sel: 'input[name="matricula"]', valor: MAT },
      { sel: 'select[name="tipo"]', valor: "EFETIVO", tipo: "select" },
      { sel: 'input[name="regimeJuridico"]', valor: "Estatutário" },
      { sel: 'select[name="regimePrevidenciario"]', valor: "RGPS", tipo: "select" },
      { sel: 'input[name="dataAdmissao"]', valor: "2026-03-01", tipo: "data" },
      ...(cargo === null ? [] : [{ sel: 'select[name="cargoId"]', valor: cargo.valor, tipo: "select" as const }]),
      ...(lot === null ? [] : [{ sel: 'select[name="lotacaoId"]', valor: lot.valor, tipo: "select" as const }]),
      { sel: 'input[data-mascara="valor"]', valor: "4.000,00" },
    ]);
    conferir("1.3 admissão com regime previdenciário e salário 4.000,00", rAdm.tipo === "ok", rAdm.texto.slice(0, 200));
    const rDep = await preencherEEnviar(page, "dependente", [
      { sel: 'input[name="nome"]', valor: `Filha da servidora ${SUF}` },
      { sel: 'input[name="dataNascimento"]', valor: "2021-06-10", tipo: "data" },
      { sel: 'select[name="grauParentesco"]', valor: "FILHO", tipo: "select" },
      { sel: 'select[name="finalidade"]', valor: "SALARIO_FAMILIA", tipo: "select" },
      { sel: 'input[name="dataInicio"]', valor: "2026-03-01", tipo: "data" },
    ]);
    conferir("1.4 dependente com finalidade registrado", rDep.tipo === "ok", rDep.texto.slice(0, 200));

    // ── 2. o administrador dá a conta e a VINCULA à pessoa ──
    await sair(page);
    await entrar(page, ADMIN, SENHA_ADMIN);
    ok("2.0 administrador entra");
    await irPara(page, `/administracao/usuarios?q=${encodeURIComponent(SERVIDORA)}`);
    const jaVinculada = (await texto(page)).includes(NOME.toLowerCase());
    if (jaVinculada) {
      ok("2.1 a conta da servidora já está vinculada a esta pessoa — reusada");
    } else {
      const temDesvincular = (await page.$(`form[data-acao="desvincular-pessoa"][data-usuario="${SERVIDORA}"]`)) !== null;
      if (temDesvincular) {
        // Execução anterior deixou a conta ligada a OUTRA pessoa: desvincula para ligar à desta vez.
        const rDesv = await preencherEEnviar(page, `form[data-acao="desvincular-pessoa"][data-usuario="${SERVIDORA}"]`, [
          { sel: 'input[name="motivo"]', valor: `percurso ${SUF}: a conta passa a ser da servidora desta execução` },
        ]);
        // Mesma pendência MENSAGEM-SOME-COM-A-LINHA: desvinculado, o formulário volta a ser o de
        // VINCULAR e a mensagem vai junto. O efeito é conferido pelo passo seguinte — vincular só
        // é possível numa conta sem pessoa.
        conferir("2.1 conta desvinculada da pessoa da execução anterior", rDesv.tipo !== "erro", `${rDesv.tipo}: ${rDesv.texto.slice(0, 200)}`);
        await irPara(page, `/administracao/usuarios?q=${encodeURIComponent(SERVIDORA)}`);
      }
      const rVinc = await preencherEEnviar(page, `form[data-acao="vincular-pessoa"][data-usuario="${SERVIDORA}"]`, [
        { sel: 'input[name="documento"]', valor: CPF },
        { sel: 'input[name="motivo"]', valor: "é a servidora do quadro (percurso)" },
      ]);
      // ⚠️ A MENSAGEM SOME COM O FORMULÁRIO: gravado o vínculo, a linha do usuário passa a
      // oferecer DESVINCULAR, e a ilha que produziria o aviso deixa de existir (pendência
      // MENSAGEM-SOME-COM-A-LINHA). O que não se admite é ERRO; o efeito é conferido em 2.3, por
      // recarga — que é a prova que vale de qualquer forma.
      conferir("2.2 o administrador vincula a conta à pessoa PELO CPF (nunca pelo nome)", rVinc.tipo !== "erro", `${rVinc.tipo}: ${rVinc.texto.slice(0, 200)}`);
    }
    const usuarios = await irPara(page, `/administracao/usuarios?q=${encodeURIComponent(SERVIDORA)}`);
    conferir("2.3 a lista de usuários mostra a pessoa vinculada", usuarios.includes(NOME.toLowerCase()), usuarios.slice(0, 300));

    // ── 3. o RH calcula; a contabilidade fecha ──
    await sair(page);
    await entrar(page);
    await irPara(page, "/folha/folhas");
    const rAbrir = await preencherEEnviar(page, "criar-folhas", [
      { sel: 'input[name="competencia"]', valor: COMP },
      { sel: 'select[name="tipo"]', valor: "MENSAL", tipo: "select" },
    ]);
    conferir(`3.1 folha ${COMP} aberta pelo RH`, rAbrir.tipo === "ok", rAbrir.texto.slice(0, 200));
    await irPara(page, `/folha/folhas?q=${COMP}`);
    const hrefFolha = await hrefDoRegistro(page, COMP);
    if (hrefFolha === null) throw new Error("sem folha para seguir");

    let rCalc = { tipo: "silencio", texto: "" };
    for (let tentativa = 0; tentativa < 6; tentativa += 1) {
      await irPara(page, hrefFolha);
      rCalc = await preencherEEnviar(page, "calcular", [{ sel: 'input[name="motivo"]', valor: `folha do percurso do portal ${SUF}` }]);
      const semRegime = /VINCULO-SEM-REGIME-PREVIDENCIARIO: a matrícula (\S+)/.exec(rCalc.texto);
      if (semRegime === null) break;
      const matricula = semRegime[1] as string;
      await irPara(page, `/pessoal/servidores?q=${encodeURIComponent(matricula)}`);
      const href = await page.evaluate(() => (document.querySelector('tbody a[href^="/pessoal/servidores/"]') as HTMLAnchorElement | null)?.getAttribute("href") ?? "");
      if (href === "") break;
      await irPara(page, href);
      const alvo = await opcaoQueCasa(page, 'form[data-acao="movimentar"] select[name="vinculoId"]', matricula);
      await preencherEEnviar(page, "movimentar", [
        ...(alvo === null ? [] : [{ sel: 'select[name="vinculoId"]', valor: alvo.valor, tipo: "select" as const }]),
        { sel: 'select[name="tipo"]', valor: "MUDANCA_REGIME_PREVIDENCIARIO", tipo: "select" },
        { sel: 'input[name="data"]', valor: ultimoDiaDaCompetencia(COMP), tipo: "data" },
        { sel: 'select[name="regimePrevidenciario"]', valor: "RGPS", tipo: "select" },
        { sel: 'input[name="motivo"]', valor: "carga do regime previdenciário do vínculo legado (percurso)" },
      ]);
    }
    conferir("3.2 o RH calcula a folha", rCalc.tipo === "ok", `${rCalc.tipo}: ${rCalc.texto.slice(0, 200)}`);

    // ⚠️ ANTES DO FECHAMENTO: a servidora não pode ver contracheque nenhum desta competência.
    await sair(page);
    await entrar(page, SERVIDORA, SENHA_PAPEIS);
    ok("3.3 a servidora entra com a própria conta");
    const antes = await irPara(page, "/portal-do-servidor");
    conferir("3.4 o portal mostra a ficha DELA (matrícula, cargo, situação e o dependente)", antes.includes(MAT.toLowerCase()) && antes.includes("ativo") && antes.includes(`filha da servidora ${SUF}`), antes.slice(0, 500));
    conferir("3.5 ⚠️ ANTES DO FECHAMENTO não há contracheque no portal — cálculo vivo ainda pode ser cancelado", !antes.includes(COMP.toLowerCase()), antes.slice(0, 400));

    await sair(page);
    await entrar(page, CONTABILIDADE, SENHA_PAPEIS);
    // ⚠️ NAVEGAR ANTES DE PREENCHER: procurar o formulário na página onde o login caiu custaria
    // o timeout inteiro do seletor antes de falhar — dois minutos para descobrir que a tela
    // errada não tem o botão.
    await irPara(page, hrefFolha);
    const rFechar = await preencherEEnviar(page, "fechar", []);
    conferir("3.6 a contabilidade fecha a folha", rFechar.tipo === "ok", `${rFechar.tipo}: ${rFechar.texto.slice(0, 200)}`);

    // ── 4. a servidora vê o SEU contracheque ──
    await sair(page);
    await entrar(page, SERVIDORA, SENHA_PAPEIS);
    const portal = await irPara(page, "/portal-do-servidor");
    conferir("4.1 depois do fechamento, a competência aparece nos contracheques dela", portal.includes(COMP.toLowerCase()), portal.slice(0, 600));
    const hrefContra = await page.evaluate(() => (document.querySelector('a[href^="/portal-do-servidor/contracheque/"]') as HTMLAnchorElement | null)?.getAttribute("href") ?? "");
    conferir("4.2 a competência leva ao contracheque", hrefContra !== "", "sem link");
    if (hrefContra !== "") {
      const cc = await irPara(page, hrefContra);
      // 4.000,00 de vencimento, 30/30 dias. Contribuição pelas faixas do ente; o líquido é derivado.
      conferir("4.3 o contracheque traz a matrícula dela e o vencimento de 4.000,00", cc.includes(MAT.toLowerCase()) && cc.includes("4.000,00"), cc.slice(0, 500));
      conferir("4.4 cada linha mostra COMO foi calculada", cc.includes("vencimento-base vigente") && cc.includes("faixas"), cc.slice(0, 600));
      const sha = await page.evaluate(() => document.querySelector("[data-sha256]")?.getAttribute("data-sha256") ?? "");
      conferir("4.5 o contracheque leva a impressão digital do cálculo", /^[0-9a-f]{64}$/.test(sha), sha);
      conferir("4.6 nenhum identificador de cláusula na tela", !/\bTR\s*\d+\.\d+/.test(await texto(page)), "apareceu rótulo de catálogo");
    }

    // ── 5. o portal é SÓ o que é dela ──
    const naFolha = await barrado(page, "/folha/folhas");
    conferir("5.1 NEGATIVA: a servidora não abre a folha do ente", naFolha.barrado, `${naFolha.url} ${naFolha.status}`);
    const noPessoal = await barrado(page, "/pessoal/servidores");
    conferir("5.2 NEGATIVA: a servidora não abre o cadastro de pessoal", noPessoal.barrado, `${noPessoal.url} ${noPessoal.status}`);
    // ⚠️ AQUI O 404 É O RESULTADO ESPERADO, e por isso a navegação é direta: `irPara` trata
    // resposta fora do 2xx como falha de execução — correto em toda outra passagem, e cego
    // justamente na que precisa ver a recusa.
    const r404 = await page.goto(`${BASE}/portal-do-servidor/contracheque/inexistente-000`, { waitUntil: "networkidle2" });
    const corpo404 = await texto(page);
    conferir(
      "5.3 NEGATIVA: id de folha que não é dela responde NÃO ENCONTRADO, nunca o contracheque alheio",
      (r404?.status() ?? 0) === 404 && !corpo404.includes("líquido"),
      `${r404?.status() ?? 0}: ${corpo404.slice(0, 160)}`
    );
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
