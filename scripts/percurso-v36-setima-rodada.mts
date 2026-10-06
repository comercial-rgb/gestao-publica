import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V36 — PERCURSO DA SÉTIMA RODADA:
 *   1. duplicar empenho: no detalhe de um empenho, "Duplicar este empenho" emite o novo com número, data, valor e
 *      histórico informados; o novo fica gravado com ficha, tipo e credor do original e abre pelo link;
 *   2. o acompanhamento das cotas aparece no cronograma de desembolso, com o realizado do exercício;
 *   3. a obra cadastrada pela tela mostra valor da obra, contratado, empenhado e percentual executado;
 *   4. negações: quem lê a despesa sem empenhar vê o empenho sem o formulário de duplicar;
 *      quem não lê o planejamento é levado a /sem-acesso no cronograma.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 SEED_ADMIN_SENHA=... \
 *      npx tsx scripts/percurso-v36-setima-rodada.mts
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação.");
const URL_BANCO = process.env["PERCURSO_BANCO"] ?? "";
if (!/\/gestao_publica_esperanca_ficticio(_[a-z]+)?(\?|$)/.test(URL_BANCO)) throw new Error("Recusado: PERCURSO_BANCO tem de ser a base fictícia que a BASE serve.");
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const senhaFicticia = process.env["FICTICIO_SENHA"] ?? "Ficticio#2026";
const prisma = criarPrismaClient(URL_BANCO);
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
const marca = String(Date.now()).slice(-6);

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  await entrar(n, page, "admin@cg.pb.gov.br", senha);

  // ── 1. duplicar empenho ──
  const original = await prisma.empenho.findFirstOrThrow({
    where: { estornoDeId: null, anulacaoParcialDeId: null, consorcioId: null, ficha: { exercicio: 2026 }, NOT: { historico: { startsWith: "Duplicado no percurso" } } },
    orderBy: { valor: "asc" },
    select: { id: true, numero: true, fichaId: true, tipo: true, credorCpfCnpj: true },
  });
  await irPara(n, page, `/despesa/empenhos/${original.id}`);
  await page.$eval("form[data-acao='duplicar-empenho']", (f) => f.closest("details")?.setAttribute("open", ""));
  const sugerido = await page.$eval("form[data-acao='duplicar-empenho'] input[name='numero']", (i) => (i as HTMLInputElement).value);
  const historico = `Duplicado no percurso ${marca}`;
  // ⚠️ O HISTÓRICO VAI PELO VALOR, NÃO PELO TECLADO. Medido em duas corridas: com o histórico do original longo
  // (quebrando em várias linhas no textarea de duas linhas), o clique triplo do helper não selecionou o texto e o
  // novo empenho saiu com o histórico do original. O textarea não é controlado; atribuir o valor é o que o usuário
  // obtém ao apagar e digitar.
  await page.$eval("form[data-acao='duplicar-empenho'] textarea[name='historico']", (t, h) => {
    (t as HTMLTextAreaElement).value = h;
  }, historico);
  const r = await preencherEEnviar(page, "duplicar-empenho", [
    { sel: 'input[name="data"]', valor: "2026-10-06", tipo: "data" },
    { sel: 'input[data-mascara="valor"]', valor: "1,23" },
  ]);
  const novo = await prisma.empenho.findFirst({ where: { numero: sugerido, fichaId: original.fichaId }, select: { historico: true, id: true, numero: true, fichaId: true, tipo: true, credorCpfCnpj: true, valor: true, lancamentoId: true } });
  conferir(
    novo !== null && novo.numero === sugerido && novo.fichaId === original.fichaId && novo.tipo === original.tipo && novo.credorCpfCnpj === original.credorCpfCnpj && novo.valor.toFixed(2) === "1.23" && novo.historico === historico,
    `empenho ${original.numero} duplicado como ${novo?.numero ?? "(nada gravado)"} (${r.tipo}): ficha, tipo e credor do original, valor 1,23, histórico "${novo?.historico ?? ""}"`
  );
  if (novo !== null) {
    const elo = await page.$eval("a[data-elo='empenho-duplicado']", (a) => a.getAttribute("href") ?? "").catch(() => "");
    await irPara(n, page, elo);
    const titulo = await page.$eval("h1", (h) => h.textContent ?? "");
    conferir(elo === `/despesa/empenhos/${novo.id}` && titulo.includes(novo.numero), `o link abre o novo empenho: "${titulo.trim()}"`);
  }

  // ── 2. acompanhamento das cotas ──
  await irPara(n, page, "/planejamento/cmd-mba?exercicio=2026");
  const quadro = await page.$eval("[data-acompanhamento-das-cotas]", (d) => (d as HTMLElement).innerText);
  // O cabeçalho vem em caixa alta pelo CSS: o innerText devolve "REALIZADO".
  conferir(/REALIZADO/i.test(quadro) && /PREVISTO/i.test(quadro) && /\n\d{3}\t(Jan|Fev|Mar|Abr|Mai|Jun|Jul|Ago|Set|Out|Nov|Dez)\t/.test(quadro),`acompanhamento das cotas na tela do cronograma (${quadro.split("\n").length} linhas de texto)`);

  // ── 3. posição financeira da obra ──
  const identificador = `OB-PERC-${marca}`;
  await irPara(n, page, "/licitacoes/obras");
  await preencherEEnviar(page, "criar-obras", [
    { sel: 'input[name="identificador"]', valor: identificador },
    { sel: 'textarea[name="descricao"]', valor: "Obra fictícia do percurso" },
    { sel: 'select[name="tipoObraServico"]', valor: "PAVIMENTACAO_ASFALTICA", tipo: "select" },
  ]);
  const obra = await prisma.obra.findUnique({ where: { identificador }, select: { id: true } });
  conferir(obra !== null, `obra ${identificador} cadastrada pela tela`);
  if (obra !== null) {
    await irPara(n, page, `/licitacoes/obras/${obra.id}`);
    const texto = await page.evaluate(() => document.body.innerText);
    conferir(
      /Valor da obra\s+sem planilha orçamentária/i.test(texto) && /Valor contratado\s+R\$\s*0,00/i.test(texto) && /Valor empenhado\s+R\$\s*0,00/i.test(texto) && /Percentual executado\s+sem valor contratado/i.test(texto),
      "a obra mostra valor da obra, contratado, empenhado e percentual executado"
    );
  }

  // ── 3b. bens incorporados e a incorporar ──
  // ⚠️ A BASE FICTÍCIA NÃO TEM LIQUIDAÇÃO DE CAPITAL nem classe de bens, e não se cria uma aqui: liquidar o elemento 52
  // exige a conta da liquidação por elemento, que é decisão do contador do ente. Mede-se a tela, os filtros tirados das
  // fichas de capital do exercício e o recorte pela URL; as linhas estão provadas em m10-relatorio-de-incorporacao.test.ts.
  await irPara(n, page, "/patrimonio/incorporacoes?exercicio=2026");
  const unidades = await page.$$eval("select[name='unidade'] option", (os) => os.map((o) => (o as HTMLOptionElement).value).filter((x) => x !== ""));
  const vazio = await page.evaluate(() => document.body.innerText.includes("Nenhuma liquidação de despesa de capital no recorte."));
  if (unidades[0] !== undefined) await irPara(n, page, `/patrimonio/incorporacoes?exercicio=2026&unidade=${unidades[0]}`);
  const escolhida = await page.$eval("select[name='unidade']", (s) => (s as HTMLSelectElement).value);
  conferir(unidades.length > 0 && vazio && escolhida === unidades[0], `incorporações: ${unidades.length} unidade(s) com ficha de capital no filtro, lista vazia dita, recorte pela unidade mantido na tela`);

  // ── 4. negações ──
  const outra = await (await nav.createBrowserContext()).newPage();
  outra.setDefaultTimeout(120000);
  await entrar(n, outra, "ordenador@ficticio.local", senhaFicticia);
  await outra.goto(`${n.base}/despesa/empenhos/${original.id}`, { waitUntil: "domcontentloaded" });
  const destino = new URL(outra.url());
  const formVisivel = (await outra.$("form[data-acao='duplicar-empenho']")) !== null;
  // O ordenador LÊ a despesa e não empenha: vê o empenho, sem o formulário. A recusa no servidor (quem não empenha na
  // ficha do original) está provada no domínio (m05-duplicar-empenho.test.ts, t3).
  const tituloOrdenador = await outra.$eval("h1", (h) => h.textContent ?? "").catch(() => "");
  conferir(
    !formVisivel && destino.pathname === `/despesa/empenhos/${original.id}` && tituloOrdenador.includes(original.numero),
    `ordenador (lê a despesa, não empenha) vê o empenho ${original.numero} sem o formulário de duplicar (em ${destino.pathname}, título "${tituloOrdenador.trim()}", formulário ${formVisivel ? "presente" : "ausente"})`
  );

  const terceira = await (await nav.createBrowserContext()).newPage();
  terceira.setDefaultTimeout(120000);
  await entrar(n, terceira, "atestador@ficticio.local", senhaFicticia);
  await terceira.goto(`${n.base}/planejamento/cmd-mba?exercicio=2026`, { waitUntil: "domcontentloaded" });
  const d2 = new URL(terceira.url());
  conferir(d2.pathname === "/sem-acesso" && d2.searchParams.get("acao") === "CONSULTAR_PLANEJAMENTO", `atestador no cronograma: ${d2.pathname}?acao=${d2.searchParams.get("acao") ?? ""}`);
  await terceira.goto(`${n.base}/patrimonio/incorporacoes`, { waitUntil: "domcontentloaded" });
  const d3 = new URL(terceira.url());
  conferir(d3.pathname === "/sem-acesso" && d3.searchParams.get("acao") === "CONSULTAR_PATRIMONIO", `atestador nas incorporações: ${d3.pathname}?acao=${d3.searchParams.get("acao") ?? ""}`);
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da sétima rodada completo.");
