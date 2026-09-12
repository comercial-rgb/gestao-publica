import "dotenv/config";
import puppeteer, { type Browser, type Page } from "puppeteer";

/**
 * ═══ O PERCURSO DA AUTORIZAÇÃO DE LEITURA POR UNIDADE (ENT10) ═══
 *
 * ⚠️ PRIMEIRO PERCURSO DO REPOSITÓRIO COM **DOIS ATORES**, e sem o segundo ele não provaria
 * nada. Os outros dez entram como `admin@cg.pb.gov.br`, que tem permissão GLOBAL: sob o
 * recorte autorizado esse usuário recebe o consolidado e **nunca dispara a recusa**. Um
 * percurso de um ator só ficaria verde com o guard inteiramente desligado.
 *
 * ═══ ⚠️ E ELE DESLIGA O JAVASCRIPT NAS TELAS — A PRIMEIRA VERSÃO NÃO DESLIGAVA, E MEDIU A
 * COISA ERRADA ═══
 * `components/ui/SincronizarContexto` é uma ilha cliente que, ao montar, faz `router.replace()`
 * normalizando a URL para a seleção do contexto do cabeçalho. Medido com uma sonda, nos quatro
 * casos:
 *
 *   admin  `?exercicio=2026&ug=01001`  ->  `?exercicio=2026`              (ug APAGADA)
 *   restr. `?exercicio=2026`           ->  `?exercicio=2026&ug=99001`     (ug ACRESCENTADA)
 *   restr. `?exercicio=2026&ug=01001`  ->  `?exercicio=2026&ug=99001`     (ug TROCADA)
 *   restr. `?exercicio=abc`            ->  `?exercicio=2026&ug=99001`     (ano SUBSTITUÍDO)
 *
 * O endereço digitado nunca sobrevivia até a leitura do DOM, e as seis falhas da primeira
 * execução eram do PERCURSO, não do código.
 *
 * ⚠️ E ISSO ESTREITA O DEFEITO DE FORMA QUE PRECISA SER DITA. Com JavaScript ativo, a ilha
 * corrige a URL antes de qualquer coisa aparecer: um usuário comum, no navegador, não
 * alcança a unidade alheia pela barra de endereços. A exposição real eram as **rotas de
 * exportação** — `GET` direto, sem ilha e sem menu —, e é lá que este percurso prova a
 * recusa com status. O guard das TELAS continua necessário e é defesa em profundidade: ilha
 * cliente não é fronteira de segurança, e `curl`, JS desligado ou um cliente que não executa
 * script passam ao largo dela. Desligar o JS é o que permite interrogar o SERVIDOR.
 *
 * ═══ ⚠️ E ELE LÊ O `<main>`, NÃO O `document.body` ═══
 * A primeira versão lia o corpo inteiro — que inclui a barra lateral e o SELETOR de unidade
 * do cabeçalho. A palavra "consolidado" aparecia ali como OPÇÃO do seletor, e por isso uma
 * asserção passou pelo motivo errado e outra falhou pelo motivo errado. O `<main>` do
 * `app/(areas)/layout.tsx` envolve só o conteúdo da página.
 *
 * ═══ OS ATORES ═══
 *   · `admin@cg.pb.gov.br` — permissão GLOBAL (`unidadeOrcId: null`);
 *   · `operador.poc@cg.pb.gov.br` — UMA permissão, `EMPENHAR`, escopada à UG **99001**
 *     (`scripts/poc-usuario-restrito.ts`).
 *
 * ⚠️ O ESCOPO DELE ESTÁ NA UNIDADE VAZIA, DE PROPÓSITO. Os 12 empenhos do banco de
 * desenvolvimento vivem em **01001**; ele é de **99001**. Logo é recusado na unidade
 * POVOADA que o administrador enxerga — não numa unidade inexistente, que seria negada por
 * outro motivo e provaria menos.
 *
 * ⚠️ CADA ATOR TEM CONTEXTO DE NAVEGADOR PRÓPRIO: reaproveitar a aba faria o cookie do
 * primeiro login atravessar para o segundo, e o percurso mediria o escopo do usuário errado.
 *
 * Pré-requisitos:
 *   npm run seed:sagres-poc                      (cria a UG 99001)
 *   npx tsx scripts/poc-usuario-restrito.ts      (cria o ator restrito)
 *   npm run build && npx next start -p 3010
 *
 * Uso: npx tsx scripts/smoke-ent10.ts http://localhost:3010
 */

const BASE = process.argv[2] ?? "http://localhost:3000";

const ADMIN = process.argv[3] ?? "admin@cg.pb.gov.br";
const SENHA_ADMIN = process.argv[4] ?? process.env["SEED_ADMIN_SENHA"] ?? "";

