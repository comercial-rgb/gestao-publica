import "dotenv/config";
import puppeteer, { type Browser, type Page } from "puppeteer";

/**
 * ═══ O PERCURSO DOS CADASTROS DE APOIO DA GESTÃO DO BEM — TR 5.19 (M10) ═══
 *
 * ⚠️ É O PERCURSO QUE PROMOVE A CLÁUSULA, NÃO O DESCRITOR. Os três serviços já tinham teste
 * de caso de uso desde o ENT05 (`m10-gestao-do-bem.test.ts`); o que não existia era tela. Um
 * cadastro que o servidor municipal não alcança está implementado e não está entregue.
 *
 * ⚠️ A ASSERÇÃO CENTRAL AQUI É O SELECT DA LOCALIZAÇÃO SUPERIOR, e ela existe por um defeito
 * real desta semana: as opções do molde são chaveadas pelo NOME DO CAMPO, e um campo sem
 * chave correspondente aparece DESABILITADO dizendo "nenhuma opção cadastrada" — mensagem
 * correta apontando a causa errada quando os registros existem. O `t20` do molde vigia isso
 * no fonte; este percurso prova pela tela: depois de criar a primeira localização, a segunda
 * TEM de conseguir escolhê-la como superior.
 *
 * ⚠️ CADA `goto` É UMA RECARGA — é o que separa persistência de estado de componente.
 *
 * ⚠️ ELE NÃO LIMPA O BANCO e sufixa os códigos pelo instante, como o percurso do ENT06.
 */

const BASE = process.argv[2] ?? "http://localhost:3000";
const USUARIO = process.argv[3] ?? "admin@cg.pb.gov.br";
const SENHA = process.argv[4] ?? process.env["SEED_ADMIN_SENHA"] ?? "";

const SUF = String(Date.now()).slice(-6);
const MOTIVO = `BX-${SUF}`;
const TIPO = `INC-${SUF}`;
const LOCAL_PAI = `PRE-${SUF}`;
const LOCAL_FILHA = `SAL-${SUF}`;

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

/**
 * ⚠️ SEM `page.click` E SEM `waitForNavigation`, E OS DOIS POR MOTIVO MEDIDO.
 *
 * `page.click` não clica direto: primeiro calcula o ponto clicável, e esse cálculo é um
 * `evaluate` no renderizador. Com a máquina em pressão de memória (medido: 53 MB livres de
 * 8 GB, swap em 7,5 de 8), esse `evaluate` trava — o rastro morre em `CdpElementHandle`,
 * nenhuma requisição sai, e o `RegistroDeOperacao` não grava NEM `NEGADO`, porque o servidor
 * nunca é chamado. O sintoma chega como "timeout de navegação", que aponta para o lugar errado.
 *
 * `requestSubmit` dispara o envio pelo caminho do próprio React, e a espera olha `page.url()`,
 * que é lido do processo do NAVEGADOR e não do renderizador — as duas coisas sobrevivem ao
 * renderizador lento. É o mesmo mecanismo que `preencherEEnviar` já usava no corpo do percurso.
 *
 * ⚠️ OS OUTROS PERCURSOS AINDA USAM O IDIOMA FRÁGIL. Pendência `ENTRAR-POR-CLIQUE-FRAGIL`:
 * eles passam em máquina folgada e falham em máquina apertada, apontando para a senha.
 */
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
  const resposta = await page.goto(`${BASE}${rota}`, { waitUntil: "networkidle0" });
  const status = resposta?.status() ?? 0;
  if (status !== 200) throw new Error(`${rota} respondeu ${status}`);
  if (page.url().includes("/login")) throw new Error(`${rota} devolveu ao login`);
  return texto(page);
}

interface CampoDoSmoke {
  readonly sel: string;
  readonly valor: string;
  readonly tipo?: "select";
}

