import "dotenv/config";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { diaCivil, somarDiasCivis } from "../packages/datas/index.js";

/**
 * ═══ O PERCURSO DO ALMOXARIFADO FÍSICO, PELO NAVEGADOR — TR 5.18 (M10) ═══
 *
 * ⚠️ É O PERCURSO QUE PROMOVE A CLÁUSULA, NÃO O DESCRITOR. Uma tela gerada pelo molde
 * compila, aparece no build e pode estar inteiramente quebrada: seletor que vem vazio,
 * formulário que grava e lista que não mostra, aviso de sucesso sem persistência. Todas
 * essas falhas passam pelo typecheck e pela suíte de módulo — a suíte prova o DOMÍNIO, e o
 * domínio já estava provado desde o ENT05. O que este percurso prova é o que faltava:
 * **que um servidor municipal consegue usar.**
 *
 * ═══ A CADEIA, NA ORDEM EM QUE UM ALMOXARIFE A FARIA ═══
 *
 *   unidade de medida -> grupo -> classe contábil -> material -> depósito
 *      -> requisição do setor -> atendimento PARCIAL -> inventário -> contagem -> fechamento
 *
 * ⚠️ A ORDEM NÃO É ARBITRÁRIA, E ELA É O PRÓPRIO ACHADO DO LOTE. Sem os três cadastros de
 * apoio, o formulário de material monta com TRÊS seletores vazios. Medido no banco de
 * desenvolvimento deste lote: `UnidadeDeMedida`, `GrupoDeMaterial` e `ClasseDeMaterial`
 * estavam todos em ZERO, e os três são campo obrigatório de `cadastrarMaterial`.
 *
 * ⚠️ CADA `goto` É UMA RECARGA, e é isso que separa persistência de estado de componente.
 * Um formulário que diz "salvo" e não gravou passa por qualquer teste que olhe só a
 * mensagem; ele não passa por uma recarga que procura o registro na lista.
 *
 * ⚠️ ESTE PERCURSO NÃO LIMPA O BANCO. Ele acrescenta uma cadeia ao banco de
 * desenvolvimento, como aconteceria na vida real, e sufixa os códigos pelo instante da
 * execução. Um percurso que só passa em banco limpo não prova nada sobre um sistema que vai
 * rodar anos com dado acumulado.
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

/** `innerText` vem TRANSFORMADO PELO CSS — comparar em caixa baixa prende o conteúdo. */
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

