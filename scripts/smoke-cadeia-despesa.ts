// `.env` para o smoke achar SEED_ADMIN_SENHA sem a senha passar pelo histórico do shell.
import "dotenv/config";
import puppeteer, { type Browser, type ElementHandle, type Page } from "puppeteer";

/**
 * SMOKE DA CADEIA DA DESPESA, PELO NAVEGADOR — o cenário de aceite do ENT01 (§2.4).
 *
 * ═══ O QUE ELE PROVA, E POR QUE NENHUM TESTE DE MÓDULO PROVA ISSO ═══
 * A suíte prova o domínio: que `pagar()` com retenção compõe as pernas certas. O gate do
 * lote pede outra coisa, literal: que a cadeia atravesse **pela interface**, e que *"cada
 * tela, recarregada, encontre o dado persistido — não estado de componente"*.
 *
 * São falhas diferentes, e todas passam pelos testes de módulo:
 *   · o formulário grava e a lista não mostra (cache do Next não revalidado);
 *   · a lista mostra e nada gravou (estado do componente);
 *   · o campo com máscara submete vazio (o hidden não acompanhou o React);
 *   · a tela de retenção manda o valor errado ao servidor;
 *   · o dossiê soma diferente do razão.
 *
 * ═══ OS NÚMEROS (§2.4), ESCRITOS AQUI ANTES DE RODAR ═══
 *   dotação 10.000,00 · empenho 1.000,00 · liquidação 1.000,00
 *   retenção INFORMADA 100,00 · SAÍDA DE CAIXA 900,00
 *
 * E, no fim, o ESTORNO: anular o pagamento devolve ao caixa os 900 que saíram — nunca os
 * 1.000 do bruto. Estornar pelo bruto inventaria 100 reais de disponibilidade, e o
 * lançamento fecharia do mesmo jeito.
 *
 * ⚠️ VALORES DE ENGENHARIA. Não são alíquota legal, não são pagamento real e não
 * representam tabela tributária de município nenhum. Existem para separar bruto, líquido
 * e a perna que carrega cada um.
 *
 * ⚠️ ESTE SMOKE NÃO LIMPA O BANCO. Ele acrescenta uma cadeia ao banco de
 * desenvolvimento — os documentos ficam lá, anulados, como ficariam na vida real. Os
 * números são sufixados pelo instante da execução para não colidirem com a execução
 * anterior.
 *
 * ⚠️ CADA EXECUÇÃO CONSOME 1.000,00 DA DOTAÇÃO da ficha do cenário, e o seed não repõe:
 * repor seria crédito adicional, que é ato do M03. Esgotada a ficha, o domínio recusa o
 * empenho com a mensagem dele — resposta certa, não defeito do smoke.
 *
 * Pré-requisitos:
 *   npm run seed:pcasp && npm run seed:m02 && npm run seed:m07
 *   npm run seed:roteiro-orc
 *   SEED_IDENTIDADE=<usuario ativo> npm run seed:cenario-aceite
 *
 * Uso:  npx next start -p 3011 &
 *       npx tsx scripts/smoke-cadeia-despesa.ts http://localhost:3011 <usuario> <senha>
 */

const BASE = process.argv[2] ?? "http://localhost:3000";
const USUARIO = process.argv[3] ?? "admin@cg.pb.gov.br";
const SENHA = process.argv[4] ?? process.env["SEED_ADMIN_SENHA"] ?? "";

const EXERCICIO = "2026";
const EMPENHO = "1.000,00";
const LIQUIDACAO = "1.000,00";
const RETENCAO = "100,00";
/** O que a tela TEM de mostrar como saída de caixa. É o ponto do cenário inteiro. */
const SAIDA_DE_CAIXA = "900,00";

/** Sufixo por execução: o smoke roda mais de uma vez no mesmo banco de desenvolvimento. */
const SUF = String(Date.now()).slice(-6);
const NE = `2026NE${SUF}`;
const NL = `2026NL${SUF}`;
const NP = `2026OP${SUF}`;
const NP_ANULACAO = `2026OP${SUF}A`;
/** T07 — o número da ordem de pagamento preparada pela tela. */
const NO = `2026ORD${SUF}`;

