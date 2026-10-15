import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { Decimal } from "../packages/contracts/index.js";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V39-R3 (R3-027) — PELA TELA: A FOLHA DA LIQUIDAÇÃO AO RETORNO DO BANCO, COM UMA REJEIÇÃO.
 *
 * O que a R2 já provou (`percurso-v39r2-folha-ate-tesouraria.mts`, 5/5) e NÃO se repete aqui: a folha na tela, a
 * liquidação da folha na fila, o pagamento pela tela com o desconto retido, a liquidação fora da fila. Este percurso
 * cobre o que faltava: a ordem de pagamento, o lote, o borderô, o retorno e o tratamento da rejeição.
 *
 * Pré-requisito: a base R3 com as liquidações da folha de agosto de dois servidores ainda sem ordem (27: 2.400,00 e 28:
 * 2.800,00, fonte 500, Administração), a conta FIC-PM-500 e os usuários da seção 1 (preparador, ordenadora,
 * tesoureiro dos lotes; o auxiliar de tesouraria só consulta).
 *   1. quem só consulta o financeiro abre os lotes e não recebe formulário nenhum;
 *   2. o preparador prepara as duas ordens; a ordenadora as autoriza;
 *   3. o tesoureiro cria o lote na FIC-PM-500, inclui as duas, fecha e gera o borderô;
 *   4. o retorno: o banco pagou a de 2.400,00 (baixa) e rejeitou a de 2.800,00 (conta encerrada) — a ordem rejeitada
 *      se cancela e o item sai dos formulários com o que o banco respondeu;
 *   5. o novo crédito: ordem nova da mesma liquidação, autorizada, em lote novo, baixada pelo retorno (a liquidação
 *      rejeitada voltou à cabeça da fila: a ordem cronológica não a recusa);
 *   6. SQL: cada liquidação tem exatamente o seu valor baixado pelo banco, a ordem rejeitada está cancelada com o
 *      motivo do banco, a rejeição liga ao cancelamento, e nada foi pago duas vezes.
 * GRAVA (base de ensaio). Cada passo confere no banco o que encontra: o já feito numa corrida anterior é dito, não contado.
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3012" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação; este percurso grava.");
await exigirDestinoDoPercurso(n.base);
const prisma = criarPrismaClient(process.env["PERCURSO_BANCO"] ?? process.env["DATABASE_URL"] ?? "");
const senha = process.env["FICTICIO_SENHA"] ?? "Ficticio#2026";
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
const nota = (o: string): void => console.log(`--  ${o}`);

/** As liquidações da folha de agosto/2026 da Administração, pelo número (as da massa da semente fictícia). */
const liquidacao = async (numero: string, valor: string) => {
  const l = await prisma.liquidacao.findFirst({
    where: { numero, valor, empenho: { ficha: { exercicio: 2026, unidadeOrc: { codigo: "02004" } }, daFolha: { isNot: null } } },
    select: { id: true },
  });
  if (l === null) throw new Error(`A base não tem a liquidação ${numero} da folha (${valor}).`);
  return l.id;
};
const LA = await liquidacao("27", "2400.00");
const LB = await liquidacao("28", "2800.00");
const conta = await prisma.contaBancaria.findUnique({ where: { codigo: "FIC-PM-500" }, select: { id: true } });
if (conta === null) throw new Error("A base não tem a conta FIC-PM-500.");
const ordensDe = (liquidacaoId: string) =>
  prisma.ordemDePagamento.findMany({
    where: { liquidacaoId },
    orderBy: { criadoEm: "asc" },
    select: { id: true, numero: true, movimentos: { select: { tipo: true, motivo: true, id: true } }, itemDeLote: { select: { id: true, loteId: true, baixa: { select: { id: true } }, rejeicao: { select: { ocorrencia: true, movimentoDaOrdemId: true } } } } },
  });
const ordemNumero = async (numero: string) => (await prisma.ordemDePagamento.findFirst({ where: { numero }, select: { id: true } }))?.id ?? "";
/** A autorização se confere pelo efeito: o movimento AUTORIZACAO da ordem, feito por quem autoriza. */
const autorizada = async (ordemId: string): Promise<boolean> => (await prisma.movimentoDaOrdemDePagamento.count({ where: { ordemId, tipo: "AUTORIZACAO", criadoPor: "ordenador.despesa@ficticio.local" } })) === 1;
const itemDa = async (ordemId: string) => prisma.itemDoLote.findUnique({ where: { ordemId }, select: { id: true, loteId: true, baixa: { select: { id: true } }, rejeicao: { select: { id: true } }, lote: { select: { borderos: { select: { id: true } } } } } });