const RESTRITO = "operador.poc@cg.pb.gov.br";
const SENHA_RESTRITO = process.env["POC_SENHA_RESTRITO"] ?? "OperadorPOC#2026";

/** A unidade do ator restrito. */
const UG_DELE = "99001";
/** A unidade POVOADA, que ele NÃO pode ler. */
const UG_ALHEIA = "01001";

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
 * ponto clicável por `evaluate` no renderizador, e sob pressão de memória trava: nenhuma
 * requisição sai e o sintoma chega 30 s depois acusando a senha.
 *
 * ⚠️ O LOGIN PRECISA DE JAVASCRIPT — `requestSubmit` é chamado no navegador. Por isso ele
 * acontece ANTES de o JS ser desligado; o cookie sobrevive ao desligamento.
 */
async function entrar(page: Page, usuario: string, senha: string): Promise<void> {
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
  throw new Error(`login de ${usuario} não passou (ainda em ${page.url()}).`);
}

/** O texto do CONTEÚDO da página — sem barra lateral e sem o seletor do cabeçalho. */
async function textoDoMain(page: Page): Promise<string> {
  const bruto = await page.evaluate(() => {
    const m = document.querySelector("main");
    const alvo: HTMLElement = m instanceof HTMLElement ? m : document.body;
    return alvo.innerText.replace(/\s+/g, " ");
  });
  return bruto.toLowerCase();
}

/**
 * QUANTOS EMPENHOS A TELA MOSTRA — lido da legenda da tabela (`N empenho(s)`).
 *
 * ⚠️ ESTA FUNÇÃO EXISTE PORQUE DUAS ASSERÇÕES MINHAS MEDIAM O NADA. Elas procuravam o
 * CÓDIGO DA UNIDADE no conteúdo — e a tabela de empenhos **não tem coluna de unidade**: as
 * colunas são Nº, Data, Credor, Ficha, Fonte e os valores. O código só aparece no subtítulo,
 * e no consolidado o subtítulo diz "consolidado (ente)", sem código nenhum.
 *
 * Consequência das duas, medida numa execução real: a que exigia ver as duas unidades
 * FALHOU por ser insatisfazível; e a gêmea — "os empenhos da unidade alheia NÃO aparecem" —
 * PASSOU por vacuidade, e continuaria verde **mesmo com o vazamento de volta**. Negação que
 * não pode falhar não é teste.
 *
 * A contagem mede o vazamento de verdade: são 12 empenhos em 01001 e 1 em 99001, então o
 * consolidado tem de trazer ESTRITAMENTE mais linhas que o recorte de uma unidade. E sem
 * cravar 13, que envelheceria no primeiro seed novo.
 */
function quantosEmpenhos(texto: string): number | null {
  const m = texto.match(/(\d+)\s+empenho\(s\)/);
  return m?.[1] === undefined ? null : Number.parseInt(m[1], 10);
}

/**
 * Navega e devolve o conteúdo do `<main>` — **exigindo que a URL tenha sobrevivido**.
 *
 * ⚠️ A CONFERÊNCIA DA URL É O AUTOTESTE DESTE PERCURSO. Se a ilha voltar a rodar (JS
 * religado por engano, ou uma normalização que passe a acontecer no servidor), a URL muda e
 * este helper acusa — em vez de o percurso medir silenciosamente uma página que não é a
 * pedida, que foi exatamente o que aconteceu na primeira execução.
 */
async function irPara(page: Page, rota: string): Promise<string> {
  const resposta = await page.goto(`${BASE}${rota}`, { waitUntil: "networkidle2" });
  const status = resposta?.status() ?? 0;
  if (status !== 200) throw new Error(`${rota} respondeu ${status}`);
  if (page.url().includes("/login")) throw new Error(`${rota} devolveu ao login`);
  const chegou = page.url().replace(BASE, "");
  if (chegou !== rota) {
    throw new Error(
      `a URL foi REESCRITA: pedi "${rota}", estou em "${chegou}". ` +
        `O JavaScript deveria estar desligado nesta etapa — com a ilha ativa, o percurso mede ` +
        `uma página que não é a pedida.`
    );
  }
  return textoDoMain(page);
}

/**
 * O IRMÃO DE `irPara` QUE **NÃO ESTOURA** — as ROTAS recusam por STATUS, não por página.
 *
 * Uma TELA recusa renderizando um estado nomeado com 200; uma ROTA de exportação recusa com
 * **403** (escopo) ou **400** (exercício ilegível), pelo tradutor de `lib/rotas/recusa.ts`.
 * `irPara` trata não-200 como defeito do percurso — usá-lo aqui transformaria a recusa
 * CORRETA em falha do teste.
 */
