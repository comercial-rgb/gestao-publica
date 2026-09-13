import "dotenv/config";
import puppeteer, { type Browser, type Page } from "puppeteer";

/**
 * SMOKE DO VÍNCULO SOLICITAÇÃO × ORDEM (M11, V6 P1.1) — navegador real contra o servidor.
 *
 * O percurso: solicitação com DUAS linhas (10 e 4) → autorizada → o detalhe mostra o atendimento
 * por item (tudo pendente) → "formar ordem" com 6 do primeiro item e 4 do segundo (atendimento
 * PARCIAL) → a ordem gerada mostra a origem → uma segunda ordem emitida pela lista recebe o
 * vínculo dos 4 restantes pelo detalhe (e 5 é RECUSADO nomeando o excesso) → recebimento parcial
 * na primeira ordem reflete "recebido" na solicitação → desfazer a parcela da segunda ordem devolve
 * o pendente → estornar a segunda ordem é FATO: ela continua na lista como ESTORNADA, e a
 * solicitação registra o movimento → o espelho em PDF da primeira ordem traz a origem → o operador
 * restrito não alcança as compras.
 *
 * ⚠️ ELE NÃO LIMPA O BANCO: números levam o sufixo do instante. Helpers copiados do smoke das compras.
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



const RESTRITO = "operador.poc@cg.pb.gov.br";
const SENHA_RESTRITO = process.env["POC_SENHA_RESTRITO"] ?? "OperadorPOC#2026";

async function segundaOpcao(page: Page, seletor: string): Promise<{ readonly valor: string; readonly rotulo: string } | null> {
  return page.evaluate((sel) => {
    const s = document.querySelector(sel);
    if (!(s instanceof HTMLSelectElement)) return null;
    const uteis = Array.from(s.options).filter((o) => o.value !== "" && !o.disabled);
    const o = uteis[1] ?? uteis[0];
    return o === undefined ? null : { valor: o.value, rotulo: (o.textContent ?? "").trim() };
  }, seletor);
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
    await entrar(page);
    ok("login");

    // ── 1. a solicitação com DUAS linhas ──
    await irPara(page, "/licitacoes/solicitacoes");
    const setor = await primeiraOpcao(page, 'form[data-acao="criar-solicitacao"] select[name="setorId"]');
    const mat1 = await primeiraOpcao(page, 'form[data-acao="criar-solicitacao"] select[name="itens.0.materialId"]');
    let mat2 = await segundaOpcao(page, 'form[data-acao="criar-solicitacao"] select[name="itens.0.materialId"]');
    if (mat1 !== null && mat2 !== null && mat2.valor === mat1.valor) {
      // Só um material ativo no banco dos percursos: cadastra o segundo pela tela do almoxarifado.
      await irPara(page, "/patrimonio/almoxarifado/materiais");
      const grupo = await primeiraOpcao(page, 'form[data-acao="criar-materiais"] select[name="grupoId"]');
      const classe = await primeiraOpcao(page, 'form[data-acao="criar-materiais"] select[name="classeDeMaterialId"]');
      const unidade = await primeiraOpcao(page, 'form[data-acao="criar-materiais"] select[name="unidadeDeMedidaId"]');
      const rMat = await preencherEEnviar(page, "criar-materiais", [
        { sel: 'input[name="codigo"]', valor: `MAT-B-${SUF}` },
        { sel: 'input[name="descricaoSucinta"]', valor: `Toner do percurso ${SUF}` },
        { sel: 'textarea[name="descricaoDetalhada"]', valor: "Cartucho de toner preto (percurso)." },
        ...(grupo === null ? [] : [{ sel: 'select[name="grupoId"]', valor: grupo.valor, tipo: "select" as const }]),
        ...(classe === null ? [] : [{ sel: 'select[name="classeDeMaterialId"]', valor: classe.valor, tipo: "select" as const }]),
        { sel: 'select[name="classificacao"]', valor: "CONSUMO", tipo: "select" },
        { sel: 'select[name="categoria"]', valor: "ESTOCAVEL", tipo: "select" },
        ...(unidade === null ? [] : [{ sel: 'select[name="unidadeDeMedidaId"]', valor: unidade.valor, tipo: "select" as const }]),
      ]);
      console.log(`      [segundo material cadastrado: ${rMat.tipo} ${rMat.texto.slice(0, 80)}]`);
      await irPara(page, "/licitacoes/solicitacoes");
      mat2 = await opcaoQueCasa(page, 'form[data-acao="criar-solicitacao"] select[name="itens.0.materialId"]', `MAT-B-${SUF}`);
    }
    conferir("1.1 a ilha oferece setor e dois materiais distintos", setor !== null && mat1 !== null && mat2 !== null && mat1.valor !== mat2.valor, `setor=${setor?.rotulo ?? "-"} m1=${mat1?.rotulo ?? "-"} m2=${mat2?.rotulo ?? "-"}`);
    if (setor === null || mat1 === null || mat2 === null) throw new Error("sem opções para a solicitação");
    await page.click('form[data-acao="criar-solicitacao"] button[data-acao="mais-um-item"]');
    await page.waitForSelector('form[data-acao="criar-solicitacao"] select[name="itens.1.materialId"]', { timeout: 10000 });
    const rSol = await preencherEEnviar(page, "criar-solicitacao", [
      { sel: 'input[name="numero"]', valor: `SC-${SUF}` },
      { sel: 'select[name="setorId"]', valor: setor.valor, tipo: "select" },
      { sel: 'input[name="data"]', valor: "2026-05-04", tipo: "data" },
      { sel: 'input[name="solicitante"]', valor: "Chefe de gabinete (percurso)" },
      { sel: 'textarea[name="justificativa"]', valor: "Reposição de material de expediente com duas linhas (percurso)" },
      { sel: 'select[name="itens.0.materialId"]', valor: mat1.valor, tipo: "select" },
      { sel: 'input[name="itens.0.quantidade"]', valor: "10" },
      { sel: 'select[name="itens.1.materialId"]', valor: mat2.valor, tipo: "select" },
      { sel: 'input[name="itens.1.quantidade"]', valor: "4" },
    ]);
    conferir("1.2 solicitação registrada com 2 itens", rSol.tipo === "ok" && rSol.texto.includes("2 item"), rSol.texto);
    await irPara(page, `/licitacoes/solicitacoes?q=SC-${SUF}`);
    const listaSol = await texto(page);
    const hrefSol = await hrefDoRegistro(page, `SC-${SUF}`);
    conferir("1.3 a lista traz o atendimento derivado (14.0000 pendente de 14.0000)", hrefSol !== null && listaSol.includes("14.0000 pendente de 14.0000"), listaSol.slice(0, 300));
    if (hrefSol === null) throw new Error("sem solicitação para seguir");

    // ── 2. pendente: sem formar ordem ──
    const detPend = await irPara(page, hrefSol);
    conferir("2.1 PENDENTE: o atendimento aparece e 'formar ordem' NÃO (só a autorizada forma)", detPend.includes("atendimento por item") && detPend.includes("só a autorizada forma ordem") && (await page.$('form[data-acao="formar-ordem"]')) === null, detPend.slice(0, 300));
    const rAut = await preencherEEnviar(page, "autorizar", [
      { sel: 'input[name="data"]', valor: "2026-05-05", tipo: "data" },
      { sel: 'input[name="motivo"]', valor: "Autorizada pelo ordenador (percurso)" },
    ]);
    conferir("2.2 solicitação autorizada", rAut.tipo === "ok", rAut.texto);

    // ── 3. formar ordem a partir da solicitação — parcial ──
    await irPara(page, hrefSol);
    const fornecedor = await primeiraOpcao(page, 'form[data-acao="formar-ordem"] select[name="fornecedorId"]');
    conferir("3.1 AUTORIZADA: a ilha 'formar ordem' oferece os DOIS itens pendentes com a quantidade pré-preenchida", fornecedor !== null && (await page.$$('form[data-acao="formar-ordem"] [data-linha]')).length === 2, `fornecedor=${fornecedor?.rotulo ?? "-"}`);
    if (fornecedor === null) throw new Error("sem fornecedor");
    const rExcesso = await preencherEEnviar(page, "formar-ordem", [
      { sel: 'input[name="numero"]', valor: `OC-A-${SUF}` },
      { sel: 'select[name="fornecedorId"]', valor: fornecedor.valor, tipo: "select" },
      { sel: 'input[name="dataEmissao"]', valor: "2026-05-10", tipo: "data" },
      { sel: 'textarea[name="finalidade"]', valor: `Atende a SC-${SUF} (percurso)` },
      { sel: 'input[name="itens.0.quantidade"]', valor: "11" },
      { sel: 'input[name="itens.0.valorUnitario"]', valor: "11,00" },
      { sel: 'input[name="itens.1.quantidade"]', valor: "4" },
      { sel: 'input[name="itens.1.valorUnitario"]', valor: "90,00" },
    ]);
    conferir("3.2 formar com 11 de 10 é RECUSADO nomeando o EXCESSO — e a ordem não nasce", rExcesso.tipo === "erro" && /EXCESSO/.test(rExcesso.texto), rExcesso.texto.slice(0, 200));
    await irPara(page, hrefSol);
    const rFormar = await preencherEEnviar(page, "formar-ordem", [
      { sel: 'input[name="numero"]', valor: `OC-A-${SUF}` },
      { sel: 'select[name="fornecedorId"]', valor: fornecedor.valor, tipo: "select" },
      { sel: 'input[name="dataEmissao"]', valor: "2026-05-10", tipo: "data" },
      { sel: 'textarea[name="finalidade"]', valor: `Atende a SC-${SUF} (percurso)` },
      { sel: 'input[name="itens.0.quantidade"]', valor: "6" },
      { sel: 'input[name="itens.0.valorUnitario"]', valor: "11,00" },
      { sel: 'input[name="itens.1.quantidade"]', valor: "4" },
      { sel: 'input[name="itens.1.valorUnitario"]', valor: "90,00" },
    ]);
    conferir("3.3 ordem FORMADA com 2 itens (6 de 10 e 4 de 4), e o resultado aponta para a ordem", rFormar.tipo === "ok" && rFormar.texto.includes("2 item"), rFormar.texto.slice(0, 200));
    const hrefOrdemA = await page.evaluate(() => document.querySelector("[data-ordem-gerada]")?.getAttribute("href") ?? null);
    conferir("3.4 o link para a ordem gerada existe", hrefOrdemA !== null, "sem link");
    if (hrefOrdemA === null) throw new Error("sem ordem A");

    const detSol2 = await irPara(page, hrefSol);
    const pendentes = await page.evaluate(() => Array.from(document.querySelectorAll("[data-atendimento] [data-pendente]")).map((e) => (e.textContent ?? "").trim()));
    const ordenados = await page.evaluate(() => Array.from(document.querySelectorAll("[data-atendimento] [data-ordenado]")).map((e) => (e.textContent ?? "").trim()));
    conferir("3.5 atendimento DERIVADO: item 1 ordenado 6 / pendente 4; item 2 ordenado 4 / pendente 0", ordenados.join(",") === "6.0000,4.0000" && pendentes.join(",") === "4.0000,0.0000", `ordenado=${ordenados.join(",")} pendente=${pendentes.join(",")}`);
    conferir("3.6 as parcelas VIVAS apontam para a ordem A", (await page.$$('[data-atendimento] [data-parcela="VIVA"]')).length === 2 && detSol2.includes(`oc-a-${SUF}`.toLowerCase()), detSol2.slice(0, 300));

    // ── 4. a ordem A: origem ──
    const detA = await irPara(page, hrefOrdemA);
    conferir("4.1 a ordem A mostra a ORIGEM (SC) nas duas linhas, sem 'sem origem'", (await page.$$('[data-origem] [data-parcela-origem="VIVA"]')).length === 2 && (await page.$('[data-origem] [data-sem-origem]')) === null && detA.includes(`origem: sc-${SUF}`.toLowerCase()), detA.slice(0, 400));
    conferir("4.2 sem disponível na linha, a ilha 'vincular' não aparece", (await page.$('form[data-acao="vincular-solicitacao"]')) === null, "ilha apareceu");
    const pdfA = await textoDoPdf(page, `/licitacoes/ordens-de-compra/espelho?id=${hrefOrdemA.split("/").pop() ?? ""}`);
    conferir("4.3 o espelho em PDF traz a seção de origem com a solicitação", pdfA.includes("Origem (solicita") && pdfA.includes(`SC-${SUF}`), pdfA.slice(0, 300));

    // ── 5. a ordem B pela lista, e o vínculo pelo detalhe ──
    await irPara(page, "/licitacoes/ordens-de-compra");
    const rOrdemB = await preencherEEnviar(page, "criar-ordem", [
      { sel: 'input[name="numero"]', valor: `OC-B-${SUF}` },
      { sel: 'select[name="tipo"]', valor: "ORDINARIA", tipo: "select" },
      { sel: 'select[name="fornecedorId"]', valor: fornecedor.valor, tipo: "select" },
      { sel: 'input[name="dataEmissao"]', valor: "2026-05-11", tipo: "data" },
      { sel: 'textarea[name="finalidade"]', valor: `Segunda ordem para o resto da SC-${SUF} (percurso)` },
      { sel: 'select[name="itens.0.materialId"]', valor: mat1.valor, tipo: "select" },
      { sel: 'input[name="itens.0.quantidade"]', valor: "6" },
      { sel: 'input[name="itens.0.valorUnitario"]', valor: "11,00" },
    ]);
    conferir("5.1 ordem B emitida pela lista, SEM origem", rOrdemB.tipo === "ok", rOrdemB.texto);
    await irPara(page, `/licitacoes/ordens-de-compra?q=OC-B-${SUF}`);
    const listaB = await texto(page);
    const hrefOrdemB = await hrefDoRegistro(page, `OC-B-${SUF}`);
    conferir("5.2 a lista mostra a origem da A e '—' na B", hrefOrdemB !== null && listaB.includes("—"), listaB.slice(0, 300));
    if (hrefOrdemB === null) throw new Error("sem ordem B");
    const detB = await irPara(page, hrefOrdemB);
    conferir("5.3 a ordem B diz 'sem origem' e oferece a ilha 'vincular' com a SC autorizada", (await page.$('[data-origem] [data-sem-origem]')) !== null && (await page.$('form[data-acao="vincular-solicitacao"]')) !== null && detB.includes(`sc-${SUF}`.toLowerCase()), detB.slice(0, 400));
    const sc = await opcaoQueCasa(page, 'form[data-acao="vincular-solicitacao"] select[name="solicitacaoId"]', `SC-${SUF}`);
    const rVincExcesso = await preencherEEnviar(page, "vincular-solicitacao", [
      ...(sc === null ? [] : [{ sel: 'select[name="solicitacaoId"]', valor: sc.valor, tipo: "select" as const }]),
      { sel: 'input[name="linhas.0.quantidade"]', valor: "5" },
    ]);
    conferir("5.4 vincular 5 com pendente 4 é RECUSADO nomeando o EXCESSO e o que resta", rVincExcesso.tipo === "erro" && /EXCESSO.*Restam 4\.0000/.test(rVincExcesso.texto), rVincExcesso.texto.slice(0, 200));
    await irPara(page, hrefOrdemB);
    const rVinc = await preencherEEnviar(page, "vincular-solicitacao", [
      ...(sc === null ? [] : [{ sel: 'select[name="solicitacaoId"]', valor: sc.valor, tipo: "select" as const }]),
      { sel: 'input[name="linhas.0.quantidade"]', valor: "4" },
    ]);
    conferir("5.5 vincular 4 grava, e o resultado diz que recebido só quando entregar", rVinc.tipo === "ok" && /1 parcela/.test(rVinc.texto), rVinc.texto.slice(0, 200));
    const detB2 = await irPara(page, hrefOrdemB);
    conferir("5.6 a ordem B mostra a parcela viva da SC e 2.0000 sem origem (compra direta)", (await page.$('[data-origem] [data-parcela-origem="VIVA"]')) !== null && detB2.includes("2.0000 sem origem"), detB2.slice(0, 400));
    await irPara(page, hrefSol);
    const pendentes2 = await page.evaluate(() => Array.from(document.querySelectorAll("[data-atendimento] [data-pendente]")).map((e) => (e.textContent ?? "").trim()));
    conferir("5.7 a solicitação fica com pendente 0 nos dois itens e sem a ilha 'formar ordem'", pendentes2.join(",") === "0.0000,0.0000" && (await page.$('form[data-acao="formar-ordem"]')) === null, `pendente=${pendentes2.join(",")}`);

    // ── 6. recebimento parcial na A → recebido na solicitação ──
    await irPara(page, hrefOrdemA);
    const itemA = await opcaoQueCasa(page, 'form[data-acao="receber-ordem"] select[name="itens.0.itemDeOrdemId"]', mat1.rotulo.split(" — ")[0] ?? "");
    const rRec = await preencherEEnviar(page, "receber-ordem", [
      { sel: 'input[name="data"]', valor: "2026-05-12", tipo: "data" },
      { sel: 'input[name="responsavelRecebimento"]', valor: "Almoxarife (percurso)" },
      ...(itemA === null ? [] : [{ sel: 'select[name="itens.0.itemDeOrdemId"]', valor: itemA.valor, tipo: "select" as const }]),
      { sel: 'input[name="itens.0.quantidade"]', valor: "3" },
    ]);
    conferir("6.1 recebimento parcial (3 de 6) registrado na ordem A", rRec.tipo === "ok", rRec.texto);
    await irPara(page, hrefSol);
    const recebidos = await page.evaluate(() => Array.from(document.querySelectorAll("[data-atendimento] [data-recebido]")).map((e) => (e.textContent ?? "").trim()));
    conferir("6.2 a solicitação mostra recebido 3 no item 1 (ordenado 10) — ordenado não é atendido", recebidos[0] === "3.0000", `recebido=${recebidos.join(",")}`);

    // ── 7. desfazer a parcela da B (sem recebimento) ──
    await irPara(page, hrefOrdemB);
    const rDesf = await preencherEEnviar(page, "desfazer-vinculo", [{ sel: 'input[name="motivo"]', valor: "a ordem B vai atender outro setor (percurso)" }]);
    conferir("7.1 desfazer a parcela grava (linha nova de estorno) e diz que voltou a pendente", rDesf.tipo === "ok" && /voltou a pendente/.test(rDesf.texto), rDesf.texto.slice(0, 200));
    const detB3 = await irPara(page, hrefOrdemB);
    conferir("7.2 a ordem B mostra a parcela DESFEITA e 6.0000 sem origem", (await page.$('[data-origem] [data-parcela-origem="DESFEITA"]')) !== null && detB3.includes("6.0000 sem origem"), detB3.slice(0, 400));
    await irPara(page, hrefSol);
    const pendentes3 = await page.evaluate(() => Array.from(document.querySelectorAll("[data-atendimento] [data-pendente]")).map((e) => (e.textContent ?? "").trim()));
    const cancelados = await page.evaluate(() => Array.from(document.querySelectorAll("[data-atendimento] [data-cancelado]")).map((e) => (e.textContent ?? "").trim()));
    conferir("7.3 a solicitação volta a pendente 4 no item 1 e conta 4 cancelado", pendentes3[0] === "4.0000" && cancelados[0] === "4.0000", `pendente=${pendentes3.join(",")} cancelado=${cancelados.join(",")}`);
    await irPara(page, hrefOrdemA);
    const podem = (await page.$$('form[data-acao="desfazer-vinculo"][data-pode-desfazer="sim"]')).length;
    const naoPodem = (await page.$$('form[data-acao="desfazer-vinculo"][data-pode-desfazer="nao"]')).length;
    conferir("7.4 na ordem A, a parcela com recebimento NÃO oferece 'desfazer'; a sem recebimento oferece", podem === 1 && naoPodem === 1, `${podem} pode(m), ${naoPodem} não pode(m)`);

    // ── 8. estornar a B: fato, não delete ──
    await irPara(page, hrefOrdemB);
    const rEst = await preencherEEnviar(page, "estornar", [{ sel: 'input[name="motivo"]', valor: "Fornecedor desistiu da ordem B (percurso)" }]);
    conferir("8.1 estorno da ordem B (sem recebimento, sem empenho) grava", rEst.tipo === "ok", rEst.texto);
    const detB4 = await irPara(page, hrefOrdemB);
    conferir("8.2 a ordem B continua existindo, ESTORNADA, sem receber/empenhar/vincular", (await page.$("[data-ordem-estornada]")) !== null && (await page.$('form[data-acao="receber-ordem"]')) === null && (await page.$('form[data-acao="vincular-solicitacao"]')) === null && !detB4.includes("empenhar esta ordem"), detB4.slice(0, 300));
    const rEst2 = await preencherEEnviar(page, "estornar", [{ sel: 'input[name="motivo"]', valor: "Segundo estorno indevido (percurso)" }]);
    conferir("8.2b estornar de novo é RECUSADO nomeando", rEst2.tipo === "erro" && /já está ESTORNADA/.test(rEst2.texto), rEst2.texto.slice(0, 200));
    await irPara(page, `/licitacoes/ordens-de-compra?q=OC-B-${SUF}&vivas=ESTORNADAS`);
    const listaEst = await texto(page);
    conferir("8.3 a lista filtra as estornadas e a B aparece como ESTORNADA", listaEst.includes(`oc-b-${SUF}`.toLowerCase()) && listaEst.includes("estornada"), listaEst.slice(0, 300));
    await irPara(page, `/licitacoes/ordens-de-compra?q=OC-B-${SUF}&vivas=VIVAS`);
    conferir("8.4 o filtro 'só as vivas' NÃO traz a B", !(await texto(page)).includes(`oc-b-${SUF}`.toLowerCase()), "B apareceu entre as vivas");
    const histSol = await irPara(page, `${hrefSol}?aba=historico`);
    conferir("8.5 o histórico da solicitação traz as parcelas e os movimentos com a ordem", histSol.includes("parcela na ordem") && histSol.includes("parcela desfeita"), histSol.slice(0, 500));

    // ── 9. o operador restrito não alcança as compras ──
    await sair(page);
    await entrar(page, RESTRITO, SENHA_RESTRITO).catch((e) => console.log(`      [restrito não entrou: ${e instanceof Error ? e.message : String(e)}]`));
    if (!page.url().includes("/login")) {
      const r = await page.goto(`${BASE}${hrefSol}`, { waitUntil: "networkidle2" });
      conferir("9.1 o operador restrito (sem CONSULTAR_LICITACOES) não lê a solicitação", page.url().includes("/sem-acesso") || (r?.status() ?? 0) === 403, `url ${page.url()} status ${r?.status() ?? 0}`);
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
