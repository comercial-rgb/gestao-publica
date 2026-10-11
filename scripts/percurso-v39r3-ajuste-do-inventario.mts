import "dotenv/config";
import Decimal from "decimal.js";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { diaCivil } from "../packages/datas/index.js";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V39-R3 (R3-012) — PELA TELA: O INVENTÁRIO DO ALMOXARIFADO GERAL, DA CONTAGEM AO AJUSTE.
 *
 * Pré-requisito: a massa `semear-massa-r3.mts` (depósito ALM-R3 com papel R3EXP001, sem lote, e caneta R3EXP002 no lote
 * CAN-2610, recebidos pela liquidação R3-EXP-L1; almoxarife e chefe do almoxarifado na Administração).
 *   1. o almoxarife abre o inventário do ALM-R3 (08/10), conta papel 97 e caneta CAN-2610 51, e fecha (09/10);
 *   2. ele não tem o "Aplicar o ajuste" na tela (a ação é de quem autoriza);
 *   3. a chefe aplica: falta 3 de papel e sobra 1 de caneta viram perda e sobra ao custo médio, com o lançamento; o
 *      rastro grava registrado, contado e o movimento de cada contagem; a tela diz quem aplicou;
 *   4. a segunda aplicação é recusada pela tela com o motivo, e nada muda.
 * Cada diferença é conferida contra o saldo calculado aqui pela soma dos movimentos. GRAVA. Uma vez por base: a segunda
 * corrida acha o inventário aplicado e só confere.
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
const SINAL: Record<string, number> = { ENTRADA: 1, SAIDA: -1, AJUSTE_ENTRADA: 1, AJUSTE_SAIDA: -1, ESTORNO_ENTRADA: -1, ESTORNO_SAIDA: 1, TRANSFERENCIA_ENTRADA: 1, TRANSFERENCIA_SAIDA: -1 };

const dep = await prisma.deposito.findFirst({ where: { codigo: "ALM-R3" }, select: { id: true } });
const papel = await prisma.material.findFirst({ where: { codigo: "R3EXP001" }, select: { id: true } });
const caneta = await prisma.material.findFirst({ where: { codigo: "R3EXP002" }, select: { id: true } });
if (dep === null || papel === null || caneta === null) throw new Error("A massa do almoxarifado geral da R3 não está nesta base. Rode scripts/demonstracao/semear-massa-r3.mts.");
const lote = await prisma.loteDeMaterial.findFirstOrThrow({ where: { identificacao: "CAN-2610", depositoId: dep.id }, select: { id: true } });
async function saldo(where: { materialId?: string; loteId?: string }): Promise<Decimal> {
  const ms = await prisma.movimentoFisicoDeEstoque.findMany({ where: { depositoId: dep!.id, ...where }, select: { tipo: true, quantidade: true } });
  return ms.reduce((t, m) => t.plus(new Decimal(m.quantidade.toString()).times(SINAL[m.tipo] ?? Number.NaN)), new Decimal(0));
}

