import "dotenv/config";
import { readFileSync } from "node:fs";
import { descricaoOficialDaNatureza, lerEmentarioDaReceita } from "../modules/m04-receita/ementario-oficial.js";
import { cadastrarNaturezaReceita } from "../modules/m04-receita/ementario.js";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V36 — PERCURSO DAS FONTES DA NATUREZA COM PERCENTUAL (TR 5.9.3.4) E DA PREVISÃO POR RATEIO (TR 5.9.3.7):
 *   o administrador registra pela tela as fontes de uma natureza (500 com 60,5% e 540 com 39,5%, sobra na 540); a lista
 *   mostra a composição com 100%; uma composição que soma 110% é recusada com o motivo e nada é gravado; na receita
 *   prevista do exercício ele informa 1.000,01 para a natureza e o sistema grava 605,00 na 500 e 395,01 na 540 (conta à mão:
 *   605,00605 e 395,00395 truncados somam 1.000,00, e o centavo vai à 540); repetir o rateio é recusado; o contador, que
 *   consulta a receita e o planejamento sem cadastrar naturezas nem prever receita, lê as duas telas sem os formulários.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 npx tsx scripts/percurso-v36-fontes-da-natureza.mts
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
// O exercício da sessão: a tela adota o do contexto (2026 na base fictícia), não o que vier na URL.
const EXERCICIO = 2026;

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  await entrar(n, page, "admin@cg.pb.gov.br", senha);

  // A natureza: uma sem composição e sem previsão no exercício. A base fictícia prevê todas as que tem; quando não houver
  // livre, o percurso cadastra (pelo domínio, como o administrador) a de multas e juros do IPTU, código real do ementário
  // oficial da STN 2026 — nada inventado.
  const livre = { codigo: { startsWith: "1" }, composicoesDeFontes: { none: {} }, receitasPrevistas: { none: { exercicio: EXERCICIO } } };
  if ((await prisma.naturezaReceita.count({ where: livre })) === 0) {
    const ementario = lerEmentarioDaReceita(readFileSync("docs/oficial/stn-sof/ementario-2026/ementario-receita-tabela-de-codigos-2026.xlsx"));
    const candidatos = ["11125002", "11125003", "11125004"];
    const existentes = new Set((await prisma.naturezaReceita.findMany({ where: { codigo: { in: candidatos } }, select: { codigo: true } })).map((x) => x.codigo));
    const codigo = candidatos.find((c) => !existentes.has(c) && descricaoOficialDaNatureza(c, ementario) !== null);
    if (codigo === undefined) throw new Error("nenhum código candidato livre no ementário");
    await cadastrarNaturezaReceita(prisma, { codigo, descricao: descricaoOficialDaNatureza(codigo, ementario)!, criadoPor: "admin@cg.pb.gov.br" });
  }
  const natureza = await prisma.naturezaReceita.findFirst({ where: livre, orderBy: { codigo: "asc" }, select: { id: true, codigo: true } });
  if (natureza === null) throw new Error("a base não tem natureza livre para o percurso");

  // ── 1. a composição pela tela ──
  await irPara(n, page, "/receita/naturezas/fontes");
  const r1 = await preencherEEnviar(page, "form[data-form-composicao]", [
    { sel: 'input[name="natureza"]', valor: natureza.codigo },
    { sel: 'input[name="fundamento"]', valor: "Lei municipal fictícia de vinculação (percurso)" },
    { sel: 'input[name="fonte0"]', valor: "500" },
    { sel: 'input[name="percentual0"]', valor: "60,5" },
    { sel: 'input[name="fonte1"]', valor: "540" },
    { sel: 'input[name="percentual1"]', valor: "39,5" },
    { sel: 'input[name="residuo"]', valor: "540" },
  ]);
  const gravada = await prisma.composicaoDeFontesDaNatureza.findFirst({ where: { naturezaReceitaId: natureza.id }, select: { itens: { select: { percentual: true, fonte: { select: { codigo: true } } } }, fonteDoResiduo: { select: { codigo: true } } } });
  const itens = (gravada?.itens ?? []).map((i) => `${i.fonte.codigo}:${i.percentual.toFixed(1)}`).sort().join(" ");
  conferir(r1.tipo === "ok" && itens === "500:60.5 540:39.5" && gravada?.fonteDoResiduo.codigo === "540", `composição de ${natureza.codigo} gravada pela tela: ${itens} (${r1.texto.slice(0, 90)})`);

  await irPara(n, page, "/receita/naturezas/fontes");
  const linha = await page.$eval(`tr[data-composicao="${natureza.codigo}"]`, (e) => (e as HTMLElement).innerText.replace(/\s+/g, " ")).catch(() => "");
  conferir(/60,5%/.test(linha) && /39,5%/.test(linha) && /100%/.test(linha) && !/incompleta/.test(linha), `a lista mostra a composição com 100%: "${linha.slice(0, 160)}"`);

  // ── 2. a soma acima de 100 é recusada com o motivo ──
  const antes = await prisma.composicaoDeFontesDaNatureza.count();
  const r2 = await preencherEEnviar(page, "form[data-form-composicao]", [
    { sel: 'input[name="natureza"]', valor: natureza.codigo },
    { sel: 'input[name="fundamento"]', valor: "Tentativa que passa de cem (percurso)" },
    { sel: 'input[name="fonte0"]', valor: "500" },
    { sel: 'input[name="percentual0"]', valor: "70" },
    { sel: 'input[name="fonte1"]', valor: "540" },
    { sel: 'input[name="percentual1"]', valor: "40" },
    { sel: 'input[name="residuo"]', valor: "500" },
  ]);
  conferir(r2.tipo === "erro" && /110% e não pode passar de 100%/.test(r2.texto) && (await prisma.composicaoDeFontesDaNatureza.count()) === antes, `110% recusado com o motivo, nada gravado (${r2.texto.slice(0, 100)})`);

  // ── 3. a previsão rateada pela tela ──
  await irPara(n, page, `/planejamento/receita-prevista?exercicio=${String(EXERCICIO)}`);
  const r3 = await preencherEEnviar(page, "prever-por-rateio", [
    { sel: 'select[name="natureza"]', valor: natureza.codigo, tipo: "select" },
    { sel: '[data-mascara="valor"]', valor: "1.000,01" },
  ]);
  const previstas = await prisma.receitaPrevista.findMany({ where: { exercicio: EXERCICIO, naturezaReceitaId: natureza.id }, select: { valorPrevisto: true, fonte: { select: { codigo: true } } }, orderBy: { fonte: { codigo: "asc" } } });
  const valores = previstas.map((p) => `${p.fonte.codigo}:${p.valorPrevisto.toFixed(2)}`).join(" ");
  const lancamentos = await prisma.lancamentoContabil.count({ where: { origemTipo: "PREVISAO_DA_RECEITA", origemId: { in: (await prisma.receitaPrevista.findMany({ where: { exercicio: EXERCICIO, naturezaReceitaId: natureza.id }, select: { id: true } })).map((p) => p.id) } } });
  conferir(r3.tipo === "ok" && valores === "500:605.00 540:395.01" && lancamentos === 2, `1.000,01 rateado: ${valores}, ${String(lancamentos)} lançamentos no razão (${r3.texto.slice(0, 100)})`);

  await irPara(n, page, `/planejamento/receita-prevista?exercicio=${String(EXERCICIO)}`);
  const naLista = await page.$$eval(`tr[data-natureza="${natureza.codigo}"]`, (els) => els.map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ")));
  conferir(naLista.length === 2 && naLista.some((t) => /605,00/.test(t)) && naLista.some((t) => /395,01/.test(t)), `a lista da receita prevista mostra as duas linhas: ${naLista.join(" | ").slice(0, 160)}`);

  // ── 4. repetir é recusado inteiro ──
  const r4 = await preencherEEnviar(page, "prever-por-rateio", [
    { sel: 'select[name="natureza"]', valor: natureza.codigo, tipo: "select" },
    { sel: '[data-mascara="valor"]', valor: "50,00" },
  ]);
  const depois = await prisma.receitaPrevista.count({ where: { exercicio: EXERCICIO, naturezaReceitaId: natureza.id } });
  conferir(r4.tipo === "erro" && /já tem previsão da natureza/.test(r4.texto) && depois === 2, `o segundo rateio é recusado com o motivo e nada muda (${r4.texto.slice(0, 110)})`);

  // ── 5. quem só consulta lê, sem os formulários ──
  const outra = await (await nav.createBrowserContext()).newPage();
  outra.setDefaultTimeout(120000);
  await entrar(n, outra, "contador@ficticio.local", "Ficticio#2026");
  await outra.goto(`${n.base}/receita/naturezas/fontes`, { waitUntil: "domcontentloaded" });
  await outra.waitForSelector("[data-tabela-composicoes]");
  const leComposicao = (await outra.$(`tr[data-composicao="${natureza.codigo}"]`)) !== null;
  const semFormComposicao = (await outra.$("form[data-form-composicao]")) === null;
  await outra.goto(`${n.base}/planejamento/receita-prevista?exercicio=${String(EXERCICIO)}`, { waitUntil: "domcontentloaded" });
  await outra.waitForSelector('[data-lista="receita-prevista"]');
  const semFormRateio = (await outra.$('form[data-acao="prever-por-rateio"]')) === null;
  conferir(leComposicao && semFormComposicao && semFormRateio, "o contador lê a composição e a previsão, sem os formulários de registro e de rateio (a recusa no servidor está no teste do domínio)");
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso das fontes da natureza completo.");
