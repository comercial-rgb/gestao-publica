import "dotenv/config";
import { exigirDestinoDoPercurso } from "../destino-do-percurso.js";
import puppeteer, { type Page } from "puppeteer";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { criarM05Deps } from "../../modules/m05-despesa/adapter-prisma.js";
import { roteiroEmpenho } from "../../modules/m01-core-contabil/roteiros.js";
import { empenhar } from "../../modules/m05-despesa/servico.js";
import { meioDiaCivil } from "../../packages/datas/index.js";
import { preencherEEnviar, type CampoDoPercurso } from "../percursos-navegador.js";

/**
 * PERCURSO DE NAVEGADOR — V32: as áreas que a conferência achou sem tela, pela tela, com o efeito no banco.
 *
 * Uso: `DATABASE_URL=<clone gestao_publica_v28> SEED_ADMIN_SENHA=... npx tsx scripts/demonstracao/percurso-v32-areas.ts [base]`
 * (padrão http://localhost:3012). GRAVA. Recusa a 3010 e a 3011, e banco que não seja o clone `gestao_publica_v28`.
 *
 * Pela TELA: os roteiros de adiantamento, a concessão do suprimento, a prestação e a aprovação, o fechamento e a
 * reabertura do mês, a conferência e a implantação do balancete, a consulta pública de diárias e a presença dos
 * campos novos (precatório no empenho, justificativa no pagamento, dívida ativa e operação de crédito na guia).
 * PREPARAÇÃO por serviço, dita no passo: o empenho em nome do suprido (o percurso do empenho pela tela já existe).
 */

const BASE = process.argv[2] ?? "http://localhost:3012";
// V39-R2 (R2-003): o destino e a natureza da base (declarada no banco) conferidos ANTES de qualquer credencial ou escrita.
await exigirDestinoDoPercurso(BASE);
if (/:301[01]\b/.test(BASE)) throw new Error("Recusado: a 3010 é a apresentação e a 3011 é da outra linha; este percurso grava.");
const URL_BANCO = process.env["DATABASE_URL"] ?? "";
if (!/\/gestao_publica_v28(\?|$)/.test(URL_BANCO)) throw new Error("Recusado: o banco tem de ser o clone gestao_publica_v28.");
const SENHA = process.env["SEED_ADMIN_SENHA"] ?? "";
if (SENHA === "") throw new Error("SEED_ADMIN_SENHA ausente.");

const AUTOR = "admin@cg.pb.gov.br";
const SUPRIDO = "52998224725";
const CONTROLE_D = "7.9.1.2.1.00.00";
const CONTROLE_C = "8.9.1.2.1.01.00";
const prisma = criarPrismaClient(URL_BANCO);
const sufixo = String(Date.now()).slice(-6);

let passos = 0;
const falhas: string[] = [];
const naoExecutados: string[] = [];
function afirmar(cond: boolean, oque: string): void {
  passos++;
  console.log(`  ${cond ? "ok  " : "FALHA"} ${oque}`);
  if (!cond) falhas.push(oque);
}
const esperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const ir = async (p: Page, rota: string): Promise<string> => {
  await p.goto(`${BASE}${rota}`, { waitUntil: "networkidle0", timeout: 180000 });
  return p.evaluate(() => document.body.innerText);
};
const enviar = (p: Page, form: string, campos: readonly CampoDoPercurso[], resultado?: string) => preencherEEnviar(p, form, campos, resultado);

async function declararRoteiro(p: Page, movimento: string, debito: string, credito: string, historico: string): Promise<{ tipo: string; texto: string }> {
  await ir(p, "/contabilidade/roteiros-patrimoniais");
  return enviar(p, 'form[data-painel="declarar-roteiro-patrimonial"]', [
    { sel: 'select[name="movimento"]', valor: movimento, tipo: "select" },
    { sel: "contaDebitoCodigo", valor: debito, tipo: "referencia", busca: debito },
    { sel: "contaCreditoCodigo", valor: credito, tipo: "referencia", busca: credito },
    { sel: 'input[name="historicoPadrao"]', valor: historico },
    { sel: 'input[name="fundamento"]', valor: "Plano do Tribunal: controle de adiantamentos e suprimentos de fundos concedidos, a comprovar." },
  ], "declarar-roteiro-patrimonial");
}