async function preencherEEnviar(
  page: Page,
  acao: string,
  campos: readonly CampoDoSmoke[]
): Promise<{ readonly tipo: string; readonly texto: string }> {
  const form = `form[data-acao="${acao}"]`;
  await page.waitForSelector(form, { timeout: 20000 });

  for (const campo of campos) {
    const seletor = `${form} ${campo.sel}`;
    await page.waitForSelector(seletor, { timeout: 20000 });
    const alvo = (await page.$$(seletor))[0];
    if (alvo === undefined) throw new Error(`"${seletor}" não casou nenhum elemento`);
    if (campo.tipo === "select") {
      await alvo.select(campo.valor);
      await new Promise((r) => setTimeout(r, 300));
      continue;
    }
    await alvo.click({ count: 3 });
    await page.keyboard.press("Backspace");
    await alvo.type(campo.valor, { delay: 5 });
  }

  const enviou = await page.evaluate((sel) => {
    const f = document.querySelector(sel);
    const botao = f?.querySelector('button[type="submit"]');
    if (!(botao instanceof HTMLButtonElement)) return false;
    botao.click();
    return true;
  }, form);
  if (!enviou) throw new Error(`não achei o botão de envio de "${acao}"`);

  await new Promise((r) => setTimeout(r, 2500));

  const resposta = await page.evaluate((sel) => {
    const f = document.querySelector(sel);
    const alerta = f?.querySelector('[role="alert"]');
    if (alerta !== null && alerta !== undefined) {
      return { tipo: "erro", texto: (alerta.textContent ?? "").trim() };
    }
    const ps = Array.from(f?.querySelectorAll("p") ?? []);
    const bom = ps.find((x) => x.className.includes("status-ok"));
    return bom !== undefined
      ? { tipo: "ok", texto: (bom.textContent ?? "").trim() }
      : { tipo: "silencio", texto: "" };
  }, form);

  if (resposta.tipo === "erro") {
    console.log(`      [servidor recusou "${acao}"] ${resposta.texto.slice(0, 400)}`);
  }
  return resposta;
}

/** A opção de um select cujo texto contém o pedaço — e `null` quando não há nenhuma. */
async function opcaoQueCasa(page: Page, seletor: string, pedaco: string): Promise<string | null> {
  return page.evaluate(
    (sel, p) => {
      const s = document.querySelector(sel);
      if (!(s instanceof HTMLSelectElement)) return null;
      const util = Array.from(s.options).find(
        (o) => o.value !== "" && !o.disabled && (o.textContent ?? "").includes(p)
      );
      return util?.value ?? null;
    },
    seletor,
    pedaco
  );
}