const nav = await lancarNavegadorDoPercurso();
try {
  const ctxA = await nav.createBrowserContext();
  const pa = await ctxA.newPage();
  pa.setDefaultTimeout(300000);
  await entrar(n, pa, "almoxarife@ficticio.local", senha);

  let inv = await prisma.inventarioDeEstoque.findFirst({ where: { depositoId: dep.id }, orderBy: { criadoEm: "desc" }, select: { id: true, dataFechamento: true } });
  const papelNaAbertura = await saldo({ materialId: papel.id });
  const canetaNaAbertura = await saldo({ loteId: lote.id });
  if (inv === null) {
    await irPara(n, pa, "/patrimonio/almoxarifado/inventarios");
    const ra = await preencherEEnviar(pa, "criar-inventarios-de-estoque", [
      { sel: 'select[name="depositoId"]', valor: dep.id, tipo: "select" },
      { sel: 'input[name="dataAbertura"]', valor: "2026-10-08", tipo: "data" },
    ]);
    inv = await prisma.inventarioDeEstoque.findFirst({ where: { depositoId: dep.id }, orderBy: { criadoEm: "desc" }, select: { id: true, dataFechamento: true } });
    conferir(ra.tipo === "ok" && inv !== null, `o almoxarife abre o inventário do ALM-R3 pela tela (${ra.texto.slice(0, 60)})`);
    if (inv === null) throw new Error("inventário não aberto");
    const url = `/patrimonio/almoxarifado/inventarios/${inv.id}`;
    await irPara(n, pa, url);
    const c1 = await preencherEEnviar(pa, "contar", [
      { sel: "materialId", valor: papel.id, tipo: "referencia", busca: "R3EXP001" },
      { sel: 'input[name="quantidadeContada"]', valor: "97" },
    ]);
    await irPara(n, pa, url);
    const c2 = await preencherEEnviar(pa, "contar", [
      { sel: "materialId", valor: caneta.id, tipo: "referencia", busca: "R3EXP002" },
      { sel: "loteId", valor: lote.id, tipo: "referencia", busca: "CAN-2610" },
      { sel: 'input[name="quantidadeContada"]', valor: "51" },
    ]);
    conferir(c1.tipo === "ok" && c2.tipo === "ok" && (await prisma.contagemDeInventario.count({ where: { inventarioId: inv.id } })) === 2, `duas contagens pela tela: papel 97, caneta lote CAN-2610 51 (${c1.texto.slice(0, 40)} / ${c2.texto.slice(0, 40)})`);
  } else conferir(true, "inventário do ALM-R3 já aberto e contado (corrida anterior)");
  const url = `/patrimonio/almoxarifado/inventarios/${inv.id}`;
  if (inv.dataFechamento === null) {
    await irPara(n, pa, url);
    const rf = await preencherEEnviar(pa, "fechar", [{ sel: 'input[name="dataFechamento"]', valor: "2026-10-09", tipo: "data" }]);
    inv = await prisma.inventarioDeEstoque.findUniqueOrThrow({ where: { id: inv.id }, select: { id: true, dataFechamento: true } });
    conferir(rf.tipo === "ok" && inv.dataFechamento !== null, `inventário fechado pela tela em 09/10/2026, pelo papel de runtime (${rf.texto.slice(0, 60)})`);
  } else conferir(true, "inventário do ALM-R3 já fechado (corrida anterior)");
  const tA = await irPara(n, pa, url);
  conferir(/falta 3\.000/.test(tA) && /sobra 1\.000/.test(tA), "a tela do inventário mostra as diferenças (falta 3 de papel, sobra 1 de caneta no lote)");
  conferir((await pa.$('form[data-acao="aplicar-ajuste"]')) === null, "o almoxarife, que contou, não tem a aplicação do ajuste na tela");
  await ctxA.close();

  const ctxC = await nav.createBrowserContext();
  const pc = await ctxC.newPage();
  pc.setDefaultTimeout(300000);
  await entrar(n, pc, "chefe.almoxarifado@ficticio.local", senha);
  const jaAplicado = await prisma.aplicacaoDoAjusteDoInventario.findUnique({ where: { inventarioId: inv.id }, select: { id: true } });
  if (jaAplicado === null) {
    const papelAntes = await saldo({ materialId: papel.id });
    const canetaAntes = await saldo({ loteId: lote.id });
    await irPara(n, pc, url);
    const rp = await preencherEEnviar(pc, "aplicar-ajuste", [
      { sel: 'input[name="data"]', valor: diaCivil(new Date()), tipo: "data" },
      { sel: 'input[name="fundamento"]', valor: "Termo de fechamento do inventário de outubro (fictício)" },
    ]);
    const ap = await prisma.aplicacaoDoAjusteDoInventario.findUnique({ where: { inventarioId: inv.id }, select: { criadoPor: true, ajustes: { select: { quantidadeRegistrada: true, quantidadeContada: true, contagem: { select: { materialId: true } }, movimentoFisico: { select: { tipo: true, loteId: true, valorUnitario: true, valorTotal: true, movimentoAlmoxarifado: { select: { lancamentoId: true } } } } } } } });
    conferir(rp.tipo === "ok" && ap?.criadoPor === "chefe.almoxarifado@ficticio.local" && ap.ajustes.length === 2, `a chefe aplica o ajuste pela tela; dois ajustes (${rp.texto.slice(0, 60)})`);
    conferir((await saldo({ materialId: papel.id })).equals(papelAntes.minus(3)) && (await saldo({ loteId: lote.id })).equals(canetaAntes.plus(1)), `o estoque segue a contagem: papel ${papelAntes.toFixed(0)} → ${(await saldo({ materialId: papel.id })).toFixed(0)}, caneta CAN-2610 ${canetaAntes.toFixed(0)} → ${(await saldo({ loteId: lote.id })).toFixed(0)}`);
    for (const a of ap?.ajustes ?? []) {
      const ehPapel = a.contagem.materialId === papel.id;
      const registrado = ehPapel ? papelNaAbertura : canetaNaAbertura;
      const ps = await prisma.partidaContabil.findMany({ where: { lancamentoId: a.movimentoFisico.movimentoAlmoxarifado?.lancamentoId ?? "" }, select: { tipo: true, valor: true, conta: { select: { codigo: true } } } });
      const linhas = ps.map((p) => `${p.tipo} ${p.conta.codigo} ${p.valor.toFixed(2)}`).sort();
      const v = a.movimentoFisico.valorTotal.toFixed(2);
      const esperado = ehPapel ? [`CREDITO 1.1.5.6.1.01.00 ${v}`, `DEBITO 3.6.3.3.1.99.00 ${v}`] : [`CREDITO 4.6.3.9.1.00.00 ${v}`, `DEBITO 1.1.5.6.1.01.00 ${v}`];
      conferir(new Decimal(a.quantidadeRegistrada.toString()).equals(registrado) && JSON.stringify(linhas) === JSON.stringify(esperado) && a.movimentoFisico.tipo === (ehPapel ? "AJUSTE_SAIDA" : "AJUSTE_ENTRADA") && (ehPapel || a.movimentoFisico.loteId === lote.id),
        `${ehPapel ? "papel: falta" : "caneta no lote: sobra"} com rastro (registrado ${a.quantidadeRegistrada.toFixed(0)}, contado ${a.quantidadeContada.toFixed(0)}) ao custo médio ${a.movimentoFisico.valorUnitario.toFixed(6)} e o lançamento ${linhas.join("; ")}`);
    }
    const tC = await irPara(n, pc, url);
    conferir(/em .* por chefe\.almoxarifado@ficticio\.local: 2 ajuste\(s\) no estoque e no razão/.test(tC), "a tela do inventário diz quem aplicou o ajuste, quando e quantos");
  } else conferir(true, "ajuste do inventário já aplicado (corrida anterior)");

  const antes = await prisma.ajusteDoInventario.count();
  await irPara(n, pc, url);
  const rr = await preencherEEnviar(pc, "aplicar-ajuste", [
    { sel: 'input[name="data"]', valor: diaCivil(new Date()), tipo: "data" },
    { sel: 'input[name="fundamento"]', valor: "Segunda aplicação do mesmo inventário (fictícia)" },
  ]);
  conferir(rr.tipo === "erro" && /já foi aplicado em .* Um inventário se aplica uma vez/.test(rr.texto) && (await prisma.ajusteDoInventario.count()) === antes, `a segunda aplicação é recusada pela tela com o motivo, nada muda (${rr.texto.slice(0, 80)})`);
  await ctxC.close();
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso do inventário do almoxarifado completo.");