const CREDOR = "11.222.333/0001-81";
const CONSIGNATARIO = "INSS - smoke";

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

/** Confere e reporta numa linha só — o smoke inteiro é uma sequência destas. */
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

async function texto(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
}

async function irPara(page: Page, rota: string): Promise<string> {
  const resposta = await page.goto(`${BASE}${rota}`, { waitUntil: "networkidle0" });
  const status = resposta?.status() ?? 0;
  if (status !== 200) throw new Error(`${rota} respondeu ${status}`);
  if (page.url().includes("/login")) throw new Error(`${rota} devolveu ao login`);
  return texto(page);
}

/**
 * ⚠️ OS CAMPOS COM MÁSCARA TÊM DOIS INPUTS — e é isto que um smoke ingênuo erra.
 * `CampoValor` e `CampoCpfCnpj` renderizam o input VISÍVEL (com máscara, controlado pelo
 * React) e um `<input type="hidden">` com o valor CRU, que é o que atravessa a fronteira.
 * Digitar em `[name="valor"]` é digitar no ESCONDIDO: nada aparece, o React não atualiza
 * e o formulário sai vazio. O visível se identifica por `data-mascara`.
 */
const SELETOR_VISIVEL: Readonly<Record<string, string>> = {
  credor: '[data-mascara="cpf-cnpj"]',
  valor: '[data-mascara="valor"]',
};

/**
 * Preenche um formulário e envia. `ancora` identifica QUAL formulário — a tela de
 * pagamentos tem três, e o primeiro botão da página seria quase sempre o errado.
 *
 * ⚠️ DIGITA DE VERDADE (`page.type`) nos campos de texto e usa `select` nos `<select>`:
 * atribuir `.value` num campo controlado muda o DOM e não o estado, e o hidden derivado
 * continua vazio.
 */
interface CampoDoSmoke {
  readonly sel: string;
  readonly valor: string;
  readonly tipo?: "select" | "data";
  /**
   * ⚠️ QUANDO O MESMO SELETOR CASA MAIS DE UM CAMPO. A tela de pagamento tem DOIS campos
   * de dinheiro — o do pagamento e o da retenção —, e os dois se identificam por
   * `data-mascara="valor"`. Um `:nth-of-type` não resolve: os `<input type="hidden">` que
   * as máscaras emitem entram na contagem do CSS e deslocam o índice. Aqui o índice é
   * sobre os elementos QUE CASARAM, na ordem do DOM, que é a ordem em que o operador os vê.
   */
  readonly indice?: number;
}

async function preencherEEnviar(
  page: Page,
  ancora: string,
  campos: readonly CampoDoSmoke[]
): Promise<void> {
  await page.waitForSelector(ancora, { timeout: 10000 });

  for (const campo of campos) {
    await page.waitForSelector(campo.sel, { timeout: 10000 });
    const indice = campo.indice ?? 0;
    const alvos = await page.$$(campo.sel);
    const alvo = alvos[indice];
    if (alvo === undefined) {
      throw new Error(
        `"${campo.sel}" casou ${alvos.length} elemento(s); o smoke pediu o de índice ${indice}`
      );
    }
    if (campo.tipo === "select") {
      await alvo.select(campo.valor);
      continue;
    }
    if (campo.tipo === "data") {
      await escreverData(alvo, campo.valor);
      continue;
    }
    await alvo.click({ count: 3 });
    await page.keyboard.press("Backspace");
    await alvo.type(campo.valor, { delay: 5 });
  }

  const enviou = await page.evaluate((sel) => {
    const campo = document.querySelector(sel);
    const form = campo?.closest("form");
    const botao = form?.querySelector('button[type="submit"]');
    if (!(botao instanceof HTMLButtonElement)) return false;
    botao.click();
    return true;
  }, ancora);
  if (!enviou) throw new Error(`não achei o botão de envio do formulário de "${ancora}"`);

  // A Server Action não navega: espera-se a resposta do servidor chegar ao DOM.
  await new Promise((r) => setTimeout(r, 2500));
}

