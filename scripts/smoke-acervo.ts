import "dotenv/config";
import puppeteer, { type Browser, type Page } from "puppeteer";

/**
 * ═══ O PERCURSO DO ACERVO — CLASSE E BEM (M10, ENT07) ═══
 *
 * ⚠️ É O PERCURSO QUE PROMOVE A CLÁUSULA, NÃO O DESCRITOR. Os dois casos de uso nasceram
 * neste lote e já têm teste contra banco (`m10-acervo.test.ts`, 11 testes); o que este
 * percurso prova é outra coisa — que um servidor municipal ALCANÇA o cadastro pela tela.
 *
 * ⚠️ A ASSERÇÃO CENTRAL É O SELECT DE CLASSE NO FORMULÁRIO DO BEM. Foi por ela que este lote
 * pôs a classe antes do bem: `ClasseDeBens` tinha ZERO registros, e as opções do molde são
 * chaveadas pelo NOME DO CAMPO — um campo sem chave correspondente aparece DESABILITADO
 * dizendo "nenhuma opção cadastrada", mensagem correta apontando a causa errada quando os
 * registros existem. O `t20` vigia no fonte; aqui se prova pela tela: criada a classe, o
 * formulário do bem TEM de conseguir escolhê-la.
 *
 * ⚠️ E ELE EXERCITA UMA RECUSA, não só o caminho feliz: tombamento repetido tem de ser negado
 * PELA TELA, nomeando qual tombamento já existe. Negação que não afirma o motivo é compatível
 * com o servidor gravando errado em silêncio.
 *
 * ⚠️ CADA `goto` É UMA RECARGA — é o que separa persistência de estado de componente.
 * ⚠️ ELE NÃO LIMPA O BANCO e sufixa os códigos pelo instante.
 */

const BASE = process.argv[2] ?? "http://localhost:3000";
const USUARIO = process.argv[3] ?? "admin@cg.pb.gov.br";
const SENHA = process.argv[4] ?? process.env["SEED_ADMIN_SENHA"] ?? "";

const SUF = String(Date.now()).slice(-6);
const CLASSE = `CL-${SUF}`;
const TOMB = `TOMB-${SUF}`;
/**
 * ⚠️ O PERCURSO CRIA O PRÓPRIO TIPO DE INCORPORAÇÃO, em vez de usar o que estiver no banco.
 * Depender de sobra de outro percurso faria este passar hoje e falhar num banco limpo — e a
 * falha apareceria no lote seguinte, longe de quem a causou.
 */
const TIPO = `INC-${SUF}`;

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
 * ⚠️ SEM `page.click` E SEM `waitForNavigation` — ver ESTADO §27.3. `page.click` calcula o
 * ponto clicável por `evaluate` no renderizador, e sob pressão de memória esse cálculo trava:
 * nenhuma requisição sai, nada é registrado no servidor, e o sintoma chega 30 s depois como
 * "timeout de navegação", acusando a senha. `requestSubmit` envia pelo caminho do próprio
 * React, e `page.url()` é lido do processo do NAVEGADOR, não do renderizador.
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
  const resposta = await page.goto(`${BASE}${rota}`, { waitUntil: "networkidle2" });
  const status = resposta?.status() ?? 0;
  if (status !== 200) throw new Error(`${rota} respondeu ${status}`);
  if (page.url().includes("/login")) throw new Error(`${rota} devolveu ao login`);
  return texto(page);
}

interface CampoDoSmoke {
  readonly sel: string;
  readonly valor: string;
  /**
   * ⚠️ `"data"` NÃO É DETALHE DE ESTILO — ver o ramo correspondente em `preencherEEnviar`.
   * Um campo de data digitado como texto fica VAZIO, e o `required` bloqueia o envio no
   * navegador sem que requisição alguma saia.
   */
  readonly tipo?: "select" | "data";
}

