import "dotenv/config";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import puppeteer, { type Browser, type Page } from "puppeteer";

/**
 * SMOKE DA ARRECADAÇÃO × CONTA BANCÁRIA × CONCILIAÇÃO (M04/M09, V6 P1.2) — navegador real.
 *
 * O percurso: a guia registrada pela tela DECLARA a conta que recebeu (a de fonte diferente é
 * recusada nomeando); a conciliação por período da conta lista as guias do LEGADO sem conta (a de
 * 80.000 do cenário SAGRES, com a conta contábil que debitou); o tesoureiro atribui a conta pela
 * tela; a guia sai da lista e passa a aparecer como pendência do razão da conta; a tela diz, com
 * números, se a identidade fecha ou quanto sobra sem explicação — nunca 500.
 *
 * ⚠️ ELE NÃO LIMPA O BANCO: números levam o sufixo do instante. Helpers copiados do smoke das compras.
 */
const BASE = process.argv[2] ?? "http://localhost:3010";
// V39-R2 (R2-003): o destino e a natureza da base (declarada no banco) conferidos ANTES de qualquer credencial ou escrita.
await exigirDestinoDoPercurso(BASE);
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



function hoje(mais = 0): string {
  const d = new Date(Date.now() + mais * 86_400_000);
  return d.toISOString().slice(0, 10);
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

    // ── 1. a guia declara a conta ──
    const ano = new Date().getFullYear();
    await irPara(page, `/receita/arrecadacoes?exercicio=${ano}`);
    const conta = await opcaoQueCasa(page, 'form[data-acao="registrar-guia"] select[name="contaBancaria"]', "CC-500-01");
    conferir("1.1 a guia oferece a conta bancária (CC-500-01) com a fonte no rótulo", conta !== null && /fonte 500/.test(conta.rotulo), conta?.rotulo ?? "sem CC-500-01");
    if (conta === null) throw new Error("sem conta para seguir");
    const natureza = await page.evaluate(() => (document.querySelector('form[data-acao="registrar-guia"] datalist option') as HTMLOptionElement | null)?.value ?? "11130211");
    // ⚠️ A NEGATIVA conta × fonte só é demonstrável com uma SEGUNDA fonte cadastrada. O banco dos
    // percursos tem só a fonte 500 (uma guia de fonte inexistente é recusada ANTES, por classificação);
    // a recusa por fonte divergente está provada em m09-atribuicao-de-conta.test.ts t1.
    const outraFonte = await page.evaluate(() => {
      const vistos = new Set<string>();
      for (const o of Array.from(document.querySelectorAll('form[data-acao="registrar-guia"] datalist option'))) {
        const m = /fonte (\d{3})/.exec(o.textContent ?? "");
        if (m !== null && m[1] !== "500") vistos.add(m[1] as string);
      }
      return [...vistos][0] ?? null;
    });
    if (outraFonte !== null) {
      const rFonteErrada = await preencherEEnviar(page, "registrar-guia", [
        { sel: 'input[name="natureza"]', valor: natureza },
        { sel: 'input[name="fonte"]', valor: outraFonte },
        { sel: 'select[name="contaBancaria"]', valor: conta.valor, tipo: "select" },
        { sel: 'input[data-mascara="valor"]', valor: "150,00" },
        { sel: 'input[name="data"]', valor: hoje(), tipo: "data" },
        { sel: 'input[name="numeroReceita"]', valor: `G-F${outraFonte}-${SUF}` },
      ]);
      conferir(`1.2 guia da fonte ${outraFonte} na conta da fonte 500 é RECUSADA nomeando as duas fontes`, rFonteErrada.tipo === "erro" && /fonte 500/.test(rFonteErrada.texto) && new RegExp(`fonte ${outraFonte}`).test(rFonteErrada.texto), rFonteErrada.texto.slice(0, 200));
      await irPara(page, `/receita/arrecadacoes?exercicio=${ano}`);
    } else {
      console.log("      [1.2 pulado: o banco só tem a fonte 500 — a negativa conta × fonte está provada no teste de domínio]");
    }
    const rGuia = await preencherEEnviar(page, "registrar-guia", [
      { sel: 'input[name="natureza"]', valor: natureza },
      { sel: 'input[name="fonte"]', valor: "500" },
      { sel: 'select[name="contaBancaria"]', valor: conta.valor, tipo: "select" },
      { sel: 'input[data-mascara="valor"]', valor: "150,00" },
      { sel: 'input[name="data"]', valor: hoje(), tipo: "data" },
      { sel: 'input[name="numeroReceita"]', valor: `G-${SUF}` },
    ]);
    conferir("1.3 guia com a conta da mesma fonte é registrada", rGuia.tipo === "ok", rGuia.texto.slice(0, 200));
    const lista = await irPara(page, `/receita/arrecadacoes?exercicio=${ano}`);
    conferir("1.4 a guia aparece na lista após recarga", lista.includes(`g-${SUF}`.toLowerCase()), lista.slice(0, 200));

    // ── 2. a conciliação da conta: o legado sem conta ──
    await irPara(page, "/financeiro/conciliacao/periodo");
    const contaConc = await opcaoQueCasa(page, 'form[data-acao="abrir-conciliacao"] select[name="conta"]', "CC-500-01");
    if (contaConc === null) throw new Error("a conciliação não oferece CC-500-01");
    // Abre um período que cubra hoje; se a conta já tem período aberto, a recusa é do domínio e seguimos com o existente.
    const rAbrir = await preencherEEnviar(page, "abrir-conciliacao", [
      { sel: 'select[name="conta"]', valor: contaConc.valor, tipo: "select" },
      { sel: 'input[name="inicio"]', valor: hoje(-1), tipo: "data" },
      { sel: 'input[name="fim"]', valor: hoje(1), tipo: "data" },
    ]);
    console.log(`      [abrir período: ${rAbrir.tipo} ${rAbrir.texto.slice(0, 120)}]`);
    const tela = await irPara(page, `/financeiro/conciliacao/periodo?conta=${contaConc.valor}`);
    conferir("2.1 a tela da conciliação responde e diz o estado da identidade (fecha ou quanto sobra), nunca 500", (await page.$("[data-conciliacao], [data-nao-fecha]")) !== null, tela.slice(0, 300));
    const semConta = await page.evaluate(() => Array.from(document.querySelectorAll("[data-guia-sem-conta]")).map((li) => (li.textContent ?? "").replace(/\s+/g, " ").trim()));
    // ⚠️ IDEMPOTÊNCIA: o banco dos percursos NÃO é limpo entre execuções. Na primeira execução a
    // guia 7 (80.000 do SAGRES) está no legado; nas seguintes ela já foi atribuída e o alvo passa
    // a ser QUALQUER guia que ainda esteja sem conta. Se não sobrou nenhuma, a seção 3 é pulada
    // com nota — e a seção 4 confere que a guia 7 continua fora do legado.
    const legado80k = semConta.find((t) => /Guia 7 /.test(t) && /80\.?000/.test(t) && /1\.1\.1\.1\.1\.19\.00/.test(t));
    const alvos = await page.evaluate(() => Array.from(document.querySelectorAll("[data-guia-sem-conta]")).map((li) => ({ id: li.getAttribute("data-guia-sem-conta") ?? "", texto: (li.textContent ?? "").replace(/\s+/g, " ").trim() })));
    const alvo = alvos.find((x) => /Guia 7 /.test(x.texto)) ?? alvos[0];
    if (legado80k !== undefined) {
      conferir("2.2 a seção 'arrecadações sem conta' lista a guia 7 (80.000 do SAGRES) com a contábil que ela debitou", true, "");
    } else {
      console.log(`      [2.2: a guia 7 já não está no legado (atribuída em execução anterior); ${alvos.length} guia(s) sem conta restante(s)]`);
      conferir("2.2 toda guia listada no legado traz a contábil que debitou", alvos.every((x) => /\d\.\d\.\d\.\d\.\d\.\d\d\.\d\d/.test(x.texto)), alvos.map((x) => x.texto).join(" | ").slice(0, 300));
    }
    conferir("2.3 a guia recém-registrada NÃO está no legado (ela declarou a conta)", !semConta.some((t) => t.includes(`G-${SUF}`)), semConta.join(" | ").slice(0, 200));
    const naoFechaAntes = await page.evaluate(() => (document.querySelector("[data-nao-fecha]")?.textContent ?? "").replace(/\s+/g, " ").trim());
    console.log(`      [antes da atribuição: ${naoFechaAntes === "" ? "fecha" : naoFechaAntes.slice(0, 200)}]`);

    // ── 3. atribuir a conta ao legado ──
    const guiaId = alvo?.id ?? "";
    const rotuloDoAlvo = alvo === undefined ? "(nenhuma)" : (alvo.texto.match(/Guia \S+/)?.[0] ?? "a guia");
    if (alvo === undefined) {
      console.log("      [3.x pulado: nenhuma guia sem conta restou no legado — a atribuição está provada em m09-atribuicao-de-conta.test.ts e na primeira execução (c9f1c9f)]");
    } else {
      conferir(`3.1 ${rotuloDoAlvo} tem formulário de atribuição`, (await page.$(`form[data-acao="atribuir-conta"][data-guia="${guiaId}"]`)) !== null, "sem formulário");
      const rAtrib = await preencherEEnviar(page, `form[data-acao="atribuir-conta"][data-guia="${guiaId}"]`, [
        { sel: 'select[name="contaBancariaId"]', valor: contaConc.valor, tipo: "select" },
        { sel: 'input[name="motivo"]', valor: "guia do cenário SAGRES anterior à conta obrigatória (percurso)" },
      ]);
      // ⚠️ Depois da atribuição a guia SAI da lista do legado no re-render, e a ilha que produziu a
      // mensagem some com ela (pendência MENSAGEM-SOME-COM-A-LINHA, P4). O efeito é conferido em 3.3.
      // A atribuição pode ser RECUSADA com motivo quando o razão da guia debitou outra contábil —
      // isso também é comportamento certo, e o smoke o registra em vez de esconder.
      const recusadaComMotivo = rAtrib.tipo === "erro" && /debitou|contábil/i.test(rAtrib.texto);
      conferir(`3.2 a atribuição de ${rotuloDoAlvo} é aceita, ou recusada NOMEANDO a contábil que o razão debitou`, rAtrib.tipo === "ok" || recusadaComMotivo || rAtrib.texto === "", `${rAtrib.tipo}: ${rAtrib.texto.slice(0, 200)}`);
      await irPara(page, `/financeiro/conciliacao/periodo?conta=${contaConc.valor}`);
      const semContaDepois = await page.evaluate(() => Array.from(document.querySelectorAll("[data-guia-sem-conta]")).map((li) => (li.getAttribute("data-guia-sem-conta") ?? "")));
      if (recusadaComMotivo) {
        conferir(`3.3 ${rotuloDoAlvo} recusada continua no legado`, semContaDepois.includes(guiaId), semContaDepois.join(" | ").slice(0, 200));
      } else {
        conferir(`3.3 após recarga ${rotuloDoAlvo} saiu do legado`, !semContaDepois.includes(guiaId), semContaDepois.join(" | ").slice(0, 200));
      }
      const pendenciasDoRazao = await page.evaluate(() => Array.from(document.querySelectorAll("[data-pendencia-interna]")).map((li) => (li.textContent ?? "").replace(/\s+/g, " ").trim()));
      const naoFechaDepois = await page.evaluate(() => (document.querySelector("[data-nao-fecha]")?.textContent ?? "").replace(/\s+/g, " ").trim());
      console.log(`      [depois da atribuição: ${naoFechaDepois === "" ? "FECHA" : naoFechaDepois.slice(0, 240)}]`);
      if (naoFechaDepois === "") {
        conferir("3.4 a identidade FECHA e as arrecadações atribuídas aparecem como pendência do razão (ARRECADACAO) desta conta", pendenciasDoRazao.some((t) => /ARRECADACAO/.test(t)), pendenciasDoRazao.join(" | ").slice(0, 300));
      } else {
        conferir("3.4 a identidade ainda não fecha, e a tela DIZ quanto sobra sem explicação (não 500)", /SEM EXPLICAÇÃO/.test(naoFechaDepois), naoFechaDepois.slice(0, 200));
      }
    }

    // ── 4. atribuir de novo é recusado ──
    await irPara(page, `/financeiro/conciliacao/periodo?conta=${contaConc.valor}`);
    const guia7Depois = await page.evaluate(() => Array.from(document.querySelectorAll("[data-guia-sem-conta]")).some((li) => /Guia 7 /.test(li.textContent ?? "")));
    conferir("4.1 a guia 7 (atribuída nesta ou em execução anterior) não tem mais formulário de atribuição", !guia7Depois, "a guia 7 continua no legado com formulário");
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
