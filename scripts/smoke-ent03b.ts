import "dotenv/config";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { diaCivil, somarDiasCivis } from "../packages/datas/index.js";

/**
 * SMOKE DO ENT03b, PELO NAVEGADOR — o MOLDE, provado pelos cadastros que ele gera.
 *
 * ═══ O QUE ELE PROVA, E POR QUE É ESTE O TESTE QUE IMPORTA NESTE LOTE ═══
 * O molde é uma abstração: ele promete que UM descritor gera listagem com filtros,
 * ordenação por URL, paginação, exportação, seleção com soma no servidor, formulário de
 * criação, detalhe com cinco abas e barra de ações amarrada a permissão. **Uma abstração
 * que ninguém exercita é uma promessa sem prova** — e o custo de descobrir que ela não
 * funciona depois de quatro cadastros construídos por cima é o dobro.
 *
 * Um percurso POR FAMÍLIA DE TELA, que é o que o regime de superfície pede:
 *   · listagem (filtros, ordenação, soma da seleção, exportação);
 *   · formulário de criação;
 *   · detalhe com as cinco abas;
 *   · barra de ações com efeito no domínio.
 *
 * E o percurso corre sobre CADA UM dos quatro cadastros — convênios, precatórios,
 * consórcios e auditorias —, porque o que o molde promete é justamente que os quatro se
 * comportem igual.
 *
 * ⚠️ A RECARGA É O PONTO. Conferir a tela logo depois do envio prova que o React
 * renderizou; conferir depois de um `goto` novo prova que o SERVIDOR tem o dado.
 *
 * ⚠️ ESTE SMOKE NÃO LIMPA O BANCO. Os identificadores levam o instante da execução, e é
 * isso que o torna re-executável — a lição do smoke de pessoas, no ENT02.
 *
 * Uso:  npx next start -p 3011 &
 *       npx tsx scripts/smoke-ent03b.ts http://localhost:3011 <usuario> <senha>
 */

const BASE = process.argv[2] ?? "http://localhost:3000";
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
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await page.type('input[name="identificador"]', USUARIO);
  await page.type('input[name="senha"]', SENHA);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0" }),
    page.click('button[type="submit"]'),
  ]);
  if (page.url().includes("/login")) {
    throw new Error(
      `login não passou (ainda em ${page.url()}). Confira SEED_ADMIN_SENHA e o seed:bootstrap.`
    );
  }
}

/**
 * ⚠️ O TEXTO VEM EM MINÚSCULAS, e isso não é capricho.
 *
 * `innerText` devolve o texto JÁ TRANSFORMADO PELO CSS — e os rótulos do sistema usam
 * `uppercase`. A primeira execução deste smoke acusou "a listagem não trouxe a barra de
 * filtros" sobre uma tela que a trazia: o rótulo estava lá, em caixa alta. Comparar em caixa
 * baixa prende o CONTEÚDO, que é o que importa, e não a decisão tipográfica.
 */
async function texto(page: Page): Promise<string> {
  const bruto = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
  return bruto.toLowerCase();
}

/** Navega e devolve o texto. Um `goto` é sempre uma RECARGA — é o que prova persistência. */
async function irPara(page: Page, rota: string): Promise<string> {
  const resposta = await page.goto(`${BASE}${rota}`, { waitUntil: "networkidle0" });
  const status = resposta?.status() ?? 0;
  if (status !== 200) throw new Error(`${rota} respondeu ${status}`);
  if (page.url().includes("/login")) throw new Error(`${rota} devolveu ao login`);
  return texto(page);
}

/**
 * ⚠️ O CAMPO DE VALOR É MASCARADO, e o `name` está no HIDDEN.
 *
 * `CampoValor` renderiza dois elementos: o visível, com `data-mascara="valor"`, e um
 * `<input type="hidden" name="...">` que carrega o valor CRU. Um seletor por `name`
 * casaria só o hidden — e o puppeteer recusa clicar nele com "Node is either not
 * clickable", que foi exatamente como este smoke falhou na primeira execução.
 *
 * Digitar no visível é o certo por outro motivo também: o hidden é derivado do estado do
 * React, e atribuir `.value` nele mudaria o DOM sem mudar o estado — o valor não chegaria
 * ao servidor.
 */
