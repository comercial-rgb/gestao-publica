import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { diaCivil } from "../packages/datas/index.js";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V39-R3 (R3-016, V39-030) — PELA TELA: VALORES A RECEBER DE VOLTA (REALIZÁVEIS DE NATUREZA ATIVA).
 *
 * Pré-requisito: a massa da R3 (a contadora de parâmetros e o tesoureiro dos valores a receber). Conta FIC-PM-500.
 *   1. a contadora cadastra a categoria e decide a conta do ativo — uma conta do plano oficial carregado na base
 *      (1.1.3.5.1.02.00, depósitos judiciais), como PARÂMETRO DE ENSAIO declarado no fundamento, não decisão do
 *      município; tentar uma conta do passivo é recusado com o motivo;
 *   2. o tesoureiro constitui para DOIS devedores e baixa parte de um: o razão debita a conta do ativo e credita a
 *      disponibilidade da conta bancária; a tela mostra os saldos; a baixa acima do saldo é recusada;
 *   3. o tesoureiro anula a baixa: o saldo volta;
 *   4. quem só consulta o financeiro vê o quadro e não recebe formulário.
 * GRAVA (base de ensaio). Cada corrida usa uma categoria nova.
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
const CONTA_ATIVO = "1.1.3.5.1.02.00";
const contaAtivo = await prisma.contaPcasp.findUnique({ where: { codigo: CONTA_ATIVO }, select: { id: true, nome: true, analitica: true } });
if (contaAtivo === null || !contaAtivo.analitica) throw new Error(`A conta ${CONTA_ATIVO} não está (analítica) no plano desta base.`);
const passivo = await prisma.contaPcasp.findFirst({ where: { analitica: true, codigo: { startsWith: "2.1.8." } }, select: { codigo: true } });
if (passivo === null) throw new Error("A base não tem conta analítica 2.1.8 para a prova de recusa.");
const banco = await prisma.contaBancaria.findFirst({ where: { codigo: "FIC-PM-500" }, select: { id: true, fonteId: true, contaContabil: { select: { codigo: true } } } });
if (banco?.contaContabil == null) throw new Error("A conta FIC-PM-500 (com conta contábil) não está nesta base.");
const marca = String(Date.now()).slice(-5);
const codigo = `DJ${marca}`;
const A = "11222333000181";
const B = "52998224725";
// O dia civil do ente (a data UTC já é amanhã depois das 21h e o servidor recusaria "ainda não chegou").
const hoje = diaCivil(new Date());

