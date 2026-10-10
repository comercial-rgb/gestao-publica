import "dotenv/config";
import { exigirDestinoDoPercurso } from "../destino-do-percurso.js";
import puppeteer, { type Page } from "puppeteer";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { reconhecerReceita } from "../../modules/m04-receita/reconhecimento.js";
import { registrarMovimentacao } from "../../modules/m32-pessoal/servico.js";
import { abrirFolha, calcularFolha, fecharFolha } from "../../modules/m33-folha/servico.js";
import { apropriarFolha } from "../../modules/m33-folha/apropriacao.js";
import { certificarFolha, liquidarFolha } from "../../modules/m33-folha/certificacao.js";
import { meioDiaCivil } from "../../packages/datas/index.js";
import { preencherEEnviar, type CampoDoPercurso } from "../percursos-navegador.js";

/**
 * PERCURSO DE NAVEGADOR — V28: as cadeias que a V28 fechou, pela tela, com o efeito conferido no banco.
 *
 * Uso: `DATABASE_URL=<clone gestao_publica_v28> SEED_ADMIN_SENHA=... npx tsx scripts/demonstracao/percurso-v28-cadeias.ts [base]`
 * (padrão http://localhost:3012). GRAVA. Recusa a 3010 (apresentação) e a 3011 (a outra linha de trabalho), e
 * recusa banco que não seja um clone `gestao_publica_v28`.
 *
 * O que entra pela TELA: as declarações da contabilidade (conta da liquidação, VPA da receita, conta do INSS,
 * desconto retido), as guias de arrecadação, o pagamento da folha, a apropriação do custo e o parâmetro de
 * depreciação. O que é PREPARAÇÃO por serviço (e está dito em cada passo): o crédito do IPTU reconhecido e o seu
 * roteiro, a folha de setembro até a liquidação (o percurso da folha pela tela já existe) e o centro de custo do
 * vínculo. O banco é LIDO para conferir o efeito, nunca para decidir o caminho.
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
const ATESTADOR = "atestador@percursos.local";
const LIQUIDANTE = "liquidante@percursos.local";
const D = (dia: string): Date => meioDiaCivil(dia);
const prisma = criarPrismaClient(URL_BANCO);

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
async function digitar(p: Page, alvo: string, valor: string): Promise<void> {
  await p.waitForSelector(alvo, { timeout: 20000 });
  await p.$eval(alvo, (e) => {
    (e as HTMLInputElement).value = "";
    (e as HTMLElement).scrollIntoView({ block: "center" });
  });
  await p.focus(alvo);
  await p.keyboard.type(valor, { delay: 5 });
}
async function data(p: Page, alvo: string, valor: string): Promise<void> {
  await p.$eval(alvo, (e, v) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(e, v);
    e.dispatchEvent(new Event("input", { bubbles: true }));
    e.dispatchEvent(new Event("change", { bubbles: true }));
  }, valor);
}
const enviar = (p: Page, form: string, campos: readonly CampoDoPercurso[], resultado?: string) => preencherEEnviar(p, form, campos, resultado);

// ── o pagamento, pelos mesmos passos do percurso das retenções próprias ──
const FPG = 'form[data-acao="pagar"]';
async function prepararPagamento(p: Page, achar: (valor: string, texto: string) => boolean, numero: string, valor: string, dia: string, historico: string): Promise<boolean> {
  await ir(p, "/despesa/pagamentos");
  const opcoes = await p.$eval(`${FPG} select[name="liquidacaoId"]`, (s) => Array.from((s as HTMLSelectElement).options).map((o) => [o.value, o.textContent ?? ""] as const));
  const alvo = opcoes.find(([v, t]) => v !== "" && achar(v, t));
  if (alvo === undefined) return false;
  await p.select(`${FPG} select[name="liquidacaoId"]`, alvo[0]);
  await digitar(p, `${FPG} input[name="numero"]`, numero);
  await digitar(p, `${FPG} input[inputmode="decimal"]`, valor);
  await data(p, `${FPG} input[name="data"]`, dia);
  const contaBanco = await p.$eval(`${FPG} select[name="contaBancaria"]`, (s) => Array.from((s as HTMLSelectElement).options).find((o) => o.value !== "")?.value ?? "");
  await p.select(`${FPG} select[name="contaBancaria"]`, contaBanco);
  await digitar(p, `${FPG} input[name="historico"]`, historico);
  if ((await p.$(`${FPG} select[name="hipotese"]`)) !== null) {
    await p.select(`${FPG} select[name="hipotese"]`, "V_ATIVIDADE_FINALISTICA");
    await digitar(p, `${FPG} input[name="autorizadoPor"]`, "Secretario de Financas");
    await digitar(p, `${FPG} textarea[name="justificativa"]`, "Servico essencial do municipio, sem o qual o atendimento para");
  }
  return true;
}
async function pagarAgora(p: Page): Promise<{ tipo: string; texto: string }> {
  await p.waitForSelector(`${FPG} input[name="__chave"][data-chave-de-comando="pronta"]`, { timeout: 30000 });
  await p.$eval(`${FPG} button[type="submit"]`, (b) => (b as HTMLButtonElement).click());
  await esperar(8000);
  return p.evaluate((sel) => {
    const f = document.querySelector(sel);
    const erro = f?.querySelector(':scope > p[role="alert"]');
    if (erro !== null && erro !== undefined) return { tipo: "erro", texto: (erro.textContent ?? "").trim() };
    const ok = Array.from(f?.querySelectorAll(":scope > p") ?? []).find((x) => /status-ok/.test(x.className));
    return ok === undefined ? { tipo: "silencio", texto: "" } : { tipo: "ok", texto: (ok.textContent ?? "").trim() };
  }, FPG);
}

/** A guia pela tela: natureza, fonte, conta, valor, data, número e, opcionalmente, o crédito lançado que ela quita. */
async function registrarGuia(p: Page, g: { natureza: string; valor: string; numero: string; credito?: string }): Promise<{ tipo: string; texto: string }> {
  await ir(p, "/receita/arrecadacoes");
  const F = 'form[data-acao="registrar-guia"]';
  const conta = await p.$eval(`${F} select[name="contaBancaria"]`, (s) => Array.from((s as HTMLSelectElement).options).find((o) => o.value !== "" && !o.disabled)?.value ?? "");
  const campos: CampoDoPercurso[] = [
    { sel: 'input[name="natureza"]', valor: g.natureza },
    { sel: 'input[name="fonte"]', valor: "500" },
    { sel: 'select[name="contaBancaria"]', valor: conta, tipo: "select" },
    { sel: 'input[inputmode="decimal"]', valor: g.valor },
    { sel: 'input[name="data"]', valor: "2026-09-30", tipo: "data" },
    { sel: 'input[name="numeroReceita"]', valor: g.numero },
    ...(g.credito !== undefined ? [{ sel: "reconhecimentoId", valor: g.credito, tipo: "referencia" as const, busca: "IPTU percurso" }] : []),
  ];
  return enviar(p, F, campos);
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

    console.log("2. a conta da liquidação de um elemento sem regra (52, equipamentos)");
    const jaDeclarado = (await prisma.contaDaLiquidacaoPorElemento.count({ where: { elemento: "52" } })) > 0;
    const t2 = await ir(p, "/contabilidade/contas-da-liquidacao");
    afirmar(/Contas da liquidação por elemento/.test(t2) && /Regra fixa/.test(t2), "a tela abre e mostra os elementos de regra fixa");
    const r2 = await enviar(p, 'form[data-painel="declarar-conta-da-liquidacao"]', [
      { sel: 'input[name="elemento"]', valor: "52" },
      { sel: 'select[name="efeito"]', valor: "IMOBILIZADO", tipo: "select" },
      { sel: "contaCodigo", valor: "1.2.3.1.1.01.99", tipo: "referencia", busca: "1.2.3.1.1.01.99" },
      { sel: 'input[name="fundamento"]', valor: "MCASP, Parte II: equipamento adquirido é incorporado ao imobilizado na liquidação." },
    ], "declarar-conta-da-liquidacao");
    afirmar(jaDeclarado ? r2.tipo === "erro" && /não é um fato novo/.test(r2.texto) : r2.tipo === "ok" && /versão 1/.test(r2.texto), `declarado na tela (${r2.texto.slice(0, 90)})`);
    const d52 = await prisma.contaDaLiquidacaoPorElemento.findFirst({ where: { elemento: "52" }, select: { contaCodigo: true, efeito: true } });
    afirmar(d52?.contaCodigo === "1.2.3.1.1.01.99" && d52.efeito === "IMOBILIZADO", "a declaração está gravada com a conta e o efeito");
    await ir(p, "/contabilidade/contas-da-liquidacao");
    const r2b = await enviar(p, 'form[data-painel="declarar-conta-da-liquidacao"]', [
      { sel: 'input[name="elemento"]', valor: "39" },
      { sel: 'select[name="efeito"]', valor: "VPD", tipo: "select" },
      { sel: "contaCodigo", valor: "", tipo: "referencia", busca: "3.3" },
      { sel: 'input[name="fundamento"]', valor: "Tentativa de sobrepor a regra fixa do elemento 39 pela tela." },
    ], "declarar-conta-da-liquidacao");
    afirmar(r2b.tipo === "erro" && /regra fixa/.test(r2b.texto), `elemento de regra fixa recusado com o motivo (${r2b.texto.slice(0, 80)})`);
    afirmar((await prisma.contaDaLiquidacaoPorElemento.count({ where: { elemento: "39" } })) === 0, "e nada foi gravado na recusa");

    console.log("3. a VPA da receita por natureza");
    const t3 = await ir(p, "/contabilidade/contas-da-receita");
    afirmar(/11180111/.test(t3) && /4\.1\.1\.2\.1\.02\.00/.test(t3), "a tela mostra o IPTU com a VPA do IPTU");
    const r3 = await enviar(p, 'form[data-acao="declarar-conta-da-receita"]', [
      { sel: 'input[name="naturezaPrefixo"]', valor: "11180111" },
      { sel: "contaVpaCodigo", valor: "4.1.1.2.1.02.00", tipo: "referencia", busca: "4.1.1.2.1.02" },
      { sel: 'input[name="fundamento"]', valor: "Confirmação pela contabilidade: o IPTU credita a VPA do IPTU no plano." },
    ]);
    afirmar(r3.tipo === "erro" && /já creditam 4\.1\.1\.2\.1\.02\.00/.test(r3.texto), `redeclarar a mesma conta é recusado com o motivo (${r3.texto.slice(0, 80)})`);

    console.log("4. a guia de IPTU pela tela credita a VPA do IPTU, não a do ITR");
    const numeroIptu = `2026PV28${String(Date.now()).slice(-5)}`;
    const r4 = await registrarGuia(p, { natureza: "11180111", valor: "150,00", numero: numeroIptu });
    afirmar(r4.tipo === "ok", `guia registrada (${r4.texto.slice(0, 80)})`);
    const g4 = await prisma.receitaArrecadada.findFirst({ where: { numeroReceita: numeroIptu }, select: { lancamento: { select: { partidas: { where: { tipo: "CREDITO", subsistema: "PATRIMONIAL" }, select: { conta: { select: { codigo: true } } } } } } } });
    afirmar(g4?.lancamento.partidas.map((x) => x.conta.codigo).join(",") === "4.1.1.2.1.02.00", `a perna patrimonial credita ${g4?.lancamento.partidas.map((x) => x.conta.codigo).join(",") ?? "?"}`);

    console.log("5. a guia que quita um crédito de IPTU já lançado (preparação: roteiro e crédito por serviço)");
    const cr = await prisma.contaPcasp.findUnique({ where: { codigo: "1.1.2.1.1.01.05" }, select: { id: true } });
    const vpaIptu = await prisma.contaPcasp.findUnique({ where: { codigo: "4.1.1.2.1.02.00" }, select: { id: true } });
    if (cr === null || vpaIptu === null) naoExecutados.push("contas do crédito/VPA do IPTU ausentes no plano do clone");
    else {
      if ((await prisma.roteiroReconhecimento.findUnique({ where: { origem: "IMPOSTOS_TAXAS_CONTRIBUICOES_DE_MELHORIA" } })) === null) {
        await prisma.roteiroReconhecimento.create({ data: { origem: "IMPOSTOS_TAXAS_CONTRIBUICOES_DE_MELHORIA", contaCreditoAReceberId: cr.id, contaVpaId: vpaIptu.id, criadoPor: AUTOR } });
      }
      const fonte = await prisma.fonteRecurso.findUniqueOrThrow({ where: { codigo: "500" }, select: { id: true } });
      const rec = await reconhecerReceita(prisma, { naturezaCodigo: "11180111", fonteId: fonte.id, dataFatoGerador: D("2026-09-01"), valor: "500.00", historico: `IPTU percurso ${String(Date.now()).slice(-5)}`, criadoPor: AUTOR });
      const vpaAntes = await prisma.partidaContabil.count({ where: { conta: { codigo: "4.1.1.2.1.02.00" } } });
      const numero = `2026PQ28${String(Date.now()).slice(-5)}`;
      const r5 = await registrarGuia(p, { natureza: "11180111", valor: "200,00", numero, credito: rec.reconhecimentoId });
      afirmar(r5.tipo === "ok" && /quitando o crédito/.test(r5.texto), `guia quitando o crédito registrada (${r5.texto.slice(0, 90)})`);
      const v = await prisma.vinculoArrecadacaoReconhecimento.findFirst({ where: { reconhecimentoId: rec.reconhecimentoId }, select: { valor: true } });
      afirmar(v?.valor.toFixed(2) === "200.00", "o vínculo guia → crédito tem 200,00");
      const vpaDepois = await prisma.partidaContabil.count({ where: { conta: { codigo: "4.1.1.2.1.02.00" } } });
      afirmar(vpaDepois === vpaAntes, "a guia NÃO lançou VPA de novo (a receita nasceu no lançamento do crédito)");
    }

    console.log("6. a folha de setembro (preparação por serviço até a liquidação)");
    let folhaId = (await prisma.folhaDePagamento.findUnique({ where: { competencia_tipo: { competencia: "2026-09", tipo: "MENSAL" } }, select: { id: true } }))?.id ?? "";
    if (folhaId === "") {
      folhaId = (await abrirFolha(prisma, { competencia: "2026-09", tipo: "MENSAL", criadoPor: AUTOR })).folhaId;
      await calcularFolha(prisma, { folhaId, motivo: "folha de setembro do percurso V28", criadoPor: AUTOR });
      await fecharFolha(prisma, { folhaId, criadoPor: AUTOR });
      await apropriarFolha(prisma, { folhaId, dataDoEmpenho: D("2026-09-30"), criadoPor: AUTOR });
      await certificarFolha(prisma, { folhaId, data: D("2026-09-30"), criadoPor: ATESTADOR });
      await liquidarFolha(prisma, { folhaId, data: D("2026-09-30"), criadoPor: LIQUIDANTE });
    }
    const calculoDoFechamento = (await prisma.fechamentoDaFolha.findUniqueOrThrow({ where: { folhaId }, select: { calculoId: true } })).calculoId;
    const contracheque = await prisma.contracheque.findFirstOrThrow({
      where: { calculoId: calculoDoFechamento, vinculo: { matricula: "DEMO-0001" } },
      select: { id: true, totalProventos: true, linhas: { where: { rubrica: { codigo: "PREV" } }, select: { valor: true } } },
    });
    const prev = contracheque.linhas[0]?.valor.toFixed(2) ?? "0.00";
    const bruto = contracheque.totalProventos.toFixed(2);
    console.log(`    DEMO-0001: bruto ${bruto}, contribuição ${prev}`);
    const brutoBr = bruto.replace(".", ",");
    // ⚠️ PELO ID, E NÃO PELO VALOR: agosto e setembro da mesma matrícula valem o mesmo bruto, e escolher pelo texto
    // da lista pagou agosto na primeira corrida deste percurso.
    const liqSetembro = await prisma.liquidacaoDaFolha.findFirstOrThrow({ where: { empenhoDaFolha: { vinculo: { matricula: "DEMO-0001" }, apropriacao: { folhaId } } }, select: { liquidacaoId: true } });
    const achar = (valor: string): boolean => valor === liqSetembro.liquidacaoId;

    console.log("7. pagar a folha sem a retenção declarada é recusado nomeando o desconto");
    if (!(await prepararPagamento(p, achar, "9028001", brutoBr, "2026-09-30", "Folha de setembro - DEMO-0001"))) naoExecutados.push("a liquidação de setembro da DEMO-0001 não está na fila de pagamento");
    else {
      const r7 = await pagarAgora(p);
      afirmar(r7.tipo === "erro" && /PREV/.test(r7.texto) && /não têm consignação declarada/.test(r7.texto), `recusado com o motivo (${r7.texto.slice(0, 110)})`);
    }

    console.log("8. a contabilidade troca a conta sintética do INSS pela analítica (tela de consignações)");
    const inss = await prisma.tipoConsignacao.findUniqueOrThrow({ where: { codigo: "INSS" }, select: { id: true } });
    await ir(p, "/financeiro/consignacoes");
    // O formulário de troca só aparece depois do clique em "Trocar a conta" na linha do tipo.
    const abriu = await p.evaluate(() => {
      const linha = document.querySelector('tr[data-teste="consignacao-INSS"]');
      const botao = Array.from(linha?.querySelectorAll("button") ?? []).find((b) => (b.textContent ?? "").trim() === "Trocar a conta");
      if (!(botao instanceof HTMLButtonElement)) return false;
      botao.click();
      return true;
    });
    afirmar(abriu, "o ato de trocar a conta abre na linha do INSS");
    await esperar(800);
    const FR = `form[data-acao="redefinir-consignacao"]:has(input[name="tipoId"][value="${inss.id}"])`;
    const r8 = await enviar(p, FR, [
      { sel: 'select[name="contaPassivoCodigo"]', valor: "2.1.8.8.1.01.02", tipo: "select" },
      { sel: 'input[name="fundamento"]', valor: "PCASP do TCE-PB 2025: 2.1.8.8.1.01.02 Contribuição ao RGPS; a 2.1.8.8.1.01.00 é sintética." },
    ], "redefinir-consignacao");
    afirmar(r8.tipo === "ok", `conta do INSS trocada (${r8.texto.slice(0, 80)})`);

    console.log("9. a contabilidade declara a retenção da contribuição do servidor (tela nova)");
    const t9 = await ir(p, "/folha/descontos-retidos");
    afirmar(/PREV/.test(t9) && /Não declarada/.test(t9) && /Não é consignação/.test(t9), "a tela mostra a PREV sem retenção e o IR fora da consignação");
    const prevId = (await prisma.rubrica.findUniqueOrThrow({ where: { codigo: "PREV" }, select: { id: true } })).id;
    const r9 = await enviar(p, `form[data-acao="declarar-desconto-retido"][data-rubrica="${prevId}"]`, [
      { sel: 'select[name="tipoConsignacaoId"]', valor: inss.id, tipo: "select" },
      { sel: 'input[name="credorConsignatario"]', valor: "Instituto Nacional do Seguro Social - INSS" },
      { sel: 'input[name="fundamento"]', valor: "Contribuição do segurado ao RGPS, retida pelo ente e recolhida ao INSS (Lei 8.212/1991, art. 30)." },
    ], "declarar-desconto-retido");
    afirmar(r9.tipo === "ok" && /versão 1/.test(r9.texto), `retenção declarada (${r9.texto.slice(0, 80)})`);

    console.log("10. pagar a folha: o servidor recebe o líquido, a contribuição vira dívida com o INSS");
    if (!(await prepararPagamento(p, achar, "9028002", brutoBr, "2026-09-30", "Folha de setembro - DEMO-0001"))) naoExecutados.push("a liquidação de setembro da DEMO-0001 sumiu da fila");
    else {
      const r10 = await pagarAgora(p);
      afirmar(r10.tipo === "ok", `folha paga (${r10.texto.slice(0, 90)})`);
      const elo = await prisma.descontoDoContrachequeRetido.findFirst({ where: { contrachequeId: contracheque.id }, select: { valor: true, pagamentoId: true } });
      afirmar(elo?.valor.toFixed(2) === prev, `o desconto retido é o do contracheque (${elo?.valor.toFixed(2) ?? "?"} = ${prev})`);
      const mov = await prisma.movimentoExtraorcamentario.findFirst({ where: { pagamentoId: elo?.pagamentoId ?? "", tipoConsignacao: { codigo: "INSS" } }, select: { valor: true } });
      afirmar(mov?.valor.toFixed(2) === prev, `a dívida com o INSS nasceu no extraorçamentário (${mov?.valor.toFixed(2) ?? "?"})`);
    }

    console.log("11. o custo da folha por centro: sem centro recusa nomeando a matrícula; com centro apropria");
    const liqA = await prisma.liquidacaoDaFolha.findFirstOrThrow({ where: { empenhoDaFolha: { vinculo: { matricula: "DEMO-0001" }, apropriacao: { folhaId } } }, select: { liquidacaoId: true } });
    await ir(p, "/contabilidade/custos?exercicio=2026");
    const r11 = await enviar(p, 'form[data-acao="apropriar-custo-da-folha"]', [{ sel: 'select[name="liquidacaoId"]', valor: liqA.liquidacaoId, tipo: "select" }]);
    afirmar(r11.tipo === "erro" && /DEMO-0001/.test(r11.texto) && /centro de custo/.test(r11.texto), `recusado nomeando a matrícula (${r11.texto.slice(0, 100)})`);
    const vinculo = await prisma.vinculo.findUniqueOrThrow({ where: { matricula: "DEMO-0001" }, select: { id: true } });
    const gab = await prisma.setor.findFirstOrThrow({ where: { codigo: "GAB" }, select: { id: true } });
    console.log("    (preparação por serviço: o centro de custo do vínculo, desde agosto)");
    await registrarMovimentacao(prisma, { vinculoId: vinculo.id, tipo: "MUDANCA_CENTRO_DE_CUSTO", data: D("2026-08-01"), motivo: "apropriação do custo no gabinete", centroDeCustoId: gab.id, criadoPor: AUTOR });
    await ir(p, "/contabilidade/custos?exercicio=2026");
    const r11b = await enviar(p, 'form[data-acao="apropriar-custo-da-folha"]', [{ sel: 'select[name="liquidacaoId"]', valor: liqA.liquidacaoId, tipo: "select" }]);
    afirmar(r11b.tipo === "ok", `custo apropriado (${r11b.texto.slice(0, 90)})`);
    const item = await prisma.itemDaApropriacaoDeCusto.findFirst({ where: { apropriacao: { liquidacaoId: liqA.liquidacaoId } }, select: { centroId: true, valor: true } });
    afirmar(item?.centroId === gab.id && item.valor.toFixed(2) === bruto, `o centro do gabinete recebeu ${item?.valor.toFixed(2) ?? "?"} (bruto ${bruto})`);

    console.log("12. o residual da depreciação com casa decimal");
    const classe = await prisma.classeDeBens.findFirst({ where: { codigo: "1.2.3.1.1.01" }, select: { id: true } });
    if (classe === null) naoExecutados.push("a classe de bens móveis da demonstração não existe no clone");
    else {
      await ir(p, "/patrimonio/parametros-de-atualizacao");
      const r12 = await enviar(p, "criar-parametros-de-atualizacao", [
        { sel: 'select[name="classeDeBensId"]', valor: classe.id, tipo: "select" },
        { sel: 'select[name="metodo"]', valor: "DEPRECIACAO", tipo: "select" },
        { sel: 'input[name="vidaUtilMeses"]', valor: "120" },
        { sel: 'input[name="percentualResidual"]', valor: "12,5" },
        { sel: 'input[name="motivo"]', valor: "Laudo da comissão: residual de doze e meio por cento." },
      ]);
      afirmar(r12.tipo === "ok" || r12.tipo === "silencio", `parâmetro enviado (${r12.tipo} ${r12.texto.slice(0, 60)})`);
      const v = await prisma.versaoDeParametroDeAtualizacao.findFirst({ where: { classeDeBensId: classe.id }, orderBy: { numero: "desc" }, select: { percentualResidual: true } });
      afirmar(v?.percentualResidual.toFixed(6) === "0.125000", `gravado com seis casas: ${v?.percentualResidual.toFixed(6) ?? "?"}`);
    }

    naoExecutados.push(
      "incorporação de bem pela liquidação de capital: o clone não tem ficha de despesa de capital; coberta pelos testes de integração do M10 (t1, t1c, t4b, t4c)"
    );
    console.log(`\n${String(passos - falhas.length)}/${String(passos)} passos${naoExecutados.length > 0 ? `; não executados: ${naoExecutados.join(" | ")}` : ""}`);
    if (falhas.length > 0) process.exitCode = 1;
  } finally {
    await navegador.close();
    await prisma.$disconnect();
  }
}

await main();
