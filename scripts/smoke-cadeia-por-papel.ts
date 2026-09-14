import "dotenv/config";
import puppeteer, { type Browser, type Page } from "puppeteer";

/**
 * SMOKE DA CADEIA POR PAPEL (V6 P1.3) — navegador real, QUATRO usuários, nenhum admin nos passos.
 *
 *   COMPRAS       solicita (duas linhas) → autoriza → forma a ordem PARCIAL a partir da solicitação;
 *                 negativa: não abre a despesa (sem CONSULTAR_DESPESA).
 *   ALMOXARIFADO  registra e confere o documento fiscal da ordem → recebe parte;
 *                 negativa: não forma ordem (sem EMITIR_ORDEM_DE_COMPRA — a tela diz).
 *   CONTABILIDADE empenha o credor da ordem → liquida apontando o documento conferido;
 *                 negativa: não abre o financeiro.
 *   TESOURARIA    paga pela conta declarada → a conciliação da conta mostra o pagamento como
 *                 pendência do razão; negativa: não abre as compras.
 *
 * Os usuários vêm de `scripts/percursos-usuarios-por-papel.ts` (senha `PERCURSOS_SENHA_PAPEIS`). O
 * admin entra UMA vez, só para garantir o segundo material do banco. Helpers do smoke das compras.
 * ⚠️ Não limpa o banco: números levam o sufixo do instante.
 */
const BASE = process.argv[2] ?? "http://localhost:3010";
const USUARIO = process.argv[3] ?? "admin@cg.pb.gov.br";
const SENHA = process.argv[4] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
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
  readonly tipo?: "select" | "data";
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



const SENHA_PAPEIS = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";
const COMPRAS = "compras@percursos.local";
const ALMOX = "almoxarifado@percursos.local";
const CONTAB = "contabilidade@percursos.local";
const TESOUR = "tesouraria@percursos.local";
const EXERCICIO = String(new Date().getFullYear());
const NE = `${EXERCICIO}NE${SUF}`;
const NL = `${EXERCICIO}NL${SUF}`;
const NP = `${EXERCICIO}NP${SUF}`;

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
async function entrarComo(page: Page, usuario: string, senha: string): Promise<void> {
  if (!page.url().includes("/login")) await sair(page);
  await entrar(page, usuario, senha);
}
async function segundaOpcao(page: Page, seletor: string): Promise<{ readonly valor: string; readonly rotulo: string } | null> {
  return page.evaluate((sel) => {
    const s = document.querySelector(sel);
    if (!(s instanceof HTMLSelectElement)) return null;
    const uteis = Array.from(s.options).filter((o) => o.value !== "" && !o.disabled);
    const o = uteis[1] ?? uteis[0];
    return o === undefined ? null : { valor: o.value, rotulo: (o.textContent ?? "").trim() };
  }, seletor);
}
/**
 * Abre a rota e diz se o servidor barrou — a NEGATIVA de um papel. Duas formas legítimas: o
 * redirecionamento para /sem-acesso (telas do ente) e o ESTADO da tela com a recusa nomeada
 * (as telas recortadas por unidade, como a despesa, respondem 200 e dizem "ACESSO NEGADO").
 */
async function barrado(page: Page, rota: string): Promise<{ readonly barrado: boolean; readonly url: string; readonly status: number }> {
  const r = await page.goto(`${BASE}${rota}`, { waitUntil: "networkidle2" });
  const url = page.url();
  const corpo = await texto(page);
  const recusaNaTela = /acesso negado|não tem a ação|sem acesso/.test(corpo);
  return { barrado: url.includes("/sem-acesso") || url.includes("/login") || recusaNaTela, url, status: r?.status() ?? 0 };
}