interface CampoDoSmoke {
  readonly sel: string;
  readonly valor: string;
  readonly tipo?: "select" | "data";
  readonly indice?: number;
}

/**
 * ⚠️ O FORMULÁRIO É LOCALIZADO POR `data-acao`, e os campos DENTRO dele.
 *
 * Estas telas têm vários formulários — a de lotes tem cinco tipos, um por lote. Procurar
 * o campo na PÁGINA faria o smoke preencher um formulário e apertar o botão de outro,
 * exatamente como aconteceu no ENT02 antes de os formulários ganharem nome.
 */
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
    const alvos = await page.$$(seletor);
    const alvo = alvos[campo.indice ?? 0];
    if (alvo === undefined) {
      throw new Error(
        `"${seletor}" casou ${alvos.length} elemento(s); o smoke pediu o índice ${campo.indice ?? 0}`
      );
    }
    if (campo.tipo === "data") {
      // ⚠️ `<input type="date">` NÃO ACEITA `type()` COM `YYYY-MM-DD`.
      //
      // O Chrome espera a digitação no formato do LOCALE (MM/DD/YYYY em en-US), e digitar
      // o ISO produz uma data inválida — foi assim que este smoke falhou na segunda
      // execução, com `"received": "Invalid Date"` vindo do Zod.
      //
      // Estes campos são NÃO CONTROLADOS (não há `value` do React neles), então atribuir
      // `.value` é legítimo: o valor vai para o `FormData` no envio. Os eventos são
      // despachados assim mesmo, para o caso de alguém tornar o campo controlado depois —
      // aí o React precisa saber.
      await page.evaluate(
        (sel, v, i) => {
          const alvos = Array.from(document.querySelectorAll(sel));
          const el = alvos[i];
          if (!(el instanceof HTMLInputElement)) return;
          el.value = v;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        },
        seletor,
        campo.valor,
        campo.indice ?? 0
      );
      continue;
    }
    if (campo.tipo === "select") {
      await alvo.select(campo.valor);
      // ⚠️ O SELECT DA CONTA DISPARA `useState` E REPOPULA O DE FONTE. Sem esta espera, o
      // smoke escolheria a fonte na lista velha — e o `value` submetido seria de outra
      // conta. É a mesma classe de defeito que o `data-acao` fechou: a tela mudou entre
      // duas ações do robô.
      await new Promise((r) => setTimeout(r, 400));
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

  await new Promise((r) => setTimeout(r, 3000));

  // ⚠️ O QUE O SERVIDOR RESPONDEU FICA REGISTRADO, inclusive no sucesso. "Não apareceu
  // após a recarga" é o SINTOMA — não diz se o servidor recusou, se a ação nem foi
  // chamada, ou se gravou e a lista é que não mostra. Três defeitos, uma cara só.
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
  } else if (resposta.tipo === "silencio") {
    console.log(`      [sem resposta visível em "${acao}"]`);
  }
  return resposta;
}

/** O `value` da primeira `<option>` utilizável de um select. */
async function primeiraOpcao(page: Page, seletor: string): Promise<string> {
  const v = await page.evaluate((sel) => {
    const s = document.querySelector(sel);
    if (!(s instanceof HTMLSelectElement)) return null;
    for (const o of Array.from(s.options)) {
      if (o.value !== "" && !o.disabled) return o.value;
    }
    return null;
  }, seletor);
  if (v === null) throw new Error(`nenhuma opção utilizável em "${seletor}"`);
  return v;
}

/**
 * Um dia civil relativo a hoje, como `YYYY-MM-DD`.
 *
 * ⚠️ ERA `toISOString().slice(0,10)`, e o ISO é UTC. Rodando às 22:00 do fuso do ente, este
 * smoke digitaria o dia SEGUINTE no formulário — e passaria, porque nada aqui confere QUAL
 * dia foi digitado. Um smoke que digita a data errada em silêncio é pior que um que falha.
 * Achado ao fechar a `DATA-CIVIL-APRESENTACAO` no ENT03c.
 */
function dia(offset = 0): string {
  return diaCivil(somarDiasCivis(new Date(), offset));
}