async function main(): Promise<void> {
  const navegador = await puppeteer.launch({ headless: true, args: ["--lang=pt-BR"] });
  try {
    const p = await navegador.newPage();
    await p.evaluateOnNewDocument("globalThis.__name = (f) => f;");
    await p.setViewport({ width: 1440, height: 900 });

    console.log("1. entrada");
    await ir(p, "/login");
    await p.type('input[name="identificador"]', AUTOR);
    await p.type('input[name="senha"]', SENHA);
    await p.click('button[type="submit"]');
    await p.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 120000 }).catch(() => undefined);
    afirmar(!p.url().includes("/login"), "a sessão abriu");

    console.log("2. os roteiros do suprimento de fundos, pela tela de roteiros");
    const t2 = await ir(p, "/contabilidade/roteiros-patrimoniais");
    afirmar(/Roteiros de precatórios, convênios e adiantamentos/.test(t2) && /Concessão de suprimento de fundos/.test(t2), "a tela lista os movimentos de precatório, convênio e adiantamento");
    for (const [mov, d, c, h] of [
      ["ADIANTAMENTO|CONCESSAO/SUPRIMENTO_DE_FUNDOS", CONTROLE_D, CONTROLE_C, "Suprimento de fundos concedido"],
      ["ADIANTAMENTO|BAIXA/SUPRIMENTO_DE_FUNDOS", CONTROLE_C, CONTROLE_D, "Suprimento de fundos comprovado"],
    ] as const) {
      const ja = await prisma.roteiroPatrimonialDeclarado.count({ where: { familia: "ADIANTAMENTO", chave: mov.split("|")[1]! } });
      const r = await declararRoteiro(p, mov, d, c, h);
      afirmar(ja > 0 ? r.tipo === "erro" && /já é este/.test(r.texto) : r.tipo === "ok" && /versão 1/.test(r.texto), `${mov.split("|")[1]} declarado (${r.texto.slice(0, 70)})`);
    }
    const rRuim = await declararRoteiro(p, "ADIANTAMENTO|CONCESSAO/DIARIA", "1.1.1.1.1.01.00", CONTROLE_C, "Tentativa com conta patrimonial");
    afirmar(rRuim.tipo === "erro" && /não é do subsistema de controle/.test(rRuim.texto), `conta fora do controle recusada com o motivo (${rRuim.texto.slice(0, 80)})`);

    console.log("3. o suprimento de fundos (preparação por serviço: o empenho em nome do suprido)");
    const ficha = await prisma.fichaOrcamentaria.findFirst({ where: { exercicio: 2026, naturezaDespesa: { codigoCompleto: "339039" } }, orderBy: { numero: "asc" }, select: { id: true } });
    if (ficha === null) {
      naoExecutados.push("o clone não tem ficha 339039 de 2026");
    } else {
      const numeroEmpenho = `2026NE9${sufixo}`;
      await empenhar(
        { fichaId: ficha.id, numero: numeroEmpenho, tipo: "ESTIMATIVO", valor: "800.00", data: meioDiaCivil("2026-09-01"), credorCpfCnpj: SUPRIDO, historico: "Suprimento de fundos do percurso", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: AUTOR },
        roteiroEmpenho(),
        criarM05Deps(prisma)
      );
      const numero = `SUP-${sufixo}`;
      const t3 = await ir(p, "/despesa/adiantamentos");
      afirmar(/Diárias e suprimento de fundos/.test(t3), "a tela de diárias e suprimento abre");
      const r3 = await enviar(p, 'form[data-painel="conceder-adiantamento"]', [
        { sel: 'select[name="especie"]', valor: "SUPRIMENTO_DE_FUNDOS", tipo: "select" },
        { sel: 'input[name="numero"]', valor: numero },
        { sel: "empenhoId", valor: "", tipo: "referencia", busca: numeroEmpenho },
        { sel: 'input[name="beneficiarioNome"]', valor: "Servidora do percurso" },
        { sel: 'input[name="beneficiarioDocumento"]', valor: SUPRIDO },
        { sel: 'input[name="finalidade"]', valor: "Pequenas despesas de pronto pagamento da secretaria" },
        { sel: 'input[name="diaInicio"]', valor: "2026-09-02", tipo: "data" },
        { sel: 'input[name="diaFim"]', valor: "2026-09-30", tipo: "data" },
        { sel: 'input[inputmode="decimal"]', valor: "500,00" },
        { sel: 'input[name="atoAutorizativo"]', valor: "Decreto Municipal 50/2026" },
        { sel: 'input[name="diaPrazoDePrestacao"]', valor: "2026-10-30", tipo: "data" },
        { sel: 'input[name="diaConcessao"]', valor: "2026-09-02", tipo: "data" },
      ], "conceder-adiantamento");
      afirmar(r3.tipo === "ok" && /concedido/.test(r3.texto), `suprimento concedido pela tela (${r3.texto.slice(0, 90)})`);
      const conc = await prisma.concessaoDeAdiantamento.findFirst({ where: { numero }, select: { id: true, valor: true, lancamentoId: true } });
      afirmar(conc?.valor.toFixed(2) === "500.00", "a concessão está gravada com 500,00");
      const pernas = conc === null ? [] : await prisma.partidaContabil.findMany({ where: { lancamentoId: conc.lancamentoId }, select: { tipo: true, conta: { select: { codigo: true } } } });
      afirmar(pernas.some((x) => x.tipo === "DEBITO" && x.conta.codigo === CONTROLE_D) && pernas.some((x) => x.tipo === "CREDITO" && x.conta.codigo === CONTROLE_C), "o controle da responsabilidade foi lançado (D 7.9.1.2.1 / C 8.9.1.2.1.01)");

      console.log("4. a prestação de contas e a aprovação");
      await ir(p, "/despesa/adiantamentos");
      const r4 = await enviar(p, `form[data-acao="registrar-prestacao"][data-concessao="${numero}"]`, [
        { sel: 'input[inputmode="decimal"]', valor: "450,00", indice: 0 },
        { sel: 'input[inputmode="decimal"]', valor: "50,00", indice: 1 },
        { sel: 'input[name="relatorio"]', valor: "Notas fiscais de pronto pagamento e guia de devolução do saldo." },
        { sel: 'input[name="diaApresentacao"]', valor: "2026-10-05", tipo: "data" },
      ], "registrar-prestacao");
      const prest = conc === null ? null : await prisma.prestacaoDeContasDoAdiantamento.findFirst({ where: { concessaoId: conc.id }, select: { id: true, valorComprovado: true, valorDevolvido: true } });
      afirmar(prest?.valorComprovado.toFixed(2) === "450.00" && prest.valorDevolvido.toFixed(2) === "50.00", `prestação registrada: comprovado 450,00 e devolvido 50,00 (${r4.texto.slice(0, 60)})`);
      await ir(p, "/despesa/adiantamentos");
      await enviar(p, `form[data-acao="decidir-prestacao"][data-concessao="${numero}"]`, [
        { sel: 'select[name="decisao"]', valor: "aprovar", tipo: "select" },
        { sel: 'input[name="diaDecisao"]', valor: "2026-10-06", tipo: "data" },
        { sel: 'input[name="motivo"]', valor: "Notas conferidas e devolução comprovada." },
      ], "decidir-prestacao");
      const dec = prest === null ? null : await prisma.decisaoDaPrestacaoDoAdiantamento.findUnique({ where: { prestacaoId: prest.id }, select: { aprovada: true, lancamentoId: true } });
      afirmar(dec?.aprovada === true && dec.lancamentoId !== null, "a aprovação está gravada, com o lançamento que baixa o controle");
      const t4 = await ir(p, "/despesa/adiantamentos");
      afirmar(new RegExp(`Suprimento ${numero}[\\s\\S]*Comprovada`).test(t4), "a tela mostra o suprimento como comprovado");
    }

    console.log("5. o fechamento do mês: conferir, fechar e reabrir");
    const t5 = await ir(p, "/contabilidade/fechamento-mensal?exercicio=2026&mes=2026-01");
    afirmar(/Fechamento mensal/.test(t5) && /Conferência de janeiro de 2026/.test(t5) && /Balancete fecha/.test(t5), "a tela mostra os meses e a conferência de janeiro");
    const situacaoJan = await p.$eval('tr[data-competencia="2026-01"] [data-papel="situacao"]', (e) => e.getAttribute("data-situacao"));
    if (situacaoJan !== "ABERTO") {
      naoExecutados.push(`janeiro de 2026 já estava ${situacaoJan ?? "?"} no clone; o fechamento não foi repetido`);
    } else {
      const antes = await prisma.movimentoTravamento.count();
      await enviar(p, 'form[data-acao="fechar-mes"][data-competencia="2026-01"]', [], "fechar-mes");
      await esperar(1500);
      const trava = await prisma.movimentoTravamento.findFirst({ orderBy: { criadoEm: "desc" }, select: { tipo: true, criadoPor: true } });
      afirmar((await prisma.movimentoTravamento.count()) === antes + 1 && trava?.tipo === "TRAVAR", "janeiro foi fechado (evento de trava gravado)");
      await ir(p, "/contabilidade/fechamento-mensal?exercicio=2026");
      afirmar((await p.$eval('tr[data-competencia="2026-01"] [data-papel="situacao"]', (e) => e.getAttribute("data-situacao"))) === "FECHADO", "a tela mostra janeiro fechado");
      await enviar(p, 'form[data-acao="reabrir-mes"][data-competencia="2026-01"]', [
        { sel: 'input[name="motivo"]', valor: "Reabertura do percurso para devolver o clone como estava." },
      ], "reabrir-mes");
      await esperar(1500);
      const reab = await prisma.movimentoTravamento.findFirst({ orderBy: { criadoEm: "desc" }, select: { tipo: true, motivo: true } });
      afirmar(reab?.tipo === "DESTRAVAR" && /Reabertura do percurso/.test(reab.motivo ?? ""), "a reabertura foi gravada com o motivo");
      await ir(p, "/contabilidade/fechamento-mensal?exercicio=2026");
      afirmar((await p.$eval('tr[data-competencia="2026-01"] [data-papel="situacao"]', (e) => e.getAttribute("data-situacao"))) === "ABERTO", "a tela mostra janeiro aberto de novo");
    }

    console.log("6. a implantação de saldos: o balancete que não fecha é recusado; o que fecha, implantado");
    await ir(p, "/contabilidade/implantacao-de-saldos");
    const F6 = 'form[data-painel="implantar-saldos"]';
    const colar = async (texto: string): Promise<void> => {
      await p.$eval(`${F6} textarea[name="balancete"]`, (e, v) => {
        const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
        set.call(e, v);
        e.dispatchEvent(new Event("input", { bubbles: true }));
      }, texto);
    };
    await colar("1.1.1.1.1.01.00;1.000,00;\n2.3.7.1.1.01.00;;999,99");
    await p.$eval(`${F6} button[value="conferir"]`, (b) => (b as HTMLButtonElement).click());
    await p.waitForSelector('[data-resultado-da-acao="conferir-balancete"]', { timeout: 60000 });
    const prev = await p.$eval('[data-resultado-da-acao="conferir-balancete"]', (e) => [e.getAttribute("data-pode-implantar"), e.textContent ?? ""] as const);
    afirmar(prev[0] === "nao" && /patrimonial não fecha[\s\S]*diferença 0\.01/.test(prev[1]), "a prévia acusa a diferença de 0,01 no patrimonial");
    afirmar(await p.$eval(`${F6} button[value="implantar"]`, (b) => (b as HTMLButtonElement).disabled), "o botão de implantar fica desabilitado");
    const jaImplantado = (await prisma.lancamentoContabil.count({ where: { origemTipo: "IMPLANTACAO_DE_SALDOS" } })) > 0;
    await colar("1.1.1.1.1.01.00;1.000,00;\n2.3.7.1.1.01.00;;1.000,00");
    await p.$eval(`${F6} input[name="dia"]`, (e) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(e, "2027-01-01");
      e.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await p.$eval(`${F6} button[value="conferir"]`, (b) => (b as HTMLButtonElement).click());
    await p.waitForFunction(() => document.querySelector('[data-resultado-da-acao="conferir-balancete"]')?.getAttribute("data-pode-implantar") === "sim", { timeout: 60000 });
    await p.waitForSelector(`${F6} input[name="__chave"][data-chave-de-comando="pronta"]`, { timeout: 30000 });
    await p.$eval(`${F6} button[value="implantar"]`, (b) => (b as HTMLButtonElement).click());
    await p.waitForSelector('[data-resultado-da-acao="implantar-saldos"]', { timeout: 60000 });
    const r6 = await p.$eval('[data-resultado-da-acao="implantar-saldos"]', (e) => e.textContent ?? "");
    afirmar(jaImplantado ? /já estava implantado|já tem saldos implantados/.test(r6) : /Saldos iniciais implantados: 2 contas/.test(r6), `implantação pela tela (${r6.slice(0, 80)})`);
    afirmar((await prisma.lancamentoContabil.count({ where: { origemTipo: "IMPLANTACAO_DE_SALDOS" } })) === 1, "há um único lançamento de implantação");

    console.log("7. a consulta pública de diárias, sem sessão");
    const anon = await navegador.createBrowserContext();
    const pa = await anon.newPage();
    await pa.goto(`${BASE}/transparencia/diarias?exercicio=2026`, { waitUntil: "networkidle0", timeout: 180000 });
    const t7 = await pa.evaluate(() => document.body.innerText);
    afirmar(/Diárias/.test(t7) && !/login/i.test(pa.url()), "a consulta pública de diárias abre sem conta");
    await pa.goto(`${BASE}/transparencia`, { waitUntil: "networkidle0", timeout: 180000 });
    afirmar((await pa.$('a[data-familia-publica="/transparencia/diarias"]')) !== null, "o portal anuncia a consulta de diárias");
    await anon.close();

    console.log("8. os campos novos nas telas de sempre");
    await ir(p, "/despesa/empenhos");
    // textContent, e não innerText: o formulário fica num bloco recolhido até a pessoa abri-lo.
    afirmar(await p.evaluate(() => document.querySelector('[data-vinculacoes]')?.textContent?.includes("Precatório") === true), "o empenho oferece o vínculo com o precatório");
    await ir(p, "/despesa/pagamentos");
    afirmar((await p.$('[data-painel="precatorio-fora-da-ordem"]')) !== null, "o pagamento oferece a justificativa da ordem do precatório");
    await ir(p, "/receita/arrecadacoes");
    const t8c = await p.evaluate(() => document.body.textContent ?? "");
    afirmar(/Dívida ativa que esta guia recebe/.test(t8c) && /Operação de crédito que esta guia ingressa/.test(t8c), "a guia oferece receber dívida ativa e ingressar operação de crédito");
  } finally {
    await navegador.close();
    await prisma.$disconnect();
  }
  console.log(`\n${String(passos)} passos · ${String(falhas.length)} falha(s) · ${String(naoExecutados.length)} não executado(s)`);
  for (const f of falhas) console.log(`  FALHA: ${f}`);
  for (const n of naoExecutados) console.log(`  NÃO EXECUTADO: ${n}`);
  if (falhas.length > 0) process.exitCode = 1;
}

await main();