async function preencherEEnviar(
  page: Page,
  acao: string,
  campos: readonly CampoDoSmoke[]
): Promise<{ readonly tipo: string; readonly texto: string }> {
  const form = `form[data-acao="${acao}"]`;
  await page.waitForSelector(form, { timeout: 30000 });

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

    // ⚠️ `input[type="date"]` NÃO SE PREENCHE DIGITANDO, E ISSO CUSTOU UM CICLO INTEIRO.
    // O molde renderiza `tipo: "data"` como campo de data nativo; `type("2026-03-10")`
    // caractere a caractere deixa o campo VAZIO ("the field is incomplete or has an invalid
    // date"), o `required` barra o envio no NAVEGADOR, e nenhuma requisição sai. O sintoma
    // chega como formulário que envia e não responde — nem sucesso, nem recusa, nem registro.
    // Silêncio, que é o pior dos três, porque não acusa lugar nenhum.
    //
    // Atribuir pelo setter NATIVO e disparar `input`/`change` é o que o React escuta: mexer
    // em `el.value` direto não notifica o estado da ilha.
    if (campo.tipo === "data") {
      // ⚠️ ATRIBUIÇÃO DIRETA BASTA, e vale dizer por quê — para o próximo não "consertar"
      // isto de volta para o truque do setter do protótipo. Aquele truque existe para input
      // CONTROLADO pelo React, onde o rastreador interno engole o `input` seguinte. O molde
      // renderiza o campo de data com `defaultValue` (ver `FormularioDeRecurso`), ou seja,
      // NÃO controlado: `el.value` mais os dois eventos é o que os outros seis percursos
      // fazem, e é o que basta.
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

/** A primeira opção ÚTIL de um select — e `null` quando não há nenhuma. */
async function primeiraOpcao(page: Page, seletor: string): Promise<string | null> {
  return page.evaluate((sel) => {
    const s = document.querySelector(sel);
    if (!(s instanceof HTMLSelectElement)) return null;
    const util = Array.from(s.options).find((o) => o.value !== "" && !o.disabled);
    return util?.value ?? null;
  }, seletor);
}

/** A opção cujo texto contém o pedaço — `null` quando não há. */
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
    // ⚠️ NAVEGADOR ECONÔMICO — a máquina tem 8 GB com o swap cheio, e um Chromium padrão abre
    // vários processos. `protocolTimeout` alto evita que uma pausa do renderizador seja
    // relatada como defeito da aplicação.
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
        // ⚠️ SEM TETO DE HEAP NO RENDERIZADOR, E A REMOÇÃO É MEDIDA. Eu havia copiado
        // `--js-flags=--max-old-space-size=256` do percurso da gestão do bem, por frugalidade.
        // Aqui ele não serve: a tela de classes monta um select com 1.405 opções — o recorte
        // honesto das analíticas do ativo —, e navegar para fora dela com o old space travado
        // em 256 MB estourou 60 s. Sem o teto, a MESMA sequência carrega em 81 ms e o
        // `networkidle2` assenta em 795 ms.
        //
        // A correção é a CAUSA, não o relógio: aumentar o timeout teria escondido um limite
        // que eu mesmo inventei, e o percurso seguiria lento por um motivo que ninguém veria.
      ],
    });
    const page = await navegador.newPage();
    page.setDefaultTimeout(60000);
    await entrar(page);
    ok("login");

    // ══════════════════════════════════════════════════════════════════════
    // 1 · A CLASSE DE BENS — e a conta do ativo, que vem recortada
    // ══════════════════════════════════════════════════════════════════════
    await irPara(page, "/patrimonio/classes-de-bens");

    const conta = await primeiraOpcao(
      page,
      'form[data-acao="criar-classes-de-bens"] select[name="contaContabilAtivoId"]'
    );
    // ⚠️ O SELETOR DE CONTA É RECORTADO às analíticas do ativo, e o teto cobre a classe
    // inteira. Se ele viesse vazio, o cadastro de classes seria inalcançável — e com ele o
    // acervo inteiro, porque o bem exige classe.
    conferir(
      "classe: o seletor de conta do ativo OFERECE contas",
      conta !== null,
      "o select de conta do ativo veio vazio ou desabilitado"
    );
    if (conta === null) throw new Error("sem conta do ativo não há como seguir");

    const rClasse = await preencherEEnviar(page, "criar-classes-de-bens", [
      { sel: 'input[name="codigo"]', valor: CLASSE },
      { sel: 'input[name="descricao"]', valor: "Móveis e utensílios do percurso" },
      { sel: 'select[name="especie"]', valor: "MOVEL", tipo: "select" },
      { sel: 'select[name="contaContabilAtivoId"]', valor: conta, tipo: "select" },
    ]);
    conferir("classe: o servidor aceitou", rClasse.tipo === "ok", rClasse.texto);

    const depoisClasse = await irPara(page, "/patrimonio/classes-de-bens");
    conferir(
      "classe: RECARREGADA, a lista a traz persistida com a conta do ativo",
      depoisClasse.includes(CLASSE.toLowerCase()),
      "a classe não apareceu depois da recarga"
    );

    // ══════════════════════════════════════════════════════════════════════
    // 2 · O TIPO DE INCORPORAÇÃO — como o bem entrou no acervo
    //
    // ⚠️ ELE É EXERCIDO AQUI, E NÃO SÓ OFERECIDO. O texto do edital pede o tipo "para ser
    // usado no cadastramento" do bem, e a identificação de se ele foi adquirido, doado,
    // recebido em comodato ou permuta. Um select que existe e nunca é escolhido prova que a
    // tela montou — não prova que o cadastro identifica a origem do bem.
    // ══════════════════════════════════════════════════════════════════════
    await irPara(page, "/patrimonio/tipos-de-incorporacao");
    const rTipo = await preencherEEnviar(page, "criar-tipos-de-incorporacao", [
      { sel: 'input[name="codigo"]', valor: TIPO },
      { sel: 'input[name="descricao"]', valor: "Recebido em doação" },
    ]);
    conferir("tipo de incorporação: o servidor aceitou", rTipo.tipo === "ok", rTipo.texto);

    // ══════════════════════════════════════════════════════════════════════
    // 3 · O BEM — e aqui mora a asserção que este percurso existe para fazer
    // ══════════════════════════════════════════════════════════════════════
    await irPara(page, "/patrimonio/bens-patrimoniais");

    const opcaoDaClasse = await opcaoQueCasa(
      page,
      'form[data-acao="criar-bens-patrimoniais"] select[name="classeDeBensId"]',
      CLASSE
    );
    // ⚠️ O DEFEITO QUE ISTO PEGA: com a chave errada na porta, este select viria DESABILITADO
    // dizendo "nenhuma opção cadastrada" — logo depois de o operador ter cadastrado uma classe.
    conferir(
      "bem: o select de CLASSE oferece a que acabou de ser criada",
      opcaoDaClasse !== null,
      "o select de classe não ofereceu a classe recém-cadastrada"
    );
    if (opcaoDaClasse === null) throw new Error("sem classe no select não há como cadastrar bem");

    const opcaoDoTipo = await opcaoQueCasa(
      page,
      'form[data-acao="criar-bens-patrimoniais"] select[name="tipoDeIncorporacaoId"]',
      TIPO
    );
    conferir(
      "bem: o select de INCORPORAÇÃO oferece o tipo cadastrado na tela anterior",
      opcaoDoTipo !== null,
      "o select de tipo de incorporação não ofereceu o tipo recém-cadastrado"
    );

    const rBem = await preencherEEnviar(page, "criar-bens-patrimoniais", [
      { sel: 'input[name="numeroTombamento"]', valor: TOMB },
      { sel: 'input[name="descricao"]', valor: "Armário de aço do percurso" },
      { sel: 'select[name="classeDeBensId"]', valor: opcaoDaClasse, tipo: "select" },
      { sel: 'input[name="dataAquisicao"]', valor: "2026-03-10", tipo: "data" },
      ...(opcaoDoTipo === null
        ? []
        : ([
            { sel: 'select[name="tipoDeIncorporacaoId"]', valor: opcaoDoTipo, tipo: "select" },
          ] as const)),
    ]);
    conferir("bem: o servidor aceitou", rBem.tipo === "ok", rBem.texto);

    const depoisBem = await irPara(page, "/patrimonio/bens-patrimoniais");
    conferir(
      "bem: RECARREGADO, a lista o traz com a CLASSE e com COMO ELE ENTROU",
      depoisBem.includes(TOMB.toLowerCase()) &&
        depoisBem.includes(CLASSE.toLowerCase()) &&
        depoisBem.includes(TIPO.toLowerCase()),
      "o bem, a classe ou o tipo de incorporação não apareceram na listagem"
    );

    // ══════════════════════════════════════════════════════════════════════
    // 3 · A RECUSA, PELA TELA — e ela tem de dizer o MOTIVO
    // ══════════════════════════════════════════════════════════════════════
    const opcaoDeNovo = await opcaoQueCasa(
      page,
      'form[data-acao="criar-bens-patrimoniais"] select[name="classeDeBensId"]',
      CLASSE
    );
    if (opcaoDeNovo !== null) {
      const rRepetido = await preencherEEnviar(page, "criar-bens-patrimoniais", [
        { sel: 'input[name="numeroTombamento"]', valor: TOMB },
        { sel: 'input[name="descricao"]', valor: "Tentativa de tombamento repetido" },
        { sel: 'select[name="classeDeBensId"]', valor: opcaoDeNovo, tipo: "select" },
        { sel: 'input[name="dataAquisicao"]', valor: "2026-03-11", tipo: "data" },
      ]);
      conferir(
        "tombamento repetido: a tela RECUSA e diz QUAL tombamento já existe",
        rRepetido.tipo === "erro" && rRepetido.texto.includes(TOMB),
        `esperava recusa nomeando ${TOMB}, veio: ${rRepetido.tipo} — ${rRepetido.texto.slice(0, 160)}`
      );
    }

    // ══════════════════════════════════════════════════════════════════════
    // 4 · O HUB DA ÁREA — a mesma lista alimenta hub e busca
    // ══════════════════════════════════════════════════════════════════════
    const hub = await irPara(page, "/patrimonio");
    conferir(
      "hub: as duas telas do acervo aparecem na área de patrimônio",
      hub.includes("classes de bens") && hub.includes("bens patrimoniais"),
      "o hub não listou o acervo"
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
