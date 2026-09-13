import "dotenv/config";
import puppeteer, { type Browser, type Page } from "puppeteer";

/**
 * ═══ O PERCURSO DO SEGUNDO PACOTE — a cadeia patrimonial utilizável (V3, pacote 2) ═══
 *
 * Contra o servidor dos PERCURSOS (`npm run percursos:servir`, porta 3010, banco próprio).
 * Prova, pela tela e com recarga entre os passos, o que as cinco unidades construíram:
 *   1. o acervo pesquisável e a etiqueta imprimível com Code 128;
 *   2. o parâmetro versionado da classe e a competência com prévia, processamento e memória;
 *   3. o estorno com análise de dependências — bloqueado enquanto a competência vive, livre
 *      depois de estorná-la (do mais recente ao mais antigo);
 *   4. o termo de responsabilidade pela tela e o PDF pela rota autenticada;
 *   5. o vínculo usuário↔pessoa e "meus bens".
 *
 * ⚠️ ELE NÃO LIMPA O BANCO e sufixa os códigos pelo instante. ⚠️ Sem `page.click` de ponto
 * calculado (ESTADO §27.3): envio por `requestSubmit`/`button.click` no DOM.
 */
const BASE = process.argv[2] ?? "http://localhost:3010";
const USUARIO = process.argv[3] ?? "admin@cg.pb.gov.br";
const SENHA = process.argv[4] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const SUF = String(Date.now()).slice(-6);
const CLASSE = `1.2.3.1.1.${SUF}`; // código da classe — único pelo sufixo INTEIRO (dois dígitos colidiam entre rodadas no mesmo banco)
const TOMB = `P2-${SUF}`;
const TERMO = `TR-${SUF}`;

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
    const alvo = (await page.$$(seletor))[0];
    if (alvo === undefined) throw new Error(`"${seletor}" não casou nenhum elemento`);
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

/**
 * O link de análise do movimento cujo item do histórico diz `oQue` (ex.: "Avaliação inicial").
 * V4: o item da competência POR BEM também aparece no histórico do bem e também leva a
 * `/estornos/valor/` — escolher "o primeiro link de valor" pegava a depreciação, não a entrada.
 */
