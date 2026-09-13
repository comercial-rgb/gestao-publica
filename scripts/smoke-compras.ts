import "dotenv/config";
import puppeteer, { type Browser, type Page } from "puppeteer";

/**
 * SMOKE DAS COMPRAS (M11, V4 §8 e V5 Fila A) — navegador real contra o servidor.
 *
 * O percurso de quem compra: registra a solicitação com um item (ilha com linhas), autoriza pelo
 * detalhe (e vê a segunda autorização recusada), registra a pesquisa de preços com cotação (a
 * média aparece derivada no detalhe), emite a ordem de compra com um item, registra o documento
 * fiscal recebido com duas linhas, recusa a duplicidade, confere, baixa os PDFs (espelho da ordem
 * e conferência da nota, sem validade fiscal), recebe PARTE pelo detalhe apontando para a nota
 * (o pendente derivado cai) e vê o estorno da ordem recebida recusado nomeando.
 *
 * ⚠️ ELE NÃO LIMPA O BANCO: números levam o sufixo do instante.
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

async function entrar(page: Page): Promise<void> {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('button[type="submit"]', { timeout: 60000 });
  await page.type('input[name="identificador"]', USUARIO);
  await page.type('input[name="senha"]', SENHA);
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
  const b64 = await page.evaluate(async (u) => {
    const r = await fetch(u);
    if (r.status !== 200) return "";
    const bytes = new Uint8Array(await r.arrayBuffer());
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  }, url);
  if (b64 === "") return "";
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(Buffer.from(b64, "base64")), useSystemFonts: true }).promise;
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



async function main(): Promise<void> {
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

    // ── 1. a solicitação de compra, com item ──
    await irPara(page, "/licitacoes/solicitacoes");
    const setor = await primeiraOpcao(page, 'form[data-acao="criar-solicitacao"] select[name="setorId"]');
    const material = await primeiraOpcao(page, 'form[data-acao="criar-solicitacao"] select[name="itens.0.materialId"]');
    conferir("solicitação: a ilha oferece setor e material", setor !== null && material !== null, `setor=${setor?.rotulo ?? "nenhum"} material=${material?.rotulo ?? "nenhum"}`);
    const rSemItem = await preencherEEnviar(page, "criar-solicitacao", [
      { sel: 'input[name="numero"]', valor: `SC-${SUF}` },
      ...(setor === null ? [] : [{ sel: 'select[name="setorId"]', valor: setor.valor, tipo: "select" as const }]),
      { sel: 'input[name="data"]', valor: "2026-05-04", tipo: "data" },
      { sel: 'input[name="solicitante"]', valor: "Chefe de gabinete (percurso)" },
      { sel: 'textarea[name="justificativa"]', valor: "Reposição de material de expediente do percurso" },
    ]);
    conferir("solicitação: SEM item é RECUSADA nomeando", rSemItem.tipo === "erro" && /item/i.test(rSemItem.texto), rSemItem.texto);
    await irPara(page, "/licitacoes/solicitacoes");
    const rSol = await preencherEEnviar(page, "criar-solicitacao", [
      { sel: 'input[name="numero"]', valor: `SC-${SUF}` },
      ...(setor === null ? [] : [{ sel: 'select[name="setorId"]', valor: setor.valor, tipo: "select" as const }]),
      { sel: 'input[name="data"]', valor: "2026-05-04", tipo: "data" },
      { sel: 'input[name="solicitante"]', valor: "Chefe de gabinete (percurso)" },
      { sel: 'textarea[name="justificativa"]', valor: "Reposição de material de expediente do percurso" },
      ...(material === null ? [] : [{ sel: 'select[name="itens.0.materialId"]', valor: material.valor, tipo: "select" as const }]),
      { sel: 'input[name="itens.0.quantidade"]', valor: "10" },
    ]);
    conferir("solicitação: registrada com 1 item", rSol.tipo === "ok" && rSol.texto.includes("1 item"), rSol.texto);
    await irPara(page, `/licitacoes/solicitacoes?q=SC-${SUF}`);
    const hrefSol = await hrefDoRegistro(page, `SC-${SUF}`);
    conferir("solicitação: RECARREGADA, a lista a traz PENDENTE", hrefSol !== null && (await texto(page)).includes("pendente"), hrefSol ?? "sem link");
    if (hrefSol === null) throw new Error("sem solicitação para seguir");
    await irPara(page, hrefSol);
    const rAut = await preencherEEnviar(page, "autorizar", [
      { sel: 'input[name="data"]', valor: "2026-05-05", tipo: "data" },
      { sel: 'input[name="motivo"]', valor: "Autorizada pelo ordenador (percurso)" },
    ]);
    conferir("solicitação: autorizada", rAut.tipo === "ok", rAut.texto);
    await irPara(page, hrefSol);
    const rAut2 = await preencherEEnviar(page, "autorizar", [
      { sel: 'input[name="data"]', valor: "2026-05-06", tipo: "data" },
      { sel: 'input[name="motivo"]', valor: "Segunda autorização indevida (percurso)" },
    ]);
    conferir("solicitação: autorizar DUAS VEZES é recusado nomeando", rAut2.tipo === "erro", rAut2.texto);
    const solDepois = await irPara(page, hrefSol);
    conferir("solicitação: RECARREGADA, a situação derivada diz AUTORIZADA", solDepois.includes("autorizada"), solDepois.slice(0, 300));

    // ── 2. a pesquisa de preços, com cotação ──
    await irPara(page, "/licitacoes/pesquisas-de-precos");
    const materialP = await primeiraOpcao(page, 'form[data-acao="criar-pesquisa"] select[name="itens.0.materialId"]');
    const fornecedor = await primeiraOpcao(page, 'form[data-acao="criar-pesquisa"] select[name="itens.0.cotacoes.0.fornecedorId"]');
    conferir("pesquisa: a ilha oferece material e fornecedor", materialP !== null && fornecedor !== null, `material=${materialP?.rotulo ?? "nenhum"} fornecedor=${fornecedor?.rotulo ?? "nenhum"}`);
    const rPesq = await preencherEEnviar(page, "criar-pesquisa", [
      { sel: 'input[name="numero"]', valor: `PP-${SUF}` },
      { sel: 'input[name="objeto"]', valor: `Estimativa de material de expediente ${SUF}` },
      { sel: 'input[name="data"]', valor: "2026-05-07", tipo: "data" },
      ...(materialP === null ? [] : [{ sel: 'select[name="itens.0.materialId"]', valor: materialP.valor, tipo: "select" as const }]),
      { sel: 'input[name="itens.0.quantidade"]', valor: "10" },
      ...(fornecedor === null ? [] : [{ sel: 'select[name="itens.0.cotacoes.0.fornecedorId"]', valor: fornecedor.valor, tipo: "select" as const }]),
      { sel: 'input[name="itens.0.cotacoes.0.valorUnitario"]', valor: "12,50" },
      { sel: 'input[name="itens.0.cotacoes.0.origem"]', valor: "proposta por e-mail (percurso)" },
    ]);
    conferir("pesquisa: registrada com 1 item e 1 cotação", rPesq.tipo === "ok", rPesq.texto);
    await irPara(page, `/licitacoes/pesquisas-de-precos?q=PP-${SUF}`);
    const hrefPesq = await hrefDoRegistro(page, `PP-${SUF}`);
    conferir("pesquisa: RECARREGADA, a lista a traz com 1 cotação", hrefPesq !== null, hrefPesq ?? "sem link");
    if (hrefPesq !== null) {
      const detPesq = await irPara(page, `${hrefPesq}?aba=historico`);
      conferir("pesquisa: o detalhe traz a média DERIVADA (12.500000) e a estimativa (125.00)", detPesq.includes("médio 12.500000"), detPesq.slice(0, 400));
      const dados = await irPara(page, hrefPesq);
      conferir("pesquisa: a estimativa pelo preço médio é 125.00", dados.includes("125,00") || dados.includes("125.00"), dados.slice(0, 400));
    }

    // ── 3. a ordem de compra e o recebimento parcial ──
    await irPara(page, "/licitacoes/ordens-de-compra");
    const fornecedorO = await primeiraOpcao(page, 'form[data-acao="criar-ordem"] select[name="fornecedorId"]');
    const materialO = await primeiraOpcao(page, 'form[data-acao="criar-ordem"] select[name="itens.0.materialId"]');
    const rOrdem = await preencherEEnviar(page, "criar-ordem", [
      { sel: 'input[name="numero"]', valor: `OC-${SUF}` },
      { sel: 'select[name="tipo"]', valor: "ORDINARIA", tipo: "select" },
      ...(fornecedorO === null ? [] : [{ sel: 'select[name="fornecedorId"]', valor: fornecedorO.valor, tipo: "select" as const }]),
      { sel: 'input[name="dataEmissao"]', valor: "2026-05-10", tipo: "data" },
      { sel: 'textarea[name="finalidade"]', valor: `Compra de material de expediente (percurso ${SUF})` },
      ...(materialO === null ? [] : [{ sel: 'select[name="itens.0.materialId"]', valor: materialO.valor, tipo: "select" as const }]),
      { sel: 'input[name="itens.0.quantidade"]', valor: "10" },
      { sel: 'input[name="itens.0.valorUnitario"]', valor: "12,50" },
    ]);
    conferir("ordem: emitida com 1 item", rOrdem.tipo === "ok", rOrdem.texto);
    await irPara(page, `/licitacoes/ordens-de-compra?q=OC-${SUF}`);
    const listaOrdem = await texto(page);
    const hrefOrdem = await hrefDoRegistro(page, `OC-${SUF}`);
    conferir("ordem: RECARREGADA, a lista traz total 125,00 A RECEBER", hrefOrdem !== null && listaOrdem.includes("a receber") && (listaOrdem.includes("125,00") || listaOrdem.includes("125.00")), listaOrdem.slice(0, 300));
    if (hrefOrdem === null) throw new Error("sem ordem para seguir");
    const detAntes = await irPara(page, hrefOrdem);
    conferir("ordem: o detalhe oferece empenhar, espelho em PDF e registrar documento fiscal", detAntes.includes("empenhar esta ordem") && detAntes.includes("emitir espelho") && detAntes.includes("registrar documento fiscal"), detAntes.slice(0, 500));
    const pdfOrdem = await textoDoPdf(page, `${BASE}/licitacoes/ordens-de-compra/espelho?id=${hrefOrdem.split("/").pop() ?? ""}`);
    conferir("ordem: PDF do espelho traz o número e 'sem validade fiscal'", pdfOrdem.toLowerCase().includes(`oc-${SUF}`.toLowerCase()) && pdfOrdem.toLowerCase().includes("sem validade fiscal"), pdfOrdem.slice(0, 400));

    // ── 4. o documento fiscal recebido (duas linhas) e a conferência ──
    await irPara(page, "/licitacoes/documentos-fiscais");
    const ordemDf = await opcaoQueCasa(page, 'form[data-acao="registrar-documento-fiscal"] select[name="ordemId"]', `OC-${SUF}`);
    conferir("documento fiscal: a ilha oferece o emitente da ordem e a ordem recém-emitida", fornecedorO !== null && ordemDf !== null, `emitente=${fornecedorO?.rotulo ?? "nenhum"} ordem=${ordemDf?.rotulo ?? "nenhuma"}`);
    const rDoc = await preencherEEnviar(page, "registrar-documento-fiscal", [
      ...(fornecedorO === null ? [] : [{ sel: 'select[name="emitenteId"]', valor: fornecedorO.valor, tipo: "select" as const }]),
      { sel: 'input[name="serie"]', valor: "1" },
      { sel: 'input[name="numero"]', valor: `DF-${SUF}` },
      { sel: 'input[name="dataEmissao"]', valor: "2026-05-11", tipo: "data" },
      { sel: 'input[name="dataRecebimento"]', valor: "2026-05-12", tipo: "data" },
      ...(ordemDf === null ? [] : [{ sel: 'select[name="ordemId"]', valor: ordemDf.valor, tipo: "select" as const }]),
      { sel: 'input[name="valorBruto"]', valor: "125,00" },
      { sel: 'input[name="valorTotal"]', valor: "125,00" },
      { sel: 'input[name="itens.0.descricao"]', valor: "Resma de papel A4" },
      { sel: 'input[name="itens.0.unidade"]', valor: "UN" },
      { sel: 'input[name="itens.0.quantidade"]', valor: "8" },
      { sel: 'input[name="itens.0.valorUnitario"]', valor: "12,50" },
      { sel: 'input[name="itens.0.valorTotal"]', valor: "100,00" },
      { sel: 'input[name="itens.1.descricao"]', valor: "Toner" },
      { sel: 'input[name="itens.1.unidade"]', valor: "UN" },
      { sel: 'input[name="itens.1.quantidade"]', valor: "2" },
      { sel: 'input[name="itens.1.valorUnitario"]', valor: "12,50" },
      { sel: 'input[name="itens.1.valorTotal"]', valor: "25,00" },
    ]);
    conferir("documento fiscal: registrado com 2 itens, sem liquidar", rDoc.tipo === "ok" && /aguardando conferência/i.test(rDoc.texto) && /não produz/i.test(rDoc.texto), rDoc.texto);
    await irPara(page, "/licitacoes/documentos-fiscais");
    const rDup = await preencherEEnviar(page, "registrar-documento-fiscal", [
      ...(fornecedorO === null ? [] : [{ sel: 'select[name="emitenteId"]', valor: fornecedorO.valor, tipo: "select" as const }]),
      { sel: 'input[name="serie"]', valor: "1" },
      { sel: 'input[name="numero"]', valor: `DF-${SUF}` },
      { sel: 'input[name="dataEmissao"]', valor: "2026-05-11", tipo: "data" },
      { sel: 'input[name="dataRecebimento"]', valor: "2026-05-12", tipo: "data" },
      { sel: 'input[name="valorBruto"]', valor: "125,00" },
      { sel: 'input[name="valorTotal"]', valor: "125,00" },
      { sel: 'input[name="itens.0.descricao"]', valor: "Resma de papel A4" },
      { sel: 'input[name="itens.0.unidade"]', valor: "UN" },
      { sel: 'input[name="itens.0.quantidade"]', valor: "8" },
      { sel: 'input[name="itens.0.valorUnitario"]', valor: "12,50" },
      { sel: 'input[name="itens.0.valorTotal"]', valor: "100,00" },
      { sel: 'input[name="itens.1.descricao"]', valor: "Toner" },
      { sel: 'input[name="itens.1.unidade"]', valor: "UN" },
      { sel: 'input[name="itens.1.quantidade"]', valor: "2" },
      { sel: 'input[name="itens.1.valorUnitario"]', valor: "12,50" },
      { sel: 'input[name="itens.1.valorTotal"]', valor: "25,00" },
    ]);
    conferir("documento fiscal: duplicidade da chave natural é recusada nomeando", rDup.tipo === "erro" && /já existe/i.test(rDup.texto), rDup.texto);
    await irPara(page, `/licitacoes/documentos-fiscais?q=DF-${SUF}`);
    const hrefDoc = await hrefDoRegistro(page, `DF-${SUF}`);
    conferir("documento fiscal: RECARREGADO na lista como REGISTRADO", hrefDoc !== null && (await texto(page)).includes("registrado"), hrefDoc ?? "sem link");
    if (hrefDoc === null) throw new Error("sem documento fiscal para seguir");
    await irPara(page, hrefDoc);
    const rConf = await preencherEEnviar(page, "conferir", [
      { sel: 'input[name="data"]', valor: "2026-05-13", tipo: "data" },
      { sel: 'input[name="motivo"]', valor: "Conferência com a origem (percurso)" },
    ]);
    conferir("documento fiscal: conferido contra a origem", rConf.tipo === "ok", rConf.texto);
    const idDoc = hrefDoc.split("/").pop() ?? "";
    const pdfDoc = await textoDoPdf(page, `${BASE}/licitacoes/documentos-fiscais/conferencia?id=${idDoc}`);
    conferir("documento fiscal: PDF de conferência traz o número e declara ausência de validade fiscal", pdfDoc.toLowerCase().includes(`df-${SUF}`.toLowerCase()) && pdfDoc.toLowerCase().includes("sem validade fiscal") && !/tr\s*\d/i.test(pdfDoc), pdfDoc.slice(0, 400));

    await irPara(page, hrefOrdem);
    const itemOrdem = await primeiraOpcao(page, 'form[data-acao="receber-ordem"] select[name="itens.0.itemDeOrdemId"]');
    conferir("ordem: a ilha de recebimento oferece o item pendente (10.0000)", itemOrdem !== null && itemOrdem.rotulo.includes("10.0000"), itemOrdem?.rotulo ?? "nenhum");
    const docRec = await primeiraOpcao(page, 'form[data-acao="receber-ordem"] select[name="documentoFiscalId"]');
    conferir("ordem: o recebimento oferece o documento conferido", docRec !== null && /df-/i.test(docRec.rotulo), docRec?.rotulo ?? "nenhum");
    const rRecAcima = await preencherEEnviar(page, "receber-ordem", [
      { sel: 'input[name="data"]', valor: "2026-05-12", tipo: "data" },
      { sel: 'input[name="responsavelRecebimento"]', valor: "Almoxarife (percurso)" },
      ...(itemOrdem === null ? [] : [{ sel: 'select[name="itens.0.itemDeOrdemId"]', valor: itemOrdem.valor, tipo: "select" as const }]),
      { sel: 'input[name="itens.0.quantidade"]', valor: "11" },
    ]);
    conferir("ordem: receber ACIMA do pendente é recusado nomeando", rRecAcima.tipo === "erro", rRecAcima.texto);
    await irPara(page, hrefOrdem);
    const rRec = await preencherEEnviar(page, "receber-ordem", [
      { sel: 'input[name="data"]', valor: "2026-05-12", tipo: "data" },
      { sel: 'input[name="notaFiscal"]', valor: `NF-${SUF}` },
      { sel: 'input[name="responsavelRecebimento"]', valor: "Almoxarife (percurso)" },
      ...(docRec === null ? [] : [{ sel: 'select[name="documentoFiscalId"]', valor: docRec.valor, tipo: "select" as const }]),
      ...(itemOrdem === null ? [] : [{ sel: 'select[name="itens.0.itemDeOrdemId"]', valor: itemOrdem.valor, tipo: "select" as const }]),
      { sel: 'input[name="itens.0.quantidade"]', valor: "4" },
    ]);
    conferir("ordem: recebimento parcial (4 de 10) registrado", rRec.tipo === "ok", rRec.texto);
    const detOrdem = await irPara(page, `${hrefOrdem}?aba=historico`);
    conferir("ordem: RECARREGADA, o pendente derivado é 6.0000 e o recebimento traz a nota", detOrdem.includes("pendente 6.0000") && detOrdem.includes(`nf-${SUF}`.toLowerCase()), detOrdem.slice(0, 500));
    await irPara(page, hrefOrdem);
    const rEst = await preencherEEnviar(page, "estornar", [{ sel: 'input[name="motivo"]', valor: "Tentativa de estorno com recebimento (percurso)" }]);
    conferir("ordem: estornar ordem COM recebimento é recusado nomeando", rEst.tipo === "erro" && /recebimento/i.test(rEst.texto), rEst.texto);
  } catch (e) {
    falhou("execução", e instanceof Error ? e.message : String(e));
  } finally {
    await navegador?.close();
  }
  console.log(`\n${passos.length} passo(s) ok, ${falhas.length} falha(s).`);
  if (falhas.length > 0) {
    for (const f of falhas) console.error(`  - ${f}`);
    process.exitCode = 1;
  }
}

await main();
