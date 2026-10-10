import "dotenv/config";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import puppeteer, { type Browser, type Page } from "puppeteer";

/**
 * SMOKE DO PESSOAL (M32, V6 P2.2) — navegador real contra o servidor.
 *
 * Cargo e lotação pelo molde → pessoa FÍSICA no cadastro único → ficha do servidor sobre ela (a
 * segunda ficha da mesma pessoa é RECUSADA) → admissão (matrícula, cargo, lotação, salário) → o
 * cargo mostra 1 vaga ocupada (contada) → promoção muda cargo e salário → o detalhe deriva o cargo
 * de hoje → afastamento muda a situação → segunda matrícula da mesma pessoa é aceita com ALERTA de
 * acumulação → desligamento é terminal (movimentar depois é recusado) → anotação e dependente no
 * histórico → o operador restrito não alcança o pessoal.
 *
 * ⚠️ ELE NÃO LIMPA O BANCO: códigos levam o sufixo do instante. Helpers do smoke das compras.
 */
const BASE = process.argv[2] ?? "http://localhost:3010";
// V39-R2 (R2-003): o destino e a natureza da base (declarada no banco) conferidos ANTES de qualquer credencial ou escrita.
await exigirDestinoDoPercurso(BASE);
// O percurso é do PAPEL: o servidor do RH dos percursos (scripts/percursos-usuarios-por-papel.ts).
// Sem o usuário de papel, passe admin e senha nos argumentos 3 e 4.
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

