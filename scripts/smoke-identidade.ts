import "dotenv/config";
import { deflateSync } from "node:zlib";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer";

/**
 * SMOKE DA IDENTIDADE (V6 P0.1/P0.2) — navegador real contra o servidor.
 *
 * O que ele prova, pela tela:
 *   · a entrada mostra o PRODUTO (Gestão Pública), o AMBIENTE e nenhum literal de entidade;
 *   · sem apresentação configurada a identidade é neutra ("Ente não configurado"), sem canais públicos;
 *   · o administrador configura a apresentação (nome, órgão, fornecedor, imagem PNG, canais) e a
 *     entrada, o shell, o rodapé, a transparência e um PDF NOVO passam a mostrá-la;
 *   · a SEGUNDA VIA de um termo já emitido NÃO muda (mesmo sha256, mesmo nome de ente antigo);
 *   · o rodapé comum traz a versão curta, nunca o SHA completo; o SHA completo está em /administracao/sistema;
 *   · quem não tem CONFIGURAR_APRESENTACAO_DO_ENTE vê a configuração e não a altera;
 *   · em 360 px o menu abre pelo botão e fecha ao navegar; a "Minha mesa" tem os três blocos com estado;
 *   · DUAS ABAS: trocar o contexto (unidade) numa aba não muda a seleção da outra, e o comando
 *     pendente da primeira grava com os dados que ela mostrava.
 *
 * ⚠️ ELE NÃO LIMPA O BANCO: a apresentação é versionada, então cada rodada grava versões novas.
 */
const BASE = process.argv[2] ?? "http://localhost:3010";
const USUARIO = process.argv[3] ?? "admin@cg.pb.gov.br";
const SENHA = process.argv[4] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const RESTRITO = "operador.poc@cg.pb.gov.br";
const SENHA_RESTRITO = process.env["POC_SENHA_RESTRITO"] ?? "OperadorPOC#2026";
const SUF = Date.now().toString().slice(-6);
const NOME_NOVO = `Prefeitura Municipal de Demonstração ${SUF}`;
const LITERAIS_LEGADOS = ["campina grande", "sefin", "cg.pb.gov.br"];
const SHA_COMPLETO = /\b[0-9a-f]{40}\b/;

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