async function hrefDaAnaliseNoHistorico(page: Page, oQue: string): Promise<string | undefined> {
  return page.evaluate((q) => {
    const a = Array.from(document.querySelectorAll("li a")).find((x) => (x.textContent ?? "").trim() === "analisar estorno" && (x.closest("li")?.textContent ?? "").includes(q));
    return a instanceof HTMLAnchorElement ? new URL(a.href).pathname : undefined;
  }, oQue);
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
    // O servidor dos percursos pode ser o `next dev`, que compila cada rota na primeira visita.
    page.setDefaultTimeout(120000);
    page.setDefaultNavigationTimeout(120000);
    await entrar(page);
    ok("login");

    // ── 1. a classe, o bem, a etiqueta ──
    await irPara(page, "/patrimonio/classes-de-bens");
    const conta = await opcaoQueCasa(page, 'form[data-acao="criar-classes-de-bens"] select[name="contaContabilAtivoId"]', "1.2.3.1.1.01");
    conferir("classe: o select de conta oferece uma analítica do imobilizado", conta !== null, "sem conta 1.2.3.1.1.01.* no select");
    const rClasse = await preencherEEnviar(page, "criar-classes-de-bens", [
      { sel: 'input[name="codigo"]', valor: CLASSE },
      { sel: 'input[name="descricao"]', valor: `Veículos do percurso ${SUF}` },
      { sel: 'select[name="especie"]', valor: "MOVEL", tipo: "select" },
      ...(conta === null ? [] : [{ sel: 'select[name="contaContabilAtivoId"]', valor: conta.valor, tipo: "select" as const }]),
    ]);
    conferir("classe: o servidor aceitou", rClasse.tipo === "ok", rClasse.texto);

    await irPara(page, "/patrimonio/bens-patrimoniais");
    const classeOpcao = await opcaoQueCasa(page, 'form[data-acao="criar-bens-patrimoniais"] select[name="classeDeBensId"]', CLASSE);
    conferir("bem: o select de classe OFERECE a classe recém-criada", classeOpcao !== null, "a classe não apareceu no select");
    const rBem = await preencherEEnviar(page, "criar-bens-patrimoniais", [
      { sel: 'input[name="numeroTombamento"]', valor: TOMB },
      { sel: 'input[name="descricao"]', valor: `Ônibus escolar ${SUF}` },
      ...(classeOpcao === null ? [] : [{ sel: 'select[name="classeDeBensId"]', valor: classeOpcao.valor, tipo: "select" as const }]),
      { sel: 'input[name="dataAquisicao"]', valor: "2026-01-10", tipo: "data" },
    ]);
    conferir("bem: o servidor aceitou", rBem.tipo === "ok", rBem.texto);

    const lista = await irPara(page, `/patrimonio/bens-patrimoniais?q=${TOMB}`);
    conferir("acervo: a pesquisa por tombamento acha o bem e mostra 'sem situação registrada'", lista.includes(TOMB.toLowerCase()) && lista.includes("sem situação registrada"), "a pesquisa não trouxe o bem com o estado derivado");
    const hrefBem = await hrefDoRegistro(page, TOMB);
    conferir("acervo: a lista liga ao detalhe do bem", hrefBem !== null, "sem link para o detalhe");
    if (hrefBem === null) throw new Error("sem detalhe do bem — o percurso não continua");
    const bemId = hrefBem.split("/").pop() ?? "";

    await irPara(page, hrefBem);
    const rEtiq = await preencherEEnviar(page, "gerar-etiqueta", []);
    conferir("etiqueta: o servidor gerou o código", rEtiq.tipo === "ok", rEtiq.texto);
    await irPara(page, `/patrimonio/etiquetas?bens=${bemId}`);
    const qtdEtiquetas = await atributo(page, "[data-etiquetas]", "data-etiquetas");
    const temSvg = await page.evaluate((t) => document.querySelector(`[data-tombamento="${t}"] svg`) !== null, TOMB);
    conferir("etiqueta: a folha traz UMA etiqueta com o SVG do código de barras e o tombamento", qtdEtiquetas === "1" && temSvg, `data-etiquetas=${qtdEtiquetas}, svg=${temSvg}`);

    // ── 2. o parâmetro versionado e a competência ──
    await irPara(page, "/patrimonio/parametros-de-atualizacao");
    const classeParam = await opcaoQueCasa(page, 'form[data-acao="criar-parametros-de-atualizacao"] select[name="classeDeBensId"]', CLASSE);
    conferir("parâmetro: o select de classe oferece a classe nova", classeParam !== null, "classe ausente no select");
    const rParam = await preencherEEnviar(page, "criar-parametros-de-atualizacao", [
      ...(classeParam === null ? [] : [{ sel: 'select[name="classeDeBensId"]', valor: classeParam.valor, tipo: "select" as const }]),
      { sel: 'select[name="metodo"]', valor: "DEPRECIACAO", tipo: "select" },
      { sel: 'input[name="vidaUtilMeses"]', valor: "24" },
      { sel: 'input[name="percentualResidual"]', valor: "10" },
      { sel: 'input[name="motivo"]', valor: "Vida útil de veículos conforme a comissão do percurso." },
    ]);
    conferir("parâmetro: o servidor gravou a versão 1", rParam.tipo === "ok", rParam.texto);
    const listaParam = await irPara(page, `/patrimonio/parametros-de-atualizacao?q=${encodeURIComponent(CLASSE)}`);
    conferir("parâmetro: RECARREGADA, a lista diz 'parametrizada', 24 meses, 10%, versão 1", listaParam.includes("parametrizada") && listaParam.includes("24 meses") && listaParam.includes("10%") && listaParam.includes("versão 1"), "a lista não trouxe o parâmetro persistido");

    await irPara(page, hrefBem);
    const rEntrada = await preencherEEnviar(page, "registrar-entrada-de-valor", [
      { sel: 'select[name="tipo"]', valor: "AVALIACAO_INICIAL", tipo: "select" },
      // `CampoValor`: o visível é `data-mascara="valor"` (sem name); o hidden `name="valor"` leva o cru.
      { sel: 'input[data-mascara="valor"]', valor: "12000,00" },
      { sel: 'input[name="dataMovimento"]', valor: "2026-01-15", tipo: "data" },
      { sel: 'input[name="motivo"]', valor: "Avaliação inicial do ônibus (percurso)." },
    ]);
    conferir("entrada de valor: o servidor lançou 12.000,00 (roteiro de demonstração)", rEntrada.tipo === "ok", rEntrada.texto);

    const classeId = classeParam?.valor ?? "";
    const previa = await irPara(page, `/patrimonio/competencia?classe=${classeId}&competencia=2026-03`);
    const situacaoPrevia = await atributo(page, "[data-previa]", "data-previa");
    conferir("competência: a prévia está PRONTA e mostra a parcela de 450,00 com a versão 1 do parâmetro", situacaoPrevia === "PRONTA" && previa.includes("450.00") && previa.includes("versão 1"), `data-previa=${situacaoPrevia}`);
    const rProc = await preencherEEnviar(page, "processar-competencia", []);
    conferir("competência: o servidor processou e lançou", rProc.tipo === "ok" && rProc.texto.includes("450.00"), rProc.texto);
    const depois = await irPara(page, `/patrimonio/competencia?classe=${classeId}&competencia=2026-03`);
    const situacaoDepois = await atributo(page, "[data-previa]", "data-previa");
    conferir("competência: RECARREGADA, a prévia diz 'já processada' e o histórico traz a memória (base 12000.00, versão 1)", situacaoDepois === "JA_ATUALIZADA" && depois.includes("base 12000.00") && depois.includes("versão 1"), `data-previa=${situacaoDepois}`);

    // ── 3. o estorno com análise de dependências ──
    await irPara(page, hrefBem + "?aba=historico");
    const analises = await hrefsDoHistorico(page, "analisar estorno");
    conferir("histórico do bem: cada movimento vivo liga à análise do seu estorno", analises.length >= 1, `links: ${analises.length}`);
    const analiseDaEntrada = await hrefDaAnaliseNoHistorico(page, "Avaliação inicial");
    conferir("histórico do bem: a ENTRADA (avaliação inicial) tem a sua análise, distinta do item da competência", analiseDaEntrada !== undefined && analiseDaEntrada.includes("/estornos/valor/"), `link: ${analiseDaEntrada ?? "nenhum"}`);
    if (analiseDaEntrada !== undefined) {
      const bloqueada = await irPara(page, analiseDaEntrada);
      const estado = await atributo(page, "[data-estorno]", "data-estorno");
      conferir("estorno da entrada: BLOQUEADO — a competência de março depende dela, e a tela diz por quê", estado === "bloqueado" && bloqueada.includes("dependentes vivos") && bloqueada.includes("depende porque"), `data-estorno=${estado}`);
    }
    await irPara(page, `/patrimonio/competencia?classe=${classeId}`);
    const analiseDaCompetencia = await hrefDoRegistro(page, "analisar");
    conferir("competência: a lista liga à análise do estorno", analiseDaCompetencia !== null, "sem link de análise");
    if (analiseDaCompetencia !== null) {
      await irPara(page, analiseDaCompetencia);
      const estado = await atributo(page, "[data-estorno]", "data-estorno");
      conferir("estorno da competência: POSSÍVEL — nada depende dela", estado === "possivel", `data-estorno=${estado}`);
      const rEst = await preencherEEnviar(page, "estornar-movimento", [
        { sel: 'input[name="dataMovimento"]', valor: "2026-04-05", tipo: "data" },
        { sel: 'textarea[name="motivo"]', valor: "Depreciação de março lançada em duplicidade no percurso." },
      ]);
      conferir("estorno da competência: o servidor estornou", rEst.tipo === "ok", rEst.texto);
      if (analiseDaEntrada !== undefined) {
        await irPara(page, analiseDaEntrada);
        const estadoEntrada = await atributo(page, "[data-estorno]", "data-estorno");
        conferir("estorno da entrada: RECARREGADA, agora é POSSÍVEL — o dependente foi estornado primeiro", estadoEntrada === "possivel", `data-estorno=${estadoEntrada}`);
      }
    }

    // ── 4. o termo de responsabilidade e o PDF ──
    // ⚠️ O BANCO DOS PERCURSOS NÃO É LIMPO: numa segunda rodada o usuário JÁ está vinculado a uma
    // pessoa, e "meus bens" lista os bens DELA. O termo vai para essa pessoa quando ela existe —
    // senão o passo final afirmaria o bem de um responsável que não é o do usuário.
    await irPara(page, "/patrimonio/meus-bens");
    const pessoaJaVinculada = await atributo(page, "[data-pessoa]", "data-pessoa");
    await irPara(page, "/patrimonio/termos");
    const responsavel =
      (pessoaJaVinculada === null ? null : await opcaoQueCasa(page, 'form[data-acao="criar-termos-patrimoniais"] select[name="responsavelId"]', pessoaJaVinculada)) ??
      (await primeiraOpcao(page, 'form[data-acao="criar-termos-patrimoniais"] select[name="responsavelId"]'));
    conferir("termo: há pessoa no cadastro para responder", responsavel !== null, "select de responsável vazio");
    const rTermo = await preencherEEnviar(page, "criar-termos-patrimoniais", [
      { sel: 'input[name="numero"]', valor: TERMO },
      { sel: 'select[name="tipo"]', valor: "RESPONSABILIDADE", tipo: "select" },
      { sel: 'input[name="data"]', valor: "2026-03-10", tipo: "data" },
      ...(responsavel === null ? [] : [{ sel: 'select[name="responsavelId"]', valor: responsavel.valor, tipo: "select" as const }]),
      { sel: 'input[name="tombamentos"]', valor: TOMB },
    ]);
    conferir("termo: o servidor emitiu e registrou o movimento", rTermo.tipo === "ok", rTermo.texto);
    const listaTermos = await irPara(page, `/patrimonio/termos?q=${TERMO}`);
    conferir("termo: RECARREGADA, a lista o traz com 1 bem", listaTermos.includes(TERMO.toLowerCase()), "o termo não apareceu");
    const hrefTermo = await hrefDoRegistro(page, TERMO);
    if (hrefTermo !== null) {
      const detalhe = await irPara(page, hrefTermo + "?aba=historico");
      conferir("termo: o detalhe lista o bem", detalhe.includes(TOMB.toLowerCase()), "o bem não está no detalhe");
      // O PDF abre um Chromium DENTRO do servidor; sob o `next dev` desta máquina isso pode
      // cruzar o reinício por memória — três tentativas, como em `irPara`.
      let pdf = { status: 0, tipo: "", tamanho: 0, erro: "" };
      for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
        pdf = await page.evaluate(async (u) => {
          try {
            const r = await fetch(u);
            return { status: r.status, tipo: r.headers.get("content-type") ?? "", tamanho: (await r.arrayBuffer()).byteLength, erro: "" };
          } catch (e) {
            return { status: 0, tipo: "", tamanho: 0, erro: e instanceof Error ? e.message : String(e) };
          }
        }, `${BASE}${hrefTermo}/pdf`);
        if (pdf.erro === "") break;
        console.log(`      [PDF: ${pdf.erro} — tentativa ${tentativa + 1} em 10 s]`);
        await new Promise((r) => setTimeout(r, 10000));
      }
      conferir("termo: o PDF é gerado pela rota autenticada (200, application/pdf, > 1 KB)", pdf.status === 200 && pdf.tipo.includes("application/pdf") && pdf.tamanho > 1024, JSON.stringify(pdf));
      // V4 (§5): o CONTEÚDO do PDF, não só o status — o tombamento, o responsável e a declaração;
      // e a posição atual é outro documento, com título próprio.
      const textoEmitido = await textoDoPdf(page, `${BASE}${hrefTermo}/pdf`);
      conferir("termo: o PDF emitido traz o tombamento, o responsável e a declaração", textoEmitido.includes(TOMB) && textoEmitido.includes("Declaro ter recebido") && (responsavel === null || textoEmitido.includes((responsavel.rotulo.split(" (")[0] ?? "").slice(0, 12))), textoEmitido.slice(0, 300));
      const textoAtual = await textoDoPdf(page, `${BASE}${hrefTermo}/pdf?via=atual`);
      conferir("termo: a posição atual é OUTRO documento, com título e nota próprios", textoAtual.includes("Posição patrimonial atual") && textoAtual.includes("NÃO é o termo"), textoAtual.slice(0, 300));
    }
    const acervoPorResponsavel = responsavel === null ? "" : await irPara(page, `/patrimonio/bens-patrimoniais?responsavel=${encodeURIComponent(responsavel.rotulo.split(" (")[0] ?? "")}`);
    conferir("acervo: a pesquisa por RESPONSÁVEL acha o bem entregue pelo termo", acervoPorResponsavel.includes(TOMB.toLowerCase()), "o bem não veio na pesquisa por responsável");

    // ── 5. o vínculo usuário↔pessoa e "meus bens" ──
    const documento = responsavel === null ? null : /\(([^)]+)\)\s*$/.exec(responsavel.rotulo)?.[1] ?? null;
    if (documento !== null) {
      // O envio pode cair no reinício do `next dev` (sem POST no log, resposta em silêncio): uma
      // segunda tentativa depois de recarregar. Vincular é recusado nomeando se já estiver feito.
      let rVinc = { tipo: "silencio", texto: "" };
      for (let tentativa = 1; tentativa <= 2 && rVinc.tipo === "silencio"; tentativa += 1) {
        await irPara(page, "/administracao/usuarios");
        const jaVinculado = await page.evaluate((u) => document.querySelector(`form[data-acao="desvincular-pessoa"][data-usuario="${u}"]`) !== null, USUARIO);
        if (jaVinculado) {
          rVinc = { tipo: "ok", texto: "já vinculado (a tela oferece desvincular)" };
          break;
        }
        rVinc = await preencherEEnviar(page, `form[data-acao="vincular-pessoa"][data-usuario="${USUARIO}"]`, [
          { sel: 'input[name="documento"]', valor: documento },
          { sel: 'input[name="motivo"]', valor: "Vínculo do administrador à pessoa do percurso." },
        ]);
      }
      conferir("vínculo: o servidor vinculou o usuário à pessoa pelo documento (ou já estava)", rVinc.tipo === "ok" || /JÁ VINCULADO|PESSOA JÁ VINCULADA/.test(rVinc.texto), rVinc.texto);
      const meus = await irPara(page, "/patrimonio/meus-bens");
      const pessoaNaTela = await atributo(page, "[data-pessoa]", "data-pessoa");
      conferir("meus bens: a tela diz quem o usuário é e lista o bem sob a sua responsabilidade", pessoaNaTela !== null && meus.includes(TOMB.toLowerCase()), `data-pessoa=${pessoaNaTela}`);
    }
  } finally {
    if (navegador !== undefined) await navegador.close();
  }
  console.log(`\n${passos.length} passo(s) ok, ${falhas.length} falha(s).`);
  if (falhas.length > 0) {
    for (const f of falhas) console.error(` - ${f}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