const nav = await lancarNavegadorDoPercurso();
try {
  // ── 1. a contadora parametriza ──
  const ctxA = await nav.createBrowserContext();
  const pa = await ctxA.newPage();
  pa.setDefaultTimeout(300000);
  await entrar(n, pa, "contabilidade.parametros@ficticio.local", senha);
  await irPara(n, pa, "/financeiro/realizaveis");
  const rc = await preencherEEnviar(pa, "cadastrar-categoria-de-realizavel", [
    { sel: 'input[name="codigo"]', valor: codigo },
    { sel: 'input[name="descricao"]', valor: `Depósito judicial restituível (ensaio ${marca})` },
  ]);
  const cat = await prisma.categoriaDeRealizavel.findUnique({ where: { codigo }, select: { id: true } });
  conferir(rc.tipo === "ok" && cat !== null, `categoria ${codigo} cadastrada pela tela (${rc.texto.slice(0, 80)})`);
  if (cat === null) throw new Error("sem a categoria o percurso não segue");
  await irPara(n, pa, "/financeiro/realizaveis");
  const recusa = await preencherEEnviar(pa, "decidir-conta-do-realizavel", [
    { sel: 'select[name="categoriaId"]', valor: cat.id, tipo: "select" },
    { sel: 'input[name="contaAtivo"]', valor: passivo.codigo },
    { sel: 'input[name="fundamento"]', valor: "Tentativa com conta do passivo (ensaio)" },
  ]);
  conferir(recusa.tipo === "erro" && /não é de crédito realizável do ativo/.test(recusa.texto) && (await prisma.decisaoDaCategoriaDeRealizavel.count({ where: { categoriaId: cat.id } })) === 0, `conta do passivo recusada com o motivo (${recusa.texto.slice(0, 90)})`);
  // Recarregar: o aviso da recusa fica no formulário, e o próximo envio seria lido por ele.
  await irPara(n, pa, "/financeiro/realizaveis");
  const rd = await preencherEEnviar(pa, "decidir-conta-do-realizavel", [
    { sel: 'select[name="categoriaId"]', valor: cat.id, tipo: "select" },
    { sel: 'input[name="contaAtivo"]', valor: `${CONTA_ATIVO} — ${contaAtivo.nome}` },
    { sel: 'input[name="fundamento"]', valor: "Parâmetro de ensaio da V39-R3: conta do plano oficial carregado; não é decisão do município" },
  ]);
  const dec = await prisma.decisaoDaCategoriaDeRealizavel.findFirst({ where: { categoriaId: cat.id }, select: { ativa: true, contaAtivoId: true, criadoPor: true } });
  conferir(rd.tipo === "ok" && dec?.ativa === true && dec.contaAtivoId === contaAtivo.id && dec.criadoPor === "contabilidade.parametros@ficticio.local", `a conta do ativo decidida pela tela, com o fundamento (${rd.texto.slice(0, 80)})`);
  await ctxA.close();

  // ── 2 e 3. o tesoureiro movimenta ──
  const ctxB = await nav.createBrowserContext();
  const pb = await ctxB.newPage();
  pb.setDefaultTimeout(300000);
  await entrar(n, pb, "tesouraria.realizavel@ficticio.local", senha);
  const movimentar = async (tipo: string, devedor: string, valor: string) => {
    await irPara(n, pb, "/financeiro/realizaveis");
    return preencherEEnviar(pb, "movimentar-realizavel", [
      { sel: 'select[name="tipo"]', valor: tipo, tipo: "select" },
      { sel: 'select[name="categoriaId"]', valor: cat.id, tipo: "select" },
      { sel: 'input[name="devedor"]', valor: devedor },
      { sel: '[data-mascara="valor"]', valor },
      { sel: 'input[name="data"]', valor: hoje, tipo: "data" },
      { sel: 'select[name="contaEFonte"]', valor: `${banco.id}|${banco.fonteId}`, tipo: "select" },
      { sel: 'input[name="historico"]', valor: `Depósito judicial no processo ${marca} (ensaio)` },
      { sel: 'input[name="documento"]', valor: `Guia de depósito ${marca}` },
    ]);
  };
  const c1 = await movimentar("CONSTITUICAO", A, "500,00");
  const c2 = await movimentar("CONSTITUICAO", B, "200,00");
  const b1 = await movimentar("BAIXA", A, "120,00");
  conferir(c1.tipo === "ok" && c2.tipo === "ok" && b1.tipo === "ok", `duas constituições e uma baixa pela tela (${b1.texto.slice(0, 70)})`);
  const movs = await prisma.movimentoDeRealizavel.findMany({ where: { categoriaId: cat.id }, select: { tipo: true, devedor: true, valor: true, criadoPor: true, lancamento: { select: { partidas: { select: { tipo: true, valor: true, conta: { select: { codigo: true } } } } } } } });
  const pernas = movs.map((m) => `${m.tipo} ${m.devedor} ${m.valor.toFixed(2)}: ${m.lancamento.partidas.map((p) => `${p.tipo} ${p.conta.codigo}`).sort().join(", ")}`).sort();
  const disp = banco.contaContabil.codigo;
  conferir(
    JSON.stringify(pernas) === JSON.stringify([
      `BAIXA ${A} 120.00: CREDITO ${CONTA_ATIVO}, DEBITO ${disp}`,
      `CONSTITUICAO ${A} 500.00: CREDITO ${disp}, DEBITO ${CONTA_ATIVO}`,
      `CONSTITUICAO ${B} 200.00: CREDITO ${disp}, DEBITO ${CONTA_ATIVO}`,
    ].sort()) && movs.every((m) => m.criadoPor === "tesouraria.realizavel@ficticio.local"),
    `o razão: constituição debita ${CONTA_ATIVO} e credita ${disp}; a baixa, o inverso`,
  );
  await irPara(n, pb, "/financeiro/realizaveis");
  const saldos = await pb.$$eval("[data-saldo]", (els) => els.map((e) => `${e.getAttribute("data-saldo") ?? ""}=${e.getAttribute("data-valor") ?? ""}`));
  conferir(saldos.includes(`${codigo}|11.222.333/0001-81=380.00`) && saldos.includes(`${codigo}|529.982.247-25=200.00`), `a tela mostra os saldos 380,00 e 200,00 (${saldos.filter((s) => s.startsWith(codigo)).join("; ")})`);
  const acima = await movimentar("BAIXA", B, "200,01");
  conferir(acima.tipo === "erro" && /passa do saldo .* \(R\$ 200,00\)/.test(acima.texto), `baixa acima do saldo recusada com o motivo (${acima.texto.slice(0, 100)})`);
  // anular a baixa de A
  const baixa = await prisma.movimentoDeRealizavel.findFirst({ where: { categoriaId: cat.id, tipo: "BAIXA", estornoDeId: null }, select: { id: true } });
  await irPara(n, pb, "/financeiro/realizaveis");
  const an = await preencherEEnviar(pb, `form[data-acao="anular-realizavel"][data-movimento="${baixa?.id ?? ""}"]`, [
    { sel: 'input[name="motivo"]', valor: "Baixa registrada antes do crédito em conta (ensaio)" },
  ], `anular-realizavel-${baixa?.id ?? ""}`);
  await irPara(n, pb, "/financeiro/realizaveis");
  const depois = await pb.$$eval("[data-saldo]", (els) => els.map((e) => `${e.getAttribute("data-saldo") ?? ""}=${e.getAttribute("data-valor") ?? ""}`));
  conferir(an.tipo === "ok" && depois.includes(`${codigo}|11.222.333/0001-81=500.00`), `a baixa anulada pela tela: o saldo volta a 500,00 (${an.texto.slice(0, 70)})`);
  await ctxB.close();

  // ── 4. quem só consulta ──
  const ctxC = await nav.createBrowserContext();
  const pc = await ctxC.newPage();
  pc.setDefaultTimeout(300000);
  await entrar(n, pc, "tesoureiro@ficticio.local", senha);
  await irPara(n, pc, "/financeiro/realizaveis");
  const temQuadro = (await pc.$(`[data-categoria="${codigo}"]`)) !== null;
  const temForm = (await pc.$('form[data-acao="movimentar-realizavel"], form[data-acao="cadastrar-categoria-de-realizavel"], form[data-acao="decidir-conta-do-realizavel"], form[data-acao="anular-realizavel"]')) !== null;
  const aviso = (await pc.content()).includes("Registrar movimentos cabe a quem tem a permissão");
  conferir(temQuadro && !temForm && aviso, "quem só consulta vê as categorias e os saldos, sem formulário, e lê por quê");
  await ctxC.close();
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso dos valores a receber de volta completo.");