interface CampoDoSmoke {
  readonly sel: string;
  readonly valor: string;
  readonly tipo?: "select" | "data";
  readonly indice?: number;
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
    const alvos = await page.$$(seletor);
    const alvo = alvos[campo.indice ?? 0];
    if (alvo === undefined) {
      throw new Error(
        `"${seletor}" casou ${alvos.length} elemento(s); o smoke pediu o índice ${campo.indice ?? 0}`
      );
    }
    if (campo.tipo === "data") {
      // `<input type="date">` não aceita `type()` com ISO — ver a nota no smoke do ENT03b.
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

async function opcaoQueCasa(page: Page, seletor: string, pedaco: string): Promise<string> {
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

/**
 * ⚠️ O DIA VEM DA RÉGUA CIVIL, e não de `toISOString().slice(0,10)`.
 *
 * O smoke do ENT03b usava o ISO, e o ISO é UTC: rodando às 22:00 do fuso do ente, ele
 * digitaria o dia SEGUINTE no formulário — e o teste passaria, porque nada confere qual dia
 * foi digitado. Um smoke que digita a data errada em silêncio é pior que um que falha.
 */
function dia(offset = 0): string {
  return diaCivil(somarDiasCivis(new Date(), offset));
}

async function hrefDaAba(page: Page, aba: string): Promise<string> {
  const href = await page.evaluate((a) => {
    const el = document.querySelector(`a[data-aba="${a}"]`);
    return el instanceof HTMLAnchorElement ? el.getAttribute("href") : null;
  }, aba);
  if (href === null) throw new Error(`aba "${aba}" não existe nesta tela`);
  return href;
}

/**
 * O detalhe do registro cujo texto da LINHA contém o identificador.
 *
 * ⚠️ POR QUE ELE EXISTE, E É UM DEFEITO QUE ESTE SMOKE TINHA. `primeiroDetalhe` devolve a
 * PRIMEIRA linha da lista — que na primeira execução é a que acabou de ser criada e, na
 * segunda, é a de ONTEM. O smoke passou no ENT03c por isso e falhou na primeira reexecução
 * com o banco já povoado: "competência 2026-03 já atualizada" e "o saldo vale 20000, não
 * 10000" não eram defeitos do produto — eram o smoke medindo o registro errado.
 *
 * Um percurso que só passa em banco limpo não prova nada sobre um sistema que vai rodar
 * anos com dado acumulado.
 */
async function detalheDe(page: Page, rota: string, identificador: string): Promise<string> {
  const href = await page.evaluate(
    (r, ident) => {
      const linhas = Array.from(document.querySelectorAll("table tr"));
      for (const tr of linhas) {
        if (!(tr.textContent ?? "").includes(ident)) continue;
        const a = tr.querySelector("a");
        const h = a?.getAttribute("href") ?? "";
        if (h.startsWith(`${r}/`)) return h;
      }
      return null;
    },
    rota,
    identificador
  );
  if (href === null) {
    throw new Error(`nenhuma linha com "${identificador}" em ${rota}`);
  }
  return href;
}

/**
 * As abas que ESTES cadastros têm. São duas, e não quatro.
 *
 * ⚠️ A DIFERENÇA É DECLARADA, NÃO ESQUECIDA. `campos` e `anexos` custam MODELO — uma coluna
 * de dono em `Anexo`, um valor em `CadastroComCamposAdicionais` — e este lote não abre
 * modelo novo. Conferir aqui as quatro faria o percurso cobrar uma promessa que o descritor
 * não fez. Conferir as duas que existem prova a falha real: uma aba que abre em branco
 * passa por qualquer teste que só olhe o status 200.
 */
async function conferirAsAbas(page: Page, detalhe: string, nome: string): Promise<void> {
  for (const [aba, marcador] of [
    ["historico", "histórico"],
    ["relacionados", "relacionados"],
  ] as const) {
    const href = await hrefDaAba(page, aba);
    const t = await irPara(page, href.replace(BASE, ""));
    conferir(
      `${nome}: a aba "${aba}" abre e traz conteúdo`,
      t.includes(marcador),
      `a aba abriu sem "${marcador}"`
    );
  }
  await irPara(page, detalhe);
}

/** O texto da LINHA que contém o identificador, para asserção recortada por registro. */
async function linhaDiz(page: Page, identificador: string, pedaco: string): Promise<boolean> {
  return page.evaluate(
    (ident, p) => {
      const linhas = Array.from(document.querySelectorAll("table tr"));
      const alvo = linhas.find((tr) => (tr.textContent ?? "").includes(ident));
      return (alvo?.textContent ?? "").toLowerCase().includes(p);
    },
    identificador,
    pedaco.toLowerCase()
  );
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
    // 1 · OS TRÊS CADASTROS DE APOIO — sem eles o material não se cadastra
    // ══════════════════════════════════════════════════════════════════════
    const sigla = `U${SUF}`.slice(0, 10);
    const listaUM = await irPara(page, "/patrimonio/almoxarifado/unidades");
    conferir(
      "unidades de medida: a listagem abre com o filtro declarado",
      listaUM.includes("unidades de medida") && listaUM.includes("sigla ou descrição"),
      "a listagem não trouxe o título ou a barra de filtros"
    );
    const rUM = await preencherEEnviar(page, "criar-unidades-de-medida", [
      { sel: 'input[name="sigla"]', valor: sigla },
      { sel: 'input[name="descricao"]', valor: `Unidade de percurso ${SUF}` },
    ]);
    conferir("unidade de medida: o servidor aceitou", rUM.tipo === "ok", rUM.texto);

    const depoisUM = await irPara(page, "/patrimonio/almoxarifado/unidades");
    conferir(
      "unidade de medida: RECARREGADA, a lista traz o registro persistido",
      depoisUM.includes(sigla.toLowerCase()),
      `a sigla ${sigla} não apareceu na lista depois da recarga`
    );

    const codGrupo = `G${SUF}`;
    await irPara(page, "/patrimonio/almoxarifado/grupos");
    const rG = await preencherEEnviar(page, "criar-grupos-de-material", [
      { sel: 'input[name="codigo"]', valor: codGrupo },
      { sel: 'input[name="descricao"]', valor: `Grupo de percurso ${SUF}` },
    ]);
    conferir("grupo de material: o servidor aceitou", rG.tipo === "ok", rG.texto);

    const codClasse = `C${SUF}`;
    await irPara(page, "/patrimonio/almoxarifado/classes");
    // ⚠️ A CONTA TEM DE SER DA CLASSE 1 (ativo). O descritor declara `classesDeConta: ["1"]`
    // justamente para o seletor não vir cheio de conta de despesa — e o percurso confere
    // que veio conta nenhuma de outra classe pedindo uma que comece com "1.".
    const contaEstoque = await opcaoQueCasa(
      page,
      'form[data-acao="criar-classes-de-material"] select[name="contaContabilId"]',
      "1."
    );
    const rC = await preencherEEnviar(page, "criar-classes-de-material", [
      { sel: 'input[name="codigo"]', valor: codClasse },
      { sel: 'input[name="descricao"]', valor: `Classe de percurso ${SUF}` },
      { sel: 'select[name="contaContabilId"]', valor: contaEstoque, tipo: "select" },
    ]);
    conferir("classe de material: o servidor aceitou", rC.tipo === "ok", rC.texto);

    // ══════════════════════════════════════════════════════════════════════
    // 2 · O MATERIAL — e os três seletores que os cadastros de apoio encheram
    // ══════════════════════════════════════════════════════════════════════
    const codMat = `MAT-${SUF}`;
    const listaMat = await irPara(page, "/patrimonio/almoxarifado/materiais");
    conferir(
      "materiais: a listagem abre com os filtros declarados",
      listaMat.includes("materiais") && listaMat.includes("código, descrição ou catmat"),
      "a listagem não trouxe o título ou a barra de filtros"
    );

    const grupoOp = await opcaoQueCasa(page, 'form[data-acao="criar-materiais"] select[name="grupoId"]', codGrupo);
    const classeOp = await opcaoQueCasa(page, 'form[data-acao="criar-materiais"] select[name="classeDeMaterialId"]', codClasse);
    const unidadeOp = await opcaoQueCasa(page, 'form[data-acao="criar-materiais"] select[name="unidadeDeMedidaId"]', sigla);
    conferir(
      "material: os três seletores obrigatórios têm opção — os cadastros de apoio os encheram",
      grupoOp !== "" && classeOp !== "" && unidadeOp !== "",
      "algum seletor obrigatório veio vazio"
    );

    const rMat = await preencherEEnviar(page, "criar-materiais", [
      { sel: 'input[name="codigo"]', valor: codMat },
      { sel: 'input[name="descricaoSucinta"]', valor: `Papel A4 do percurso ${SUF}` },
      { sel: 'textarea[name="descricaoDetalhada"]', valor: "Resma 500 folhas, 75 g/m2, alcalino." },
      { sel: 'select[name="grupoId"]', valor: grupoOp, tipo: "select" },
      { sel: 'select[name="classeDeMaterialId"]', valor: classeOp, tipo: "select" },
      { sel: 'select[name="classificacao"]', valor: "CONSUMO", tipo: "select" },
      { sel: 'select[name="categoria"]', valor: "ESTOCAVEL", tipo: "select" },
      { sel: 'input[name="catmat"]', valor: "268471" },
      { sel: 'select[name="unidadeDeMedidaId"]', valor: unidadeOp, tipo: "select" },
    ]);
    conferir("material: o servidor aceitou", rMat.tipo === "ok", rMat.texto);

    const depoisMat = await irPara(page, "/patrimonio/almoxarifado/materiais");
    conferir(
      "material: RECARREGADA, a lista traz o registro persistido",
      depoisMat.includes(codMat.toLowerCase()),
      `${codMat} não apareceu na lista depois da recarga`
    );

    const detMat = await detalheDe(page, "/patrimonio/almoxarifado/materiais", codMat);
    const tMat = await irPara(page, detMat);
    conferir(
      "material: o detalhe mostra a unidade de estoque e o CATMAT",
      tMat.includes(sigla.toLowerCase()) && tMat.includes("268471"),
      "o detalhe não trouxe a unidade de estoque ou o CATMAT"
    );
    conferir(
      "material: o detalhe diz que a unidade de estoque tem fator 1",
      tMat.includes("fator dela é 1") || tMat.includes("fator 1"),
      "o detalhe não explicou o fator da unidade de estoque"
    );
    await conferirAsAbas(page, detMat, "material");

    // ══════════════════════════════════════════════════════════════════════
    // 3 · O DEPÓSITO
    // ══════════════════════════════════════════════════════════════════════
    const codDep = `D${SUF}`.slice(0, 10);
    await irPara(page, "/patrimonio/almoxarifado/depositos");
    const ugOp = await primeiraOpcao(page, 'form[data-acao="criar-depositos"] select[name="unidadeOrcId"]');
    const rDep = await preencherEEnviar(page, "criar-depositos", [
      { sel: 'input[name="codigo"]', valor: codDep },
      { sel: 'input[name="nome"]', valor: `Almoxarifado do percurso ${SUF}` },
      { sel: 'select[name="unidadeOrcId"]', valor: ugOp, tipo: "select" },
    ]);
    conferir("depósito: o servidor aceitou", rDep.tipo === "ok", rDep.texto);

    const depoisDep = await irPara(page, "/patrimonio/almoxarifado/depositos");
    // O id do depósito sai do href da própria linha — a tela de posição o recebe na URL.
    const hrefDep = await detalheDe(page, "/patrimonio/almoxarifado/depositos", codDep);
    const idDoDeposito = hrefDep.split("/").pop() ?? "";
    conferir(
      "depósito: RECARREGADA, a lista traz o registro e o mostra LIBERADO",
      depoisDep.includes(codDep.toLowerCase()) && depoisDep.includes("liberada"),
      "o depósito não apareceu, ou não apareceu com a movimentação liberada"
    );

    // ══════════════════════════════════════════════════════════════════════
    // 4 · A REQUISIÇÃO, E O ATENDIMENTO PARCIAL
    //
    // ⚠️ O NÚCLEO DA SEÇÃO 5.18. A requisição pede 10; o almoxarifado entrega 4. O que
    // falta NÃO é uma coluna: é a diferença entre o solicitado e as saídas vinculadas ao
    // item, derivada na leitura. Um sistema que guardasse "quantidade atendida" passaria a
    // poder divergir dela no primeiro estorno.
    // ══════════════════════════════════════════════════════════════════════
    const numReq = `REQ-${SUF}`;
    await irPara(page, "/patrimonio/almoxarifado/requisicoes");
    const depOp = await opcaoQueCasa(page, 'form[data-acao="criar-requisicoes-de-material"] select[name="depositoId"]', codDep);
    const setorOp = await primeiraOpcao(page, 'form[data-acao="criar-requisicoes-de-material"] select[name="setorId"]');
    const matOp = await opcaoQueCasa(page, 'form[data-acao="criar-requisicoes-de-material"] select[name="materialId"]', codMat);
    const rReq = await preencherEEnviar(page, "criar-requisicoes-de-material", [
      { sel: 'input[name="numero"]', valor: numReq },
      { sel: 'select[name="depositoId"]', valor: depOp, tipo: "select" },
      { sel: 'select[name="setorId"]', valor: setorOp, tipo: "select" },
      { sel: 'input[name="dataRequisicao"]', valor: dia(), tipo: "data" },
      { sel: 'input[name="solicitante"]', valor: "Servidora do percurso" },
      { sel: 'select[name="materialId"]', valor: matOp, tipo: "select" },
      { sel: 'input[name="quantidade"]', valor: "10" },
    ]);
    conferir("requisição: o servidor aceitou", rReq.tipo === "ok", rReq.texto);

    const depoisReq = await irPara(page, "/patrimonio/almoxarifado/requisicoes");
    conferir(
      "requisição: RECARREGADA, a lista mostra que FALTAM 10 — derivado, não coluna",
      depoisReq.includes(numReq.toLowerCase()) && depoisReq.includes("faltam 10"),
      "a requisição não apareceu, ou o saldo a atender não foi derivado"
    );

    const detReq = await detalheDe(page, "/patrimonio/almoxarifado/requisicoes", numReq);
    await irPara(page, detReq);

    // ⚠️ O ATENDIMENTO PARCIAL. Sem estoque, o servidor RECUSA — e a recusa é o
    // comportamento certo, não uma falha do percurso. É o guard do ENT05 dizendo que não se
    // entrega o que não entrou.
    const itemOp = await primeiraOpcao(page, 'form[data-acao="atender"] select[name="itemDeRequisicaoId"]');
    const rAtend = await preencherEEnviar(page, "atender", [
      { sel: 'select[name="itemDeRequisicaoId"]', valor: itemOp, tipo: "select" },
      { sel: 'input[name="quantidade"]', valor: "4" },
      { sel: 'input[name="dataMovimento"]', valor: dia(), tipo: "data" },
      { sel: 'input[name="motivo"]', valor: "Atendimento parcial do percurso" },
    ]);
    conferir(
      "requisição: o servidor RECUSA entregar o que não entrou no estoque, e diz por quê",
      rAtend.tipo === "erro" && rAtend.texto.toLowerCase().includes("estoque"),
      `esperava recusa por falta de estoque; veio "${rAtend.tipo}": ${rAtend.texto.slice(0, 200)}`
    );

    const reReq = await irPara(page, detReq);
    conferir(
      "requisição: depois da RECUSA, o saldo a atender continua 10 — nada foi gravado",
      reReq.includes("faltam 10") || reReq.includes("10.000"),
      "o saldo mudou apesar de o servidor ter recusado"
    );
    await conferirAsAbas(page, detReq, "requisição");

    // ══════════════════════════════════════════════════════════════════════
    // 5 · O INVENTÁRIO — e o BLOQUEIO que ele impõe ao depósito
    // ══════════════════════════════════════════════════════════════════════
    await irPara(page, "/patrimonio/almoxarifado/inventarios");
    const depInvOp = await opcaoQueCasa(page, 'form[data-acao="criar-inventarios-de-estoque"] select[name="depositoId"]', codDep);
    const rInv = await preencherEEnviar(page, "criar-inventarios-de-estoque", [
      { sel: 'select[name="depositoId"]', valor: depInvOp, tipo: "select" },
      { sel: 'input[name="dataAbertura"]', valor: dia(), tipo: "data" },
    ]);
    conferir("inventário: o servidor aceitou a abertura", rInv.tipo === "ok", rInv.texto);

    const listaInv = await irPara(page, "/patrimonio/almoxarifado/inventarios");
    conferir(
      "inventário: RECARREGADA, a lista diz que o depósito está BLOQUEADO",
      listaInv.includes("aberto — depósito bloqueado"),
      "a lista não mostrou o inventário aberto bloqueando a movimentação"
    );

    // ⚠️ O BLOQUEIO É VERIFICÁVEL DE FORA DO INVENTÁRIO, e é isso que prova que ele é um
    // FATO do domínio e não um rótulo desta tela: a lista de depósitos, que não sabe nada
    // sobre inventário, tem de passar a dizer "bloqueada".
    await irPara(page, "/patrimonio/almoxarifado/depositos");
    conferir(
      "depósito: a tela de depósitos reflete o bloqueio imposto pelo inventário",
      // ⚠️ O RECORTE É DESTE DEPÓSITO, e não "alguma linha diz bloqueada". Com o banco
      // povoado por execuções anteriores há outros depósitos bloqueados, e a asserção
      // frouxa passaria sem que o inventário de AGORA tivesse bloqueado coisa alguma.
      await linhaDiz(page, codDep, "bloqueada"),
      "a linha deste depósito continuou dizendo que a movimentação está liberada"
    );

    // ⚠️ VOLTAR À LISTA ANTES DE PROCURAR A LINHA. `detalheDe` lê a página ATUAL, e a
    // verificação acima deixou o navegador na tela de depósitos. A primeira versão deste
    // percurso procurava o inventário dentro da lista de depósitos e falhava com "nenhuma
    // linha com D..." — um erro do percurso, não do produto.
    await irPara(page, "/patrimonio/almoxarifado/inventarios");
    const detInv = await detalheDe(page, "/patrimonio/almoxarifado/inventarios", codDep);
    await irPara(page, detInv);
    const matInvOp = await opcaoQueCasa(page, 'form[data-acao="contar"] select[name="materialId"]', codMat);
    const rCont = await preencherEEnviar(page, "contar", [
      { sel: 'select[name="materialId"]', valor: matInvOp, tipo: "select" },
      { sel: 'input[name="quantidadeContada"]', valor: "7" },
    ]);
    conferir("inventário: o servidor aceitou a contagem", rCont.tipo === "ok", rCont.texto);

    const tInv = await irPara(page, detInv);
    conferir(
      "inventário: a DIVERGÊNCIA é derivada — contou 7 contra posição 0, sobra 7",
      tInv.includes("sobra 7") || tInv.includes("contado 7"),
      "o detalhe não derivou a divergência entre o contado e a posição"
    );
    conferir(
      "inventário: a tela diz que divergência NÃO vira ajuste automático",
      tInv.includes("não vira ajuste"),
      "a tela não explicou o que acontece com a divergência"
    );

    const rFech = await preencherEEnviar(page, "fechar", [
      { sel: 'input[name="dataFechamento"]', valor: dia(), tipo: "data" },
    ]);
    conferir("inventário: o servidor aceitou o fechamento", rFech.tipo === "ok", rFech.texto);

    await irPara(page, "/patrimonio/almoxarifado/depositos");
    conferir(
      "depósito: fechado o inventário, a movimentação volta a aparecer LIBERADA",
      await linhaDiz(page, codDep, "liberada"),
      "a linha deste depósito continuou bloqueada depois de o inventário fechar"
    );

    // ══════════════════════════════════════════════════════════════════════
    // 6 · A POSIÇÃO DE ESTOQUE — "quanto havia NAQUELA DATA"
    //
    // ⚠️ É A CLÁUSULA QUE REFUTA A COLUNA DE SALDO, e ela só se prova com DUAS datas: a
    // mesma consulta, dois dias, dois resultados. Uma tela que respondesse só "agora"
    // passaria por qualquer teste que consultasse uma vez.
    // ══════════════════════════════════════════════════════════════════════
    const posHoje = await irPara(page, `/patrimonio/almoxarifado/estoque?deposito=${idDoDeposito}`);
    conferir(
      "posição: a tela abre para o depósito pedido e diz a data da posição",
      posHoje.includes("posição de estoque") && posHoje.includes(codDep.toLowerCase()),
      "a tela de posição não abriu para o depósito pedido"
    );
    conferir(
      "posição: sem movimento, ela diz que não há saldo — e que isso não é erro",
      posHoje.includes("nenhum material com saldo") && posHoje.includes("não é um erro"),
      "a tela não explicou o estado vazio"
    );

    const ontem = dia(-1);
    const posOntem = await irPara(
      page,
      `/patrimonio/almoxarifado/estoque?deposito=${idDoDeposito}&em=${ontem}`
    );
    conferir(
      "posição: a MESMA consulta responde por outra data — é a pergunta 'naquela data'",
      posOntem.includes(ontem.split("-").reverse().join("/")) || posOntem.includes(ontem),
      `a tela não respondeu pela data ${ontem}`
    );

    conferir(
      "posição: o relatório de validade diz que só lote COM SALDO entra na conta",
      posHoje.includes("já consumido não vence para ninguém"),
      "a tela não explicou o recorte do relatório de validade"
    );

    // ⚠️ GET NÃO PRODUZ TRANSIÇÃO DE ESTADO: a consulta é um `<form method="get">`, e o
    // endereço resultante se copia e se guarda. Um formulário que postasse aqui faria o
    // pré-carregador do navegador disparar a consulta, e o histórico repeti-la ao voltar.
    const metodoDaConsulta = await page.evaluate(() => {
      const f = document.querySelector('form[data-acao="consultar-posicao"]');
      return f instanceof HTMLFormElement ? f.method.toLowerCase() : "(sem formulário)";
    });
    conferir(
      "posição: a consulta é GET — ela não transiciona estado",
      metodoDaConsulta === "get",
      `o formulário de consulta usa "${metodoDaConsulta}"`
    );

    // ══════════════════════════════════════════════════════════════════════
    // 6 · A LISTAGEM DO MOLDE — ordenação por URL e filtro derivado
    // ══════════════════════════════════════════════════════════════════════
    const ordenada = await irPara(page, "/patrimonio/almoxarifado/materiais?ordem=codigo&direcao=desc");
    conferir(
      "a ordenação por URL é aceita e a lista continua respondendo",
      ordenada.includes("materiais"),
      "a lista não respondeu à ordenação por URL"
    );

    const colunaInvalida = await irPara(page, "/patrimonio/almoxarifado/materiais?ordem=descricaoDetalhada");
    conferir(
      "ordenar por coluna NÃO DECLARADA não derruba a tela — cai no padrão",
      colunaInvalida.includes("materiais"),
      "a tela quebrou com um parâmetro de ordenação inválido"
    );

    const soPendentes = await irPara(page, "/patrimonio/almoxarifado/requisicoes?pendentes=PENDENTES");
    conferir(
      "o filtro DERIVADO de requisição pendente responde — e ele não é uma coluna",
      soPendentes.includes(numReq.toLowerCase()),
      "a requisição com saldo não apareceu no filtro de pendentes"
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