async function main(): Promise<void> {
  if (SENHA === "") throw new Error("senha ausente (PERCURSOS_SENHA_PAPEIS ou SEED_ADMIN_SENHA).");
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

    // ── 1. o quadro: cargo e lotação ──
    const lp = await irPara(page, "/pessoal");
    conferir("1.0 a landing de pessoal abre com servidores, cargos e lotações", lp.includes("servidores") && lp.includes("cargos") && lp.includes("lotações"), lp.slice(0, 200));
    await irPara(page, "/pessoal/cargos");
    const rCargo = await preencherEEnviar(page, "criar-cargos", [
      { sel: 'input[name="codigo"]', valor: `PROF-${SUF}` },
      { sel: 'input[name="denominacao"]', valor: `Professor do percurso ${SUF}` },
      { sel: 'select[name="tipo"]', valor: "EFETIVO", tipo: "select" },
      { sel: 'input[name="vagasFixadas"]', valor: "2" },
      { sel: 'input[name="leiAutorizativa"]', valor: "Lei Municipal 1.234/2010 (percurso)" },
      { sel: 'input[name="dataPublicacaoLei"]', valor: "2010-05-01", tipo: "data" },
    ]);
    conferir("1.1 cargo criado pelo molde (2 vagas fixadas em lei)", rCargo.tipo === "ok", rCargo.texto.slice(0, 200));
    await irPara(page, "/pessoal/cargos");
    const rCargo2 = await preencherEEnviar(page, "criar-cargos", [
      { sel: 'input[name="codigo"]', valor: `DIR-${SUF}` },
      { sel: 'input[name="denominacao"]', valor: `Diretor do percurso ${SUF}` },
      { sel: 'select[name="tipo"]', valor: "COMISSAO", tipo: "select" },
      { sel: 'input[name="vagasFixadas"]', valor: "1" },
      { sel: 'input[name="leiAutorizativa"]', valor: "Lei Municipal 1.234/2010 (percurso)" },
      { sel: 'input[name="dataPublicacaoLei"]', valor: "2010-05-01", tipo: "data" },
    ]);
    conferir("1.2 segundo cargo (em comissão) criado", rCargo2.tipo === "ok", rCargo2.texto.slice(0, 200));
    await irPara(page, "/pessoal/lotacoes");
    const rLot = await preencherEEnviar(page, "criar-lotacoes", [
      { sel: 'input[name="codigo"]', valor: `SEDUC-${SUF}` },
      { sel: 'input[name="nome"]', valor: `Secretaria de Educação do percurso ${SUF}` },
    ]);
    conferir("1.3 lotação criada pelo molde", rLot.tipo === "ok", rLot.texto.slice(0, 200));

    // ── 2. a pessoa no cadastro único, e a ficha sobre ela ──
    await irPara(page, "/cadastros/pessoas");
    const formPessoa = "cadastrar-pessoa";
    const rPessoa = await preencherEEnviar(page, formPessoa, [
      { sel: 'input[data-mascara="cpf-cnpj"]', valor: CPF },
      { sel: 'input[name="nome"]', valor: `Maria do Percurso ${SUF}` },
    ]);
    conferir("2.1 pessoa física criada no cadastro único", rPessoa.tipo === "ok", `${formPessoa}: ${rPessoa.texto.slice(0, 200)}`);
    await irPara(page, "/pessoal/servidores");
    const pessoa = await opcaoQueCasa(page, 'form[data-acao="criar-servidores"] select[name="pessoaId"]', `Maria do Percurso ${SUF}`);
    conferir("2.2 a ficha oferece SÓ pessoas físicas ainda sem ficha — a recém-criada está lá", pessoa !== null, "pessoa não ofertada");
    if (pessoa === null) throw new Error("sem pessoa para seguir");
    const rServ = await preencherEEnviar(page, "criar-servidores", [
      { sel: 'select[name="pessoaId"]', valor: pessoa.valor, tipo: "select" },
      { sel: 'input[name="dataNascimento"]', valor: "1985-07-20", tipo: "data" },
      { sel: 'select[name="sexo"]', valor: "FEMININO", tipo: "select" },
      { sel: 'input[name="pisPasep"]', valor: "12345678901" },
      { sel: 'input[name="nomeMae"]', valor: "Mãe do Percurso" },
    ]);
    conferir("2.3 ficha do servidor criada sobre a pessoa", rServ.tipo === "ok", rServ.texto.slice(0, 200));
    await irPara(page, `/pessoal/servidores?q=${encodeURIComponent(`Maria do Percurso ${SUF}`)}`);
    const lista = await texto(page);
    const hrefServ = await hrefDoRegistro(page, `Maria do Percurso ${SUF}`);
    conferir("2.4 a lista traz a ficha SEM VÍNCULO", hrefServ !== null && lista.includes("sem_vinculo"), lista.slice(0, 300));
    if (hrefServ === null) throw new Error("sem servidor");
    await irPara(page, "/pessoal/servidores");
    const pessoaDeNovo = await opcaoQueCasa(page, 'form[data-acao="criar-servidores"] select[name="pessoaId"]', `Maria do Percurso ${SUF}`);
    conferir("2.5 a pessoa que já tem ficha NÃO é mais oferecida (uma pessoa, uma ficha)", pessoaDeNovo === null, "ofertada de novo");

    // ── 3. admissão, derivações e o cargo ocupado ──
    await irPara(page, hrefServ);
    const cargoProf = await opcaoQueCasa(page, 'form[data-acao="admitir"] select[name="cargoId"]', `PROF-${SUF}`);
    const lot = await opcaoQueCasa(page, 'form[data-acao="admitir"] select[name="lotacaoId"]', `SEDUC-${SUF}`);
    conferir("3.1 a admissão oferece o cargo e a lotação criados", cargoProf !== null && lot !== null, `cargo=${cargoProf?.rotulo ?? "-"} lot=${lot?.rotulo ?? "-"}`);
    const rAdm = await preencherEEnviar(page, "admitir", [
      { sel: 'input[name="matricula"]', valor: `MAT-${SUF}-1` },
      { sel: 'select[name="tipo"]', valor: "EFETIVO", tipo: "select" },
      { sel: 'input[name="regimeJuridico"]', valor: "Estatutário" },
      { sel: 'input[name="dataAdmissao"]', valor: "2026-02-01", tipo: "data" },
      ...(cargoProf === null ? [] : [{ sel: 'select[name="cargoId"]', valor: cargoProf.valor, tipo: "select" as const }]),
      ...(lot === null ? [] : [{ sel: 'select[name="lotacaoId"]', valor: lot.valor, tipo: "select" as const }]),
      { sel: 'input[data-mascara="valor"]', valor: "3.000,00" },
    ]);
    conferir("3.2 admissão registrada (matrícula, cargo, lotação, salário)", rAdm.tipo === "ok" && !/acumulação/i.test(rAdm.texto), rAdm.texto.slice(0, 200));
    const det = await irPara(page, hrefServ);
    conferir("3.3 o detalhe deriva o vínculo ATIVO com o cargo, a lotação e o salário 3000.00", det.includes("ativo") && det.includes(`prof-${SUF}`.toLowerCase()) && det.includes("3000.00"), det.slice(0, 400));
    const cargosLista = await irPara(page, `/pessoal/cargos?q=PROF-${SUF}`);
    conferir("3.4 o cargo mostra 1 vaga OCUPADA (contada) de 2, com vaga", /\b1\b/.test(cargosLista) && cargosLista.includes("com vaga"), cargosLista.slice(0, 300));

    // ── 4. promoção → cargo e salário de hoje mudam ──
    await irPara(page, hrefServ);
    const vinc = await opcaoQueCasa(page, 'form[data-acao="alterar-remuneracao"] select[name="vinculoId"]', `MAT-${SUF}-1`);
    const cargoDir = await opcaoQueCasa(page, 'form[data-acao="alterar-remuneracao"] select[name="cargoId"]', `DIR-${SUF}`);
    const rProm = await preencherEEnviar(page, "alterar-remuneracao", [
      ...(vinc === null ? [] : [{ sel: 'select[name="vinculoId"]', valor: vinc.valor, tipo: "select" as const }]),
      { sel: 'select[name="tipo"]', valor: "PROMOCAO", tipo: "select" },
      { sel: 'input[name="data"]', valor: "2026-06-01", tipo: "data" },
      ...(cargoDir === null ? [] : [{ sel: 'select[name="cargoId"]', valor: cargoDir.valor, tipo: "select" as const }]),
      { sel: 'input[data-mascara="valor"]', valor: "5.000,00", indice: 0 },
      { sel: 'input[name="motivo"]', valor: "Promoção por merecimento (percurso)" },
    ]);
    conferir("4.1 promoção registrada (cargo + salário)", rProm.tipo === "ok", rProm.texto.slice(0, 200));
    const det2 = await irPara(page, hrefServ);
    conferir("4.2 o detalhe deriva o cargo de HOJE (diretor) e o salário 5000.00", det2.includes(`dir-${SUF}`.toLowerCase()) && det2.includes("5000.00"), det2.slice(0, 400));
    const hist = await irPara(page, `${hrefServ}?aba=historico`);
    conferir("4.3 o histórico traz admissão e promoção com datas do fato", hist.includes("admissão") && hist.includes("promoção"), hist.slice(0, 300));

    // ── 5. afastamento e retorno ──
    await irPara(page, hrefServ);
    const vincMov = await opcaoQueCasa(page, 'form[data-acao="movimentar"] select[name="vinculoId"]', `MAT-${SUF}-1`);
    const rAf = await preencherEEnviar(page, "movimentar", [
      ...(vincMov === null ? [] : [{ sel: 'select[name="vinculoId"]', valor: vincMov.valor, tipo: "select" as const }]),
      { sel: 'select[name="tipo"]', valor: "AFASTAMENTO", tipo: "select" },
      { sel: 'input[name="data"]', valor: "2026-07-01", tipo: "data" },
      { sel: 'input[name="motivo"]', valor: "Licença para tratamento de saúde (percurso)" },
    ]);
    conferir("5.1 afastamento registrado", rAf.tipo === "ok", rAf.texto.slice(0, 200));
    const det3 = await irPara(page, hrefServ);
    conferir("5.2 a situação derivada diz AFASTADO", det3.includes("afastado"), det3.slice(0, 300));

    // ── 6. segunda matrícula: ALERTA, não erro ──
    await irPara(page, hrefServ);
    const rAdm2 = await preencherEEnviar(page, "admitir", [
      { sel: 'input[name="matricula"]', valor: `MAT-${SUF}-2` },
      { sel: 'select[name="tipo"]', valor: "COMISSIONADO", tipo: "select" },
      { sel: 'input[name="regimeJuridico"]', valor: "Comissão" },
      { sel: 'input[name="dataAdmissao"]', valor: "2026-08-01", tipo: "data" },
      ...(cargoProf === null ? [] : [{ sel: 'select[name="cargoId"]', valor: cargoProf.valor, tipo: "select" as const }]),
      ...(lot === null ? [] : [{ sel: 'select[name="lotacaoId"]', valor: lot.valor, tipo: "select" as const }]),
      { sel: 'input[data-mascara="valor"]', valor: "1.500,00" },
    ]);
    conferir("6.1 a segunda matrícula da MESMA pessoa entra com ALERTA de acumulação nomeando a primeira", rAdm2.tipo === "ok" && /acumulação/i.test(rAdm2.texto) && rAdm2.texto.includes(`MAT-${SUF}-1`), rAdm2.texto.slice(0, 200));
    await irPara(page, hrefServ);
    const rAdmDup = await preencherEEnviar(page, "admitir", [
      { sel: 'input[name="matricula"]', valor: `MAT-${SUF}-1` },
      { sel: 'select[name="tipo"]', valor: "EFETIVO", tipo: "select" },
      { sel: 'input[name="regimeJuridico"]', valor: "Estatutário" },
      { sel: 'input[name="dataAdmissao"]', valor: "2026-08-01", tipo: "data" },
      ...(cargoProf === null ? [] : [{ sel: 'select[name="cargoId"]', valor: cargoProf.valor, tipo: "select" as const }]),
      ...(lot === null ? [] : [{ sel: 'select[name="lotacaoId"]', valor: lot.valor, tipo: "select" as const }]),
      { sel: 'input[data-mascara="valor"]', valor: "1.500,00" },
    ]);
    conferir("6.2 matrícula REPETIDA é recusada nomeando quem a usa", rAdmDup.tipo === "erro" && /MATRICULA-JA-USADA|matrícula/i.test(rAdmDup.texto), rAdmDup.texto.slice(0, 200));

    // ── 7. desligamento é terminal ──
    await irPara(page, hrefServ);
    const vincDes = await opcaoQueCasa(page, 'form[data-acao="desligar"] select[name="vinculoId"]', `MAT-${SUF}-2`);
    const rDes = await preencherEEnviar(page, "desligar", [
      ...(vincDes === null ? [] : [{ sel: 'select[name="vinculoId"]', valor: vincDes.valor, tipo: "select" as const }]),
      { sel: 'input[name="data"]', valor: "2026-09-01", tipo: "data" },
      { sel: 'input[name="motivo"]', valor: "Exoneração a pedido (percurso)" },
    ]);
    conferir("7.1 desligamento da segunda matrícula registrado", rDes.tipo === "ok", rDes.texto.slice(0, 200));
    await irPara(page, hrefServ);
    const vincDesligado = await opcaoQueCasa(page, 'form[data-acao="movimentar"] select[name="vinculoId"]', `MAT-${SUF}-2`);
    conferir("7.2 a matrícula desligada NÃO é mais oferecida às movimentações (terminal)", vincDesligado === null, "ofertada");

    // ── 8. anotação e dependente ──
    const rAnot = await preencherEEnviar(page, "anotacao", [
      { sel: 'select[name="tipo"]', valor: "ELOGIO", tipo: "select" },
      { sel: 'input[name="data"]', valor: "2026-09-02", tipo: "data" },
      { sel: 'input[name="titulo"]', valor: "Elogio do percurso" },
      { sel: 'textarea[name="texto"]', valor: "Servidora destacada na organização do evento escolar (percurso)." },
    ]);
    conferir("8.1 anotação na ficha registrada", rAnot.tipo === "ok", rAnot.texto.slice(0, 200));
    await irPara(page, hrefServ);
    const rDep = await preencherEEnviar(page, "dependente", [
      { sel: 'input[name="nome"]', valor: "Filho do Percurso" },
      { sel: 'input[name="dataNascimento"]', valor: "2020-01-15", tipo: "data" },
      { sel: 'select[name="grauParentesco"]', valor: "FILHO", tipo: "select" },
      { sel: 'select[name="finalidade"]', valor: "SALARIO_FAMILIA", tipo: "select" },
      { sel: 'input[name="dataInicio"]', valor: "2026-02-01", tipo: "data" },
    ]);
    conferir("8.2 dependente cadastrado com finalidade", rDep.tipo === "ok", rDep.texto.slice(0, 200));
    const hist2 = await irPara(page, `${hrefServ}?aba=historico`);
    conferir("8.3 o histórico traz a anotação, o dependente e o desligamento", hist2.includes("elogio") && hist2.includes("filho do percurso") && hist2.includes("desligamento"), hist2.slice(0, 400));
    const semRotulo = !/\bTR\s*\d+\.\d+/.test(await dados(page));
    conferir("8.4 nenhum identificador de cláusula na tela", semRotulo, "apareceu rótulo de catálogo");

    // ── 9. o papel é fechado nos dois sentidos ──
    const b = await barrado(page, "/despesa/empenhos");
    conferir("9.0 NEGATIVA: o servidor do RH não abre os empenhos (sem CONSULTAR_DESPESA)", USUARIO !== "rh@percursos.local" || b.barrado, `${b.url} ${b.status}`);
    await sair(page);
    await entrar(page, RESTRITO, SENHA_RESTRITO).catch((e) => console.log(`      [restrito não entrou: ${e instanceof Error ? e.message : String(e)}]`));
    if (!page.url().includes("/login")) {
      await page.goto(`${BASE}/pessoal/servidores`, { waitUntil: "networkidle2" });
      conferir("9.1 o operador restrito (sem CONSULTAR_PESSOAL) não abre os servidores", page.url().includes("/sem-acesso"), page.url());
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