/**
 * ESCREVE NUM `input[type="date"]` — e ele NÃO se digita.
 *
 * ═══ ⚠️ POR QUE DIGITAR NUM CAMPO DE DATA É LOTERIA ═══
 * Um `input[type=date]` não é uma caixa de texto: são três segmentos (dia, mês, ano), e o
 * clique cai no segmento que estiver sob o ponteiro. `page.click` mira o CENTRO do
 * elemento — que num campo largo é o mês e num campo estreito é o ano. Digitar
 * "15/06/2026" a partir do segmento errado produz uma data INCOMPLETA, e o navegador
 * bloqueia o submit por conta própria: o servidor nunca é chamado, o DOM não ganha
 * mensagem, e a falha se lê como "a tela não respondeu".
 *
 * Foi exatamente o que aconteceu com a anulação deste smoke — os outros campos de data
 * funcionaram por sorte de largura.
 *
 * ⚠️ O `value` DE UM CAMPO DE DATA É SEMPRE ISO (`aaaa-mm-dd`), independente do idioma do
 * navegador. A exibição é que segue o locale.
 *
 * ⚠️ O SETTER NATIVO, E NÃO `el.value = v`. O React substitui o setter de `value` no
 * protótipo para saber quando o valor muda; atribuir direto num campo CONTROLADO muda o
 * DOM sem avisar o React, e o estado (e qualquer hidden derivado dele) fica para trás.
 * Estes campos de data são não-controlados hoje — mas o smoke não deve depender disso.
 */