/** O `value` da primeira opção utilizável cujo rótulo casa (ou a primeira, se não casar). */
async function opcaoQueCasa(
  page: Page,
  seletor: string,
  pedaco: string
): Promise<string> {
  const v = await page.evaluate(
    (sel, p) => {
      const s = document.querySelector(sel);
      if (!(s instanceof HTMLSelectElement)) return null;
      const uteis = Array.from(s.options).filter((o) => o.value !== "" && !o.disabled);
      const casada = uteis.find((o) => o.textContent?.includes(p));
      return (casada ?? uteis[0])?.value ?? null;
    },
    seletor,
    pedaco
  );
  if (v === null) throw new Error(`nenhuma opção utilizável em "${seletor}"`);
  return v;
}

/** O texto de um `<a>` de aba, e o href dele — para o smoke navegar como um humano. */
async function hrefDaAba(page: Page, aba: string): Promise<string> {
  const href = await page.evaluate((a) => {
    const el = document.querySelector(`a[data-aba="${a}"]`);
    return el instanceof HTMLAnchorElement ? el.getAttribute("href") : null;
  }, aba);
  if (href === null) throw new Error(`aba "${aba}" não existe nesta tela`);
  return href;
}

/** O href do primeiro link da tabela que leva a um detalhe da rota indicada. */
async function primeiroDetalhe(page: Page, rota: string): Promise<string> {
  const href = await page.evaluate((r) => {
    const links = Array.from(document.querySelectorAll("table a"));
    const alvo = links.find((a) => (a.getAttribute("href") ?? "").startsWith(`${r}/`));
    return alvo?.getAttribute("href") ?? null;
  }, rota);
  if (href === null) throw new Error(`nenhum link de detalhe em ${rota}`);
  return href;
}

/**
 * ⚠️ AS CINCO ABAS SÃO CONFERIDAS UMA A UMA, e a conferência é o TEXTO de cada uma.
 *
 * Uma aba que abre em branco passaria por qualquer teste que só verificasse o status 200 —
 * e "abre e não mostra nada" é exatamente o modo de falha de uma aba ligada ao dado errado.
 */
async function conferirAsCincoAbas(
  page: Page,
  detalhe: string,
  nome: string
): Promise<void> {
  // ⚠️ MINÚSCULAS — `texto()` devolve o innerText já transformado pelo CSS. Ver a nota lá.
  const esperado: readonly [string, string][] = [
    ["campos", "campos adicionais"],
    ["anexos", "anexos"],
    ["historico", "histórico"],
    ["relacionados", "relacionados"],
  ];
  for (const [aba, marcador] of esperado) {
    const href = await hrefDaAba(page, aba);
    const t = await irPara(page, href.replace(BASE, ""));
    conferir(
      `${nome}: a aba "${aba}" abre e traz conteúdo`,
      t.includes(marcador),
      `a aba abriu sem "${marcador}"`
    );
  }
  // e volta para dados, que é onde a barra de ações mora
  await irPara(page, detalhe);
}

