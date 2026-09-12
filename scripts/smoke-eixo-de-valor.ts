import "dotenv/config";
import puppeteer, { type Browser, type Page } from "puppeteer";

/**
 * ═══ O PERCURSO DO EIXO DE VALOR DO BEM (M10, ENT12) ═══
 *
 * ⚠️ O QUE ELE PROVA, E POR QUE A ORDEM IMPORTA. O reconhecimento deste lote mediu que
 * **nenhuma porta e nenhuma tela tocavam o eixo de valor**: sete serviços com domínio provado,
 * teste contra banco e ação no censo desde o ENT05, e superfície zero. A baixa sozinha seria
 * inalcançável — `baixarBem` tem teto duplo, e sem tela de entrada todo bem vale zero.
 *
 * Por isso o percurso é uma CADEIA, e ela atravessa o lote anterior:
 *
 *   parametrizar o roteiro (ENT11)  ->  registrar entrada  ->  ver o valor  ->  baixar  ->
 *   ver o valor cair
 *
 * ⚠️ ELE NÃO SEMEIA ROTEIRO. Semear para um percurso passar seria inventar norma — foi
 * exatamente o que o ENT09 recusou fazer. Ele parametriza PELA TELA, e com isso prova que as
 * duas entregas se encaixam.
 *
 * ⚠️ E ELE EXERCITA A RECUSA DO TETO: baixar acima do valor do bem tem de ser negado NOMEANDO
 * o teto. Negação que não afirma o motivo é compatível com o servidor gravando errado.
 *
 * ⚠️ CADA `goto` É UMA RECARGA — é o que separa persistência de estado de componente.
 * ⚠️ O PAR DE CONTAS DO ROTEIRO É INSTRUMENTAL, não doutrina — ver `smoke-roteiros.ts`.
 */

const BASE = process.argv[2] ?? "http://localhost:3000";
const USUARIO = process.argv[3] ?? "admin@cg.pb.gov.br";
const SENHA = process.argv[4] ?? process.env["SEED_ADMIN_SENHA"] ?? "";

const SUF = String(Date.now()).slice(-6);
const CLASSE = `CV-${SUF}`;
const TOMB = `TOMBV-${SUF}`;
/**
 * ⚠️ O SEGUNDO BEM É A FIXTURE N=2, e sem ele um teto não se prova.
 *
 * `baixarBem` tem DOIS tetos: o da classe e o do BEM. Com um bem só na classe os dois valem
 * o mesmo número, a recusa vem sempre pelo teto da CLASSE, e a asserção "não baixa mais do
 * que o bem vale" passa por vacuidade — foi exatamente o que aconteceu na primeira execução
 * deste percurso. O segundo bem separa os dois: a classe fica com saldo, ELE não tem nenhum,
 * e só o teto do bem pode recusar.
 */
const TOMB2 = `TOMBW-${SUF}`;

/**
 * O valor da entrada, e o da baixa. A baixa cabe; a tentativa de estouro não.
 *
 * ⚠️ VÍRGULA, E O SELETOR É `data-mascara` — os dois vêm do idioma já provado nos percursos
 * do ENT03b e da cadeia da despesa, e cada um evita um defeito que já aconteceu aqui:
 *
 *  · `CampoValor` renderiza DOIS elementos — o visível (`data-mascara="valor"`, sem `name`,
 *    controlado pelo React) e um `<input type="hidden" name="...">` com o valor CRU. Um
 *    seletor por `name` casa só o escondido, e o puppeteer recusa digitar nele com "Node is
 *    either not clickable". Atribuir `.value` no hidden seria pior: mudaria o DOM sem mudar
 *    o estado do React, e o valor não chegaria ao servidor.
 *  · O campo exibe `1.234.567,89` e submete `1234.56`. Ele NÃO acumula centavos — o
 *    cabeçalho de `Campos.tsx` explica por quê: o acumulador faria `10000` virar `100,00`, e
 *    num sistema onde o número digitado vira empenho esse erro de 100x não tem preço aceitável.
 *    Então "5000,00" vale cinco mil, e é isso que se digita.
 */
const ENTRADA = "5000,00";
const BAIXA = "1200,00";
const ESTOURO = "999999,00";

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

