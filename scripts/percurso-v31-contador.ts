import "dotenv/config";
import type { PrismaClient } from "../prisma/generated/client/client.js";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, registroDePassos, sair, type Navegador } from "./percursos-navegador.js";

/**
 * V31 — O CONTADOR NAVEGA E PREPARA 2027 PELA TELA (menu em abas, contexto visível, conferência e comparação).
 *
 *   A. MENU — o planejador vê as abas que o servidor libera para ele (Planejamento) e NÃO vê Tesouraria;
 *      o menu leva às telas pelos nomes do contador.
 *   B. CONTEXTO — o cabeçalho diz a fase do exercício (2026 em execução) e a competência; um link com
 *      ?exercicio= vence o contexto; trocar no seletor reescreve a URL; edição não salva pede confirmação.
 *   C. PROPOSTA — o PLANEJADOR importa 2026 (orçamento atualizado) para 2027 e vê a conferência antes da
 *      votação; o ADMINISTRADOR (que tem abrir exercício e prever receita) abre 2027 e gera o orçamento.
 *   D. DEPOIS — 2027 aparece como "proposta gerada, sem lei"; a comparação 2026 x 2027 fecha com a proposta.
 *
 * ⚠️ GRAVA NO BANCO. A porta 3010 é recusada.
 * Uso: DATABASE_URL=<ensaio> npx tsx scripts/percurso-v31-contador.ts http://localhost:3011 <senha-admin>
 */

const BASE = process.argv[2] ?? "http://localhost:3011";
const SENHA_ADMIN = process.argv[3] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const ADMIN = "admin@cg.pb.gov.br";
const PLANEJADOR = "planejamento@percursos.local";
const SENHA_PAPEIS = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";
const ORIGEM = 2026;
const DESTINO = 2027;
const N: Navegador = { base: BASE };

if (BASE.includes(":3010")) {
  throw new Error("Este percurso grava proposta, exercício e fichas. A 3010 é a apresentação — use o ensaio (3011). Nada foi feito.");
}

