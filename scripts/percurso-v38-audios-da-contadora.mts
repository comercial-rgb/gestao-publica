import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { entrar, irPara, lancarNavegadorDoPercurso, type Navegador } from "./percursos-navegador.js";

/**
 * V38 — PERCURSO DO QUE A CONTADORA NÃO ACHOU (áudios de 09/10/2026), na base fictícia. Só leitura nas telas:
 *   1. a busca do credor no empenho acha uma pessoa cadastrada SEM o papel de credor, e diz isso;
 *   2. a liquidação tem o documento fiscal por busca (do credor do empenho) e diz onde fica a retenção;
 *   3. o lançamento manual tem a conta por busca;
 *   4. a LOA leva a "Preparar o próximo exercício"; o menu tem a aba Tributos; o rótulo da MSC está no menu;
 *   5. o Diário leva ao lançamento; o movimento diário abre no último dia com movimento;
 *   6. a reserva do processo licitatório tem a ficha por busca;
 *   7. no pagamento a uma pessoa física, o bloco do IR da IN 1.234 some e o "valor informado" abre.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 SEED_ADMIN_SENHA=... \
 *      npx tsx scripts/percurso-v38-audios-da-contadora.mts
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação.");
const URL_BANCO = process.env["PERCURSO_BANCO"] ?? "";
if (!/\/gestao_publica_esperanca_ficticio(_[a-z]+)?(\?|$)/.test(URL_BANCO)) throw new Error("Recusado: PERCURSO_BANCO tem de ser a base fictícia que a BASE serve.");
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const prisma = criarPrismaClient(URL_BANCO);
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
const texto = (page: import("puppeteer").Page): Promise<string> => page.$eval("main", (m) => (m.textContent ?? "").replace(/ /g, " "));
const digitarNaBusca = async (page: import("puppeteer").Page, form: string, nome: string, valor: string): Promise<string[]> => {
  const raiz = `${form} [data-seletor]:has(input[type="hidden"][name="${nome}"])`;
  await page.waitForSelector(`${raiz} input[role="combobox"]`, { timeout: 60000 });
  const combo = await page.$(`${raiz} input[role="combobox"]`);
  await combo!.click({ count: 3 });
  await page.keyboard.press("Backspace");
  await combo!.type(valor, { delay: 10 });
  // A busca espera a pessoa parar de digitar e depois consulta o servidor: espera-se a opção chegar, até 30 s.
  for (let i = 0; i < 60; i += 1) {
    const opcoes = await page.$$eval(`${raiz} [role="option"]`, (os) => os.map((o) => (o.textContent ?? "").replace(/ /g, " ")));
    if (opcoes.length > 0) return opcoes;
    await new Promise((r) => setTimeout(r, 500));
  }
  return [];
};

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  // Digitar num formulário marca edição pendente, e sair da tela abre o aviso do navegador: aceita-se.
  page.on("dialog", (d) => void d.accept());
  await entrar(n, page, "admin@cg.pb.gov.br", senha);

  // ── 1. o credor sem papel aparece na busca do empenho ──
  const semPapel = await prisma.pessoa.findFirst({
    where: { movimentos: { none: { papel: "CREDOR" } }, versoes: { some: { ativa: true } } },
    orderBy: { documento: "asc" },
    select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } },
  });
  if (semPapel === null) console.log("NAO EXECUTADO 1: a base não tem pessoa ativa sem o papel de credor");
  else {
    await irPara(n, page, "/despesa/empenhos?exercicio=2026");
    const opcoes = await digitarNaBusca(page, "form", "credor", semPapel.documento);
    conferir(opcoes.some((o) => o.includes(semPapel.versoes[0]?.nome ?? "") && /cadastro sem o papel de credor/.test(o)), `a busca do credor acha ${semPapel.versoes[0]?.nome ?? semPapel.documento} (sem o papel) e diz que falta o papel (${String(opcoes.length)} opção)`);
  }

  // ── 2. a liquidação: documento por busca e o aviso da retenção ──
  await irPara(n, page, "/despesa/liquidacoes?exercicio=2026");
  conferir((await page.$('form [data-seletor]:has(input[type="hidden"][name="documentoFiscalId"]) input[role="combobox"]')) !== null, "a liquidação tem o documento fiscal por busca");
  conferir((await page.$("[data-onde-fica-a-retencao]")) !== null, "a liquidação diz onde a retenção é informada");

  // ── 3. o lançamento manual: a conta por busca ──
  await irPara(n, page, "/contabilidade/lancamentos?exercicio=2026");
  const contas = await digitarNaBusca(page, 'form[data-acao="registrar-lancamento-manual"]', "partidas.0.conta", "1.1.1.1");
  conferir(contas.length > 0 && contas.every((o) => /^\d\.\d\.\d\.\d/.test(o)), `a conta do lançamento manual vem da busca (${String(contas.length)} opção)`);

  // ── 4. LOA, menu Tributos e MSC ──
  await irPara(n, page, "/planejamento/loa?exercicio=2026");
  conferir((await page.$("a[data-proximo-exercicio]")) !== null, "a LOA leva a Preparar o próximo exercício");
  const menu = await page.$eval("nav[aria-label='Áreas do sistema']", (m) => m.textContent ?? "").catch(() => "");
  conferir(/Tributos/.test(menu), "o menu tem a aba Tributos");
  await irPara(n, page, "/contabilidade/exportacoes-federais");
  conferir(/Matriz de Saldos Contábeis \(MSC\) e MANAD/.test(await texto(page)), "a MSC está no título da tela de arquivos federais");

  // ── 5. Diário com link; movimento diário no último dia com movimento ──
  await irPara(n, page, "/relatorios/livros/diario?exercicio=2026");
  const primeiroLink = await page.$eval("main tbody tr td a[href^='/contabilidade/lancamentos/']", (a) => a.getAttribute("href") ?? "").catch(() => "");
  conferir(primeiroLink !== "", `o Diário leva ao lançamento (${primeiroLink.slice(0, 40)})`);
  const [pg, ar] = await Promise.all([prisma.pagamento.findFirst({ orderBy: { data: "desc" }, select: { data: true } }), prisma.receitaArrecadada.findFirst({ orderBy: { dataArrecadacao: "desc" }, select: { dataArrecadacao: true } })]);
  const ultimo = [pg?.data, ar?.dataArrecadacao].filter((d): d is Date => d instanceof Date).sort((a, b) => b.getTime() - a.getTime())[0];
  await irPara(n, page, "/relatorios/movimento-diario");
  const corpoDiario = await texto(page);
  const diaBr = ultimo === undefined ? "" : new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(ultimo);
  conferir(ultimo !== undefined && corpoDiario.includes(diaBr), `o movimento diário abre no último dia com movimento (${diaBr})`);

  // ── 6. a reserva do processo: ficha por busca ──
  const processo = await prisma.processoLicitatorio.findFirst({ select: { id: true } });
  if (processo === null) {
    await irPara(n, page, "/licitacoes/processos");
    conferir(/Processos/i.test(await texto(page)), "a lista de processos abre (a base não tem processo para abrir a reserva)");
  } else {
    await irPara(n, page, `/licitacoes/processos/${processo.id}`);
    conferir((await page.$('form[data-acao="reservar"] [data-seletor]:has(input[type="hidden"][name="fichaId"])')) !== null, "a reserva do processo tem a ficha por busca");
  }

  // ── 7. pagamento a pessoa física: sem o bloco do IR das pessoas jurídicas, com o valor informado aberto ──
  const liqPf = await prisma.liquidacao.findFirst({
    where: { estornoDeId: null, empenho: { credorCpfCnpj: { not: { contains: "/" } } } },
    orderBy: { data: "desc" },
    select: { id: true, empenho: { select: { credorCpfCnpj: true } } },
  });
  const pf = liqPf !== null && liqPf.empenho.credorCpfCnpj.replace(/\D/g, "").length === 11 ? liqPf : null;
  if (pf === null) console.log("NAO EXECUTADO 7: a base não tem liquidação de pessoa física");
  else {
    await irPara(n, page, `/despesa/pagamentos?exercicio=2026&liquidacao=${pf.id}`);
    const marcada = await page.$('input[name="retencaoCalculada"]');
    if (marcada !== null) await marcada.click();
    await new Promise((r) => setTimeout(r, 500));
    conferir((await page.$("[data-ir-pessoa-fisica]")) !== null && (await page.$("details[data-valor-informado][open]")) !== null, "pagamento a pessoa física: o IR das pessoas jurídicas some e o valor informado abre");
  }
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso dos áudios da contadora completo.");