async function main(): Promise<void> {
  let navegador: Browser | undefined;
  try {
    // ⚠️ NAVEGADOR ECONÔMICO, e não por gosto: um Chromium padrão abre vários processos, e
    // esta máquina tem 8 GB com o swap cheio. `protocolTimeout` alto evita que uma pausa do
    // renderizador seja relatada como defeito da aplicação.
    navegador = await puppeteer.launch({
      headless: true,
      protocolTimeout: 180000,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-background-networking",
        "--renderer-process-limit=1",
        "--js-flags=--max-old-space-size=256",
      ],
    });
    const page = await navegador.newPage();
    page.setDefaultTimeout(60000);
    await entrar(page);
    ok("login");

    // ══════════════════════════════════════════════════════════════════════
    // 1 · MOTIVOS DE BAIXA (TR 5.19.30) — o rol é do ente, e por isso é cadastro
    // ══════════════════════════════════════════════════════════════════════
    await irPara(page, "/patrimonio/motivos-de-baixa");
    const rMotivo = await preencherEEnviar(page, "criar-motivos-de-baixa", [
      { sel: 'input[name="codigo"]', valor: MOTIVO },
      { sel: 'input[name="descricao"]', valor: "Inservível apurado em comissão" },
    ]);
    conferir("motivo de baixa: o servidor aceitou", rMotivo.tipo === "ok", rMotivo.texto);

    const depoisMotivo = await irPara(page, "/patrimonio/motivos-de-baixa");
    conferir(
      "motivo de baixa: RECARREGADA, a lista o traz persistido",
      depoisMotivo.includes(MOTIVO.toLowerCase()),
      "o motivo não apareceu depois da recarga"
    );

    // ══════════════════════════════════════════════════════════════════════
    // 2 · TIPOS DE INCORPORAÇÃO (TR 5.19.3 e 5.19.7)
    // ══════════════════════════════════════════════════════════════════════
    await irPara(page, "/patrimonio/tipos-de-incorporacao");
    const rTipo = await preencherEEnviar(page, "criar-tipos-de-incorporacao", [
      { sel: 'input[name="codigo"]', valor: TIPO },
      { sel: 'input[name="descricao"]', valor: "Recebido em doação" },
    ]);
    conferir("tipo de incorporação: o servidor aceitou", rTipo.tipo === "ok", rTipo.texto);

    const depoisTipo = await irPara(page, "/patrimonio/tipos-de-incorporacao");
    conferir(
      "tipo de incorporação: RECARREGADA, a lista o traz — e a coluna de bens é DERIVADA",
      depoisTipo.includes(TIPO.toLowerCase()),
      "o tipo não apareceu depois da recarga"
    );

    // ══════════════════════════════════════════════════════════════════════
    // 3 · LOCALIZAÇÕES — e aqui mora a asserção que este percurso existe para fazer
    // ══════════════════════════════════════════════════════════════════════
    await irPara(page, "/patrimonio/localizacoes");
    const rPai = await preencherEEnviar(page, "criar-localizacoes-fisicas", [
      { sel: 'input[name="codigo"]', valor: LOCAL_PAI },
      { sel: 'input[name="descricao"]', valor: "Prédio da administração" },
    ]);
    conferir("localização raiz: o servidor aceitou", rPai.tipo === "ok", rPai.texto);

    await irPara(page, "/patrimonio/localizacoes");
    const opcaoDoPai = await opcaoQueCasa(
      page,
      'form[data-acao="criar-localizacoes-fisicas"] select[name="paiId"]',
      LOCAL_PAI
    );
    // ⚠️ O DEFEITO QUE ISTO PEGA: com a chave errada na porta, este select viria DESABILITADO
    // dizendo "nenhuma opção cadastrada" — logo depois de o operador ter cadastrado uma.
    conferir(
      "localização superior: o select OFERECE a que acabou de ser criada",
      opcaoDoPai !== null,
      "o select de localização superior não ofereceu a raiz recém-cadastrada"
    );

    if (opcaoDoPai !== null) {
      const rFilha = await preencherEEnviar(page, "criar-localizacoes-fisicas", [
        { sel: 'input[name="codigo"]', valor: LOCAL_FILHA },
        { sel: 'input[name="descricao"]', valor: "Sala do almoxarifado" },
        { sel: 'select[name="paiId"]', valor: opcaoDoPai, tipo: "select" },
      ]);
      conferir("sublocalização: o servidor aceitou", rFilha.tipo === "ok", rFilha.texto);

      const lista = await irPara(page, "/patrimonio/localizacoes");
      conferir(
        "sublocalização: RECARREGADA, a lista mostra a hierarquia — a filha aponta para a raiz",
        lista.includes(LOCAL_FILHA.toLowerCase()) && lista.includes(LOCAL_PAI.toLowerCase()),
        "a hierarquia não apareceu na listagem"
      );
    }

    // ══════════════════════════════════════════════════════════════════════
    // 4 · O HUB DA ÁREA — a mesma lista alimenta hub e busca; se divergirem, some
    // ══════════════════════════════════════════════════════════════════════
    const hub = await irPara(page, "/patrimonio");
    conferir(
      "hub: as três telas novas aparecem na área de patrimônio",
      hub.includes("localizações físicas") &&
        hub.includes("motivos de baixa") &&
        hub.includes("tipos de incorporação"),
      "o hub não listou os cadastros novos"
    );
  } finally {
    if (navegador !== undefined) await navegador.close();
  }

  console.log(`\n${passos.length} passos, ${falhas.length} falhas.`);
  if (falhas.length > 0) {
    console.error("\nFALHAS:");
    for (const f of falhas) console.error(`  · ${f}`);
    process.exit(1);
  }
}

await main();
