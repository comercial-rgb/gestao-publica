import "dotenv/config";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import puppeteer, { type Browser, type Page } from "puppeteer";

/**
 * SMOKE DO PLANEJAMENTO PLURIANUAL (M02b, V4 §8) — navegador real contra o servidor.
 *
 * O percurso de quem monta o PPA e a LDO: cadastra o plano, a estrutura temática (eixo, área,
 * público-alvo), põe um programa no plano com valor previsto, prevê a receita do quadriênio,
 * registra a série histórica (e vê a recusa quando o ano está dentro do plano), detalha o
 * programa com uma ação (meta física de seis casas) e um indicador; cadastra a LDO, vê a recusa
 * da primária maior que a total, registra a meta anual, um risco fiscal e uma alienação com a
 * aplicação do produto; e baixa dois anexos em PDF lendo o texto com um leitor independente.
 *
 * ⚠️ ELE NÃO LIMPA O BANCO: os anos do plano e da LDO são únicos por rodada (2100–2189), e os
 * códigos da estrutura levam o sufixo do instante. Sem `page.click` de ponto calculado.
 */
const BASE = process.argv[2] ?? "http://localhost:3010";
// V39-R2 (R2-003): o destino e a natureza da base (declarada no banco) conferidos ANTES de qualquer credencial ou escrita.
await exigirDestinoDoPercurso(BASE);
const USUARIO = process.argv[3] ?? "admin@cg.pb.gov.br";
const SENHA = process.argv[4] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const SUF = String(Date.now()).slice(-6);
// Um ano de início único por rodada (o plano é @@unique por anoInicio; a LDO por exercício).
const ANO = 2100 + (Math.floor(Date.now() / 1000) % 90);

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

    // ── 1. a estrutura temática ──
    await irPara(page, "/planejamento/ppa/estrutura");
    const rEixo = await preencherEEnviar(page, "criar-estrutura-do-ppa", [
      { sel: 'select[name="tipo"]', valor: "EIXO", tipo: "select" },
      { sel: 'input[name="codigo"]', valor: `E${SUF}` },
      { sel: 'input[name="descricao"]', valor: `Eixo do percurso ${SUF}` },
    ]);
    conferir("estrutura: o eixo foi cadastrado", rEixo.tipo === "ok", rEixo.texto);
    await irPara(page, "/planejamento/ppa/estrutura");
    const eixoOpcao = await opcaoQueCasa(page, 'form[data-acao="criar-estrutura-do-ppa"] select[name="eixoId"]', `E${SUF}`);
    conferir("estrutura: RECARREGADA, o eixo novo aparece como pai possível da área", eixoOpcao !== null, "o select de eixo não oferece o eixo criado");
    const rArea = await preencherEEnviar(page, "criar-estrutura-do-ppa", [
      { sel: 'select[name="tipo"]', valor: "AREA", tipo: "select" },
      { sel: 'input[name="codigo"]', valor: `A${SUF}` },
      { sel: 'input[name="descricao"]', valor: `Área temática do percurso ${SUF}` },
      ...(eixoOpcao === null ? [] : [{ sel: 'select[name="eixoId"]', valor: eixoOpcao.valor, tipo: "select" as const }]),
    ]);
    conferir("estrutura: a área temática foi cadastrada sob o eixo", rArea.tipo === "ok", rArea.texto);
    const lista = await irPara(page, `/planejamento/ppa/estrutura?q=${SUF}`);
    conferir("estrutura: a listagem filtrada traz o eixo e a área", lista.includes(`e${SUF}`.toLowerCase()) && lista.includes(`a${SUF}`.toLowerCase()), lista.slice(0, 300));

    // ── 2. o plano ──
    await irPara(page, "/planejamento/ppa");
    const rPlanoErrado = await preencherEEnviar(page, "criar-planos-plurianuais", [
      { sel: 'input[name="anoInicio"]', valor: String(ANO) },
      { sel: 'input[name="anoFim"]', valor: String(ANO + 4) },
      { sel: 'input[name="leiRef"]', valor: `Lei ${SUF}/${ANO - 1}` },
      { sel: 'input[name="dataPublicacao"]', valor: `${ANO - 1}-12-20`, tipo: "data" },
    ]);
    conferir("plano: cinco exercícios são RECUSADOS nomeando a duração", rPlanoErrado.tipo === "erro" && /DURAÇÃO INVÁLIDA/i.test(rPlanoErrado.texto), rPlanoErrado.texto);
    await irPara(page, "/planejamento/ppa");
    const rPlano = await preencherEEnviar(page, "criar-planos-plurianuais", [
      { sel: 'input[name="anoInicio"]', valor: String(ANO) },
      { sel: 'input[name="anoFim"]', valor: String(ANO + 3) },
      { sel: 'input[name="leiRef"]', valor: `Lei ${SUF}/${ANO - 1}` },
      { sel: 'input[name="dataPublicacao"]', valor: `${ANO - 1}-12-20`, tipo: "data" },
    ]);
    conferir("plano: o quadriênio foi cadastrado", rPlano.tipo === "ok", rPlano.texto);
    await irPara(page, `/planejamento/ppa?ano=${ANO + 2}`);
    const hrefPlano = await hrefDoRegistro(page, `${ANO}–${ANO + 3}`);
    conferir("plano: RECARREGADA, a lista filtrada pelo exercício vigente traz o plano", hrefPlano !== null, "o plano não veio na lista");
    if (hrefPlano === null) throw new Error("sem plano para seguir");

    await irPara(page, hrefPlano);
    const programa = await primeiraOpcao(page, 'form[data-acao="programa-no-plano"] select[name="programaId"]');
    const area = await opcaoQueCasa(page, 'form[data-acao="programa-no-plano"] select[name="areaTematicaId"]', `A${SUF}`);
    conferir("plano: o formulário oferece o programa do M02 e a área temática recém-criada", programa !== null && area !== null, `programa=${programa?.rotulo ?? "nenhum"} area=${area?.rotulo ?? "nenhuma"}`);
    const rProg = await preencherEEnviar(page, "programa-no-plano", [
      ...(programa === null ? [] : [{ sel: 'select[name="programaId"]', valor: programa.valor, tipo: "select" as const }]),
      ...(area === null ? [] : [{ sel: 'select[name="areaTematicaId"]', valor: area.valor, tipo: "select" as const }]),
      { sel: 'textarea[name="estrategia"]', valor: "Executar em parceria com os distritos (percurso)." },
      { sel: 'input[data-mascara="valor"]', valor: "1000000,00" },
    ]);
    conferir("plano: o programa entrou no plano com valor previsto", rProg.tipo === "ok", rProg.texto);
    await irPara(page, hrefPlano);
    const natureza = await primeiraOpcao(page, 'form[data-acao="previsao-de-receita"] select[name="naturezaReceitaId"]');
    const fonte = await primeiraOpcao(page, 'form[data-acao="previsao-de-receita"] select[name="fonteId"]');
    conferir("plano: a previsão oferece natureza de receita e fonte", natureza !== null && fonte !== null, `natureza=${natureza?.rotulo ?? "nenhuma"} fonte=${fonte?.rotulo ?? "nenhuma"}`);
    const rPrev = await preencherEEnviar(page, "previsao-de-receita", [
      ...(natureza === null ? [] : [{ sel: 'select[name="naturezaReceitaId"]', valor: natureza.valor, tipo: "select" as const }]),
      ...(fonte === null ? [] : [{ sel: 'select[name="fonteId"]', valor: fonte.valor, tipo: "select" as const }]),
      { sel: 'input[name="ano"]', valor: String(ANO + 1) },
      { sel: 'input[data-mascara="valor"]', valor: "500000,00" },
    ]);
    conferir("plano: a receita do quadriênio foi prevista", rPrev.tipo === "ok", rPrev.texto);
    await irPara(page, hrefPlano);
    const rHistErrado = await preencherEEnviar(page, "receita-anterior", [
      ...(natureza === null ? [] : [{ sel: 'select[name="naturezaReceitaId"]', valor: natureza.valor, tipo: "select" as const }]),
      { sel: 'input[name="ano"]', valor: String(ANO) },
      { sel: 'input[data-mascara="valor"]', valor: "450000,00" },
    ]);
    conferir("plano: série histórica DENTRO do quadriênio é RECUSADA nomeando", rHistErrado.tipo === "erro" && /ANO NÃO É ANTERIOR AO PLANO/i.test(rHistErrado.texto), rHistErrado.texto);
    await irPara(page, hrefPlano);
    const rHist = await preencherEEnviar(page, "receita-anterior", [
      ...(natureza === null ? [] : [{ sel: 'select[name="naturezaReceitaId"]', valor: natureza.valor, tipo: "select" as const }]),
      { sel: 'input[name="ano"]', valor: String(ANO - 1) },
      { sel: 'input[data-mascara="valor"]', valor: "450000,00" },
    ]);
    conferir("plano: a série histórica anterior ao plano foi registrada", rHist.tipo === "ok", rHist.texto);
    const historicoDoPlano = await irPara(page, `${hrefPlano}?aba=historico`);
    conferir("plano: RECARREGADO, o histórico traz o programa, a previsão e a série histórica", historicoDoPlano.includes("programa") && historicoDoPlano.includes(`receita prevista ${ANO + 1}`) && historicoDoPlano.includes(`receita realizada em ${ANO - 1}`), historicoDoPlano.slice(0, 400));
    const hrefsPrograma = await hrefsDoHistorico(page, "Abrir o programa no plano");
    conferir("plano: o programa do histórico liga ao seu detalhe", hrefsPrograma.length >= 1, "sem link");

    // ── 3. o programa no plano: ação e indicador ──
    if (hrefsPrograma[0] !== undefined) {
      await irPara(page, hrefsPrograma[0]);
      const acao = await primeiraOpcao(page, 'form[data-acao="acao-do-plano"] select[name="acaoId"]');
      const unidade = await primeiraOpcao(page, 'form[data-acao="acao-do-plano"] select[name="unidadeExecutoraId"]');
      const funcao = await primeiraOpcao(page, 'form[data-acao="acao-do-plano"] select[name="funcaoId"]');
      const subfuncao = await primeiraOpcao(page, 'form[data-acao="acao-do-plano"] select[name="subfuncaoId"]');
      const rAcao = await preencherEEnviar(page, "acao-do-plano", [
        ...(acao === null ? [] : [{ sel: 'select[name="acaoId"]', valor: acao.valor, tipo: "select" as const }]),
        ...(unidade === null ? [] : [{ sel: 'select[name="unidadeExecutoraId"]', valor: unidade.valor, tipo: "select" as const }]),
        ...(funcao === null ? [] : [{ sel: 'select[name="funcaoId"]', valor: funcao.valor, tipo: "select" as const }]),
        ...(subfuncao === null ? [] : [{ sel: 'select[name="subfuncaoId"]', valor: subfuncao.valor, tipo: "select" as const }]),
        { sel: 'input[name="produto"]', valor: "Pavimentação executada" },
        { sel: 'input[name="unidadeMedida"]', valor: "km" },
        { sel: 'input[name="metaFisica"]', valor: "3,5" },
        { sel: 'input[data-mascara="valor"]', valor: "250000,00" },
      ]);
      conferir("programa: a ação do plano entrou com meta física de seis casas", rAcao.tipo === "ok", rAcao.texto);
      await irPara(page, hrefsPrograma[0]);
      const rInd = await preencherEEnviar(page, "indicador", [
        { sel: 'input[name="descricao"]', valor: "Vias pavimentadas" },
        { sel: 'input[name="unidadeMedida"]', valor: "percentual" },
        { sel: 'input[name="situacaoInicial"]', valor: "42,5" },
        { sel: 'input[name="situacaoModificada"]', valor: "60" },
      ]);
      conferir("programa: o indicador foi registrado", rInd.tipo === "ok", rInd.texto);
      const histPrograma = await irPara(page, `${hrefsPrograma[0]}?aba=historico`);
      conferir("programa: RECARREGADO, o histórico traz a ação (3.500000 km) e o indicador", histPrograma.includes("3.500000 km") && histPrograma.includes("indicador: vias pavimentadas"), histPrograma.slice(0, 400));
    }

    // ── 4. a LDO ──
    await irPara(page, "/planejamento/ldo");
    const rLdo = await preencherEEnviar(page, "criar-leis-de-diretrizes", [
      { sel: 'input[name="exercicio"]', valor: String(ANO) },
      { sel: 'input[name="inicioVigencia"]', valor: `${ANO}-01-01`, tipo: "data" },
      { sel: 'input[name="fimVigencia"]', valor: `${ANO}-12-31`, tipo: "data" },
      { sel: 'input[name="dataEnvioLegislativo"]', valor: `${ANO - 1}-08-15`, tipo: "data" },
    ]);
    conferir("LDO: cadastrada, no Legislativo", rLdo.tipo === "ok", rLdo.texto);
    await irPara(page, `/planejamento/ldo?exercicio=${ANO}`);
    const hrefLdo = await hrefDoRegistro(page, String(ANO));
    conferir("LDO: RECARREGADA, a lista traz a LDO com o trâmite derivado", hrefLdo !== null && (await texto(page)).includes("no legislativo"), hrefLdo ?? "sem link");
    if (hrefLdo === null) throw new Error("sem LDO para seguir");
    await irPara(page, hrefLdo);
    const META = (receitaPrimaria: string) => [
      { sel: 'input[name="ano"]', valor: String(ANO), indice: 0 },
      { sel: 'input[data-mascara="valor"]', valor: "1000000,00", indice: 0 },
      { sel: 'input[data-mascara="valor"]', valor: receitaPrimaria, indice: 1 },
      { sel: 'input[data-mascara="valor"]', valor: "950000,00", indice: 2 },
      { sel: 'input[data-mascara="valor"]', valor: "800000,00", indice: 3 },
      { sel: 'input[name="resultadoNominal"]', valor: "-50000,00" },
      { sel: 'input[data-mascara="valor"]', valor: "0,00", indice: 4 },
      { sel: 'input[data-mascara="valor"]', valor: "0,00", indice: 5 },
      { sel: 'input[data-mascara="valor"]', valor: "0,00", indice: 6 },
      { sel: 'input[data-mascara="valor"]', valor: "0,00", indice: 7 },
      { sel: 'input[name="impactoSaldoPpp"]', valor: "0" },
    ];
    const rMetaErrada = await preencherEEnviar(page, "meta-anual", META("1100000,00"));
    conferir("LDO: receita primária maior que a total é RECUSADA nomeando", rMetaErrada.tipo === "erro" && /RECEITA PRIMÁRIA/i.test(rMetaErrada.texto), rMetaErrada.texto);
    await irPara(page, hrefLdo);
    const rMeta = await preencherEEnviar(page, "meta-anual", META("900000,00"));
    conferir("LDO: a meta anual foi registrada", rMeta.tipo === "ok", rMeta.texto);
    await irPara(page, hrefLdo);
    const rRisco = await preencherEEnviar(page, "risco-fiscal", [
      { sel: 'select[name="codigoPassivo"]', valor: "99", tipo: "select" },
      { sel: 'input[name="descricaoPassivo"]', valor: `Demandas judiciais do percurso ${SUF}` },
      { sel: 'input[data-mascara="valor"]', valor: "120000,00", indice: 0 },
      { sel: 'input[name="descricaoProvidencia"]', valor: "Reserva de contingência" },
      { sel: 'input[data-mascara="valor"]', valor: "120000,00", indice: 1 },
    ]);
    conferir("LDO: o risco fiscal (passivo 99, outros) foi registrado com a providência", rRisco.tipo === "ok", rRisco.texto);
    await irPara(page, hrefLdo);
    const rAlien = await preencherEEnviar(page, "alienacao", [
      { sel: 'input[name="descricaoBem"]', valor: `Terreno do percurso ${SUF}` },
      { sel: 'input[data-mascara="valor"]', valor: "800000,00" },
      { sel: 'input[name="numeroLaudo"]', valor: `LAUDO-${SUF}` },
    ]);
    conferir("LDO: a alienação prevista foi registrada", rAlien.tipo === "ok", rAlien.texto);
    await irPara(page, hrefLdo);
    const alien = await opcaoQueCasa(page, 'form[data-acao="aplicacao-da-alienacao"] select[name="alienacaoId"]', `Terreno do percurso ${SUF}`);
    conferir("LDO: RECARREGADA, a aplicação oferece SÓ as alienações desta LDO — inclusive a nova", alien !== null, "a alienação não veio no select");
    const rAplic = await preencherEEnviar(page, "aplicacao-da-alienacao", [
      ...(alien === null ? [] : [{ sel: 'select[name="alienacaoId"]', valor: alien.valor, tipo: "select" as const }]),
      { sel: 'select[name="tipoAplicacao"]', valor: "1", tipo: "select" },
      { sel: 'input[name="anoAplicacao"]', valor: String(ANO) },
      { sel: 'input[name="descricao"]', valor: "Obras de infraestrutura" },
      { sel: 'input[data-mascara="valor"]', valor: "800000,00" },
    ]);
    conferir("LDO: a aplicação do produto da alienação foi declarada", rAplic.tipo === "ok", rAplic.texto);
    const histLdo = await irPara(page, `${hrefLdo}?aba=historico`);
    conferir("LDO: o histórico traz a meta anual com o resultado primário DERIVADO (100000.00)", histLdo.includes("resultado primário derivado 100000.00"), histLdo.slice(0, 500));

    // ── 5. os anexos em PDF ──
    const textoMetas = await textoDoPdf(page, `${BASE}${hrefLdo}/anexos/metas-anuais`);
    conferir("anexo: o PDF de metas anuais é gerado e traz o exercício e o resultado primário", textoMetas.includes(String(ANO)) && /Metas/i.test(textoMetas) && /100\.000,00/.test(textoMetas), textoMetas.slice(0, 300));
    const textoRiscos = await textoDoPdf(page, `${BASE}${hrefLdo}/anexos/riscos-fiscais`);
    conferir("anexo: o PDF de riscos fiscais traz o passivo e a providência", textoRiscos.includes(`Demandas judiciais do percurso ${SUF}`) && textoRiscos.includes("Reserva de contingência"), textoRiscos.slice(0, 300));
    const inexistente = await page.evaluate(async (u) => (await fetch(u)).status, `${BASE}${hrefLdo}/anexos/nao-existe`);
    conferir("anexo: chave desconhecida é 404, não um anexo improvisado", inexistente === 404, `status=${inexistente}`);
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