const nav = await lancarNavegadorDoPercurso();
try {
  // ── 1. quem só consulta ──
  const ctxC = await nav.createBrowserContext();
  const pc = await ctxC.newPage();
  pc.setDefaultTimeout(300000);
  await entrar(n, pc, "auxiliar.tesouraria@ficticio.local", senha);
  await irPara(n, pc, "/financeiro/lotes");
  const formsC = await pc.$$('form[data-acao="criar-lote"], form[data-acao="incluir-no-lote"], form[data-acao="processar-retorno"], form[data-acao="registrar-rejeicao"]');
  const titulo = await pc.$eval("h1", (e) => e.textContent ?? "").catch(() => "");
  conferir(/Lotes de pagamento/.test(titulo) && formsC.length === 0, `quem só consulta abre os lotes (${titulo.trim()}) sem formulário nenhum`);
  await ctxC.close();

  const sessao = async (email: string) => {
    const ctx = await nav.createBrowserContext();
    const p = await ctx.newPage();
    p.setDefaultTimeout(300000);
    await entrar(n, p, email, senha);
    return { ctx, p };
  };
  /** Prepara (se ainda não houver) e autoriza (se ainda não estiver) a ordem pela tela. Devolve o id. */
  const ordemPelaTela = async (liquidacaoId: string, numero: string, valor: string): Promise<string> => {
    if ((await ordemNumero(numero)) === "") {
      const { ctx, p } = await sessao("ordem.preparador@ficticio.local");
      await irPara(n, p, "/despesa/ordens?exercicio=2026");
      const r = await preencherEEnviar(p, "preparar-ordem", [
        { sel: 'select[name="liquidacaoId"]', valor: liquidacaoId, tipo: "select" },
        { sel: 'input[name="numero"]', valor: numero },
        { sel: '[data-mascara="valor"]', valor },
        { sel: 'input[name="dataPrevista"]', valor: "2026-10-16", tipo: "data" },
        { sel: 'select[name="contaBancaria"]', valor: "FIC-PM-500", tipo: "select" },
        { sel: 'input[name="historico"]', valor: "Crédito da folha de agosto em conta do servidor (ensaio)" },
      ]);
      await ctx.close();
      conferir(r.tipo === "ok" && (await ordemNumero(numero)) !== "", `o preparador prepara ${numero} (${valor}) (${r.texto.slice(0, 50)})`);
    } else nota(`${numero} já preparada numa corrida anterior`);
    const id = await ordemNumero(numero);
    if (!(await autorizada(id))) {
      const { ctx, p } = await sessao("ordenador.despesa@ficticio.local");
      await irPara(n, p, "/despesa/ordens?exercicio=2026");
      const r = await preencherEEnviar(p, `form[data-acao="autorizar-ordem"][data-ordem="${id}"]`, [{ sel: 'input[name="motivo"]', valor: "Conferida a folha de agosto (ensaio)" }]);
      await ctx.close();
      conferir(r.tipo !== "erro" && (await autorizada(id)), `a ordenadora autoriza ${numero} (o movimento de autorização gravado por ela)`);
    } else nota(`${numero} já autorizada numa corrida anterior`);
    return id;
  };

  /** O tesoureiro: lote na FIC-PM-500 com as ordens, fechado, borderô gerado. Devolve o borderô. */
  const loteComBordero = async (descricao: string, ordens: readonly string[]): Promise<string> => {
    const ja = await itemDa(ordens[0] as string);
    if (ja !== null && ja.lote.borderos.length > 0) {
      nota(`o lote "${descricao}" e o borderô já existiam de uma corrida anterior`);
      return ja.lote.borderos[0]?.id ?? "";
    }
    if (ja !== null) throw new Error(`o lote de "${descricao}" existe sem borderô: estado de corrida anterior que este percurso não retoma.`);
    const { ctx, p } = await sessao("tesoureiro.lote@ficticio.local");
    await irPara(n, p, "/financeiro/lotes");
    const rc = await preencherEEnviar(p, "criar-lote", [
      { sel: 'select[name="conta"]', valor: conta.id, tipo: "select" },
      { sel: 'input[name="vencimento"]', valor: "2026-10-16", tipo: "data" },
      { sel: 'input[name="descricao"]', valor: descricao },
    ]);
    const lote = await prisma.loteDePagamento.findFirst({ where: { descricao }, orderBy: { criadoEm: "desc" }, select: { id: true } });
    if (rc.tipo !== "ok" || lote === null) throw new Error(`o lote "${descricao}" não nasceu: ${rc.texto}`);
    const doLote = (acao: string) => `form[data-acao="${acao}"]:has(input[name="loteId"][value="${lote.id}"])`;
    const incluidos: string[] = [];
    for (const o of ordens) {
      await irPara(n, p, "/financeiro/lotes");
      const ri = await preencherEEnviar(p, doLote("incluir-no-lote"), [{ sel: 'select[name="ordemId"]', valor: o, tipo: "select" }]);
      incluidos.push(ri.tipo === "ok" ? "ok" : ri.texto.slice(0, 120));
    }
    await irPara(n, p, "/financeiro/lotes");
    const rf = await preencherEEnviar(p, doLote("fechar-lote"), []);
    await irPara(n, p, "/financeiro/lotes");
    const rb = await preencherEEnviar(p, doLote("gerar-bordero"), [{ sel: 'select[name="signatarios"]', valor: "ordenador.despesa@ficticio.local", tipo: "select" }]);
    const bordero = await prisma.bordero.findFirst({ where: { loteId: lote.id }, select: { id: true, filaAssinaturaId: true } });
    await ctx.close();
    conferir(
      // O fechar e o gerar se conferem pelo EFEITO: com sucesso a página se refaz e os dois formulários saem dela (o lote
      // fechado não oferece fechar; o lote com borderô não oferece gerar), levando a mensagem junto.
      incluidos.every((x) => x === "ok") && rf.tipo !== "erro" && rb.tipo !== "erro" && bordero !== null && bordero.filaAssinaturaId !== null,
      `lote "${descricao}": ${String(ordens.length)} ordem(ns) incluída(s) (${incluidos.join(" | ")}), fechado, borderô com fila de assinatura (${rb.texto.slice(0, 50)})`
    );
    return bordero?.id ?? "";
  };
  const doBordero = (acao: string, borderoId: string) => `form[data-acao="${acao}"]:has(input[name="borderoId"][value="${borderoId}"])`;
  const baixarPelaTela = async (borderoId: string, ordemId: string, numero: string, dia: string, identificador: string) => {
    const item = await itemDa(ordemId);
    if (item === null) return conferir(false, `${numero} não está em lote`);
    if (item.baixa !== null) return nota(`${numero} já baixada pelo retorno numa corrida anterior`);
    const { ctx, p } = await sessao("tesoureiro.lote@ficticio.local");
    await irPara(n, p, "/financeiro/lotes");
    const r = await preencherEEnviar(p, doBordero("processar-retorno", borderoId), [
      { sel: 'input[name="pagoEm"]', valor: dia, tipo: "data" },
      { sel: `input[name="itens"][value="${item.id}"]`, valor: "sim", tipo: "marcar" },
      { sel: `input[name="identificador-${item.id}"]`, valor: identificador },
    ]);
    // Pelo efeito e pela tela: com o último item respondido, o formulário do retorno sai da página (e a mensagem com ele).
    await irPara(n, p, "/financeiro/lotes");
    const naTela = await p.$eval(`[data-item-bordero="${item.id}"] [data-situacao-item]`, (e) => e.getAttribute("data-situacao-item") ?? "").catch(() => "");
    await ctx.close();
    conferir(r.tipo !== "erro" && (await itemDa(ordemId))?.baixa != null && naTela === "baixado", `retorno: o banco pagou ${numero}; a tela mostra "${naTela}" (${r.texto.slice(0, 60)})`);
  };

  // ── 2 a 4. o primeiro ciclo ──
  const OA = await ordemPelaTela(LA, "R3-OP-0001", "2.400,00");
  const OB = await ordemPelaTela(LB, "R3-OP-0002", "2.800,00");
  const B1 = await loteComBordero("Folha de agosto — crédito em conta (ensaio)", [OA, OB]);
  await baixarPelaTela(B1, OA, "R3-OP-0001", "2026-10-16", "BB-R3-000001");
  const itemB = await itemDa(OB);
  if (itemB !== null && itemB.rejeicao === null) {
    const { ctx, p } = await sessao("tesoureiro.lote@ficticio.local");
    await irPara(n, p, "/financeiro/lotes");
    const rj = await preencherEEnviar(p, doBordero("registrar-rejeicao", B1), [
      { sel: 'select[name="itemId"]', valor: itemB.id, tipo: "select" },
      { sel: 'input[name="rejeitadoEm"]', valor: "2026-10-16", tipo: "data" },
      { sel: 'input[name="ocorrencia"]', valor: "BD - conta do favorecido encerrada (ensaio)" },
    ]);
    await ctx.close();
    // Sem outro item a rejeitar, o formulário sai da tela com a mensagem dentro (pendência MENSAGEM-QUE-SAI-COM-O-FORMULARIO):
    // conforme o tempo do servidor, o percurso lê a mensagem ou o silêncio. No silêncio, o passo se afirma pelo efeito.
    const gravada = (await prisma.rejeicaoDeRetornoBancario.count({ where: { itemId: itemB.id } })) === 1;
    if (rj.tipo === "silencio") nota("retorno: a mensagem da rejeição saiu da tela com o formulário; o passo se afirma pela rejeição gravada");
    conferir(gravada && (rj.tipo === "silencio" || (rj.tipo === "ok" && /ordem do item foi cancelada/.test(rj.texto))), `retorno: o banco rejeitou R3-OP-0002 (${rj.texto.slice(0, 90)})`);
  } else nota("a rejeição de R3-OP-0002 já estava registrada numa corrida anterior");
  {
    const { ctx, p } = await sessao("tesoureiro.lote@ficticio.local");
    await irPara(n, p, "/financeiro/lotes");
    const IA = (await itemDa(OA))?.id ?? "";
    const IB = (await itemDa(OB))?.id ?? "";
    const situacao = await p.$$eval(`[data-item-bordero="${IA}"] [data-situacao-item], [data-item-bordero="${IB}"] [data-situacao-item]`, (els) => els.map((e) => e.getAttribute("data-situacao-item") ?? ""));
    const nosFormularios = await p.$$eval(`${doBordero("processar-retorno", B1)} input[name="itens"], ${doBordero("registrar-rejeicao", B1)} option`, (els) => els.map((e) => (e as HTMLInputElement).value));
    const resposta = await p.$eval('[data-lista="rejeicoes-do-bordero"]', (e) => (e.textContent ?? "").replace(/\s+/g, " ")).catch(() => "");
    await ctx.close();
    conferir(situacao.join(",") === "baixado,rejeitado" && !nosFormularios.includes(IA) && !nosFormularios.includes(IB) && /conta do favorecido encerrada/.test(resposta), `a tela mostra baixado e rejeitado, sem oferecer os dois de novo, com o que o banco respondeu (${resposta.slice(0, 90)})`);
  }

  // ── 5. o novo crédito ──
  const OC = await ordemPelaTela(LB, "R3-OP-0003", "2.800,00");
  const B2 = await loteComBordero("Folha de agosto — novo crédito do rejeitado (ensaio)", [OC]);
  await baixarPelaTela(B2, OC, "R3-OP-0003", "2026-10-19", "BB-R3-000002");
} finally {
  await nav.close();
}