async function escreverData(
  alvo: ElementHandle<Element>,
  iso: string
): Promise<void> {
  await alvo.evaluate((el, v) => {
    if (!(el instanceof HTMLInputElement)) return;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    if (setter !== undefined) setter.call(el, v);
    else el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, iso);
}

/** O `value` da primeira `<option>` do select cujo texto contém `trecho`. */
async function opcaoQueContem(
  page: Page,
  seletorDoSelect: string,
  trecho: string
): Promise<string> {
  const valor = await page.evaluate(
    (sel, t) => {
      const s = document.querySelector(sel);
      if (!(s instanceof HTMLSelectElement)) return null;
      for (const o of Array.from(s.options)) {
        if (o.value !== "" && !o.disabled && o.textContent?.includes(t) === true) {
          return o.value;
        }
      }
      return null;
    },
    seletorDoSelect,
    trecho
  );
  if (valor === null) {
    throw new Error(`nenhuma opção de "${seletorDoSelect}" contém "${trecho}"`);
  }
  return valor;
}

async function main(): Promise<void> {
  if (SENHA === "") {
    throw new Error(
      "Senha ausente. Passe como 3º argumento ou defina SEED_ADMIN_SENHA no ambiente."
    );
  }

  const browser: Browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1200 });

  try {
    await entrar(page);
    ok("login");

    // ── 1. EMPENHAR ────────────────────────────────────────────────────────
    await irPara(page, `/despesa/empenhos?exercicio=${EXERCICIO}`);
    /*
      ⚠️ A FICHA COM MAIS SALDO, e não a primeira que casar com o elemento.
      A ficha do cenário de aceite tem exatamente os 10.000,00 do §2.4 e cada execução
      deste smoke consome 1.000,00 dela; esgotada, o domínio recusa o empenho — o que está
      certo, e foi o que aconteceu. O seed cria uma segunda ficha, declarada como orçamento
      de reexecução; o smoke escolhe pelo saldo e deixa a do cenário intacta para quem
      quiser conferi-la.
    */
    const ficha = await page.evaluate(() => {
      const s = document.querySelector('select[name="fichaId"]');
      if (!(s instanceof HTMLSelectElement)) return null;
      let melhor: { valor: string; saldo: number } | null = null;
      for (const o of Array.from(s.options)) {
        if (o.value === "" || o.disabled) continue;
        if (o.textContent?.includes("339039") !== true) continue;
        // ⚠️ O SALDO SAI CRU DA PORTA ("500000.00"), não formatado em pt-BR — dinheiro
        // atravessa a fronteira como string decimal, e é isso que o `<option>` imprime.
        // A primeira versão deste smoke procurou "1.234,56" e não achou nada: escolheu
        // sempre a primeira ficha, que era a já esgotada.
        const m = /disponível\s+(-?[\d]+\.\d{2})\s*$/.exec(o.textContent.trim());
        const saldo = m === null ? 0 : Number(m[1]!);
        if (melhor === null || saldo > melhor.saldo) melhor = { valor: o.value, saldo };
      }
      return melhor?.valor ?? null;
    });
    if (ficha === null) throw new Error("nenhuma ficha do elemento 339039 no seletor");
    await preencherEEnviar(page, 'select[name="fichaId"]', [
      { sel: 'select[name="fichaId"]', valor: ficha, tipo: "select" },
      { sel: 'input[name="numero"]', valor: NE },
      { sel: SELETOR_VISIVEL["credor"]!, valor: CREDOR },
      { sel: SELETOR_VISIVEL["valor"]!, valor: EMPENHO },
      { sel: 'input[name="data"]', valor: "2026-04-10", tipo: "data" },
      { sel: 'select[name="categoria"]', valor: "PRESTACAO_SERVICOS", tipo: "select" },
      { sel: 'input[name="historico"]', valor: `empenho do smoke ${SUF}` },
    ]);
    const aposEmpenhar = await texto(page);
    conferir(
      "empenhar pela tela",
      aposEmpenhar.includes(NE) || /empenho .*registrad|emitid/i.test(aposEmpenhar),
      `a tela não confirmou. Texto: ${aposEmpenhar.slice(0, 400)}`
    );

    // ── 2. RECARREGAR e encontrar o empenho ────────────────────────────────
    // É aqui que "estado de componente" seria desmascarado.
    const listaEmpenhos = await irPara(page, `/despesa/empenhos?exercicio=${EXERCICIO}`);
    conferir(
      "recarregar a lista de empenhos e achar o documento persistido",
      listaEmpenhos.includes(NE),
      `${NE} não está na lista depois do recarregamento`
    );

    // ── 3. O DOSSIÊ (T05) — abrir pelo número, como quem confere ───────────
    const href = await page.evaluate((numero) => {
      for (const a of Array.from(document.querySelectorAll("a"))) {
        if (a.textContent?.trim() === numero) return a.getAttribute("href");
      }
      return null;
    }, NE);
    if (href === null) {
      falhou("abrir o dossiê", "o número do empenho não é um link na lista");
      throw new Error("sem o dossiê, o resto do smoke não tem onde conferir");
    }
    const dossieId = href.replace("/despesa/empenhos/", "");
    const dossie1 = await irPara(page, href);
    conferir(
      "abrir o detalhe do empenho pelo número",
      dossie1.includes(`Empenho ${NE}`) && dossie1.includes("Origem"),
      `a tela de detalhe não abriu como esperado: ${dossie1.slice(0, 300)}`
    );
    conferir(
      "o detalhe traz a dotação inteira, não só o número da ficha",
      dossie1.includes("339039") && dossie1.includes("Fonte de recursos"),
      "faltou a classificação da despesa no bloco de origem"
    );
    conferir(
      "o detalhe mostra o razão do empenho, com o total por subsistema",
      dossie1.includes("Lançamentos contábeis") && dossie1.includes("Total ORCAMENTARIO"),
      "o bloco de lançamentos não trouxe os totais por subsistema"
    );
    conferir(
      "o detalhe não usa rótulo de conformidade em lugar nenhum",
      dossie1.includes("Histórico") && !/\bTR\s*\d+\.\d+/.test(dossie1),
      "apareceu identificador de catálogo na tela de detalhe"
    );

    // ── 4. LIQUIDAR ────────────────────────────────────────────────────────
    await irPara(page, `/despesa/liquidacoes?exercicio=${EXERCICIO}`);
    const empenhoNaLiquidacao = await opcaoQueContem(page, 'select[name="empenhoId"]', NE);
    await preencherEEnviar(page, 'select[name="empenhoId"]', [
      { sel: 'select[name="empenhoId"]', valor: empenhoNaLiquidacao, tipo: "select" },
      { sel: 'input[name="numero"]', valor: NL },
      { sel: SELETOR_VISIVEL["valor"]!, valor: LIQUIDACAO },
      { sel: 'input[name="data"]', valor: "2026-05-01", tipo: "data" },
      { sel: 'input[name="atesto"]', valor: "Servidor do Smoke" },
      { sel: 'input[name="historico"]', valor: `liquidação do smoke ${SUF}` },
    ]);
    const listaLiquidacoes = await irPara(page, `/despesa/liquidacoes?exercicio=${EXERCICIO}`);
    conferir(
      "liquidar pela tela e reencontrar a liquidação recarregando",
      listaLiquidacoes.includes(NL),
      `${NL} não está na lista depois do recarregamento`
    );

    // ── 4b. T07 — AS QUATRO ETAPAS, e a segregação provada pela tela ───────
    //
    // ⚠️ ANTES DE PAGAR, e não depois. A ordem de pagamento é a etapa que PRECEDE o
    // registro — e, na prática, `liquidacoesParaOrdem` só oferece o que ainda cabe: uma
    // liquidação já paga por inteiro some da lista, corretamente. A primeira versão deste
    // smoke tentava preparar a ordem depois de pagar e não achava a liquidação. Quem
    // estava certo era a tela.
    await irPara(page, `/despesa/ordens?exercicio=${EXERCICIO}`);
    const liqParaOrdem = await opcaoQueContem(page, 'select[name="liquidacaoId"]', NL);
    const contaDaOrdem = await opcaoQueContem(page, 'select[name="contaBancaria"]', "CC-500-01");
    await preencherEEnviar(page, 'select[name="liquidacaoId"]', [
      { sel: 'select[name="liquidacaoId"]', valor: liqParaOrdem, tipo: "select" },
      { sel: 'input[name="numero"]', valor: NO },
      { sel: SELETOR_VISIVEL["valor"]!, valor: LIQUIDACAO, indice: 0 },
      { sel: 'input[name="dataPrevista"]', valor: "2026-06-20", tipo: "data" },
      { sel: 'select[name="contaBancaria"]', valor: contaDaOrdem, tipo: "select" },
      { sel: 'input[name="historico"]', valor: `ordem do smoke ${SUF}` },
    ]);

    const ordens = await irPara(page, `/despesa/ordens?exercicio=${EXERCICIO}`);
    conferir(
      "preparar a ordem pela tela e reencontrá-la recarregando",
      ordens.includes(NO) && ordens.includes("Aguardando autorização"),
      `${NO} não está na lista, ou não nasceu aguardando autorização`
    );
    conferir(
      "a tela declara o envio ao banco INDISPONÍVEL, com motivo — e sem botão",
      ordens.includes("Envio ao banco: indisponível") &&
        !/enviar ao banco\b(?!:)/i.test(ordens),
      "a etapa de envio ao banco não está declarada indisponível, ou há botão de envio"
    );
    conferir(
      "as quatro etapas aparecem, cada uma com o seu estado",
      ordens.includes("1. Preparada") &&
        ordens.includes("2. Autorizada") &&
        ordens.includes("3. Pagamento registrado") &&
        ordens.includes("4. Confirmação do banco"),
      "o painel das quatro etapas não apareceu"
    );

    /*
      ⚠️ AQUI A TELA TEM DE RECUSAR. O smoke está logado com UM usuário, e foi ele quem
      preparou a ordem. Autorizar é ato de OUTRA pessoa — a recusa vem do domínio, e é
      isso que se confere. Um smoke que "conseguisse" autorizar aqui estaria provando que
      a segregação não existe.
    */
    const abriuAutorizar = await page.evaluate(() => {
      for (const su of Array.from(document.querySelectorAll("summary"))) {
        if (su.textContent?.includes("Autorizar") === true) {
          (su as HTMLElement).click();
          return true;
        }
      }
      return false;
    });
    if (abriuAutorizar) {
      await new Promise((r) => setTimeout(r, 300));
      await preencherEEnviar(page, 'details[open] input[name="motivo"]', [
        { sel: 'details[open] input[name="motivo"]', valor: "conferido pelo smoke" },
      ]);
      const resposta = await texto(page);
      conferir(
        "QUEM PREPAROU NÃO AUTORIZA — a tela mostra a recusa do domínio",
        /SEGREGAÇÃO DE FUNÇÕES/.test(resposta),
        `a recusa da segregação não apareceu. Texto: ${resposta.slice(-500)}`
      );
    } else {
      falhou("abrir o formulário de autorização", "não achei o gatilho Autorizar");
    }

    // ── 5. PAGAR COM RETENÇÃO INFORMADA (T06/T07) ──────────────────────────
    await irPara(page, "/despesa/pagamentos");
    const liquidacaoNaFila = await opcaoQueContem(page, 'select[name="liquidacaoId"]', NL);
    const conta = await opcaoQueContem(page, 'select[name="contaBancaria"]', "CC-500-01");

    // A linha de retenção só existe depois do clique — é UI dinâmica, e o smoke tem de
    // passar por ela como o operador passa.
    const abriu = await page.evaluate(() => {
      for (const b of Array.from(document.querySelectorAll("button"))) {
        if (b.textContent?.includes("Acrescentar retenção") === true) {
          b.click();
          return true;
        }
      }
      return false;
    });
    conferir(
      "a tela de pagamento OFERECE retenção na fonte",
      abriu,
      "não achei o botão de acrescentar retenção — a retenção continua só no domínio"
    );
    if (!abriu) throw new Error("sem retenção na tela o cenário de aceite não atravessa");
    await new Promise((r) => setTimeout(r, 300));

    const tipoInss = await opcaoQueContem(page, 'select[name="retencaoTipo"]', "INSS");

    /*
      ⚠️ A POSIÇÃO NA FILA NÃO É ESCOLHA DO SMOKE — É DO ART. 141.
      Numa base de desenvolvimento que já rodou este smoke antes, sobram liquidações não
      pagas, e a nossa entra ATRÁS delas. Aí pagar exige justificativa prévia do §1º, e o
      domínio recusa sem ela — corretamente.

      A primeira versão deste smoke ignorava isso e acusava a tela de "não confirmar o
      pagamento". Quem estava certo era o sistema. Então o smoke passou a fazer o que o
      operador faz: olhar a posição e, se não for a cabeça da fila, justificar. A tela
      marca a posição 1 com uma estrela — é dela que a decisão sai.
    */
    const cabecaDaFila = await page.evaluate((valor) => {
      const s = document.querySelector('select[name="liquidacaoId"]');
      if (!(s instanceof HTMLSelectElement)) return false;
      const o = Array.from(s.options).find((x) => x.value === valor);
      return o?.textContent?.trim().startsWith("\u2605") === true;
    }, liquidacaoNaFila);
    console.log(
      cabecaDaFila
        ? "[info] a liquidação do smoke é a cabeça da fila — pagamento sem justificativa"
        : "[info] a liquidação do smoke está atrás na fila — o smoke justifica a quebra (§1º)"
    );

    // A tela só revela o bloco do §1º depois de escolher uma liquidação fora da posição 1.
    if (!cabecaDaFila) {
      await page.select('select[name="liquidacaoId"]', liquidacaoNaFila);
      await new Promise((r) => setTimeout(r, 400));
    }

    await preencherEEnviar(page, 'select[name="liquidacaoId"]', [
      { sel: 'select[name="liquidacaoId"]', valor: liquidacaoNaFila, tipo: "select" },
      { sel: 'input[name="numero"]', valor: NP },
      { sel: 'select[name="contaBancaria"]', valor: conta, tipo: "select" },
      { sel: 'input[name="data"]', valor: "2026-06-01", tipo: "data" },
      { sel: 'input[name="historico"]', valor: `pagamento com retenção do smoke ${SUF}` },
      { sel: 'select[name="retencaoTipo"]', valor: tipoInss, tipo: "select" },
      { sel: 'input[name="retencaoCredor"]', valor: CONSIGNATARIO },
      // ⚠️ OS DOIS CAMPOS DE DINHEIRO DESTA TELA, na ordem do DOM: o do PAGAMENTO vem
      // antes; o da RETENÇÃO vem no bloco de baixo. Trocar os dois pagaria 100 e reteria
      // 1.000 — e o domínio recusaria, escondendo o defeito atrás de uma mensagem certa.
      { sel: SELETOR_VISIVEL["valor"]!, valor: LIQUIDACAO, indice: 0 },
      { sel: SELETOR_VISIVEL["valor"]!, valor: RETENCAO, indice: 1 },
      ...(cabecaDaFila
        ? []
        : [
            { sel: 'select[name="hipotese"]', valor: "V_ATIVIDADE_FINALISTICA", tipo: "select" as const },
            { sel: 'input[name="autorizadoPor"]', valor: "Secretario de Financas" },
            {
              sel: 'textarea[name="justificativa"]',
              valor:
                "smoke da cadeia da despesa: a liquidacao anterior da fila e residuo de execucao anterior deste mesmo smoke",
            },
          ]),
    ]);

    const aposPagar = await texto(page);
    conferir(
      "pagar com retenção pela tela",
      /Pagamento .* registrado/i.test(aposPagar),
      `a tela não confirmou o pagamento. Texto: ${aposPagar.slice(-900)}`
    );

    // ── 6. O DOSSIÊ MOSTRA O BRUTO E A SAÍDA DE CAIXA, SEPARADOS ───────────
    const dossie2 = await irPara(page, `/despesa/empenhos/${dossieId}`);
    conferir(
      "o dossiê mostra a saída de caixa de 900,00 — e não o bruto",
      dossie2.includes(SAIDA_DE_CAIXA),
      `a tela não mostrou ${SAIDA_DE_CAIXA} como saída de caixa`
    );
    conferir(
      "o dossiê mostra o retido de 100,00 preso ao pagamento",
      dossie2.includes(RETENCAO) && dossie2.includes(CONSIGNATARIO),
      "a retenção não aparece no dossiê com o consignatário"
    );
    conferir(
      "o dossiê mostra o pago BRUTO de 1.000,00 — a obrigação morre inteira",
      dossie2.includes("1.000,00"),
      "o valor bruto sumiu do quadro de valores"
    );

    // ── 6c. T08 — o razão com totalizador por subsistema ───────────────────
    const razao = await irPara(
      page,
      `/contabilidade/lancamentos?desde=2026-01-01&ate=2026-12-31&fato=${encodeURIComponent(dossieId)}`
    );
    conferir(
      "o razão filtra pelo IDENTIFICADOR DO FATO e traz os lançamentos do empenho",
      razao.includes("Totais do recorte, por subsistema"),
      "o totalizador por subsistema não apareceu na consulta do razão"
    );
    conferir(
      "o razão oferece selecionar e somar",
      razao.includes("Selecionar e somar"),
      "o painel de seleção e soma não apareceu"
    );

    // ── 7. ESTORNAR — e não devolver ao caixa o que nunca saiu ─────────────
    await irPara(page, `/despesa/pagamentos?exercicio=${EXERCICIO}`);
    const abriuAnulacao = await page.evaluate((numero) => {
      for (const linha of Array.from(document.querySelectorAll("tr"))) {
        if (linha.textContent?.includes(numero) !== true) continue;
        const resumo = linha.querySelector("summary");
        if (resumo instanceof HTMLElement) {
          resumo.click();
          return true;
        }
      }
      return false;
    }, NP);
    conferir(
      "a linha do pagamento oferece anular",
      abriuAnulacao,
      `não achei o gatilho de anulação na linha de ${NP}`
    );

    if (abriuAnulacao) {
      await new Promise((r) => setTimeout(r, 300));
      await preencherEEnviar(page, 'details[open] input[name="numero"]', [
        { sel: 'details[open] input[name="numero"]', valor: NP_ANULACAO },
        { sel: 'details[open] input[name="data"]', valor: "2026-06-15", tipo: "data" },
        {
          sel: 'details[open] textarea[name="motivo"], details[open] input[name="motivo"]',
          valor: "estorno do smoke da cadeia da despesa",
        },
      ]);
      /*
        ⚠️ A CONFIRMAÇÃO SE LÊ NO FORMULÁRIO, NÃO NA PÁGINA INTEIRA. A primeira versão
        procurava a palavra "erro" nos 600 primeiros caracteres — que são o menu — e por
        isso dava OK para uma anulação que nunca aconteceu. Um smoke que passa sem o fato
        ter ocorrido é pior que smoke nenhum: ele certifica o contrário do que se pensa.
      */
      /*
        ⚠️ A CONFIRMAÇÃO SE LÊ NO FATO, NÃO NA MENSAGEM DA TELA — e isso custou duas
        tentativas erradas antes de ficar claro.

        A ação de anular chama `revalidatePath`, e o Next re-renderiza a árvore inteira do
        servidor. A ilha client remonta: o `<details>` fecha, os campos voltam a vazio e a
        mensagem de sucesso, que vivia no estado do componente, some junto. Procurá-la é
        procurar uma coisa que deixou de existir — e as duas primeiras versões deste passo
        deram FALHA para uma anulação que tinha dado certo.

        O que sobrevive ao recarregamento é o FATO: a linha do pagamento passa a "Anulado"
        e deixa de oferecer o gatilho de anulação. É isso que se confere — e é a mesma
        coisa que o gate pede em toda tela: recarregar e encontrar o dado persistido.
      */
      const pagamentosDepois = await irPara(
        page,
        `/despesa/pagamentos?exercicio=${EXERCICIO}`
      );
      const linhaAnulada = await page.evaluate((numero) => {
        for (const linha of Array.from(document.querySelectorAll("tr"))) {
          if (linha.textContent?.includes(numero) === true) {
            return linha.textContent.replace(/\s+/g, " ");
          }
        }
        return null;
      }, NP);
      conferir(
        "anular o pagamento pela tela e reencontrar a anulação recarregando",
        linhaAnulada !== null &&
          linhaAnulada.includes("Anulado") &&
          !linhaAnulada.includes("Anular"),
        linhaAnulada === null
          ? `${NP} sumiu da lista de pagamentos executados`
          : `a linha continua como "${linhaAnulada.slice(0, 200)}"`
      );
      void pagamentosDepois;

      const dossie3 = await irPara(page, `/despesa/empenhos/${dossieId}`);
      conferir(
        "depois do estorno o dossiê volta a dever e nada consta como retido",
        dossie3.includes("Anulado") || dossie3.includes("Anulação total"),
        "o dossiê não registrou o estorno na cadeia do pagamento"
      );
      conferir(
        "o pagamento anulado CONTINUA no dossiê — a correção acrescenta, não apaga",
        dossie3.includes(NP),
        `${NP} sumiu do dossiê depois de anulado — isso seria apagamento, não estorno`
      );
    }
  } catch (e) {
    falhou("execução", e instanceof Error ? e.message : String(e));
  } finally {
    await browser.close();
  }

  console.log(`\n${passos.length} passo(s) ok, ${falhas.length} falha(s).`);
  if (falhas.length > 0) {
    for (const f of falhas) console.error(`  - ${f}`);
    process.exitCode = 1;
  }
}

await main();
