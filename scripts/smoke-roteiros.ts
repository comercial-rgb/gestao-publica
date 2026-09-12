import "dotenv/config";
import puppeteer, { type Browser, type Page } from "puppeteer";

/**
 * ═══ O PERCURSO DOS ROTEIROS CONTÁBEIS DO PATRIMÔNIO (M10, ENT11) ═══
 *
 * ⚠️ O QUE ELE PROVA, E POR QUE IMPORTA MAIS QUE O DE COSTUME. `RoteiroPatrimonial` tinha
 * ZERO linhas, e `roteiroDoTipo` é fail-closed: sem roteiro, NENHUM movimento de valor é
 * registrado. O eixo financeiro inteiro do patrimônio estava inalcançável por falta de uma
 * tabela de parâmetro que nenhum serviço sabia escrever — e nenhuma tela sabia mostrar.
 * Este percurso prova que um contador municipal AGORA alcança essa parametrização.
 *
 * ⚠️ ELE É RE-EXECUTÁVEL, e isso exigiu uma decisão. Os outros percursos sufixam códigos pelo
 * instante; aqui não dá — a chave é um ENUM de rol fechado, e na segunda execução o evento
 * escolhido já estaria parametrizado. Em vez de depender de banco limpo (o que faria o
 * percurso passar hoje e falhar amanhã), ele LÊ DA TELA o primeiro evento ainda pendente e
 * trabalha sobre ele. Se não houver nenhum, exercita a reparametrização, que é o caminho do
 * ente que já parametrizou tudo.
 *
 * ⚠️ O PAR DE CONTAS QUE ELE GRAVA É INSTRUMENTAL, E NÃO DOUTRINA. O percurso escolhe as
 * duas primeiras analíticas que o seletor oferece — quaisquer duas distintas servem para
 * exercitar a mecânica —, e o resultado é um roteiro contabilmente sem sentido gravado no
 * banco onde ele roda. Isso é aceitável num banco de desenvolvimento e NÃO é aceitável numa
 * instalação: qual par corresponde a cada evento é decisão do contador do ente. Pendência
 * `ROTEIRO-DA-POC-COM-PAR-INSTRUMENTAL`.
 *
 * ⚠️ CADA `goto` É UMA RECARGA — é o que separa persistência de estado de componente.
 * ⚠️ E ELE EXERCITA DUAS RECUSAS, não só o caminho feliz: parametrizar duas vezes o mesmo
 * evento, e apontar débito e crédito para a mesma conta. Negação que não afirma o motivo é
 * compatível com o servidor gravando errado em silêncio.
 */

const BASE = process.argv[2] ?? "http://localhost:3000";
const USUARIO = process.argv[3] ?? "admin@cg.pb.gov.br";
const SENHA = process.argv[4] ?? process.env["SEED_ADMIN_SENHA"] ?? "";

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
 * nenhuma requisição sai, e o sintoma chega 30 s depois como "timeout de navegação",
 * acusando a senha. `requestSubmit` envia pelo caminho do próprio React.
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
  readonly tipo?: "select";
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

/** As `n` primeiras opções ÚTEIS de um select — vazio quando não há nenhuma. */
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

/**
 * O primeiro evento AINDA SEM ROTEIRO, lido da própria listagem.
 *
 * ⚠️ ELE SAI DA TELA, e não de uma lista montada aqui. Um percurso que escolhesse o tipo por
 * conta própria continuaria verde no dia em que a listagem parasse de mostrar os pendentes —
 * e é justamente o pendente que esta tela existe para revelar.
 */
async function primeiroPendente(
  page: Page
): Promise<{ readonly href: string; readonly rotulo: string } | null> {
  return page.evaluate(() => {
    for (const tr of Array.from(document.querySelectorAll("tr"))) {
      if (!(tr.textContent ?? "").includes("Sem roteiro")) continue;
      const a = tr.querySelector("a");
      if (!(a instanceof HTMLAnchorElement)) continue;
      const u = new URL(a.href);
      return { href: `${u.pathname}${u.search}`, rotulo: (a.textContent ?? "").trim() };
    }
    return null;
  });
}

/**
 * A SITUAÇÃO de cada linha da tabela — a ÚLTIMA célula, que é a coluna `situacao`.
 *
 * ⚠️ ELA EXISTE PORQUE A PRIMEIRA VERSÃO DESTE PERCURSO LEU `document.body`, e o corpo da
 * página inclui o próprio `select` de filtro — cuja opção se chama "Parametrizado". A busca
 * por texto achava a palavra no FORMULÁRIO e concluía que o filtro estava errado. É o mesmo
 * defeito que o ENT10 já tinha registrado (duas asserções lendo o corpo inteiro, com a
 * barra lateral dentro), repetido por mim aqui.
 */
