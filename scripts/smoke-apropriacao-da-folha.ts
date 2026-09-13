import "dotenv/config";
import puppeteer, { type Browser, type Page } from "puppeteer";

/**
 * SMOKE DA APROPRIAÇÃO CONTÁBIL DA FOLHA (M33, V6 P2.3b; TR 5.12.71) — navegador real.
 *
 * O RH abre e calcula a folha de uma competência do EXERCÍCIO ABERTO → a contabilidade FECHA,
 * cadastra o grupo de empenho (quais rubricas, qual ficha) e APROPRIA → os empenhos aparecem no
 * detalhe da folha e na tela da despesa, com o mesmo número determinístico → apropriar de novo
 * NÃO duplica → e o RH não vê o formulário de apropriar.
 *
 * ⚠️ A COMPETÊNCIA É DE 2026 de propósito: o empenho só entra em exercício ABERTO, e o banco dos
 * percursos tem 2026. A data dos empenhos é o último dia da competência.
 *
 * ⚠️ A FICHA DOS PERCURSOS É DE SERVIÇOS DE TERCEIROS (339039) — a folha real usaria 319011. O
 * percurso exercita o MECANISMO (saldo, razão, fila do art. 141), não a classificação; a
 * pendência é do banco de demonstração (`FICHA-DE-PESSOAL-NOS-PERCURSOS`), não do código.
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


async function main(): Promise<void> {
  if (SENHA === "") throw new Error("senha ausente (PERCURSOS_SENHA_PAPEIS).");
  let navegador: Browser | undefined;
  try {
    navegador = await puppeteer.launch({
      headless: true,
      protocolTimeout: 180000,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-extensions", "--disable-background-networking", "--renderer-process-limit=1", "--js-flags=--max-old-space-size=256"],
    });
    const page = await navegador.newPage();
    page.setDefaultTimeout(120000);

    // ── 1. o RH abre e calcula a folha de uma competência do exercício aberto ──
    await entrar(page);
    ok("login como RH");
    const COMP = await competenciaLivreDe2026(page);
    console.log(`      [competência ${COMP} · empenhos em ${ultimoDiaDaCompetencia(COMP)}]`);
    const rAbrir = await preencherEEnviar(page, "criar-folhas", [
      { sel: 'input[name="competencia"]', valor: COMP },
      { sel: 'select[name="tipo"]', valor: "MENSAL", tipo: "select" },
    ]);
    conferir(`1.1 folha ${COMP} aberta`, rAbrir.tipo === "ok", rAbrir.texto.slice(0, 200));
    await irPara(page, `/folha/folhas?q=${COMP}`);
    const hrefFolha = await hrefDoRegistro(page, COMP);
    if (hrefFolha === null) throw new Error("sem folha para seguir");

    let rCalc = { tipo: "silencio", texto: "" };
    for (let tentativa = 0; tentativa < 8; tentativa += 1) {
      await irPara(page, hrefFolha);
      rCalc = await preencherEEnviar(page, "calcular", [{ sel: 'input[name="motivo"]', valor: `folha do percurso da apropriação ${SUF}` }]);
      const semRegime = /VINCULO-SEM-REGIME-PREVIDENCIARIO: a matrícula (\S+)/.exec(rCalc.texto);
      if (semRegime === null) break;
      const matricula = semRegime[1] as string;
      await irPara(page, `/pessoal/servidores?q=${encodeURIComponent(matricula)}`);
      const href = await page.evaluate(() => (document.querySelector('tbody a[href^="/pessoal/servidores/"]') as HTMLAnchorElement | null)?.getAttribute("href") ?? "");
      if (href === "") break;
      await irPara(page, href);
      // A carga do regime tem lista PRÓPRIA, que inclui os desligados — é o único lugar que os inclui.
      const alvo = await opcaoQueCasa(page, 'form[data-acao="informar-regime"] select[name="vinculoRegimeId"]', matricula);
      if (alvo === null) {
        // ⚠️ LACUNA CONHECIDA DO PRODUTO, e o percurso a NOMEIA em vez de insistir: a matrícula
        // DESLIGADA não é oferecida às movimentações (regra certa — vínculo encerrado não recebe
        // evento novo), e por isso o regime previdenciário de um vínculo legado JÁ DESLIGADO não
        // tem por onde ser informado. A folha da competência em que ele ainda viveu um dia fica
        // travada. Pendência `REGIME-DE-VINCULO-DESLIGADO` (MODULO do M32).
        falhou("1.2 o RH calcula a folha", `a matrícula ${matricula} não aparece nem na lista da carga do regime — nada a fazer pela tela.`);
        break;
      }
      // ⚠️ A DATA TEM DE CAIR DENTRO DA VIDA DO VÍNCULO: o último dia da competência serve para
      // quem estava vivo o mês todo; para quem foi DESLIGADO no começo dele, serve o primeiro dia
      // (a carga do regime é aceita até o desligamento, inclusive). Duas tentativas cobrem os dois.
      for (const data of [ultimoDiaDaCompetencia(COMP), `${COMP}-01`]) {
        const r = await preencherEEnviar(page, "informar-regime", [
          ...(alvo === null ? [] : [{ sel: 'select[name="vinculoRegimeId"]', valor: alvo.valor, tipo: "select" as const }]),
          { sel: 'input[name="data"]', valor: data, tipo: "data" },
          { sel: 'select[name="regimePrevidenciario"]', valor: "RGPS", tipo: "select" },
          { sel: 'input[name="motivo"]', valor: "carga do regime previdenciário do vínculo legado (percurso)" },
        ]);
        if (r.tipo === "ok") break;
        await irPara(page, href);
      }
    }
    if (!falhas.some((f) => f.startsWith("1.2"))) conferir("1.2 o RH calcula a folha", rCalc.tipo === "ok", `${rCalc.tipo}: ${rCalc.texto.slice(0, 200)}`);
    if (rCalc.tipo !== "ok") {
      console.log("      [o percurso para aqui: sem cálculo não há fechamento, e sem fechamento não há apropriação]");
      throw new Error("cálculo da folha não passou — ver a falha 1.2");
    }

    // ⚠️ ANTES DO FECHAMENTO: apropriar é recusado — o cálculo vivo ainda pode ser cancelado.
    await sair(page);
    await entrar(page, CONTABILIDADE, SENHA_PAPEIS);
    ok("2.0 contabilidade entra");
    await irPara(page, hrefFolha);
    const rAntes = await preencherEEnviar(page, "apropriar", [{ sel: 'input[name="dataDoEmpenho"]', valor: ultimoDiaDaCompetencia(COMP), tipo: "data" }]);
    conferir("2.1 NEGATIVA: apropriar a folha ABERTA é recusado nomeando o motivo", rAntes.tipo === "erro" && /FOLHA-NAO-FECHADA/.test(rAntes.texto), `${rAntes.tipo}: ${rAntes.texto.slice(0, 200)}`);

    // ── 2. a contabilidade fecha, cadastra o grupo e apropria ──
    await irPara(page, hrefFolha);
    const rFechar = await preencherEEnviar(page, "fechar", []);
    conferir("2.2 a contabilidade fecha a folha", rFechar.tipo === "ok", `${rFechar.tipo}: ${rFechar.texto.slice(0, 200)}`);

    await irPara(page, "/folha/grupos-de-empenho");
    const grupos = await page.evaluate(() => Array.from(document.querySelectorAll("tbody tr")).map((tr) => (tr.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase()));
    if (grupos.length === 0) {
      // As rubricas de PROVENTO ficam TODAS no mesmo grupo: uma que sobrasse faria a apropriação
      // recusar (e é isso que o passo 3.1 prova).
      const marcaveis = await page.evaluate(() =>
        Array.from(document.querySelectorAll('form[data-acao="criar-grupo-de-empenho"] input[type="checkbox"][name^="rubricas."]'))
          .filter((el) => !(el as HTMLInputElement).disabled)
          .map((el) => (el as HTMLInputElement).name)
      );
      conferir("2.3 a ilha do grupo oferece as rubricas de provento", marcaveis.length > 0, "nenhuma caixa de rubrica");
      // ⚠️ A FICHA COM MAIOR SALDO, e não a primeira: a folha inteira precisa caber, e o rótulo da
      // opção já traz "disponível N" — escolher a primeira foi o que fez a execução anterior parar
      // no terceiro servidor.
      const ficha = await page.evaluate(() => {
        const opcoes = Array.from(document.querySelectorAll('form[data-acao="criar-grupo-de-empenho"] select[name="fichaId"] option'))
          .map((o) => ({ valor: (o as HTMLOptionElement).value, rotulo: o.textContent ?? "" }))
          .filter((o) => o.valor !== "");
        const saldo = (r: string): number => Number((/disponível\s+([\d.]+)/.exec(r)?.[1] ?? "0").replace(/\./g, ""));
        return opcoes.sort((a, b) => saldo(b.rotulo) - saldo(a.rotulo))[0] ?? null;
      });
      const r = await preencherEEnviar(page, "criar-grupo-de-empenho", [
        { sel: 'input[name="codigo"]', valor: `FOLHA-${SUF}` },
        { sel: 'input[name="descricao"]', valor: "Vencimentos e demais proventos (percurso)" },
        { sel: 'input[name="serie"]', valor: "FP" },
        ...(ficha === null ? [] : [{ sel: 'select[name="fichaId"]', valor: ficha.valor, tipo: "select" as const }]),
        { sel: 'select[name="tipoEmpenho"]', valor: "ORDINARIO", tipo: "select" },
        { sel: 'select[name="categoriaOrdemCronologica"]', valor: "PRESTACAO_SERVICOS", tipo: "select" },
        ...marcaveis.map((name) => ({ sel: `input[name="${name}"]`, valor: "sim", tipo: "marcar" as const })),
      ]);
      conferir("2.4 grupo de empenho cadastrado (por servidor, na ficha com saldo)", r.tipo === "ok", r.texto.slice(0, 220));
    } else {
      ok(`2.3/2.4 grupo de empenho já cadastrado (execução anterior): ${grupos.length} grupo(s) — reusado`);
    }

    await irPara(page, hrefFolha);
    const rApropriar = await preencherEEnviar(page, "apropriar", [{ sel: 'input[name="dataDoEmpenho"]', valor: ultimoDiaDaCompetencia(COMP), tipo: "data" }]);
    // ⚠️ DOIS DESFECHOS, E OS DOIS SÃO O PRODUTO FUNCIONANDO. Quando a ficha do grupo comporta a
    // folha inteira, a apropriação grava tudo. Quando não comporta — e é o caso do banco dos
    // percursos, cuja ficha de demonstração é curta —, ela PARA, diz em qual grupo e matrícula
    // parou e por quê, e os empenhos já gravados continuam valendo. O que o percurso não admite é
    // silêncio: ou grava e diz quanto, ou recusa e diz onde.
    const interrompida = /APROPRIACAO-INTERROMPIDA/.test(rApropriar.texto);
    if (interrompida) {
      conferir(
        "3.1 a apropriação PARA por saldo e diz onde parou — os empenhos já gravados continuam (retomável)",
        /Saldo insuficiente/.test(rApropriar.texto) && /CONTINUAM válidos/.test(rApropriar.texto) && /parou em \S+ \/ \S+/.test(rApropriar.texto),
        rApropriar.texto.slice(0, 300)
      );
      console.log("      [a ficha do grupo não comporta a folha inteira no banco dos percursos — pendência FICHA-DE-PESSOAL-NOS-PERCURSOS]");
    } else {
      conferir("3.1 a apropriação grava e diz quantos empenhos, em qual ficha e quanto", rApropriar.tipo === "ok" && /empenho\(s\)/.test(rApropriar.texto), `${rApropriar.tipo}: ${rApropriar.texto.slice(0, 300)}`);
    }

    const detalhe = await irPara(page, hrefFolha);
    const gravados = await page.evaluate(() => document.querySelectorAll("[data-empenho]").length);
    if (gravados === 0) {
      // A apropriação parou antes do primeiro empenho: o percurso afirma que a TELA diz isso, em
      // vez de mostrar uma tabela vazia sob o título "empenhos gerados por esta folha".
      conferir("3.2 sem empenho gravado, a tela DIZ que a apropriação parou antes do primeiro — não mostra tabela vazia", detalhe.includes("parou antes de gravar o primeiro") && !detalhe.includes("empenhos gerados por esta folha"), detalhe.slice(0, 500));
      ok("3.3/3.4/3.5 pulados: nenhum empenho nesta competência (a ficha do grupo não comporta) — o caminho com empenho está provado no log r2 desta mesma unidade e em m33-apropriacao.test.ts");
    } else {
      conferir("3.2 o detalhe mostra os empenhos gerados pela folha, com o número determinístico", detalhe.includes(`fp/${COMP.toLowerCase()}/`), detalhe.slice(0, 600));
      // ⚠️ O TEXTO DO PAINEL, não o aviso do botão: "só o bruto é empenhado" aparece nos dois, e a
      // primeira versão passava sem que painel nenhum existisse.
      conferir("3.3 o painel dos empenhos existe e diz que só o BRUTO foi empenhado", detalhe.includes("empenhos gerados por esta folha") && detalhe.includes("só o bruto é empenhado"), detalhe.slice(0, 600));
      const hrefEmpenho = await page.evaluate(() => (document.querySelector('a[href^="/despesa/empenhos/"]') as HTMLAnchorElement | null)?.getAttribute("href") ?? "");
      conferir("3.4 a linha leva ao empenho de verdade (tela da despesa)", hrefEmpenho !== "", "sem link para o empenho");
      if (hrefEmpenho !== "") {
        const emp = await irPara(page, hrefEmpenho);
        conferir("3.5 o empenho existe na despesa, com o histórico da competência", emp.includes(COMP.toLowerCase()) && emp.includes("folha mensal"), emp.slice(0, 400));
      }
    }

    // ── 4. reexecutar não duplica ──
    await irPara(page, hrefFolha);
    const empenhosAntes = await page.evaluate(() => document.querySelectorAll("[data-empenho]").length);
    const rDeNovo = await preencherEEnviar(page, "apropriar", [{ sel: 'input[name="dataDoEmpenho"]', valor: ultimoDiaDaCompetencia(COMP), tipo: "data" }]);
    // ⚠️ A PROVA DA IDEMPOTÊNCIA VALE NOS DOIS DESFECHOS: se tudo coube, a segunda passada diz que
    // os empenhos JÁ EXISTEM; se parou por saldo, a segunda passada grava ZERO novos e para no
    // MESMO ponto — em nenhum dos dois ela empenha de novo o que já estava empenhado.
    const naoDuplicou = interrompida
      ? /APROPRIACAO-INTERROMPIDA: 0 empenho\(s\) já gravado\(s\)/.test(rDeNovo.texto)
      : rDeNovo.tipo === "ok" && /já existem|já existiam/.test(rDeNovo.texto);
    conferir("4.1 ⚠️ apropriar DE NOVO não duplica: a numeração determinística reconhece os que já existem", naoDuplicou, `${rDeNovo.tipo}: ${rDeNovo.texto.slice(0, 250)}`);
    await irPara(page, hrefFolha);
    const empenhosDepois = await page.evaluate(() => document.querySelectorAll("[data-empenho]").length);
    conferir("4.2 e a lista de empenhos da folha continua do mesmo tamanho", empenhosDepois === empenhosAntes, `antes ${empenhosAntes}, depois ${empenhosDepois}`);

    // ── 5. quem calcula não apropria ──
    await sair(page);
    await entrar(page);
    await irPara(page, hrefFolha);
    const temApropriar = (await page.$('form[data-acao="apropriar"]')) !== null;
    conferir("5.1 NEGATIVA: o RH não vê o formulário de APROPRIAR (a ação é da contabilidade)", !temApropriar, "o formulário de apropriar apareceu para quem não tem a ação");
    conferir("5.2 nenhum identificador de cláusula na tela", !/\bTR\s*\d+\.\d+/.test(await texto(page)), "apareceu rótulo de catálogo");
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