// ── 6. SQL, independente das telas ──
const baixadoDa = async (liquidacaoId: string): Promise<string> =>
  (await prisma.ordemDePagamento.findMany({ where: { liquidacaoId, itemDeLote: { baixa: { isNot: null } } }, select: { valor: true } })).reduce((s, o) => s.plus(o.valor.toString()), new Decimal(0)).toFixed(2);
const bA = await baixadoDa(LA);
const bB = await baixadoDa(LB);
conferir(bA === "2400.00" && bB === "2800.00", `cada liquidação tem o seu valor pago pelo banco, uma vez: 27 = ${bA}, 28 = ${bB}`);
const oB = await ordensDe(LB);
const rejeitada = oB.find((o) => o.numero === "R3-OP-0002");
const canc = rejeitada?.movimentos.find((m) => m.tipo === "CANCELAMENTO");
conferir(
  canc !== undefined && /rejeitado pelo banco .*conta do favorecido encerrada/.test(canc.motivo ?? "") && rejeitada?.itemDeLote?.rejeicao?.movimentoDaOrdemId === canc.id && rejeitada.itemDeLote.baixa === null,
  `R3-OP-0002 cancelada pelo banco ("${(canc?.motivo ?? "").slice(0, 80)}"), a rejeição ligada ao cancelamento e sem baixa`
);
const nova = oB.find((o) => o.numero === "R3-OP-0003");
conferir(nova !== undefined && nova.itemDeLote !== null && nova.itemDeLote.loteId !== rejeitada?.itemDeLote?.loteId && nova.itemDeLote.baixa !== null, "R3-OP-0003 noutro lote, baixada");
await prisma.$disconnect();
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da folha até o banco completo.");