async function statusDe(page: Page, rota: string): Promise<{ status: number; corpo: string }> {
  const resposta = await page.goto(`${BASE}${rota}`, { waitUntil: "domcontentloaded" });
  const status = resposta?.status() ?? 0;
  let corpo = "";
  try {
    corpo = (await resposta?.text()) ?? "";
  } catch {
    corpo = ""; // resposta binária (um PDF de verdade) não é texto — e isso já é informação
  }
  return { status, corpo: corpo.toLowerCase() };
}

async function main(): Promise<void> {
  if (SENHA_ADMIN === "") {
    throw new Error("Senha do admin ausente. Defina SEED_ADMIN_SENHA ou passe como 4º argumento.");
  }

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

    // ══════════════════════════════════════════════════════════════════════
    // 1 · O ADMINISTRADOR GLOBAL — anti-regressão
    //
    // ⚠️ SEM ESTE BLOCO, O LOTE PODERIA TER "CORRIGIDO" O SISTEMA RECUSANDO TODO MUNDO. Um
    // guard que nega o legítimo junto com o ilegítimo não é segurança: é indisponibilidade
    // com outro nome.
    // ══════════════════════════════════════════════════════════════════════
    const ctxAdmin = await navegador.createBrowserContext();
    const pAdmin = await ctxAdmin.newPage();
    pAdmin.setDefaultTimeout(60000);
    await entrar(pAdmin, ADMIN, SENHA_ADMIN);
    ok("login do administrador global");
    await pAdmin.setJavaScriptEnabled(false); // a partir daqui, quem responde é o SERVIDOR

    const listaAdmin = await irPara(pAdmin, "/despesa/empenhos?exercicio=2026");
    conferir(
      "admin sem `?ug=`: o conteúdo afirma o CONSOLIDADO",
      listaAdmin.includes("consolidado"),
      "o subtítulo não disse consolidado — o global perdeu o recorte do ente"
    );
    const contaAdmin = quantosEmpenhos(listaAdmin);
    conferir(
      "admin sem `?ug=`: a tabela traz linhas (o consolidado não veio vazio)",
      contaAdmin !== null && contaAdmin > 0,
      `não achei a legenda "N empenho(s)" no conteúdo do admin (lido: ${String(contaAdmin)})`
    );

    const adminNaAlheia = await irPara(
      pAdmin,
      `/despesa/empenhos?exercicio=2026&ug=${UG_ALHEIA}`
    );
    conferir(
      "admin com `?ug=` explícita: passa (a permissão global cobre todas)",
      adminNaAlheia.includes(`unidade ${UG_ALHEIA}`),
      "o admin foi recusado numa unidade que a permissão global deveria cobrir"
    );

    // ══════════════════════════════════════════════════════════════════════
    // 2 · O ATOR RESTRITO — contexto próprio, para o cookie não atravessar
    // ══════════════════════════════════════════════════════════════════════
    const ctxRestrito = await navegador.createBrowserContext();
    const pRestrito = await ctxRestrito.newPage();
    pRestrito.setDefaultTimeout(60000);
    await entrar(pRestrito, RESTRITO, SENHA_RESTRITO);
    ok("login do operador restrito (uma unidade, sem consolidado)");
    await pRestrito.setJavaScriptEnabled(false);

    // ── 2.1 · sem `?ug=`: cai no escopo DELE, e NUNCA no ente ──
    const semUg = await irPara(pRestrito, "/despesa/empenhos?exercicio=2026");
    conferir(
      "restrito sem `?ug=`: cai na unidade DELE, não no consolidado",
      semUg.includes(`unidade ${UG_DELE}`) && !semUg.includes("consolidado"),
      "a omissão de `ug` entregou o ente inteiro — é o defeito que a ENT10 fecha"
    );

    // ⚠️ A ASSERÇÃO QUE MEDE O VAZAMENTO, E ELA É UMA CONTAGEM, NÃO UM RÓTULO. O subtítulo
    // pode dizer a coisa certa enquanto a TABELA traz as linhas erradas — foi assim que o
    // defeito original sobreviveu: o seletor do cabeçalho já era honesto, e a lista não.
    //
    // ⚠️ E ELA COMPARA COM O CONSOLIDADO DO ADMIN, em vez de procurar o código da unidade no
    // texto. A primeira versão procurava o código, que a tabela NUNCA imprime — e passava por
    // vacuidade, verde inclusive com o vazamento de volta.
    const contaRestrito = quantosEmpenhos(semUg);
    conferir(
      "restrito sem `?ug=`: vê ESTRITAMENTE menos empenhos que o consolidado do admin",
      contaRestrito !== null &&
        contaAdmin !== null &&
        contaRestrito > 0 &&
        contaRestrito < contaAdmin,
      `restrito viu ${String(contaRestrito)} e o admin ${String(contaAdmin)} — ` +
        `o recorte por unidade não reduziu a lista`
    );

    // ── 2.2 · `?ug=` alheia: recusa NOMEANDO o escopo que ele tem ──
    const naAlheia = await irPara(
      pRestrito,
      `/despesa/empenhos?exercicio=2026&ug=${UG_ALHEIA}`
    );
    conferir(
      "restrito com `?ug=` alheia: a tela RECUSA com título próprio",
      naAlheia.includes("não está no seu acesso"),
      "a recusa não apareceu — a URL continua servindo a unidade alheia"
    );
    conferir(
      "a recusa NOMEIA o escopo que ele TEM (não é 'não encontrado')",
      naAlheia.includes(`só em: ${UG_DELE}`) && !naAlheia.includes("não encontrad"),
      "a mensagem não disse em que unidade ele tem leitura"
    );
    conferir(
      "a recusa diz QUEM RESOLVE — a providência é de outra pessoa",
      naAlheia.includes("administrador"),
      "a mensagem não indicou a providência"
    );

    // ── 2.3 · exercício ilegível: recusa própria, não o padrão em silêncio ──
    const anoRuim = await irPara(pRestrito, "/despesa/empenhos?exercicio=abc");
    conferir(
      "`?exercicio=abc`: RECUSA em vez de virar 2026 em silêncio",
      anoRuim.includes("não é um ano"),
      "o exercício ilegível virou o padrão — a tela afirmaria um ano que ninguém pediu"
    );

    // ══════════════════════════════════════════════════════════════════════
    // 3 · AS ROTAS DE EXPORTAÇÃO — a exposição REAL
    //
    // ⚠️ AQUI NÃO HÁ ILHA E NÃO HÁ MENU: `GET` direto entrega o arquivo inteiro a quem tiver
    // a URL. É o caminho que um navegador com JavaScript jamais normaliza, e por isso o que
    // mais precisava do guard. A recusa acontece ANTES de montar o PDF — o Chromium do
    // servidor nem é acionado.
    // ══════════════════════════════════════════════════════════════════════
    const pdfAlheio = await statusDe(
      pRestrito,
      `/despesa/empenhos/pdf?exercicio=2026&ug=${UG_ALHEIA}`
    );
    conferir(
      "rota de PDF com unidade alheia: 403, e não o arquivo",
      pdfAlheio.status === 403,
      `a rota respondeu ${pdfAlheio.status} — esperado 403`
    );
    conferir(
      "o 403 carrega a mensagem que nomeia o escopo",
      pdfAlheio.corpo.includes(`só em: ${UG_DELE}`),
      "o corpo do 403 não trouxe o motivo"
    );

    const pdfAnoRuim = await statusDe(pRestrito, "/despesa/empenhos/pdf?exercicio=abc");
    conferir(
      "rota de PDF com exercício ilegível: 400 (pedido malformado, não escopo)",
      pdfAnoRuim.status === 400,
      `a rota respondeu ${pdfAnoRuim.status} — esperado 400`
    );

    // ⚠️ E UMA ROTA DO **ENTE**, que usa a outra metade da decisão (`exercicioAutorizado`).
    // Ela não tem dimensão de unidade — a receita é do ente —, então o que se prova aqui é
    // que o silêncio do exercício morreu também onde não há `ug` nenhuma a conferir.
    const guiaAnoRuim = await statusDe(pRestrito, "/receita/arrecadacoes/pdf?exercicio=abc");
    conferir(
      "rota do ENTE com exercício ilegível: 400 (a outra metade da decisão)",
      guiaAnoRuim.status === 400,
      `a rota respondeu ${guiaAnoRuim.status} — esperado 400`
    );

    // ⚠️ ANTI-REGRESSÃO NA ROTA: o admin continua BAIXANDO. Um guard que devolvesse 403 a
    // todo mundo passaria em todas as asserções acima.
    const pdfAdmin = await statusDe(
      pAdmin,
      `/despesa/empenhos/pdf?exercicio=2026&ug=${UG_ALHEIA}`
    );
    conferir(
      "admin na mesma rota: 200 — o guard não negou o legítimo junto com o ilegítimo",
      pdfAdmin.status === 200,
      `o admin recebeu ${pdfAdmin.status} numa rota que a permissão global cobre`
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
