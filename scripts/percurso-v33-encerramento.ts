import "dotenv/config";
import type { Page } from "puppeteer";
import type { PrismaClient } from "../prisma/generated/client/client.js";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, registroDePassos, sair, type Navegador } from "./percursos-navegador.js";

/**
 * V33 — A COMPOSIÇÃO DAS DEMONSTRAÇÕES E O ENCERRAMENTO DO EXERCÍCIO, PELO NAVEGADOR. GRAVA: só na 3011, sobre uma
 * cópia do banco da apresentação feita para este percurso.
 *
 *   C. O CONTADOR abre, no Balanço Orçamentário, no Financeiro e na DFC de 2026 (em andamento), a composição de uma
 *      linha: os documentos, o caminho até cada um e a soma conferida contra a linha.
 *   E. O CONTADOR não encerra o exercício (a tela diz quem encerra); o ADMINISTRADOR encerra 2026 e a lista de restos
 *      a pagar mostra as inscrições; a soma das inscrições é a do encerramento.
 *   D. Depois do encerramento, o Balanço Orçamentário de 2026 sai encerrado e a composição continua conferindo.
 *   V. A virada das contas de controle diz o que falta, em vez de encerrar sem a classificação do ente.
 *
 * Uso: DATABASE_URL=<cópia> npx tsx scripts/percurso-v33-encerramento.ts http://localhost:3011 <senha-admin>
 */

const BASE = process.argv[2] ?? "http://localhost:3011";
const SENHA_ADMIN = process.argv[3] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const SENHA_PAPEIS = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";
const N: Navegador = { base: BASE };

const linksDeComposicao = (page: Page, prefixo: string): Promise<string[]> =>
  page.$$eval(
    `a[href^="/relatorios/demonstracoes/composicao?linha=${prefixo}"]`,
    (as) => as.map((a) => a.getAttribute("href") ?? "")
  );

/** Abre a composição e devolve a conferência, o número de documentos e os destinos dos links. */
async function abrirComposicao(page: Page, rota: string): Promise<{ texto: string; documentos: number; destinos: string[] }> {
  const texto = await irPara(N, page, rota);
  const destinos = await page.$$eval("table a[href]", (as) => as.map((a) => a.getAttribute("href") ?? ""));
  return { texto, documentos: destinos.length, destinos };
}