/** ⚠️ SEM `page.click` E SEM `waitForNavigation` — ver ESTADO §27.3. */
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
    // ⚠️ CAMPO DE DATA NÃO SE PREENCHE DIGITANDO — ver a nota longa em `smoke-acervo.ts`:
    // `type()` caractere a caractere deixa o campo VAZIO, o `required` barra o envio no
    // NAVEGADOR, e nenhuma requisição sai. O sintoma chega como formulário mudo.
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

async function opcoesUteis(page: Page, seletor: string, n: number): Promise<readonly string[]> {
  return page.evaluate(
    (sel, quantas) => {
      const s = document.querySelector(sel);
      if (!(s instanceof HTMLSelectElement)) return [];
      return Array.from(s.options)
        .filter((o) => o.value !== "" && !o.disabled)
        .slice(0, quantas)
        .map((o) => o.value);
    },
    seletor,
    n
  );
}

/** O href do detalhe cujo link de listagem carrega o texto — sai da TELA, não de um id montado. */
async function hrefDoRegistro(page: Page, alvo: string): Promise<string | null> {
  return page.evaluate((t) => {
    const a = Array.from(document.querySelectorAll("a")).find((x) =>
      (x.textContent ?? "").includes(t)
    );
    if (a === undefined) return null;
    const u = new URL(a.href);
    return `${u.pathname}${u.search}`;
  }, alvo);
}

/**
 * O VALOR CONTÁBIL mostrado no detalhe, como número.
 *
 * ⚠️ ELE SAI DO RÓTULO, e não de uma posição na página: o detalhe do molde lista pares
 * rótulo/valor, e casar por posição quebraria na primeira linha nova.
 */
async function valorContabilNaTela(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    // ⚠️ O PAR É `dt`/`dd`, e isso está garantido pela marcação do `DetalheDeRecurso`: cada
    // dado é uma `<div>` com o rótulo em `<dt>` e o valor no PRIMEIRO `<dd>` (o segundo, se
    // existir, é a NOTA). Varrer `div`/`span` e pegar "o irmão seguinte" funcionaria por
    // acidente hoje e quebraria na primeira linha nova.
    const rotulo = Array.from(document.querySelectorAll("dt")).find(
      (n) => (n.textContent ?? "").trim() === "Valor contábil"
    );
    if (rotulo === undefined) return null;
    const valor = rotulo.parentElement?.querySelector("dd");
    return (valor?.textContent ?? "").trim();
  });
}