async function situacoesDasLinhas(page: Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("tr"))
      .filter((tr) => tr.querySelector("td") !== null)
      .map((tr) => {
        const celulas = Array.from(tr.querySelectorAll("td"));
        return (celulas[celulas.length - 1]?.textContent ?? "").trim();
      })
      .filter((t) => t !== "")
  );
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
        // ⚠️ SEM TETO DE HEAP NO RENDERIZADOR, pela lição do percurso do acervo: os selects
        // de conta trazem as analíticas das classes 1 a 4 (milhares de opções), e um old
        // space travado em 256 MB estourou 60 s ali. A correção é a causa, não o relógio.
      ],
    });
    const page = await navegador.newPage();
    page.setDefaultTimeout(60000);
    await entrar(page);
    ok("login");

    // ══════════════════════════════════════════════════════════════════════
    // 1 · A LISTA MOSTRA O QUE FALTA — é o ponto inteiro desta tela
    // ══════════════════════════════════════════════════════════════════════
    const lista = await irPara(page, "/patrimonio/roteiros");
    conferir(
      "lista: a tela dos roteiros abre e nomeia os eventos do patrimônio",
      lista.includes("depreciação") && lista.includes("avaliação inicial"),
      "a listagem não trouxe os eventos do rol"
    );

    const FORM = 'form[data-acao="criar-roteiros-patrimoniais"]';
    const contas = await opcoesUteis(page, `${FORM} select[name="contaDebitoId"]`, 2);
    conferir(
      "lista: o seletor de conta OFERECE contas analíticas do patrimônio",
      contas.length >= 2,
      `o select de conta trouxe ${contas.length} opção(ões) úteis — precisa de duas distintas`
    );
    if (contas.length < 2) throw new Error("sem duas contas não há como formar um roteiro");
    const [debito, credito] = contas as [string, string];

    const pendente = await primeiroPendente(page);
    conferir(
      "lista: ela REVELA os eventos ainda sem roteiro",
      pendente !== null,
      "nenhuma linha 'Sem roteiro' — o banco já está todo parametrizado, ou a coluna sumiu"
    );

    // ══════════════════════════════════════════════════════════════════════
    // 2 · A RECUSA QUE VEM ANTES DO ACERTO — mesma conta nas duas pernas
    // ══════════════════════════════════════════════════════════════════════
    const alvo = pendente?.href.split("/").pop() ?? "AVALIACAO_INICIAL";

    const rMesmaConta = await preencherEEnviar(page, "criar-roteiros-patrimoniais", [
      { sel: 'select[name="tipo"]', valor: alvo, tipo: "select" },
      { sel: 'select[name="contaDebitoId"]', valor: debito, tipo: "select" },
      { sel: 'select[name="contaCreditoId"]', valor: debito, tipo: "select" },
    ]);
    conferir(
      "recusa: débito e crédito na MESMA conta é negado, nomeando o motivo",
      rMesmaConta.tipo === "erro" && /MESMA conta/i.test(rMesmaConta.texto),
      `esperava recusa nomeando a mesma conta; veio ${rMesmaConta.tipo}: ${rMesmaConta.texto}`
    );

    // ══════════════════════════════════════════════════════════════════════
    // 3 · A PARAMETRIZAÇÃO, E A PERSISTÊNCIA APÓS RECARGA
    // ══════════════════════════════════════════════════════════════════════
    await irPara(page, "/patrimonio/roteiros");
    const rCriar = await preencherEEnviar(page, "criar-roteiros-patrimoniais", [
      { sel: 'select[name="tipo"]', valor: alvo, tipo: "select" },
      { sel: 'select[name="contaDebitoId"]', valor: debito, tipo: "select" },
      { sel: 'select[name="contaCreditoId"]', valor: credito, tipo: "select" },
    ]);
    conferir("roteiro: o servidor aceitou a parametrização", rCriar.tipo === "ok", rCriar.texto);

    const depois = await irPara(page, "/patrimonio/roteiros");
    conferir(
      "roteiro: RECARREGADA, a lista traz o evento como parametrizado",
      depois.includes("parametrizado"),
      "a lista recarregada não mostra nenhum evento parametrizado"
    );

    // ══════════════════════════════════════════════════════════════════════
    // 4 · A SEGUNDA RECUSA — parametrizar de novo NÃO sobrescreve em silêncio
    // ══════════════════════════════════════════════════════════════════════
    const rDeNovo = await preencherEEnviar(page, "criar-roteiros-patrimoniais", [
      { sel: 'select[name="tipo"]', valor: alvo, tipo: "select" },
      { sel: 'select[name="contaDebitoId"]', valor: credito, tipo: "select" },
      { sel: 'select[name="contaCreditoId"]', valor: debito, tipo: "select" },
    ]);
    conferir(
      "recusa: parametrizar um evento que JÁ tem roteiro é negado, nomeando o par vigente",
      rDeNovo.tipo === "erro" && /JÁ TEM roteiro/i.test(rDeNovo.texto),
      `esperava recusa nomeando o par vigente; veio ${rDeNovo.tipo}: ${rDeNovo.texto}`
    );

    // ══════════════════════════════════════════════════════════════════════
    // 5 · O DETALHE, E A REPARAMETRIZAÇÃO COMO ATO À PARTE
    // ══════════════════════════════════════════════════════════════════════
    const detalhe = await irPara(page, `/patrimonio/roteiros/${alvo}`);
    conferir(
      "detalhe: o roteiro aparece com as duas contas e o selo de parametrizado",
      detalhe.includes("parametrizado") && detalhe.includes("conta de débito"),
      "o detalhe não trouxe o par de contas"
    );

    const rTrocar = await preencherEEnviar(page, "reparametrizar", [
      { sel: 'select[name="contaDebitoId"]', valor: credito, tipo: "select" },
      { sel: 'select[name="contaCreditoId"]', valor: debito, tipo: "select" },
    ]);
    conferir(
      "detalhe: a reparametrização — ato à parte — é aceita",
      rTrocar.tipo === "ok",
      rTrocar.texto
    );

    const detalhe2 = await irPara(page, `/patrimonio/roteiros/${alvo}`);
    conferir(
      "detalhe: RECARREGADO, ele traz as contas TROCADAS",
      detalhe2.includes("parametrizado"),
      "o detalhe recarregado não confirma a troca"
    );

    // ══════════════════════════════════════════════════════════════════════
    // 6 · O FILTRO RESPONDE POR DERIVAÇÃO — "o que ainda falta"
    // ══════════════════════════════════════════════════════════════════════
    // ⚠️ PROPRIEDADE NAS DUAS DIREÇÕES, e não uma busca por palavra. Cada lado exige ao
    // menos UMA linha: um filtro que devolvesse tabela vazia satisfaria "toda linha está
    // sem roteiro" por vacuidade, e passaria escondendo justamente o que se quer ver.
    await irPara(page, "/patrimonio/roteiros?situacao=PENDENTE");
    const soPendentes = await situacoesDasLinhas(page);
    conferir(
      "filtro: com 'Sem roteiro', TODA linha listada está sem roteiro — e há ao menos uma",
      soPendentes.length > 0 && soPendentes.every((s) => s === "Sem roteiro"),
      `situações listadas: ${[...new Set(soPendentes)].join(" | ") || "(nenhuma linha)"}`
    );

    await irPara(page, "/patrimonio/roteiros?situacao=PARAMETRIZADO");
    const soParametrizados = await situacoesDasLinhas(page);
    conferir(
      "filtro: com 'Parametrizado', TODA linha listada tem roteiro — e há ao menos uma",
      soParametrizados.length > 0 && soParametrizados.every((s) => s === "Parametrizado"),
      `situações listadas: ${[...new Set(soParametrizados)].join(" | ") || "(nenhuma linha)"}`
    );

    // ══════════════════════════════════════════════════════════════════════
    // 7 · O RESULTADO DA ALIENAÇÃO — tabela irmã, mesma disciplina
    // ══════════════════════════════════════════════════════════════════════
    const resultado = await irPara(page, "/patrimonio/roteiros-de-resultado");
    conferir(
      "resultado: a tela abre e traz ganho e perda",
      resultado.includes("ganho na alienação") && resultado.includes("perda na alienação"),
      "a listagem do resultado não trouxe as duas chaves"
    );

    const pendenteResultado = await primeiroPendente(page);
    if (pendenteResultado !== null) {
      const chave = pendenteResultado.href.split("/").pop() ?? "GANHO_ALIENACAO";
      const rResultado = await preencherEEnviar(page, "criar-roteiros-de-resultado", [
        { sel: 'select[name="chave"]', valor: chave, tipo: "select" },
        { sel: 'select[name="contaDebitoId"]', valor: debito, tipo: "select" },
        { sel: 'select[name="contaCreditoId"]', valor: credito, tipo: "select" },
      ]);
      conferir(
        "resultado: o servidor aceitou a parametrização do ganho/perda",
        rResultado.tipo === "ok",
        rResultado.texto
      );

      const depoisResultado = await irPara(page, "/patrimonio/roteiros-de-resultado");
      conferir(
        "resultado: RECARREGADA, a lista o traz parametrizado",
        depoisResultado.includes("parametrizado"),
        "a lista do resultado não confirma a persistência"
      );
    } else {
      ok("resultado: ganho e perda já estavam parametrizados neste banco");
    }

    // ══════════════════════════════════════════════════════════════════════
    // 8 · A TELA É ALCANÇÁVEL PELA NAVEGAÇÃO, e não só pela URL
    // ══════════════════════════════════════════════════════════════════════
    const hub = await irPara(page, "/patrimonio");
    conferir(
      "navegação: o hub do patrimônio LEVA aos roteiros",
      hub.includes("roteiros contábeis do patrimônio"),
      "o hub da área não oferece a tela — ela existiria só para quem soubesse a URL"
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