async function main(): Promise<void> {
  let navegador: Browser | undefined;
  try {
    navegador = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await navegador.newPage();
    page.setDefaultTimeout(30000);
    await entrar(page);
    ok("login");

    // ══════════════════════════════════════════════════════════════════════
    // 1 · CONVÊNIOS — o percurso completo do molde
    // ══════════════════════════════════════════════════════════════════════
    const lista = await irPara(page, "/transferencias/convenios");
    conferir(
      "a listagem do molde abre com os filtros declarados",
      lista.includes("convênios de repasse") && lista.includes("número ou outra parte"),
      "a listagem não trouxe o título ou a barra de filtros"
    );
    // ⚠️ AS COLUNAS SÓ APARECEM QUANDO HÁ LINHA. A primeira versão as conferia na lista
    // VAZIA, e acusou uma tela que estava certa: sem registro, o molde mostra o estado vazio
    // — que é o comportamento desejado, e não uma tabela de cabeçalhos órfãos. A conferência
    // desceu para depois da criação.

    const fonte = await opcaoQueCasa(
      page,
      'form[data-acao="criar-convenios"] select[name="fonteRecursoId"]',
      ""
    );
    const conta = await opcaoQueCasa(
      page,
      'form[data-acao="criar-convenios"] select[name="contaContabilId"]',
      "8."
    );
    const IDENT = `CV-SMOKE-${SUF}`;
    const rCriar = await preencherEEnviar(page, "criar-convenios", [
      { sel: 'input[name="identificador"]', valor: IDENT },
      { sel: 'select[name="papelDoEnte"]', valor: "CONCEDENTE", tipo: "select" },
      { sel: 'textarea[name="objeto"]', valor: `Repasse de custeio verificado pelo smoke ${SUF}` },
      { sel: 'input[name="partidaNome"]', valor: "Associacao Casa de Apoio" },
      { sel: 'input[data-mascara="cpf-cnpj"]', valor: "12345678000199" },
      { sel: 'input[name="leiAutorizativa"]', valor: "Lei Municipal 8.100/2025" },
      { sel: 'input[data-mascara="valor"]', valor: "100000,00", indice: 0 },
      { sel: 'input[data-mascara="valor"]', valor: "10000,00", indice: 1 },
      { sel: 'input[name="diaVigenciaInicio"]', valor: dia(-30), tipo: "data" },
      { sel: 'input[name="diaVigenciaFim"]', valor: dia(120), tipo: "data" },
      { sel: 'select[name="fonteRecursoId"]', valor: fonte, tipo: "select" },
      { sel: 'select[name="contaContabilId"]', valor: conta, tipo: "select" },
    ]);
    conferir("o convênio é cadastrado pelo formulário do molde", rCriar.tipo !== "erro", rCriar.texto);

    const aposCriar = await irPara(page, "/transferencias/convenios");
    conferir(
      "o convênio aparece APÓS RECARGA, com a situação derivada",
      aposCriar.includes(IDENT.toLowerCase()) && aposCriar.includes("a iniciar"),
      `"${IDENT}" não apareceu com a situação derivada`
    );
    conferir(
      "a listagem traz as colunas derivadas (a liberar, a prestar contas)",
      aposCriar.includes("a liberar") && aposCriar.includes("a prestar contas"),
      "faltaram as colunas de saldo derivado"
    );

    // ── o FILTRO, que é do molde e não da tela ──
    const filtrado = await irPara(
      page,
      `/transferencias/convenios?q=${encodeURIComponent(IDENT)}`
    );
    conferir(
      "o filtro composto é aplicado pela URL, e a lista é linkável",
      filtrado.includes(IDENT.toLowerCase()),
      "o filtro escondeu o registro que deveria mostrar"
    );
    const filtroVazio = await irPara(page, "/transferencias/convenios?q=ZZZ-NAO-EXISTE-ZZZ");
    conferir(
      "o filtro sem resultado DIZ que o filtro é a causa",
      filtroVazio.includes("limpe os filtros"),
      "a lista vazia não explicou o motivo"
    );

    // ── a ORDENAÇÃO, também por URL ──
    const ordenado = await irPara(
      page,
      "/transferencias/convenios?ordem=identificador&dir=desc"
    );
    conferir(
      "a ordenação por URL responde",
      ordenado.includes("convênios de repasse"),
      "a ordenação derrubou a tela"
    );

    // ── a SELEÇÃO COM SOMA, no servidor ──
    const detalheHref = await (async () => {
      await irPara(page, `/transferencias/convenios?q=${encodeURIComponent(IDENT)}`);
      return primeiroDetalhe(page, "/transferencias/convenios");
    })();
    const id = detalheHref.split("/").pop() ?? "";
    const comSoma = await irPara(
      page,
      `/transferencias/convenios?q=${encodeURIComponent(IDENT)}&sel=${id}`
    );
    conferir(
      "a soma da seleção vem do SERVIDOR, em Decimal",
      comSoma.includes("1 selecionada(s)") && comSoma.includes("100.000,00"),
      "a soma da seleção não apareceu com o total esperado"
    );

    // ── o DETALHE e as CINCO ABAS ──
    const detalhe = await irPara(page, detalheHref);
    conferir(
      "o detalhe do molde abre com os saldos DERIVADOS",
      detalhe.includes("saldo a liberar") && detalhe.includes("pendente de prestação"),
      "o detalhe não trouxe os saldos derivados"
    );
    await conferirAsCincoAbas(page, detalheHref, "convênio");

    // ── a BARRA DE AÇÕES, com efeito no domínio ──
    const rGlosa = await preencherEEnviar(page, "glosar", [
      { sel: 'input[data-mascara="valor"]', valor: "1.000,00" },
      { sel: 'input[name="diaMovimento"]', valor: dia(0), tipo: "data" },
      { sel: 'input[name="competencia"]', valor: dia(0).slice(0, 7) },
      { sel: 'input[name="motivo"]', valor: `Glosa verificada pelo smoke ${SUF}` },
    ]);
    conferir(
      "a ação da barra grava, ou RECUSA nomeando o motivo",
      rGlosa.tipo !== "silencio",
      "a ação não respondeu nada — nem sucesso, nem recusa"
    );

    // ⚠️ A GLOSA FOI RECUSADA POR FALTA DE ROTEIRO, e a recusa está CERTA: as contas do PCASP
    // vêm por parâmetro, e o banco de desenvolvimento não tem `RoteiroConvenio` cadastrado.
    // Por isso a conferência do HISTÓRICO desceu para a auditoria, cujo movimento de ABERTURA
    // nasce junto com o registro e existe sempre. Pendência: ROTEIROS-ENT03B-PARAMETRIZACAO.
    const aposAcao = await irPara(page, `${detalheHref}?aba=historico`);
    conferir(
      "a aba de histórico responde mesmo sem movimento",
      aposAcao.includes("nenhum movimento registrado") || aposAcao.includes("fato em"),
      "a aba de histórico não disse nem que está vazia"
    );

    // ══════════════════════════════════════════════════════════════════════
    // 2 · PRECATÓRIOS — a mesma superfície, e a FILA do art. 100 na listagem
    // ══════════════════════════════════════════════════════════════════════
    const prec = await irPara(page, "/divida/precatorios");
    conferir(
      "a listagem de precatórios abre e traz a coluna da FILA",
      prec.includes("precatórios judiciais") && prec.includes("fila"),
      "a listagem não trouxe a posição na fila"
    );

    const contaPrec = await opcaoQueCasa(
      page,
      'form[data-acao="criar-precatorios"] select[name="contaContabilId"]',
      "2."
    );
    const PROC = `0001-SMOKE-${SUF}`;
    const rPrec = await preencherEEnviar(page, "criar-precatorios", [
      { sel: 'input[name="numeroProcesso"]', valor: PROC },
      { sel: 'input[name="tribunal"]', valor: "TJSC" },
      { sel: 'input[name="beneficiarioNome"]', valor: `Beneficiario do smoke ${SUF}` },
      { sel: 'input[data-mascara="cpf-cnpj"]', valor: "12345678901" },
      { sel: 'select[name="natureza"]', valor: "ALIMENTAR", tipo: "select" },
      { sel: 'select[name="preferencia"]', valor: "IDOSO", tipo: "select" },
      { sel: 'input[name="diaApresentacao"]', valor: dia(-400), tipo: "data" },
      { sel: 'input[name="exercicioDePagamento"]', valor: String(new Date().getFullYear()) },
      { sel: 'input[data-mascara="valor"]', valor: "50.000,00" },
      { sel: 'select[name="contaContabilId"]', valor: contaPrec, tipo: "select" },
    ]);
    conferir("o precatório é cadastrado pelo mesmo molde", rPrec.tipo !== "erro", rPrec.texto);

    const aposPrec = await irPara(page, `/divida/precatorios?q=${encodeURIComponent(PROC)}`);
    conferir(
      "o precatório aparece APÓS RECARGA, com natureza e preferência",
      aposPrec.includes(PROC.toLowerCase()) && aposPrec.includes("alimentar") && aposPrec.includes("idoso"),
      "o precatório não apareceu com a classificação do art. 100"
    );

    const detPrecHref = await primeiroDetalhe(page, "/divida/precatorios");
    const detPrec = await irPara(page, detPrecHref);
    conferir(
      "o detalhe do precatório explica o critério da fila",
      detPrec.includes("alimentar paga-se antes de comum") || detPrec.includes("art. 100"),
      "o detalhe não trouxe a base legal da ordem"
    );

    // ══════════════════════════════════════════════════════════════════════
    // 3 · CONSÓRCIOS
    // ══════════════════════════════════════════════════════════════════════
    const cons = await irPara(page, "/transferencias/consorcios");
    conferir(
      "a listagem de consórcios abre com o rateio do exercício",
      cons.includes("consórcios públicos") && cons.includes("rateio do exercício"),
      "a listagem não trouxe o teto do rateio"
    );

    const fonteCons = await opcaoQueCasa(
      page,
      'form[data-acao="criar-consorcios"] select[name="fonteRecursoId"]',
      ""
    );
    const contaCons = await opcaoQueCasa(
      page,
      'form[data-acao="criar-consorcios"] select[name="contaContabilId"]',
      "8."
    );
    const CIS = `CIS-SMOKE-${SUF}`;
    const rCons = await preencherEEnviar(page, "criar-consorcios", [
      { sel: 'input[name="identificador"]', valor: CIS },
      { sel: 'input[name="denominacao"]', valor: `Consorcio do smoke ${SUF}` },
      { sel: 'input[data-mascara="cpf-cnpj"]', valor: "12345678000188" },
      { sel: 'input[name="areaDeAtuacao"]', valor: "Saude" },
      { sel: 'input[name="protocoloDeIntencoes"]', valor: "Protocolo de 12/03/2019" },
      { sel: 'input[name="leiRatificadora"]', valor: "Lei Municipal 7.200/2019" },
      { sel: 'select[name="fonteRecursoId"]', valor: fonteCons, tipo: "select" },
      { sel: 'select[name="contaContabilId"]', valor: contaCons, tipo: "select" },
    ]);
    conferir("o consórcio é cadastrado pelo mesmo molde", rCons.tipo !== "erro", rCons.texto);

    const aposCons = await irPara(page, `/transferencias/consorcios?q=${encodeURIComponent(CIS)}`);
    conferir(
      "o consórcio aparece APÓS RECARGA",
      aposCons.includes(CIS.toLowerCase()),
      `"${CIS}" não apareceu na lista`
    );

    // ⚠️ O TETO NASCE ZERO, e é isso que faz o repasse ser RECUSADO até haver rateio.
    const detConsHref = await primeiroDetalhe(page, "/transferencias/consorcios");
    await irPara(page, detConsHref);
    const rRepasse = await preencherEEnviar(page, "repassar", [
      { sel: 'input[name="exercicio"]', valor: String(new Date().getFullYear()) },
      { sel: 'input[data-mascara="valor"]', valor: "1.000,00" },
      { sel: 'input[name="diaMovimento"]', valor: dia(0), tipo: "data" },
      { sel: 'input[name="competencia"]', valor: dia(0).slice(0, 7) },
      { sel: 'input[name="motivo"]', valor: `Repasse sem rateio, do smoke ${SUF}` },
    ]);
    conferir(
      "repassar SEM contrato de rateio é recusado PELA TELA, citando o art. 8º",
      rRepasse.tipo === "erro" && rRepasse.texto.includes("art. 8º"),
      `esperava recusa citando o art. 8º; veio "${rRepasse.tipo}": ${rRepasse.texto.slice(0, 200)}`
    );

    // ══════════════════════════════════════════════════════════════════════
    // 4 · AUDITORIAS INTERNAS — o cadastro SEM efeito contábil
    // ══════════════════════════════════════════════════════════════════════
    const aud = await irPara(page, "/controle-interno/auditorias");
    conferir(
      "a listagem de auditorias abre",
      aud.includes("auditorias internas"),
      "a listagem de auditorias não abriu"
    );
    // ⚠️ ELA NÃO TEM SELEÇÃO COM SOMA, e isso é o molde OBEDECENDO ao descritor: não há
    // coluna de dinheiro. Caixa de marcação sem total prometeria uma operação inexistente.
    conferir(
      "a listagem SEM coluna de dinheiro não oferece seleção com soma",
      !aud.includes("somar selecionadas"),
      "apareceu 'Somar selecionadas' num cadastro sem coluna somável"
    );

    const orgao = await opcaoQueCasa(
      page,
      'form[data-acao="criar-auditorias"] select[name="orgaoId"]',
      ""
    );
    const AI = `AI-SMOKE-${SUF}`;
    const rAud = await preencherEEnviar(page, "criar-auditorias", [
      { sel: 'input[name="identificador"]', valor: AI },
      { sel: 'select[name="tipo"]', valor: "PROGRAMADA", tipo: "select" },
      { sel: 'select[name="orgaoId"]', valor: orgao, tipo: "select" },
      { sel: 'textarea[name="objeto"]', valor: `Auditoria verificada pelo smoke ${SUF}` },
      { sel: 'input[name="diaPeriodoInicio"]', valor: dia(-365), tipo: "data" },
      { sel: 'input[name="diaPeriodoFim"]', valor: dia(-1), tipo: "data" },
      { sel: 'input[name="responsavel"]', valor: USUARIO },
      { sel: 'input[name="diaAbertura"]', valor: dia(0), tipo: "data" },
      { sel: 'input[name="motivo"]', valor: `Plano anual, item do smoke ${SUF}` },
    ]);
    conferir("a auditoria é aberta pelo mesmo molde", rAud.tipo !== "erro", rAud.texto);

    const aposAud = await irPara(page, `/controle-interno/auditorias?q=${encodeURIComponent(AI)}`);
    conferir(
      "a auditoria aparece APÓS RECARGA, com a situação derivada dos movimentos",
      aposAud.includes(AI.toLowerCase()) && aposAud.includes("aberta"),
      `"${AI}" não apareceu com a situação derivada`
    );
    conferir(
      "a listagem de auditorias traz a coluna do checklist",
      aposAud.includes("checklist"),
      "faltou a coluna do checklist"
    );

    const detAudHref = await primeiroDetalhe(page, "/controle-interno/auditorias");
    await irPara(page, detAudHref);
    const rIrreg = await preencherEEnviar(page, "registrar-irregularidade", [
      { sel: 'textarea[name="descricao"]', valor: `Achado verificado pelo smoke ${SUF}, com descricao suficiente.` },
      { sel: 'select[name="gravidade"]', valor: "GRAVE", tipo: "select" },
      { sel: 'input[name="diaPrazo"]', valor: dia(30), tipo: "data" },
      { sel: 'input[name="providencia"]', valor: `Regularizar conforme o smoke ${SUF}` },
    ]);
    conferir("a irregularidade é registrada pela tela", rIrreg.tipo !== "erro", rIrreg.texto);

    const aposIrreg = await irPara(page, `/controle-interno/auditorias?q=${encodeURIComponent(AI)}`);
    conferir(
      "o achado aparece na listagem APÓS RECARGA",
      aposIrreg.includes(AI.toLowerCase()),
      "a auditoria sumiu da lista depois do achado"
    );

    // ⚠️ AS DUAS DATAS, e aqui elas existem: a auditoria nasce com o movimento de ABERTURA, e
    // a irregularidade acrescentou outra linha. "fato em X · registrado Y" é a promessa do
    // molde — mostrar só uma faria o movimento de março, lançado em maio, parecer de maio.
    const histAud = await irPara(page, `${detAudHref}?aba=historico`);
    conferir(
      "o HISTÓRICO mostra cada linha com as DUAS datas (fato e registro)",
      histAud.includes("fato em") && histAud.includes("registrado"),
      "o histórico não separou a data do fato da do registro"
    );
    conferir(
      "o histórico traz a abertura E o achado — nada se apaga",
      histAud.includes("abertura") && histAud.includes("irregularidade"),
      "o histórico não trouxe os dois movimentos"
    );
    await conferirAsCincoAbas(page, detAudHref, "auditoria");

    // ══════════════════════════════════════════════════════════════════════
    // 5 · A NAVEGAÇÃO — as três áreas novas existem e chegam às telas
    // ══════════════════════════════════════════════════════════════════════
    for (const [rota, marcador] of [
      ["/transferencias", "convênios de repasse"],
      ["/divida", "precatórios judiciais"],
      ["/controle-interno", "auditorias internas"],
    ] as const) {
      const t = await irPara(page, rota);
      conferir(
        `a área ${rota} lista os cadastros dela`,
        t.includes(marcador),
        `a landing de ${rota} não apontou para "${marcador}"`
      );
    }
  } finally {
    await navegador?.close();
  }

  console.log(`\n${passos.length} passos concluídos, ${falhas.length} falha(s).`);
  if (falhas.length > 0) {
    console.error("\nFALHAS:");
    for (const f of falhas) console.error(`  · ${f}`);
    process.exitCode = 1;
  }
}

await main();