async function main(): Promise<void> {
  let navegador: Browser | undefined;
  try {
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
      ],
    });
    const page = await navegador.newPage();
    page.setDefaultTimeout(60000);
    await entrar(page);
    ok("login");

    // ══════════════════════════════════════════════════════════════════════
    // 1 · O ROTEIRO, PELA TELA DO ENT11 — a cadeia começa aqui
    // ══════════════════════════════════════════════════════════════════════
    await irPara(page, "/patrimonio/roteiros");
    const FORM_R = 'form[data-acao="criar-roteiros-patrimoniais"]';
    const contas = await opcoesUteis(page, `${FORM_R} select[name="contaDebitoId"]`, 2);
    if (contas.length < 2) throw new Error("sem duas contas analíticas não há como formar roteiro");
    const [debito, credito] = contas as [string, string];

    const rRoteiro = await preencherEEnviar(page, "criar-roteiros-patrimoniais", [
      { sel: 'select[name="tipo"]', valor: "AVALIACAO_INICIAL", tipo: "select" },
      { sel: 'select[name="contaDebitoId"]', valor: debito, tipo: "select" },
      { sel: 'select[name="contaCreditoId"]', valor: credito, tipo: "select" },
    ]);
    // ⚠️ "JÁ TEM roteiro" é ACEITÁVEL AQUI: o percurso é re-executável e o rol é fechado.
    // O que NÃO é aceitável é silêncio — nem sucesso, nem recusa.
    conferir(
      "roteiro: AVALIACAO_INICIAL parametrizada (ou já estava)",
      rRoteiro.tipo === "ok" || /JÁ TEM roteiro/i.test(rRoteiro.texto),
      `veio ${rRoteiro.tipo}: ${rRoteiro.texto}`
    );

    await irPara(page, "/patrimonio/roteiros");
    const rBaixa = await preencherEEnviar(page, "criar-roteiros-patrimoniais", [
      { sel: 'select[name="tipo"]', valor: "BAIXA_ALIENACAO", tipo: "select" },
      { sel: 'select[name="contaDebitoId"]', valor: credito, tipo: "select" },
      { sel: 'select[name="contaCreditoId"]', valor: debito, tipo: "select" },
    ]);
    conferir(
      "roteiro: BAIXA_ALIENACAO parametrizada (ou já estava)",
      rBaixa.tipo === "ok" || /JÁ TEM roteiro/i.test(rBaixa.texto),
      `veio ${rBaixa.tipo}: ${rBaixa.texto}`
    );

    // ══════════════════════════════════════════════════════════════════════
    // 2 · A CLASSE E O BEM — o percurso cria os seus, para não depender de sobra
    // ══════════════════════════════════════════════════════════════════════
    await irPara(page, "/patrimonio/classes-de-bens");
    const contaAtivo = await opcoesUteis(
      page,
      'form[data-acao="criar-classes-de-bens"] select[name="contaContabilAtivoId"]',
      1
    );
    if (contaAtivo[0] === undefined) throw new Error("sem conta do ativo não há classe");

    const rClasse = await preencherEEnviar(page, "criar-classes-de-bens", [
      { sel: 'input[name="codigo"]', valor: CLASSE },
      { sel: 'input[name="descricao"]', valor: "Classe do percurso de valor" },
      { sel: 'select[name="especie"]', valor: "MOVEL", tipo: "select" },
      { sel: 'select[name="contaContabilAtivoId"]', valor: contaAtivo[0], tipo: "select" },
    ]);
    conferir("classe: criada pela tela", rClasse.tipo === "ok", rClasse.texto);

    await irPara(page, "/patrimonio/bens-patrimoniais");
    const classeDoBem = await page.evaluate((codigo) => {
      const s = document.querySelector(
        'form[data-acao="criar-bens-patrimoniais"] select[name="classeDeBensId"]'
      );
      if (!(s instanceof HTMLSelectElement)) return null;
      const o = Array.from(s.options).find((x) => (x.textContent ?? "").includes(codigo));
      return o?.value ?? null;
    }, CLASSE);
    conferir(
      "bem: o seletor de classe OFERECE a classe recém-criada",
      classeDoBem !== null,
      "a classe criada não apareceu no formulário do bem"
    );
    if (classeDoBem === null) throw new Error("sem classe no seletor não há como seguir");

    const rBem = await preencherEEnviar(page, "criar-bens-patrimoniais", [
      { sel: 'input[name="numeroTombamento"]', valor: TOMB },
      { sel: 'input[name="descricao"]', valor: "Bem do percurso de valor" },
      { sel: 'select[name="classeDeBensId"]', valor: classeDoBem, tipo: "select" },
      { sel: 'input[name="dataAquisicao"]', valor: "2026-03-10", tipo: "data" },
    ]);
    conferir("bem: cadastrado pela tela", rBem.tipo === "ok", rBem.texto);

    await irPara(page, "/patrimonio/bens-patrimoniais");
    const href = await hrefDoRegistro(page, TOMB);
    conferir("bem: a listagem LINKA para o detalhe", href !== null, "o bem não apareceu linkado");
    if (href === null) throw new Error("sem o detalhe não há eixo de valor a exercitar");

    // ══════════════════════════════════════════════════════════════════════
    // 3 · O VALOR NASCE ZERO — e a tela diz isso
    // ══════════════════════════════════════════════════════════════════════
    await irPara(page, href);
    const zero = await valorContabilNaTela(page);
    conferir(
      "detalhe: o bem recém-cadastrado mostra VALOR CONTÁBIL, e ele é zero",
      zero !== null && /0[,.]00/.test(zero),
      `valor contábil lido: ${zero ?? "(rótulo não encontrado)"}`
    );

    // ══════════════════════════════════════════════════════════════════════
    // 4 · A RECUSA DO TETO — baixar o que não se tem, ANTES de ter
    // ══════════════════════════════════════════════════════════════════════
    const rSemSaldo = await preencherEEnviar(page, "baixar-do-acervo", [
      { sel: 'select[name="tipo"]', valor: "BAIXA_ALIENACAO", tipo: "select" },
      { sel: 'input[data-mascara="valor"]', valor: BAIXA },
      { sel: 'input[name="dataMovimento"]', valor: "2026-04-01", tipo: "data" },
      { sel: 'input[name="motivo"]', valor: "Tentativa de baixa sem valor lancado" },
    ]);
    conferir(
      "recusa: baixar bem que vale ZERO é negado, nomeando o teto",
      rSemSaldo.tipo === "erro" && /excede o valor contábil/i.test(rSemSaldo.texto),
      `esperava recusa nomeando o teto; veio ${rSemSaldo.tipo}: ${rSemSaldo.texto}`
    );

    // ══════════════════════════════════════════════════════════════════════
    // 5 · A ENTRADA DE VALOR — e a persistência após recarga
    // ══════════════════════════════════════════════════════════════════════
    await irPara(page, href);
    const rEntrada = await preencherEEnviar(page, "registrar-entrada-de-valor", [
      { sel: 'select[name="tipo"]', valor: "AVALIACAO_INICIAL", tipo: "select" },
      { sel: 'input[data-mascara="valor"]', valor: ENTRADA },
      { sel: 'input[name="dataMovimento"]', valor: "2026-03-15", tipo: "data" },
      { sel: 'input[name="motivo"]', valor: "Avaliacao inicial do bem do percurso" },
    ]);
    conferir("entrada: o servidor aceitou e lançou no razão", rEntrada.tipo === "ok", rEntrada.texto);

    await irPara(page, href);
    const depoisEntrada = await valorContabilNaTela(page);
    conferir(
      "detalhe: RECARREGADO, o valor contábil subiu para a entrada",
      depoisEntrada !== null && depoisEntrada.includes("5.000,00"),
      `valor contábil lido: ${depoisEntrada ?? "(não encontrado)"}`
    );

    const historico = await texto(page);
    conferir(
      "detalhe: o movimento de VALOR aparece no histórico",
      historico.includes("avaliação inicial") || historico.includes("avaliacao inicial"),
      "o histórico não trouxe o movimento de valor"
    );

    // ══════════════════════════════════════════════════════════════════════
    // 6 · O TETO DE VERDADE — com saldo, mas não tanto
    // ══════════════════════════════════════════════════════════════════════
    const rEstouro = await preencherEEnviar(page, "baixar-do-acervo", [
      { sel: 'select[name="tipo"]', valor: "BAIXA_ALIENACAO", tipo: "select" },
      { sel: 'input[data-mascara="valor"]', valor: ESTOURO },
      { sel: 'input[name="dataMovimento"]', valor: "2026-04-01", tipo: "data" },
      { sel: 'input[name="motivo"]', valor: "Tentativa de baixa acima do valor do bem" },
    ]);
    // ⚠️ ESTE PASSO PROVA O TETO DA **CLASSE**, e o nome diz isso. A primeira versão dele se
    // chamava "acima do valor do BEM" e casava qualquer "excede o valor contábil" — com um
    // bem só na classe os dois tetos valem o mesmo número, e o rótulo descrevia um guard que
    // não era o que disparava. O teto do BEM é o passo 8, com N=2.
    conferir(
      "recusa: baixar acima do valor da CLASSE é negado, nomeando o teto da classe",
      rEstouro.tipo === "erro" && /excede o valor contábil da classe/i.test(rEstouro.texto),
      `esperava recusa nomeando o teto da classe; veio ${rEstouro.tipo}: ${rEstouro.texto}`
    );

    // ══════════════════════════════════════════════════════════════════════
    // 7 · A BAIXA QUE CABE — e o valor CAI
    // ══════════════════════════════════════════════════════════════════════
    await irPara(page, href);
    const rBaixaOk = await preencherEEnviar(page, "baixar-do-acervo", [
      { sel: 'select[name="tipo"]', valor: "BAIXA_ALIENACAO", tipo: "select" },
      { sel: 'input[data-mascara="valor"]', valor: BAIXA },
      { sel: 'input[name="dataMovimento"]', valor: "2026-04-01", tipo: "data" },
      { sel: 'input[name="motivo"]', valor: "Baixa parcial do bem do percurso" },
    ]);
    conferir("baixa: o servidor aceitou", rBaixaOk.tipo === "ok", rBaixaOk.texto);

    await irPara(page, href);
    const depoisBaixa = await valorContabilNaTela(page);
    conferir(
      "detalhe: RECARREGADO, o valor contábil CAIU (5.000 − 1.200 = 3.800)",
      depoisBaixa !== null && depoisBaixa.includes("3.800,00"),
      `valor contábil lido: ${depoisBaixa ?? "(não encontrado)"}`
    );

    // ══════════════════════════════════════════════════════════════════════
    // 8 · N=2 — O TETO DO BEM, que o teto da CLASSE estava escondendo
    //
    // ⚠️ ESTE PASSO EXISTE PORQUE A PRIMEIRA EXECUÇÃO PASSOU SEM PROVAR NADA. Com um bem só
    // na classe, os dois tetos valem o mesmo número e a recusa vem sempre pela CLASSE — a
    // asserção "não baixa mais do que o bem vale" ficava verde sem nunca ter exercido o
    // guard do bem. Agora a classe tem 3.800 e o bem novo tem ZERO: só o teto do BEM pode
    // recusar uma baixa de 1.000, e a mensagem tem de dizer isso com todas as letras.
    // ══════════════════════════════════════════════════════════════════════
    await irPara(page, "/patrimonio/bens-patrimoniais");
    const rBem2 = await preencherEEnviar(page, "criar-bens-patrimoniais", [
      { sel: 'input[name="numeroTombamento"]', valor: TOMB2 },
      { sel: 'input[name="descricao"]', valor: "Segundo bem, sem valor lancado" },
      { sel: 'select[name="classeDeBensId"]', valor: classeDoBem, tipo: "select" },
      { sel: 'input[name="dataAquisicao"]', valor: "2026-03-10", tipo: "data" },
    ]);
    conferir("N=2: o segundo bem da MESMA classe é cadastrado", rBem2.tipo === "ok", rBem2.texto);

    await irPara(page, "/patrimonio/bens-patrimoniais");
    const href2 = await hrefDoRegistro(page, TOMB2);
    if (href2 === null) throw new Error("o segundo bem não apareceu linkado");

    await irPara(page, href2);
    const zeroDoSegundo = await valorContabilNaTela(page);
    conferir(
      "N=2: o segundo bem vale ZERO enquanto a classe ainda tem saldo",
      zeroDoSegundo !== null && /0[,.]00/.test(zeroDoSegundo),
      `valor contábil do segundo bem: ${zeroDoSegundo ?? "(não encontrado)"}`
    );

    const rTetoDoBem = await preencherEEnviar(page, "baixar-do-acervo", [
      { sel: 'select[name="tipo"]', valor: "BAIXA_ALIENACAO", tipo: "select" },
      { sel: 'input[data-mascara="valor"]', valor: "1000,00" },
      { sel: 'input[name="dataMovimento"]', valor: "2026-04-03", tipo: "data" },
      { sel: 'input[name="motivo"]', valor: "Baixa em bem sem valor, com classe com saldo" },
    ]);
    conferir(
      "⚠️ N=2: o teto do BEM recusa, e a mensagem nomeia O BEM — a classe não o mascara",
      rTetoDoBem.tipo === "erro" && /excede o valor contábil do BEM/i.test(rTetoDoBem.texto),
      `esperava recusa nomeando o BEM; veio ${rTetoDoBem.tipo}: ${rTetoDoBem.texto}`
    );

    // ══════════════════════════════════════════════════════════════════════
    // 9 · OS DOIS EIXOS COEXISTEM — um não sobrescreve o outro
    // ══════════════════════════════════════════════════════════════════════
    await irPara(page, href);
    const rGestao = await preencherEEnviar(page, "registrar-situacao", [
      { sel: 'select[name="situacao"]', valor: "EM_DESUSO", tipo: "select" },
      { sel: 'input[name="dataMovimento"]', valor: "2026-04-02", tipo: "data" },
      { sel: 'input[name="motivo"]', valor: "Situacao apos a baixa parcial" },
    ]);
    conferir("gestão: o eixo antigo continua funcionando", rGestao.tipo === "ok", rGestao.texto);

    await irPara(page, href);
    const final = await texto(page);
    const aindaTemValor = await valorContabilNaTela(page);
    conferir(
      "detalhe: os DOIS eixos aparecem juntos — valor e gestão, sem um apagar o outro",
      final.includes("desuso") &&
        aindaTemValor !== null &&
        aindaTemValor.includes("3.800,00"),
      `gestão no histórico: ${final.includes("desuso")}; valor: ${aindaTemValor ?? "(nulo)"}`
    );
  } finally {
    await navegador?.close();
  }
}

await main();

console.log(`\n${passos.length} passo(s), ${falhas.length} falha(s).`);
if (falhas.length > 0) {
  for (const f of falhas) console.error(`  · ${f}`);
  process.exitCode = 1;
}