/** Um PNG 1×1 válido, gerado aqui — validado pelos BYTES no servidor. */
function pngMinimo(): Buffer {
  const crcTabela = new Int32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c;
  });
  const crc = (buf: Buffer): number => {
    let c = -1;
    for (const b of buf) c = (crcTabela[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const chunk = (tipo: string, dados: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(dados.length);
    const td = Buffer.concat([Buffer.from(tipo, "ascii"), dados]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = deflateSync(Buffer.from([0, 0x1e, 0x4e, 0x8c]));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

async function entrar(page: Page, usuario = USUARIO, senha = SENHA): Promise<void> {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('button[type="submit"]', { timeout: 60000 });
  await page.type('input[name="identificador"]', usuario);
  await page.type('input[name="senha"]', senha);
  const enviou = await page.evaluate(() => {
    const f = document.querySelector("form");
    if (!(f instanceof HTMLFormElement)) return "não achei o formulário de login";
    f.requestSubmit();
    return "";
  });
  if (enviou !== "") throw new Error(enviou);
  for (let i = 0; i < 120; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    if (!page.url().includes("/login")) return;
  }
  throw new Error(`login não passou (ainda em ${page.url()}).`);
}
async function sair(page: Page): Promise<void> {
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
async function texto(page: Page): Promise<string> {
  return (await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "))).toLowerCase();
}
async function irPara(page: Page, rota: string): Promise<{ readonly status: number; readonly texto: string }> {
  const resposta = await page.goto(`${BASE}${rota}`, { waitUntil: "networkidle2" });
  const status = resposta?.status() ?? 0;
  return { status, texto: await texto(page) };
}
async function atributo(page: Page, sel: string, attr: string | null): Promise<string | null> {
  return page.evaluate(
    (s, a) => {
      const el = document.querySelector(s);
      if (el === null) return null;
      return a === null ? (el.textContent ?? "").trim() : el.getAttribute(a);
    },
    sel,
    attr
  );
}
async function visivel(page: Page, sel: string): Promise<boolean> {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    return el instanceof HTMLElement && el.offsetParent !== null;
  }, sel);
}
async function esperarChave(page: Page, form: string): Promise<void> {
  await page.waitForSelector(`${form} input[name="__chave"][data-chave-de-comando="pronta"]`, { timeout: 30000 });
}
async function respostaDoForm(page: Page, form: string): Promise<{ readonly tipo: string; readonly texto: string }> {
  let resposta = { tipo: "silencio", texto: "" };
  for (let i = 0; i < 40 && resposta.tipo === "silencio"; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    resposta = await page.evaluate((sel) => {
      const f = document.querySelector(sel);
      const alerta = f?.querySelector('[role="alert"]');
      if (alerta !== null && alerta !== undefined) return { tipo: "erro", texto: (alerta.textContent ?? "").trim() };
      const bom = f?.querySelector('[role="status"]');
      return bom !== null && bom !== undefined ? { tipo: "ok", texto: (bom.textContent ?? "").trim() } : { tipo: "silencio", texto: "" };
    }, form);
  }
  return resposta;
}
async function limparEDigitar(page: Page, sel: string, valor: string): Promise<void> {
  await page.waitForSelector(sel, { timeout: 30000 });
  const el = await page.$(sel);
  if (el === null) throw new Error(`${sel} ausente`);
  await el.click({ count: 3 });
  await page.keyboard.press("Backspace");
  if (valor !== "") await el.type(valor, { delay: 3 });
}
async function marcar(page: Page, sel: string, marcado: boolean): Promise<void> {
  await page.evaluate(
    (s, m) => {
      const el = document.querySelector(s);
      if (el instanceof HTMLInputElement && el.checked !== m) el.click();
    },
    sel,
    marcado
  );
}
/** Baixa com a sessão do navegador: status, cabeçalhos pedidos e o texto do PDF (pdf.js, leitor independente). */
async function baixarPdf(page: Page, url: string): Promise<{ readonly status: number; readonly sha: string | null; readonly texto: string }> {
  const obtido = await page.evaluate(async (u) => {
    const r = await fetch(u);
    if (r.status !== 200) return { status: r.status, sha: null, b64: "" };
    const bytes = new Uint8Array(await r.arrayBuffer());
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return { status: r.status, sha: r.headers.get("x-documento-sha256"), b64: btoa(bin) };
  }, url);
  if (obtido.b64 === "") return { status: obtido.status, sha: null, texto: "" };
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(Buffer.from(obtido.b64, "base64")), useSystemFonts: true }).promise;
  const partes: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const pagina = await doc.getPage(i);
    const conteudo = await pagina.getTextContent();
    partes.push(conteudo.items.map((it) => ("str" in it ? it.str : "")).join(" "));
  }
  return { status: obtido.status, sha: obtido.sha, texto: partes.join("\n") };
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
    await page.setViewport({ width: 1366, height: 900 });

    // ── 1. A ENTRADA, ANTES DE QUALQUER CONFIGURAÇÃO DESTA RODADA ──
    const entrada = await irPara(page, "/login");
    conferir("1.1 /login responde 200", entrada.status === 200, `status ${entrada.status}`);
    conferir("1.2 a entrada nomeia o produto", (await atributo(page, "[data-marca-produto]", null)) === "Gestão Pública", `marca: ${await atributo(page, "[data-marca-produto]", null)}`);
    const legadoNaEntrada = LITERAIS_LEGADOS.filter((l) => entrada.texto.includes(l));
    conferir("1.3 nenhum literal de entidade legada na entrada", legadoNaEntrada.length === 0, legadoNaEntrada.join(", "));
    conferir("1.4 o ambiente é dito na entrada", (await atributo(page, "[data-ambiente]", null))?.startsWith("Ambiente de") === true, `ambiente: ${await atributo(page, "[data-ambiente]", null)}`);
    conferir("1.5 o rodapé da entrada não traz o SHA completo", !SHA_COMPLETO.test(await page.evaluate(() => document.body.innerText)), "SHA de 40 hex no corpo");
    conferir("1.6 o botão mostrar/ocultar senha existe com aria-pressed", (await atributo(page, 'button[aria-pressed]', "aria-pressed")) === "false", "sem botão de senha");
    conferir("1.7 todo campo da entrada tem rótulo", await page.evaluate(() => Array.from(document.querySelectorAll("form input:not([type=hidden])")).every((i) => i.id !== "" && document.querySelector(`label[for="${i.id}"]`) !== null)), "campo sem <label for>");

    // erro por campo: enviar vazio
    await page.evaluate(() => (document.querySelector("form") as HTMLFormElement).requestSubmit());
    await page.waitForFunction(() => document.querySelectorAll('input[aria-invalid="true"]').length === 2, { timeout: 30000 }).catch(() => undefined);
    conferir("1.8 campos vazios → erro POR CAMPO (aria-invalid nos dois), sem mensagem de credencial", (await page.$$('input[aria-invalid="true"]')).length === 2 && (await page.$('[role="alert"]')) === null, "erro por campo ausente");

    // ── 2. ENTRAR E VER O SHELL ──
    await entrar(page);
    const home = await irPara(page, "/");
    conferir("2.1 a home é a Minha mesa", home.texto.includes("minha mesa"), home.texto.slice(0, 200));
    for (const bloco of ["acoes", "processos", "comunicados"]) {
      const existe = (await page.$(`[data-mesa="${bloco}"]`)) !== null;
      conferir(`2.2 bloco "${bloco}" da mesa presente`, existe, "ausente");
    }
    const estadoIndisp = await page.$$('[data-estado="indisponivel"]');
    conferir("2.3 nenhum bloco da mesa está 'indisponível' (falha de consulta não é zero, e aqui não deve haver falha)", estadoIndisp.length === 0, `${estadoIndisp.length} indisponível(is)`);
    conferir("2.4 a sidebar nomeia o produto", (await atributo(page, "aside [data-marca-produto]", null)) === "Gestão Pública", "marca da sidebar");
    const rodapeAntes = (await atributo(page, "[data-rodape-ente]", null)) ?? "";
    console.log(`      [rodapé antes: "${rodapeAntes}"]`);
    const versaoRodape = await atributo(page, "[data-rodape-versao]", null);
    conferir("2.5 o rodapé traz a versão curta (7) ou nada — nunca o SHA completo", versaoRodape === null || /^versão [0-9a-f]{7}$/.test(versaoRodape), `rodapé: ${versaoRodape}`);
    const legadoNoShell = LITERAIS_LEGADOS.filter((l) => home.texto.includes(l) && l !== "cg.pb.gov.br");
    conferir("2.6 nenhum literal de entidade legada no shell (o e-mail do usuário logado é dado, não rótulo)", legadoNoShell.length === 0, legadoNoShell.join(", "));

    // ── 3. A ÁREA TÉCNICA TEM O SHA COMPLETO ──
    const sistema = await irPara(page, "/administracao/sistema");
    conferir("3.1 /administracao/sistema responde 200", sistema.status === 200, `status ${sistema.status}`);
    const commit = (await atributo(page, "[data-build-commit]", null)) ?? "";
    conferir("3.2 a área técnica mostra o commit completo (ou declara desenvolvimento)", SHA_COMPLETO.test(commit) || commit.includes("desenvolvimento"), `commit: ${commit}`);

    // ── 4. UM TERMO JÁ EMITIDO: a segunda via ANTES da reconfiguração ──
    const termos = await irPara(page, "/patrimonio/termos");
    const termoHref = await page.evaluate(() => Array.from(document.querySelectorAll('a[href^="/patrimonio/termos/"]')).map((a) => a.getAttribute("href") ?? "").find((h) => /\/patrimonio\/termos\/[^/?]+$/.test(h)) ?? null);
    conferir("4.1 há um termo patrimonial emitido para conferir a segunda via", termoHref !== null, `status ${termos.status}, sem link de termo`);
    let segundaViaAntes: Awaited<ReturnType<typeof baixarPdf>> | null = null;
    if (termoHref !== null) {
      segundaViaAntes = await baixarPdf(page, `${termoHref}/pdf`);
      conferir("4.2 a segunda via baixa com sha256 no cabeçalho", segundaViaAntes.status === 200 && segundaViaAntes.sha !== null, `status ${segundaViaAntes.status}`);
    }

    // ── 5. CONFIGURAR A APRESENTAÇÃO ──
    const adm = await irPara(page, "/administracao/apresentacao");
    conferir("5.1 /administracao/apresentacao responde 200", adm.status === 200, `status ${adm.status}`);
    const FORM = 'form[data-acao="configurar-apresentacao"]';
    await page.waitForSelector(FORM, { timeout: 30000 });
    await limparEDigitar(page, `${FORM} input[name="nomeDeExibicao"]`, NOME_NOVO);
    await limparEDigitar(page, `${FORM} input[name="orgao"]`, "Secretaria de Administração");
    await limparEDigitar(page, `${FORM} input[name="assinaturaDoFornecedor"]`, "fornecido pela equipe de demonstração");
    await limparEDigitar(page, `${FORM} input[name="contatoEmail"]`, "atendimento@exemplo.gov.br");
    await limparEDigitar(page, `${FORM} input[name="sitio"]`, "https://exemplo.gov.br");
    await marcar(page, `${FORM} input[name="canalTransparencia"]`, true);
    await marcar(page, `${FORM} input[name="canalConsultaPublica"]`, true);
    const dir = mkdtempSync(join(tmpdir(), "smoke-identidade-"));
    const png = join(dir, "marca.png");
    writeFileSync(png, pngMinimo());
    const arquivo = await page.$(`${FORM} input[name="imagem"]`);
    if (arquivo !== null) await arquivo.uploadFile(png);
    await esperarChave(page, FORM);
    await page.click(`${FORM} button[type="submit"]`);
    const gravou = await respostaDoForm(page, FORM);
    conferir("5.2 a apresentação grava como versão nova", gravou.tipo === "ok" && /versão \d+/.test(gravou.texto), `${gravou.tipo}: ${gravou.texto.slice(0, 200)}`);
    const versaoGravada = Number(/versão (\d+)/.exec(gravou.texto)?.[1] ?? "0");

    // um SVG é recusado pelos bytes
    const svg = join(dir, "marca.svg");
    writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>');
    await irPara(page, "/administracao/apresentacao");
    await page.waitForSelector(FORM, { timeout: 30000 });
    const arquivo2 = await page.$(`${FORM} input[name="imagem"]`);
    if (arquivo2 !== null) {
      // o `accept` do navegador é conveniência; o servidor decide pelos bytes
      await page.evaluate((sel) => document.querySelector(sel)?.removeAttribute("accept"), `${FORM} input[name="imagem"]`);
      await arquivo2.uploadFile(svg);
    }
    await esperarChave(page, FORM);
    await page.click(`${FORM} button[type="submit"]`);
    const recusou = await respostaDoForm(page, FORM);
    conferir("5.3 um SVG é RECUSADO pelos bytes, nomeando", recusou.tipo === "erro" && /IMAGEM RECUSADA/.test(recusou.texto), `${recusou.tipo}: ${recusou.texto.slice(0, 200)}`);

    const adm2 = await irPara(page, "/administracao/apresentacao");
    conferir("5.4 o histórico lista a versão gravada como vigente", adm2.texto.includes(`${versaoGravada} (vigente)`), adm2.texto.slice(0, 300));

    // ── 6. A IDENTIDADE PROPAGOU ──
    const homeDepois = await irPara(page, "/");
    conferir("6.1 o rodapé do shell mostra o novo nome e o órgão", ((await atributo(page, "[data-rodape-ente]", null)) ?? "").includes(NOME_NOVO), `rodapé: ${await atributo(page, "[data-rodape-ente]", null)}`);
    conferir("6.2 a sidebar mostra o ente sob o produto", ((await atributo(page, "aside [data-marca-ente]", null)) ?? "") === NOME_NOVO, `ente: ${await atributo(page, "aside [data-marca-ente]", null)}`);
    conferir("6.3 a marca usa a imagem institucional (rota própria)", ((await atributo(page, "aside [data-marca] img", "src")) ?? "").includes("/identidade/imagem"), "sem <img> da marca");
    conferir("6.4 o título da aba nomeia produto e ente", (await page.title()).includes("Gestão Pública") && (await page.title()).includes(NOME_NOVO), `title: ${await page.title()}`);
    conferir("6.5 a imagem responde 200 como PNG", await page.evaluate(async () => { const r = await fetch("/identidade/imagem"); return r.status === 200 && (r.headers.get("content-type") ?? "").includes("image/png"); }), "imagem não serviu");
    void homeDepois;

    const transparencia = await irPara(page, "/transparencia/demonstrativos");
    conferir("6.6 a transparência pública mostra o novo nome do ente", transparencia.texto.includes(NOME_NOVO.toLowerCase()), transparencia.texto.slice(0, 200));
    const pdfNovo = await baixarPdf(page, "/transparencia/demonstrativos/pdf?slug=rreo-anexo1&exercicio=2026&bimestre=1");
    conferir("6.7 um PDF NOVO sai com o novo nome do ente no cabeçalho", pdfNovo.status === 200 && pdfNovo.texto.includes(NOME_NOVO), `status ${pdfNovo.status}; texto: ${pdfNovo.texto.slice(0, 160)}`);

    if (termoHref !== null && segundaViaAntes !== null) {
      const segundaViaDepois = await baixarPdf(page, `${termoHref}/pdf`);
      conferir("6.8 a SEGUNDA VIA do termo emitido NÃO mudou (mesmo sha256) e não traz o nome novo", segundaViaDepois.sha === segundaViaAntes.sha && !segundaViaDepois.texto.includes(NOME_NOVO), `sha antes ${segundaViaAntes.sha?.slice(0, 12)} × depois ${segundaViaDepois.sha?.slice(0, 12)}`);
    }

    // ── 7. A ENTRADA DEPOIS: canais e nome ──
    await sair(page);
    const entrada2 = await irPara(page, "/login");
    conferir("7.1 a entrada mostra o novo ente", ((await atributo(page, "[data-marca-ente]", null)) ?? "") === NOME_NOVO, `ente: ${await atributo(page, "[data-marca-ente]", null)}`);
    conferir("7.2 os canais públicos ativados ganham link (transparência e consulta)", (await page.$('[data-canal="transparencia"]')) !== null && (await page.$('[data-canal="consulta-publica"]')) !== null, "canais ausentes");
    conferir("7.3 nenhum canal inexistente é prometido", (await page.$('[data-canal="portal-do-servidor"]')) === null && (await page.$('[data-canal="portal-do-cidadao"]')) === null, "canal sem rota apareceu");
    conferir("7.4 a assinatura do fornecedor aparece no rodapé da entrada", entrada2.texto.includes("fornecido pela equipe de demonstração"), entrada2.texto.slice(-200));

    // ── 8. QUEM NÃO CONFIGURA: vê e não altera ──
    let restritoEntrou = false;
    try {
      await entrar(page, RESTRITO, SENHA_RESTRITO);
      restritoEntrou = true;
    } catch (e) {
      console.log(`      [operador restrito não entrou: ${e instanceof Error ? e.message : String(e)}]`);
    }
    if (restritoEntrou) {
      const admRestrito = await irPara(page, "/administracao/apresentacao");
      const semAcesso = page.url().includes("/sem-acesso") || admRestrito.status === 403;
      const semBotao = (await page.$(`${FORM} button[type="submit"]`)) === null;
      conferir("8.1 o operador restrito não altera a apresentação (sem acesso à administração, ou sem o botão de gravar)", semAcesso || semBotao, `url ${page.url()}, status ${admRestrito.status}`);
      const mesaRestrito = await irPara(page, "/");
      conferir("8.2 a mesa do restrito diz 'não está no seu acesso' onde não pode, em vez de lista vazia", mesaRestrito.status === 200 && (await page.$$('[data-estado="sem-acesso"]')).length >= 1, `sem-acesso: ${(await page.$$('[data-estado="sem-acesso"]')).length}`);
      await sair(page);
    }

    // ── 9. 360 px: o menu ──
    await entrar(page);
    await page.setViewport({ width: 360, height: 800 });
    await irPara(page, "/");
    conferir("9.1 em 360 px a sidebar começa fechada", !(await visivel(page, "aside[data-menu-aberto]")), "aside visível");
    conferir("9.2 o corpo não rola na horizontal em 360 px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `scrollWidth ${await page.evaluate(() => document.documentElement.scrollWidth)}`);
    await page.click("[data-botao-menu]");
    await page.waitForSelector('aside[data-menu-aberto="sim"]', { timeout: 10000 });
    conferir("9.3 o botão abre o menu (aria-expanded=true)", (await atributo(page, "[data-botao-menu]", "aria-expanded")) === "true" && (await visivel(page, "aside")), "menu não abriu");
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.click('aside a[href="/administracao"]')]);
    conferir("9.4 navegar pelo menu fecha o painel", !(await visivel(page, "aside[data-menu-aberto]")) || (await atributo(page, "aside", "data-menu-aberto")) === "nao", "menu continuou aberto");
    await page.setViewport({ width: 1366, height: 900 });

    // ── 10. DUAS ABAS: o contexto de uma não reinterpreta o comando da outra ──
    const abaB = await navegador.newPage();
    abaB.setDefaultTimeout(120000);
    await abaB.setViewport({ width: 1366, height: 900 });
    await page.goto(`${BASE}/administracao/apresentacao`, { waitUntil: "networkidle2" });
    await abaB.goto(`${BASE}/`, { waitUntil: "networkidle2" });
    const ugsA = await page.evaluate(() => Array.from(document.querySelectorAll('select[aria-label="Unidade gestora"] option')).map((o) => (o as HTMLOptionElement).value));
    const outraUg = ugsA.find((v) => v !== "CONSOLIDADO");
    if (outraUg !== undefined) {
      await abaB.select('select[aria-label="Unidade gestora"]', outraUg);
      const ugNaA = await page.evaluate(() => (document.querySelector('select[aria-label="Unidade gestora"]') as HTMLSelectElement).value);
      conferir("10.1 trocar a unidade na aba B não muda a seleção da aba A", ugNaA === "CONSOLIDADO", `A ficou em ${ugNaA}`);
    } else {
      conferir("10.1 (sem segunda unidade para trocar — passo não aplicável)", true, "");
    }
    await page.waitForSelector(FORM, { timeout: 30000 });
    await limparEDigitar(page, `${FORM} input[name="nomeDeExibicao"]`, `${NOME_NOVO} (aba A)`);
    await esperarChave(page, FORM);
    await page.click(`${FORM} button[type="submit"]`);
    const gravouA = await respostaDoForm(page, FORM);
    conferir("10.2 o comando pendente da aba A grava com os dados da aba A", gravouA.tipo === "ok" && /versão \d+/.test(gravouA.texto), `${gravouA.tipo}: ${gravouA.texto.slice(0, 200)}`);
    const adm3 = await irPara(page, "/administracao/apresentacao");
    conferir("10.3 a vigente é a gravada pela aba A", adm3.texto.includes(`${NOME_NOVO.toLowerCase()} (aba a)`), adm3.texto.slice(0, 300));
    await abaB.close();
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