async function main(): Promise<void> {
  if (SENHA === "") throw new Error("SEED_ADMIN_SENHA ausente.");
  let navegador: Browser | undefined;
  try {
    navegador = await puppeteer.launch({
      headless: true,
      protocolTimeout: 180000,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-extensions", "--disable-background-networking", "--renderer-process-limit=1", "--js-flags=--max-old-space-size=256"],
    });
    const page = await navegador.newPage();
    page.setDefaultTimeout(120000);

    // ── 0. o admin garante o SEGUNDO material (só isso) ──
    await entrar(page);
    await irPara(page, "/licitacoes/solicitacoes");
    const mat1 = await primeiraOpcao(page, 'form[data-acao="criar-solicitacao"] select[name="itens.0.materialId"]');
    let mat2 = await segundaOpcao(page, 'form[data-acao="criar-solicitacao"] select[name="itens.0.materialId"]');
    if (mat1 !== null && mat2 !== null && mat2.valor === mat1.valor) {
      await irPara(page, "/patrimonio/almoxarifado/materiais");
      const grupo = await primeiraOpcao(page, 'form[data-acao="criar-materiais"] select[name="grupoId"]');
      const classe = await primeiraOpcao(page, 'form[data-acao="criar-materiais"] select[name="classeDeMaterialId"]');
      const unidade = await primeiraOpcao(page, 'form[data-acao="criar-materiais"] select[name="unidadeDeMedidaId"]');
      await preencherEEnviar(page, "criar-materiais", [
        { sel: 'input[name="codigo"]', valor: `MAT-P-${SUF}` },
        { sel: 'input[name="descricaoSucinta"]', valor: `Toner do percurso por papel ${SUF}` },
        { sel: 'textarea[name="descricaoDetalhada"]', valor: "Cartucho de toner preto (percurso por papel)." },
        ...(grupo === null ? [] : [{ sel: 'select[name="grupoId"]', valor: grupo.valor, tipo: "select" as const }]),
        ...(classe === null ? [] : [{ sel: 'select[name="classeDeMaterialId"]', valor: classe.valor, tipo: "select" as const }]),
        { sel: 'select[name="classificacao"]', valor: "CONSUMO", tipo: "select" },
        { sel: 'select[name="categoria"]', valor: "ESTOCAVEL", tipo: "select" },
        ...(unidade === null ? [] : [{ sel: 'select[name="unidadeDeMedidaId"]', valor: unidade.valor, tipo: "select" as const }]),
      ]);
      await irPara(page, "/licitacoes/solicitacoes");
      mat2 = await opcaoQueCasa(page, 'form[data-acao="criar-solicitacao"] select[name="itens.0.materialId"]', `MAT-P-${SUF}`);
    }
    if (mat1 === null || mat2 === null) throw new Error("sem dois materiais para a solicitação");
    ok("0. o admin só garantiu o segundo material; sai");

    // ── 1. COMPRAS ──
    await entrarComo(page, COMPRAS, SENHA_PAPEIS);
    ok("1.0 COMPRAS entra");
    await irPara(page, "/licitacoes/solicitacoes");
    const setor = await primeiraOpcao(page, 'form[data-acao="criar-solicitacao"] select[name="setorId"]');
    if (setor === null) throw new Error("sem setor");
    await page.click('form[data-acao="criar-solicitacao"] button[data-acao="mais-um-item"]');
    await page.waitForSelector('form[data-acao="criar-solicitacao"] select[name="itens.1.materialId"]', { timeout: 10000 });
    const rSol = await preencherEEnviar(page, "criar-solicitacao", [
      { sel: 'input[name="numero"]', valor: `SC-P-${SUF}` },
      { sel: 'select[name="setorId"]', valor: setor.valor, tipo: "select" },
      { sel: 'input[name="data"]', valor: "2026-05-04", tipo: "data" },
      { sel: 'input[name="solicitante"]', valor: "Servidor de Compras (percurso)" },
      { sel: 'textarea[name="justificativa"]', valor: "Cadeia por papel: material de expediente com duas linhas" },
      { sel: 'select[name="itens.0.materialId"]', valor: mat1.valor, tipo: "select" },
      { sel: 'input[name="itens.0.quantidade"]', valor: "10" },
      { sel: 'select[name="itens.1.materialId"]', valor: mat2.valor, tipo: "select" },
      { sel: 'input[name="itens.1.quantidade"]', valor: "4" },
    ]);
    conferir("1.1 COMPRAS registra a solicitação com 2 itens", rSol.tipo === "ok", rSol.texto);
    await irPara(page, `/licitacoes/solicitacoes?q=SC-P-${SUF}`);
    const hrefSol = await hrefDoRegistro(page, `SC-P-${SUF}`);
    if (hrefSol === null) throw new Error("sem solicitação");
    await irPara(page, hrefSol);
    const rAut = await preencherEEnviar(page, "autorizar", [
      { sel: 'input[name="data"]', valor: "2026-05-05", tipo: "data" },
      { sel: 'input[name="motivo"]', valor: "Autorizada (percurso por papel)" },
    ]);
    conferir("1.2 COMPRAS autoriza", rAut.tipo === "ok", rAut.texto);
    await irPara(page, hrefSol);
    const fornecedor = await primeiraOpcao(page, 'form[data-acao="formar-ordem"] select[name="fornecedorId"]');
    if (fornecedor === null) throw new Error("sem fornecedor");
    const rFormar = await preencherEEnviar(page, "formar-ordem", [
      { sel: 'input[name="numero"]', valor: `OC-P-${SUF}` },
      { sel: 'select[name="fornecedorId"]', valor: fornecedor.valor, tipo: "select" },
      { sel: 'input[name="dataEmissao"]', valor: "2026-05-10", tipo: "data" },
      { sel: 'textarea[name="finalidade"]', valor: `Atende parte da SC-P-${SUF} (percurso por papel)` },
      { sel: 'input[name="itens.0.quantidade"]', valor: "6" },
      { sel: 'input[name="itens.0.valorUnitario"]', valor: "11,00" },
      { sel: 'input[name="itens.1.quantidade"]', valor: "4" },
      { sel: 'input[name="itens.1.valorUnitario"]', valor: "90,00" },
    ]);
    conferir("1.3 COMPRAS forma a ordem PARCIAL (6 de 10 e 4 de 4) a partir da solicitação", rFormar.tipo === "ok", rFormar.texto.slice(0, 200));
    const hrefOrdem = await page.evaluate(() => document.querySelector("[data-ordem-gerada]")?.getAttribute("href") ?? null);
    if (hrefOrdem === null) throw new Error("sem ordem gerada");
    const pend = await (async () => { await irPara(page, hrefSol); return page.evaluate(() => Array.from(document.querySelectorAll("[data-atendimento] [data-pendente]")).map((e) => (e.textContent ?? "").trim())); })();
    conferir("1.4 o atendimento diz 4 pendente no item 1 e 0 no item 2", pend.join(",") === "4.0000,0.0000", pend.join(","));
    const negCompras = await barrado(page, `/despesa/empenhos?exercicio=${EXERCICIO}`);
    conferir("1.5 NEGATIVA: COMPRAS não abre a despesa (sem CONSULTAR_DESPESA)", negCompras.barrado, `${negCompras.url} ${negCompras.status}`);

    // ── 2. ALMOXARIFADO ──
    await entrarComo(page, ALMOX, SENHA_PAPEIS);
    ok("2.0 ALMOXARIFADO entra");
    const detSolAlmox = await irPara(page, hrefSol);
    conferir("2.1 NEGATIVA: ALMOXARIFADO vê a solicitação mas a tela diz que ele não forma ordem", detSolAlmox.includes("não tem a permissão emitir_ordem_de_compra") && (await page.$('form[data-acao="formar-ordem"]')) === null, detSolAlmox.slice(0, 300));
    await irPara(page, "/licitacoes/documentos-fiscais");
    const emitente = await opcaoQueCasa(page, 'form[data-acao="registrar-documento-fiscal"] select[name="emitenteId"]', fornecedor.rotulo.split(" (")[0] ?? "");
    const ordemDf = await opcaoQueCasa(page, 'form[data-acao="registrar-documento-fiscal"] select[name="ordemId"]', `OC-P-${SUF}`);
    conferir("2.2 a ilha do documento fiscal oferece o emitente da ordem e a ordem", emitente !== null && ordemDf !== null, `emitente=${emitente?.rotulo ?? "-"} ordem=${ordemDf?.rotulo ?? "-"}`);
    const rDoc = await preencherEEnviar(page, "registrar-documento-fiscal", [
      ...(emitente === null ? [] : [{ sel: 'select[name="emitenteId"]', valor: emitente.valor, tipo: "select" as const }]),
      { sel: 'input[name="serie"]', valor: "1" },
      { sel: 'input[name="numero"]', valor: `DF-P-${SUF}` },
      { sel: 'input[name="dataEmissao"]', valor: "2026-05-11", tipo: "data" },
      { sel: 'input[name="dataRecebimento"]', valor: "2026-05-12", tipo: "data" },
      ...(ordemDf === null ? [] : [{ sel: 'select[name="ordemId"]', valor: ordemDf.valor, tipo: "select" as const }]),
      { sel: 'input[data-mascara="valor"]', valor: "426,00", indice: 0 },
      { sel: 'input[data-mascara="valor"]', valor: "426,00", indice: 3 },
      { sel: 'input[name="itens.0.descricao"]', valor: "Papel A4" },
      { sel: 'input[name="itens.0.unidade"]', valor: "UN" },
      { sel: 'input[name="itens.0.quantidade"]', valor: "6" },
      { sel: 'input[data-mascara="valor"]', valor: "11,00", indice: 4 },
      { sel: 'input[data-mascara="valor"]', valor: "66,00", indice: 5 },
      { sel: 'input[name="itens.1.descricao"]', valor: "Toner" },
      { sel: 'input[name="itens.1.unidade"]', valor: "UN" },
      { sel: 'input[name="itens.1.quantidade"]', valor: "4" },
      { sel: 'input[data-mascara="valor"]', valor: "90,00", indice: 6 },
      { sel: 'input[data-mascara="valor"]', valor: "360,00", indice: 7 },
    ]);
    conferir("2.3 ALMOXARIFADO registra o documento fiscal da ordem (426,00, 2 itens)", rDoc.tipo === "ok", rDoc.texto.slice(0, 200));
    await irPara(page, `/licitacoes/documentos-fiscais?q=DF-P-${SUF}`);
    const hrefDoc = await hrefDoRegistro(page, `DF-P-${SUF}`);
    if (hrefDoc === null) throw new Error("sem documento fiscal");
    await irPara(page, hrefDoc);
    const rConf = await preencherEEnviar(page, "conferir", [
      { sel: 'input[name="data"]', valor: "2026-05-13", tipo: "data" },
      { sel: 'input[name="motivo"]', valor: "Conferido com a ordem (percurso por papel)" },
    ]);
    conferir("2.4 ALMOXARIFADO confere o documento", rConf.tipo === "ok", rConf.texto.slice(0, 200));
    await irPara(page, hrefOrdem);
    const itemA = await primeiraOpcao(page, 'form[data-acao="receber-ordem"] select[name="itens.0.itemDeOrdemId"]');
    const docRec = await opcaoQueCasa(page, 'form[data-acao="receber-ordem"] select[name="documentoFiscalId"]', `DF-P-${SUF}`);
    const rRec = await preencherEEnviar(page, "receber-ordem", [
      { sel: 'input[name="data"]', valor: "2026-05-14", tipo: "data" },
      { sel: 'input[name="responsavelRecebimento"]', valor: "Almoxarife (percurso por papel)" },
      ...(docRec === null ? [] : [{ sel: 'select[name="documentoFiscalId"]', valor: docRec.valor, tipo: "select" as const }]),
      ...(itemA === null ? [] : [{ sel: 'select[name="itens.0.itemDeOrdemId"]', valor: itemA.valor, tipo: "select" as const }]),
      { sel: 'input[name="itens.0.quantidade"]', valor: "3" },
    ]);
    conferir("2.5 ALMOXARIFADO recebe parte (3) apontando o documento conferido", rRec.tipo === "ok", rRec.texto.slice(0, 200));

    // ── 3. CONTABILIDADE ──
    await entrarComo(page, CONTAB, SENHA_PAPEIS);
    ok("3.0 CONTABILIDADE entra");
    const negContab = await barrado(page, "/financeiro/conciliacao/periodo");
    conferir("3.1 NEGATIVA: CONTABILIDADE não abre o financeiro (sem CONSULTAR_FINANCEIRO)", negContab.barrado, `${negContab.url} ${negContab.status}`);
    await irPara(page, `/despesa/empenhos?exercicio=${EXERCICIO}`);
    // ⚠️ A FICHA TEM DE SER DA NATUREZA CERTA, e não só "a que tem mais saldo". Quando o banco dos
    // percursos ganhou a ficha de PESSOAL (319011, para a folha), ela passou a ser a de maior
    // saldo — e a liquidação caiu com "SEM ROTEIRO PARA O ELEMENTO 11", corretamente: não se
    // compra serviço de terceiro em ficha de vencimentos. O percurso escolhe entre as que TÊM
    // roteiro de liquidação (elemento 39 — outros serviços de terceiros), que é o que esta cadeia
    // de COMPRA exercita.
    const ficha = await page.evaluate(() => {
      const s = document.querySelector('form[data-acao="empenhar"] select[name="fichaId"]');
      if (!(s instanceof HTMLSelectElement)) return null;
      let melhor: { valor: string; saldo: number } | null = null;
      for (const o of Array.from(s.options)) {
        if (o.value === "" || o.disabled) continue;
        const rotulo = (o.textContent ?? "").trim();
        if (!/\b3\d9039\b|\b339039\b/.test(rotulo)) continue;
        const m = /disponível\s+(-?[\d]+\.\d{2})\s*$/.exec(rotulo);
        const saldo = m === null ? 0 : Number(m[1]);
        if (melhor === null || saldo > melhor.saldo) melhor = { valor: o.value, saldo };
      }
      return melhor?.valor ?? null;
    });
    if (ficha === null) throw new Error("sem ficha de serviços de terceiros (339039) com saldo — esta cadeia é de COMPRA");
    // O rótulo é "Nome (documento formatado)": os dígitos do CREDOR são os do parêntese, não os do nome.
    const credorDigitos = ((/\(([^)]*)\)\s*$/.exec(fornecedor.rotulo)?.[1] ?? fornecedor.rotulo).match(/\d/g) ?? []).join("");
    // ⚠️ A ordem formada NÃO tem ficha (o banco dos percursos só tem fichas 339039 e os materiais
    // são de consumo): o empenho é DIRETO ao credor da ordem — o vínculo ordem→empenho fica provado
    // pelos testes do M11 (pendência FICHA-DE-MATERIAL-NOS-PERCURSOS).
    const rEmp = await preencherEEnviar(page, "empenhar", [
      { sel: 'select[name="fichaId"]', valor: ficha, tipo: "select" },
      { sel: 'input[name="numero"]', valor: NE },
      { sel: '[data-mascara="cpf-cnpj"]', valor: credorDigitos },
      { sel: '[data-mascara="valor"]', valor: "426,00" },
      { sel: 'input[name="data"]', valor: "2026-05-15", tipo: "data" },
      { sel: 'select[name="categoria"]', valor: "PRESTACAO_SERVICOS", tipo: "select" },
      { sel: 'input[name="historico"]', valor: `empenho do credor da OC-P-${SUF} (percurso por papel)` },
    ]);
    conferir("3.2 CONTABILIDADE empenha o credor da ordem", rEmp.tipo === "ok" || (await texto(page)).includes(NE.toLowerCase()), rEmp.texto.slice(0, 200));
    await irPara(page, `/despesa/liquidacoes?exercicio=${EXERCICIO}`);
    const empLiq = await opcaoQueCasa(page, 'form[data-acao="liquidar"] select[name="empenhoId"]', NE);
    if (empLiq === null) throw new Error("o empenho não está no seletor da liquidação");
    await page.select('form[data-acao="liquidar"] select[name="empenhoId"]', empLiq.valor);
    await new Promise((r) => setTimeout(r, 500));
    const docLiq = await opcaoQueCasa(page, 'form[data-acao="liquidar"] select[name="documentoFiscalId"]', `DF-P-${SUF}`);
    conferir("3.3 a liquidação oferece o documento fiscal CONFERIDO do mesmo credor", docLiq !== null, "documento não ofertado");
    const rLiq = await preencherEEnviar(page, "liquidar", [
      { sel: 'select[name="empenhoId"]', valor: empLiq.valor, tipo: "select" },
      { sel: 'input[name="numero"]', valor: NL },
      { sel: '[data-mascara="valor"]', valor: "426,00" },
      { sel: 'input[name="data"]', valor: "2026-05-16", tipo: "data" },
      { sel: 'input[name="atesto"]', valor: "Contador (percurso por papel)" },
      ...(docLiq === null ? [] : [{ sel: 'select[name="documentoFiscalId"]', valor: docLiq.valor, tipo: "select" as const }]),
      { sel: 'input[name="historico"]', valor: `liquidação da DF-P-${SUF}` },
    ]);
    conferir("3.4 CONTABILIDADE liquida apontando o documento", rLiq.tipo === "ok" || (await texto(page)).includes(NL.toLowerCase()), rLiq.texto.slice(0, 200));

    // ── 4. TESOURARIA ──
    await entrarComo(page, TESOUR, SENHA_PAPEIS);
    ok("4.0 TESOURARIA entra");
    const negTes = await barrado(page, "/licitacoes/solicitacoes");
    conferir("4.1 NEGATIVA: TESOURARIA não abre as compras (sem CONSULTAR_LICITACOES)", negTes.barrado, `${negTes.url} ${negTes.status}`);
    await irPara(page, `/despesa/pagamentos?exercicio=${EXERCICIO}`);
    const liqPag = await opcaoQueCasa(page, 'form[data-acao="pagar"] select[name="liquidacaoId"]', NL);
    if (liqPag === null) throw new Error("a liquidação não está na fila de pagamento");
    const conta = await opcaoQueCasa(page, 'form[data-acao="pagar"] select[name="contaBancaria"]', "CC-500-01");
    const cabeca = await page.evaluate((valor) => {
      const s = document.querySelector('form[data-acao="pagar"] select[name="liquidacaoId"]');
      if (!(s instanceof HTMLSelectElement)) return false;
      return Array.from(s.options).find((x) => x.value === valor)?.textContent?.trim().startsWith("★") === true;
    }, liqPag.valor);
    if (!cabeca) {
      await page.select('form[data-acao="pagar"] select[name="liquidacaoId"]', liqPag.valor);
      await new Promise((r) => setTimeout(r, 400));
    }
    const rPag = await preencherEEnviar(page, "pagar", [
      { sel: 'select[name="liquidacaoId"]', valor: liqPag.valor, tipo: "select" },
      { sel: 'input[name="numero"]', valor: NP },
      ...(conta === null ? [] : [{ sel: 'select[name="contaBancaria"]', valor: conta.valor, tipo: "select" as const }]),
      { sel: 'input[name="data"]', valor: "2026-05-20", tipo: "data" },
      { sel: 'input[name="historico"]', valor: `pagamento da DF-P-${SUF} (percurso por papel)` },
      { sel: '[data-mascara="valor"]', valor: "426,00", indice: 0 },
      ...(cabeca ? [] : [
        { sel: 'select[name="hipotese"]', valor: "V_ATIVIDADE_FINALISTICA", tipo: "select" as const },
        { sel: 'input[name="autorizadoPor"]', valor: "Secretario de Financas" },
        { sel: 'textarea[name="justificativa"]', valor: "percurso por papel: as liquidacoes anteriores da fila sao residuo de smokes anteriores" },
      ]),
    ]);
    conferir("4.2 TESOURARIA paga pela conta CC-500-01", rPag.tipo === "ok" || (await texto(page)).includes(NP.toLowerCase()), rPag.texto.slice(0, 200));
    await irPara(page, "/financeiro/conciliacao/periodo");
    const contaConc = await opcaoQueCasa(page, 'form[data-acao="abrir-conciliacao"] select[name="conta"]', "CC-500-01");
    if (contaConc !== null) {
      const tela = await irPara(page, `/financeiro/conciliacao/periodo?conta=${contaConc.valor}`);
      const pendencias = await page.evaluate(() => Array.from(document.querySelectorAll("[data-pendencia-interna]")).map((li) => (li.textContent ?? "").replace(/\s+/g, " ").trim()));
      const fecha = (await page.$("[data-nao-fecha]")) === null;
      conferir("4.3 a conciliação de CC-500-01 responde como estado (fecha ou diz quanto sobra) — e, se fecha, o pagamento é pendência do razão", (await page.$("[data-conciliacao], [data-nao-fecha]")) !== null && (!fecha || pendencias.some((t) => t.includes(NP))), `fecha=${fecha} pendências=${pendencias.slice(0, 3).join(" | ").slice(0, 200)} ${tela.slice(0, 100)}`);
    }
    await irPara(page, hrefSol).catch(() => undefined);
    conferir("4.4 NEGATIVA: TESOURARIA não lê a solicitação da cadeia", page.url().includes("/sem-acesso"), page.url());
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