const confere = (t: string): boolean => /a soma dos documentos confere com a linha/i.test(t);
const naoEmitida = (t: string): boolean => /a demonstração não foi emitida/i.test(t);

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"] ?? "";
  if (url === "") throw new Error("DATABASE_URL é obrigatória.");
  if (!/ensaio/.test(url)) throw new Error("Este percurso grava: só roda sobre um banco de ensaio.");
  if (SENHA_ADMIN === "") throw new Error("A senha do administrador é obrigatória.");
  const prisma = criarPrismaClient(url) as unknown as PrismaClient;
  const R = registroDePassos();
  const navegador = await lancarNavegadorDoPercurso();
  try {
    const page = await navegador.newPage();
    page.setDefaultTimeout(120000);
    await entrar(N, page, "contabilidade@percursos.local", SENHA_PAPEIS);

    // ══ C. COMPOSIÇÃO, EXERCÍCIO EM ANDAMENTO ══
    await irPara(N, page, "/relatorios/demonstracoes/balanco-orcamentario?exercicio=2026");
    const linksBo = await linksDeComposicao(page, "bo-despesa");
    R.conferir("C.1 o Balanço Orçamentário liga cada categoria e grupo da despesa à composição", linksBo.length >= 2, linksBo.join(" "));
    const grupo = linksBo.find((h) => /bo-despesa%3A\d\.\d/.test(h)) ?? linksBo[0] ?? "";
    const cBo = await abrirComposicao(page, grupo);
    R.conferir(
      "C.2 a composição do grupo lista os empenhos (com o caminho até cada um) e a soma confere com a linha",
      confere(cBo.texto) && cBo.documentos > 0 && cBo.destinos.every((d) => d.startsWith("/despesa/empenhos/")),
      `${cBo.texto.slice(0, 240)} | ${cBo.destinos.slice(0, 3).join(" ")}`
    );
    if (cBo.destinos[0] !== undefined) {
      const emp = await irPara(N, page, cBo.destinos[0]);
      R.conferir("C.3 o documento da composição abre o empenho", /empenho/i.test(emp) && !/não foi possível/i.test(emp), emp.slice(0, 160));
    }

    await irPara(N, page, "/relatorios/demonstracoes/balanco-orcamentario?exercicio=2026");
    const linksRec = await linksDeComposicao(page, "bo-receita");
    if (linksRec.length > 0) {
      const cRec = await abrirComposicao(page, linksRec[linksRec.length - 1]!);
      R.conferir(
        "C.4 a composição da receita lista as guias, que abrem a arrecadação, e confere com a linha",
        confere(cRec.texto) && cRec.destinos.every((d) => d.startsWith("/receita/arrecadacoes/")),
        `${cRec.texto.slice(0, 200)} | ${cRec.destinos.slice(0, 3).join(" ")}`
      );
    } else {
      R.conferir("C.4 o ensaio tem receita realizada em 2026", false, "nenhuma linha de receita com composição");
    }

    // O Anexo 13 e a DFC dependem do rol de caixa e da conferência contra o razão: se o motor recusar, a
    // composição tem de dizer isso — e não fingir conferência.
    const bf = await irPara(N, page, "/relatorios/demonstracoes/balanco-financeiro?exercicio=2026");
    const linksBf = await linksDeComposicao(page, "bf-");
    if (linksBf.length > 0) {
      const cBf = await abrirComposicao(page, linksBf[0]!);
      R.conferir("C.5 o Balanço Financeiro abre a composição da fonte, e a soma confere com a linha", confere(cBf.texto) && cBf.documentos > 0, cBf.texto.slice(0, 240));
    } else {
      R.conferir("C.5 o Balanço Financeiro não emitido diz o motivo (sem link de composição a seguir)", /não|informad/i.test(bf), bf.slice(0, 240));
      const direto = await abrirComposicao(page, "/relatorios/demonstracoes/composicao?linha=bf-despesa%3A500&exercicio=2026");
      R.conferir("C.5b a composição aberta direto mostra os documentos e diz que a linha não pôde ser conferida", naoEmitida(direto.texto) || confere(direto.texto), direto.texto.slice(0, 240));
    }
    const dfc = await irPara(N, page, "/relatorios/demonstracoes/fluxos-de-caixa?exercicio=2026");
    const linksDfc = await linksDeComposicao(page, "dfc-");
    R.conferir(
      "C.6 a DFC liga as linhas com documentos à composição (ou diz por que não foi emitida)",
      linksDfc.length > 0 || /não|informad|fecham|atividade/i.test(dfc),
      linksDfc.length > 0 ? linksDfc.join(" ") : dfc.slice(0, 240)
    );
    if (linksDfc.length > 0) {
      const cDfc = await abrirComposicao(page, linksDfc[linksDfc.length - 1]!);
      R.conferir("C.7 a composição da linha da DFC confere com a linha", confere(cDfc.texto), cDfc.texto.slice(0, 240));
    }
    const ruim = await irPara(N, page, "/relatorios/demonstracoes/composicao?linha=bo-despesa%3Axyz&exercicio=2026");
    R.conferir("C.8 linha que não existe é recusada com o caminho certo", /linha não reconhecida/i.test(ruim), ruim.slice(0, 200));

    // ══ E. ENCERRAMENTO ══
    const restos = await irPara(N, page, "/despesa/restos-a-pagar?exercicio=2026");
    R.conferir(
      "E.1 o contador não vê o botão de encerrar o exercício; a tela diz quem encerra",
      (await page.$('form[data-acao="encerrar-exercicio"]')) === null && (await page.$('[data-atos-do-encerramento="sem-permissao"]')) !== null,
      restos.slice(0, 200)
    );
    await sair(N, page);

    const antes = await prisma.inscricaoRestosAPagar.count({ where: { exercicioOrigem: 2026 } });
    await entrar(N, page, "admin@cg.pb.gov.br", SENHA_ADMIN);
    await irPara(N, page, "/despesa/restos-a-pagar?exercicio=2026");
    await page.$eval('form[data-acao="encerrar-exercicio"]', (f) => f.closest("details")?.setAttribute("open", ""));
    const errada = await preencherEEnviar(page, "encerrar-exercicio", [{ sel: 'input[name="confirmacao"]', valor: "2025" }]);
    R.conferir("E.2 a confirmação errada recusa e nada é gravado", /não corresponde/i.test(errada.texto) && (await prisma.encerramentoExercicio.count()) === 0, errada.texto.slice(0, 200));
    const r = await preencherEEnviar(page, "encerrar-exercicio", [{ sel: 'input[name="confirmacao"]', valor: "2026" }]);
    const inscricoes = await prisma.inscricaoRestosAPagar.findMany({ where: { exercicioOrigem: 2026 }, select: { tipo: true, valorInscrito: true } });
    R.conferir(
      "E.3 o administrador encerra 2026; o encerramento e as inscrições ficam gravados",
      /encerrado/i.test(r.texto) && antes === 0 && (await prisma.encerramentoExercicio.count({ where: { exercicio: { ano: 2026 } } })) === 1 && inscricoes.length > 0,
      `${r.texto.slice(0, 220)} | inscrições ${String(inscricoes.length)}`
    );
    const lista = await irPara(N, page, "/despesa/restos-a-pagar?exercicio=2026");
    R.conferir("E.4 a lista de restos a pagar de 2026 mostra as inscrições, depois de recarregar", /processado/i.test(lista) && !/nenhum resto a pagar/i.test(lista), lista.slice(0, 240));
    await sair(N, page);

    // ══ D. DEPOIS DO ENCERRAMENTO ══
    await entrar(N, page, "contabilidade@percursos.local", SENHA_PAPEIS);
    const bo = await irPara(N, page, "/relatorios/demonstracoes/balanco-orcamentario?exercicio=2026");
    R.conferir("D.1 o Balanço Orçamentário de 2026 sai como exercício encerrado", /exercício 2026 encerrado/i.test(bo), bo.slice(0, 240));
    const linksDepois = await linksDeComposicao(page, "bo-despesa");
    const cDepois = await abrirComposicao(page, linksDepois.find((h) => /bo-despesa%3A\d\.\d/.test(h)) ?? linksDepois[0] ?? "");
    R.conferir("D.2 a composição do grupo continua conferindo com a linha do exercício encerrado", confere(cDepois.texto), cDepois.texto.slice(0, 240));
    const bfDepois = await irPara(N, page, "/relatorios/demonstracoes/balanco-financeiro?exercicio=2026");
    R.conferir(
      "D.3 o Balanço Financeiro de 2026 encerrado: emitido com as inscrições como ingresso, ou o motivo da recusa",
      /restos a pagar/i.test(bfDepois) || /não|informad/i.test(bfDepois),
      bfDepois.slice(0, 260)
    );

    // ══ V. VIRADA ══
    const virada = await irPara(N, page, "/contabilidade/virada-dos-controles?exercicio=2026");
    const impedimentos = await page.$eval("[data-impedimentos]", (e) => e.textContent ?? "").catch(() => "");
    R.conferir(
      "V.1 a virada dos controles diz o que falta (a classificação das contas é do ente) em vez de encerrar sem ela",
      impedimentos !== "" || /nada a classificar|nenhuma conta de controle/i.test(virada),
      (impedimentos || virada).slice(0, 300)
    );
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