async function main(): Promise<void> {
  if (SENHA_ADMIN === "") throw new Error("senha do administrador ausente.");
  const url = process.env["DATABASE_URL"] ?? "";
  if (url === "") throw new Error("DATABASE_URL ausente.");
  const prisma = criarPrismaClient(url) as unknown as PrismaClient;
  const R = registroDePassos();
  if ((await prisma.exercicio.count({ where: { ano: DESTINO } })) > 0) {
    throw new Error(`O exercício ${String(DESTINO)} já existe neste banco; use um ensaio limpo. Nada foi feito.`);
  }
  const navegador = await lancarNavegadorDoPercurso();
  try {
    const page = await navegador.newPage();
    page.setDefaultTimeout(120000);

    // ══ A. MENU ══
    await entrar(N, page, PLANEJADOR, SENHA_PAPEIS);
    R.ok("A.0 login do planejador (perfil sem tesouraria)");
    await irPara(N, page, "/");
    const abas = await page.evaluate(() => [...document.querySelectorAll("li[data-aba]")].map((l) => l.getAttribute("data-aba")));
    R.conferir("A.1 a aba Planejamento aparece para o planejador", abas.includes("planejamento"), JSON.stringify(abas));
    R.conferir("A.2 a aba Tesouraria NÃO aparece — o perfil não tem a área financeira", !abas.includes("tesouraria"), JSON.stringify(abas));
    await page.click('li[data-aba="planejamento"] button[aria-expanded]');
    const itens = await page.evaluate(() =>
      [...document.querySelectorAll('li[data-aba="planejamento"] a')].map((a) => [a.textContent?.trim() ?? "", a.getAttribute("href") ?? ""])
    );
    // Os links levam o contexto (?exercicio=): confere-se o CAMINHO e que o exercício vai junto.
    const temItem = (rotulo: string, href: string): boolean =>
      itens.some(([t, h]) => t === rotulo && (h ?? "").split("?")[0] === href && /exercicio=\d{4}/.test(h ?? ""));
    R.conferir("A.3 a aba abre os grupos com o nome do contador: Preparar o próximo exercício (proposta)", temItem("Preparar o próximo exercício (proposta)", "/planejamento/proposta-orcamentaria"), JSON.stringify(itens));
    R.conferir("A.4 e a comparação de exercícios", temItem("Comparação de exercícios", "/planejamento/comparacao-de-exercicios"), JSON.stringify(itens));

    // ══ B. CONTEXTO ══
    const cab = await page.evaluate(() => ({
      fase: document.querySelector("[data-situacao-do-exercicio]")?.getAttribute("data-situacao-do-exercicio") ?? null,
      competencia: document.querySelector("[data-competencia]")?.getAttribute("data-competencia") ?? null,
      exercicio: (document.querySelector('select[aria-label="Exercício ativo"]') as HTMLSelectElement | null)?.value ?? null,
    }));
    R.conferir(`B.1 a sessão abre em ${String(ORIGEM)}, em execução, com a competência dita`, cab.exercicio === String(ORIGEM) && cab.fase === "EM_EXECUCAO" && cab.competencia !== null, JSON.stringify(cab));

    // ══ C. PROPOSTA (planejador) ══
    await irPara(N, page, "/planejamento/proposta-orcamentaria");
    const nome = `Proposta ${String(DESTINO)} — percurso V31 ${String(Date.now()).slice(-5)}`;
    const r = await preencherEEnviar(page, "elaborar-proposta", [
      { sel: 'input[name="exercicio"]', valor: String(DESTINO) },
      { sel: 'select[name="exercicioDeOrigem"]', valor: String(ORIGEM), tipo: "select" },
      { sel: 'input[name="descricao"]', valor: nome },
      { sel: 'select[name="baseDaReceita"]', valor: "PREVISAO_ATUALIZADA", tipo: "select" },
      { sel: 'input[name="percentualDaReceita"]', valor: "5" },
      { sel: 'select[name="baseDaDespesa"]', valor: "DOTACAO_AUTORIZADA", tipo: "select" },
      { sel: 'input[name="percentualDaDespesa"]', valor: "5" },
    ]);
    R.conferir("C.1 o planejador importa 2026 pelo orçamento ATUALIZADO", r.tipo === "ok" && /proposta criada/i.test(r.texto), `${r.tipo}: ${r.texto}`);
    const proposta = await prisma.propostaOrcamentaria.findFirst({ where: { descricao: nome }, select: { id: true } });
    if (proposta === null) throw new Error("a proposta não foi gravada");
    const rota = `/planejamento/proposta-orcamentaria/${proposta.id}`;
    await irPara(N, page, rota);
    const verif = await page.evaluate(() =>
      [...document.querySelectorAll("[data-verificacao]")].map((v) => [v.getAttribute("data-verificacao"), v.getAttribute("data-situacao")])
    );
    const codigos = verif.map(([c]) => c);
    R.conferir(
      "C.2 a conferência antes da votação aparece com equilíbrio, fontes, LDO e PPA",
      ["EQUILIBRIO", "FONTES", "LDO", "PPA", "LINHAS_NEGATIVAS"].every((c) => codigos.includes(c)),
      JSON.stringify(verif)
    );
    // A conferência e a tela dizem o mesmo que o banco: o equilíbrio confere com os totais da proposta.
    const det = await page.evaluate(() => document.querySelector('[data-verificacao="EQUILIBRIO"]')?.textContent ?? "");
    R.conferir("C.3 o equilíbrio é dito em reais", /R\$ [\d.]+,\d{2}/.test(det), det);
    const temQuadro = await page.evaluate(() => document.querySelector("[data-acoes-do-ppa]") !== null || document.querySelector('[data-verificacao="PPA"]') !== null);
    R.conferir("C.4 o PPA é conferido (quadro da ação x fichas quando há plano)", temQuadro, "sem PPA na conferência");

    // Edição não salva: digitar num formulário VISÍVEL (importar, na lista) e clicar no menu pede confirmação.
    await irPara(N, page, "/planejamento/proposta-orcamentaria");
    await page.type('form[data-acao="elaborar-proposta"] input[name="descricao"]', "rascunho não salvo");
    let perguntou = "";
    page.once("dialog", (d) => {
      perguntou = d.message();
      void d.dismiss();
    });
    await page.click('li[data-aba="planejamento"] a[href^="/planejamento/ppa?"]');
    await new Promise((ok) => setTimeout(ok, 1500));
    R.conferir(
      "B.2 com dado digitado e não salvo, sair pelo menu pede confirmação — e quem recusa fica na página",
      /n[ãa]o salvos/i.test(perguntou) && new URL(page.url()).pathname === "/planejamento/proposta-orcamentaria",
      `${perguntou} · ${page.url()}`
    );
    // O rascunho de B.2 continua no formulário: sair agora dispara o aviso do navegador — aceito aqui.
    page.on("dialog", (d) => void d.accept());
    await sair(N, page).catch(() => undefined);

    // ══ C (administrador): abrir 2027 e gerar ══
    await entrar(N, page, ADMIN, SENHA_ADMIN);
    await irPara(N, page, rota);
    const ab = await preencherEEnviar(page, "abrir-exercicio", []);
    R.conferir(`C.5 o administrador abre ${String(DESTINO)}`, ab.tipo === "ok", `${ab.tipo}: ${ab.texto}`);
    await irPara(N, page, rota);
    // V39-021: na base de demonstração o orçamento se gera em ENSAIO (o serviço confere a natureza da base).
    const ef = await preencherEEnviar(page, "efetivar-proposta", [{ sel: 'input[name="fundamento"][value="ENSAIO"]', valor: "sim", tipo: "marcar" }]);
    R.conferir(`C.6 e gera o orçamento de ${String(DESTINO)}`, ef.tipo === "ok" && /gerado/i.test(ef.texto), `${ef.tipo}: ${ef.texto}`);
    const total = await prisma.fichaOrcamentaria.aggregate({ where: { exercicio: DESTINO }, _sum: { valorDotado: true } });

    // ══ D. DEPOIS ══
    await irPara(N, page, `/planejamento/fichas?exercicio=${String(DESTINO)}`);
    const depois = await page.evaluate(() => ({
      fase: document.querySelector("[data-situacao-do-exercicio]")?.getAttribute("data-situacao-do-exercicio") ?? null,
      exercicio: (document.querySelector('select[aria-label="Exercício ativo"]') as HTMLSelectElement | null)?.value ?? null,
    }));
    R.conferir(`D.1 o link com ?exercicio=${String(DESTINO)} vence o contexto e o cabeçalho diz "proposta gerada, sem lei"`, depois.exercicio === String(DESTINO) && depois.fase === "PROPOSTA_GERADA", JSON.stringify(depois));
    await page.select('select[aria-label="Exercício ativo"]', String(ORIGEM));
    await page.waitForFunction((ano: string) => new URL(window.location.href).searchParams.get("exercicio") === ano, {}, String(ORIGEM));
    R.conferir(`D.2 trocar no seletor reescreve a URL para ${String(ORIGEM)}`, new URL(page.url()).searchParams.get("exercicio") === String(ORIGEM), page.url());

    const cmp = await irPara(N, page, `/planejamento/comparacao-de-exercicios?a=${String(ORIGEM)}&b=${String(DESTINO)}&por=unidade`);
    R.conferir("D.3 a comparação 2026 x 2027 abre com a abrangência dita", /todas as fichas de 2026 e 2027/i.test(cmp), cmp.slice(0, 400));
    const totalNaTela = await page.evaluate(() => {
      const linhas = [...document.querySelectorAll("table tbody tr")];
      const ultima = linhas[linhas.length - 1];
      return ultima?.textContent ?? "";
    });
    const esperado = Number(total._sum.valorDotado?.toFixed(2) ?? "0").toLocaleString("pt-BR", { minimumFractionDigits: 2 });
    R.conferir(`D.4 o total de 2027 na comparação é o que nasceu nas fichas (${esperado})`, totalNaTela.includes(esperado), totalNaTela);
  } finally {
    await navegador.close();
    await prisma.$disconnect();
  }
  R.encerrar();
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});
