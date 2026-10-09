import "dotenv/config";
import puppeteer, { type Browser, type Page } from "puppeteer";

/**
 * SMOKE DA CONTRATAÇÃO (M11, V4 §8 — Fila A) — navegador real contra o servidor.
 *
 * O percurso de quem contrata: cadastra o processo (pregão), tenta contratar ANTES de homologar
 * e vê a recusa; homologa; reserva dotação vinculada ao processo; contrata; registra uma
 * prorrogação no contrato e vê a vigência derivada mudar; empenha informando o contrato e a
 * reserva; e vê o empenho no histórico do contrato. Cada passo lê o dado DEPOIS de recarregar.
 *
 * ⚠️ ELE NÃO LIMPA O BANCO: números levam o sufixo do instante; a ficha é a primeira com saldo.
 */
const BASE = process.argv[2] ?? "http://localhost:3010";
const USUARIO = process.argv[3] ?? "admin@cg.pb.gov.br";
const SENHA = process.argv[4] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const SUF = String(Date.now()).slice(-6);
const PROCESSO = `2026/${SUF}`;
const CONTRATO = `CT-${SUF}`;
const EMPENHO = `2026NE${SUF}`;

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

    // ── 1. o processo ──
    await irPara(page, "/licitacoes/processos");
    const rProc = await preencherEEnviar(page, "criar-processos-licitatorios", [
      { sel: 'input[name="numeroProcesso"]', valor: PROCESSO },
      { sel: 'select[name="modalidade"]', valor: "PREGAO_ELETRONICO", tipo: "select" },
      { sel: 'input[data-mascara="valor"]', valor: "50000,00" },
      { sel: 'textarea[name="objeto"]', valor: `Aquisição de material de expediente (percurso ${SUF})` },
    ]);
    conferir("processo: cadastrado como pregão eletrônico", rProc.tipo === "ok", rProc.texto);
    await irPara(page, `/licitacoes/processos?q=${encodeURIComponent(PROCESSO)}`);
    const hrefProc = await hrefDoRegistro(page, PROCESSO);
    const listaProc = await texto(page);
    conferir("processo: RECARREGADA, a lista o traz EM ANDAMENTO", hrefProc !== null && listaProc.includes("em andamento"), hrefProc ?? "sem link");
    if (hrefProc === null) throw new Error("sem processo para seguir");

    // ── 2. contratar antes de homologar é recusado ──
    await irPara(page, hrefProc);
    const CONTRATO_CAMPOS = [
      { sel: 'input[name="numeroContrato"]', valor: CONTRATO },
      { sel: 'input[data-mascara="cpf-cnpj"]', valor: "12345678000195" },
      { sel: 'input[name="contratadoNome"]', valor: `Fornecedor do percurso ${SUF}` },
      { sel: 'input[data-mascara="valor"]', valor: "40000,00" },
      { sel: 'input[name="vigenciaInicio"]', valor: "2026-03-01", tipo: "data" as const },
      { sel: 'input[name="vigenciaFimInicial"]', valor: "2027-02-28", tipo: "data" as const },
      { sel: 'select[name="categoriaOrdemCronologica"]', valor: "FORNECIMENTO_BENS", tipo: "select" as const },
    ];
    const rAntes = await preencherEEnviar(page, "contratar", CONTRATO_CAMPOS);
    conferir("contrato: ANTES da homologação é RECUSADO nomeando", rAntes.tipo === "erro" && /PROCESSO NÃO HOMOLOGADO/i.test(rAntes.texto), rAntes.texto);

    // ── 3. homologar, reservar, contratar ──
    await irPara(page, hrefProc);
    const rHom = await preencherEEnviar(page, "homologar", [{ sel: 'input[name="data"]', valor: "2026-02-15", tipo: "data" }]);
    conferir("processo: homologado", rHom.tipo === "ok", rHom.texto);
    const depoisHom = await irPara(page, hrefProc);
    conferir("processo: RECARREGADO, a situação derivada diz HOMOLOGADO", depoisHom.includes("homologado"), depoisHom.slice(0, 300));
    const ficha = await primeiraOpcao(page, 'form[data-acao="reservar"] select[name="fichaId"]');
    conferir("processo: a reserva oferece uma ficha com saldo", ficha !== null, "sem ficha");
    const rRes = await preencherEEnviar(page, "reservar", [
      ...(ficha === null ? [] : [{ sel: 'select[name="fichaId"]', valor: ficha.valor, tipo: "select" as const }]),
      { sel: 'input[data-mascara="valor"]', valor: "1000,00" },
      { sel: 'input[name="historico"]', valor: `Reserva do percurso ${SUF}` },
      // V37 — a reserva tem data do fato; a do empenho por ela não pode ser anterior.
      { sel: 'input[name="data"]', valor: "2026-02-15", tipo: "data" },
    ]);
    conferir("processo: a dotação foi reservada e vinculada ao processo", rRes.tipo === "ok", rRes.texto);
    await irPara(page, hrefProc);
    const rCont = await preencherEEnviar(page, "contratar", CONTRATO_CAMPOS);
    conferir("contrato: cadastrado no processo homologado", rCont.tipo === "ok", rCont.texto);
    const histProc = await irPara(page, `${hrefProc}?aba=historico`);
    conferir("processo: RECARREGADO, o histórico traz a homologação, a reserva (saldo 1000.00) e o contrato", histProc.includes("homologação do processo") && histProc.includes("saldo 1000.00") && histProc.includes(`contrato ${CONTRATO.toLowerCase()}`), histProc.slice(0, 500));
    const hrefsContrato = await hrefsDoHistorico(page, "Abrir o contrato");
    conferir("processo: o contrato do histórico liga ao seu detalhe", hrefsContrato.length >= 1, "sem link");
    const hrefContrato = hrefsContrato[0];
    if (hrefContrato === undefined) throw new Error("sem contrato para seguir");

    // ── 4. o aditivo e a vigência derivada ──
    const antes = await irPara(page, hrefContrato);
    conferir("contrato: o detalhe mostra a vigência inicial até 28/02/2027", antes.includes("28/02/2027"), antes.slice(0, 400));
    const rAdit = await preencherEEnviar(page, "aditivo", [
      { sel: 'select[name="tipo"]', valor: "PRORROGACAO_PRAZO", tipo: "select" },
      { sel: 'input[name="dias"]', valor: "30" },
      { sel: 'input[name="data"]', valor: "2026-06-10", tipo: "data" },
      { sel: 'input[name="numeroAditivo"]', valor: `TA-${SUF}` },
      { sel: 'input[name="motivo"]', valor: "Prorrogação de prazo do percurso de contratação" },
    ]);
    conferir("contrato: a prorrogação de 30 dias foi registrada", rAdit.tipo === "ok", rAdit.texto);
    const depoisAdit = await irPara(page, hrefContrato);
    conferir("contrato: RECARREGADO, o fim da vigência DERIVADO passou a 30/03/2027", depoisAdit.includes("30/03/2027"), depoisAdit.slice(0, 400));

    // ── 5. o empenho vinculado ao contrato e à reserva ──
    await irPara(page, "/despesa/empenhos?exercicio=2026");
    const contratoOpcao = await opcaoQueCasa(page, 'form[data-acao="empenhar"] select[name="contratoId"]', CONTRATO);
    const reservaOpcao = await opcaoQueCasa(page, 'form[data-acao="empenhar"] select[name="reservaId"]', `percurso ${SUF}`);
    conferir("empenho: o formulário oferece o contrato vigente e a reserva viva", contratoOpcao !== null && reservaOpcao !== null, `contrato=${contratoOpcao?.rotulo ?? "nenhum"} reserva=${reservaOpcao?.rotulo ?? "nenhuma"}`);
    // A ficha da reserva: o rótulo do select de empenho é outro, então casa pelo NÚMERO da ficha.
    const numeroDaFicha = ficha === null ? "" : (/ficha (\d+)/.exec(ficha.rotulo)?.[1] ?? "");
    const fichaEmp = numeroDaFicha === "" ? null : await opcaoQueCasa(page, 'form[data-acao="empenhar"] select[name="fichaId"]', `${numeroDaFicha} — `);
    const rEmp = await preencherEEnviar(page, "empenhar", [
      ...(fichaEmp === null ? [] : [{ sel: 'select[name="fichaId"]', valor: fichaEmp.valor, tipo: "select" as const }]),
      { sel: 'input[name="numero"]', valor: EMPENHO },
      { sel: 'input[data-mascara="cpf-cnpj"]', valor: "12345678000195" },
      { sel: 'input[data-mascara="valor"]', valor: "1000,00" },
      { sel: 'input[name="data"]', valor: "2026-06-15", tipo: "data" },
      { sel: 'select[name="categoria"]', valor: "FORNECIMENTO_BENS", tipo: "select" },
      ...(contratoOpcao === null ? [] : [{ sel: 'select[name="contratoId"]', valor: contratoOpcao.valor, tipo: "select" as const }]),
      ...(reservaOpcao === null ? [] : [{ sel: 'select[name="reservaId"]', valor: reservaOpcao.valor, tipo: "select" as const }]),
      { sel: 'input[name="historico"]', valor: `Empenho vinculado ao contrato ${CONTRATO} (percurso)` },
    ]);
    conferir("empenho: emitido com o contrato e a reserva informados", rEmp.tipo === "ok", rEmp.texto);
    const histContrato = await irPara(page, `${hrefContrato}?aba=historico`);
    conferir("contrato: RECARREGADO, o histórico traz o empenho que o informou", histContrato.includes(`empenho ${EMPENHO.toLowerCase()}`), histContrato.slice(0, 400));
    const procFinal = await irPara(page, `${hrefProc}?aba=historico`);
    conferir("processo: a reserva mostra o consumo pelo empenho (saldo 0.00)", procFinal.includes("consumido por empenhos 1000.00"), procFinal.slice(0, 500));
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
