import "dotenv/config";
import Decimal from "decimal.js";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { diaCivil, meioDiaCivil } from "../packages/datas/index.js";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V39-R3 (R3-009, R3-010) — PELA TELA: A CORREÇÃO DA DISPENSAÇÃO E A TROCA DO DEPÓSITO DA FARMÁCIA.
 *
 * Pré-requisito: a massa `semear-massa-r3.mts` (farmácia 9001 com estoque; farmácia 9002 com o depósito FARM-R3C e o
 * FARM-R3D livre; farmacêutica, supervisora e coordenador).
 *   R3-009 cancelamento: a farmacêutica dispensa dois itens; ela não vê a correção (não tem a ação); a supervisora cancela
 *          o registro pela tela; os lotes voltam (soma dos movimentos) e o consumo é estornado no razão invertendo o
 *          lançamento original; a dispensação original continua lá, com a correção ao lado; o formulário não oferece o
 *          item corrigido de novo.
 *   R3-009 devolução: nova dispensação de dois itens; a supervisora registra a devolução — dipirona apta (volta ao lote),
 *          amoxicilina inapta (não volta, com destino); sem o conferente a tela recusa com o motivo.
 *   R3-010 troca: o coordenador troca o depósito da farmácia 9002 de FARM-R3C para FARM-R3D a partir de amanhã; data
 *          passada é recusada com o motivo; o estoque não muda de depósito; a tela mostra a troca.
 * GRAVA (base de ensaio ou demonstração). Cada corrida faz dispensações novas; a troca é feita uma vez por base.
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

const farmacia = await prisma.farmaciaPublica.findFirst({ where: { codigo: "9001" }, select: { id: true, deposito: { select: { depositoId: true } } } });
const distrital = await prisma.farmaciaPublica.findFirst({ where: { codigo: "9002" }, select: { id: true } });
if (farmacia === null || farmacia.deposito === null || distrital === null) throw new Error("A massa da R3 não está nesta base (farmácias 9001 e 9002). Rode scripts/demonstracao/semear-massa-r3.mts.");
const depositoId = farmacia.deposito.depositoId;
const lote = async (identificacao: string): Promise<{ id: string }> => prisma.loteDeMaterial.findFirstOrThrow({ where: { identificacao, depositoId }, select: { id: true } });
const [dip, amx] = await Promise.all([lote("DIP-2601"), lote("AMX-2603")]);
async function saldoDoLote(id: string): Promise<Decimal> {
  const ms = await prisma.movimentoFisicoDeEstoque.findMany({ where: { loteId: id }, select: { tipo: true, quantidade: true } });
  return ms.reduce((t, m) => t.plus(new Decimal(m.quantidade.toString()).times(SINAL[m.tipo] ?? Number.NaN)), new Decimal(0));
}
async function partidas(lancamentoId: string | null | undefined): Promise<string[]> {
  if (lancamentoId === null || lancamentoId === undefined) return [];
  const ps = await prisma.partidaContabil.findMany({ where: { lancamentoId }, select: { tipo: true, valor: true, conta: { select: { codigo: true } } } });
  return ps.map((p) => `${p.tipo} ${p.conta.codigo} ${p.valor.toFixed(2)}`).sort();
}
const url = `/patrimonio/farmacias/${farmacia.id}`;

const nav = await lancarNavegadorDoPercurso();
try {
  // ── a farmacêutica dispensa (duas vezes: uma para cancelar, outra para a devolução) ──
  const ctxF = await nav.createBrowserContext();
  const pf = await ctxF.newPage();
  pf.setDefaultTimeout(300000);
  await entrar(n, pf, "farmaceutica@ficticio.local", senha);
  const dispensar = async (receita: string): Promise<{ id: string; numero: number }> => {
    await irPara(n, pf, url);
    const r = await preencherEEnviar(pf, "dispensar", [
      { sel: 'input[name="identificacaoDoUsuario"]', valor: `CNS 7001${String(Date.now()).slice(-11)}` },
      { sel: 'input[name="receita"]', valor: receita },
      { sel: 'input[name="prescritor"]', valor: "Médico da UBS Lagoa, CRM-PB 0000 (fictício)" },
      { sel: 'select[name="lote_1"]', valor: dip.id, tipo: "select" },
      { sel: 'input[name="quantidade_1"]', valor: "3" },
      { sel: 'select[name="lote_2"]', valor: amx.id, tipo: "select" },
      { sel: 'input[name="quantidade_2"]', valor: "4" },
    ], "dispensar");
    const d = await prisma.dispensacaoDeMedicamento.findFirst({ where: { farmaciaId: farmacia.id, receita }, orderBy: { numero: "desc" }, select: { id: true, numero: true } });
    if (r.tipo !== "ok" || d === null) throw new Error(`a dispensação não foi registrada: ${r.texto}`);
    return d;
  };
  const marca = String(Date.now()).slice(-6);
  const dipAntes = await saldoDoLote(dip.id);
  const amxAntes = await saldoDoLote(amx.id);
  const d1 = await dispensar(`Receita C-${marca} (fictícia)`);
  conferir((await saldoDoLote(dip.id)).equals(dipAntes.minus(3)) && (await saldoDoLote(amx.id)).equals(amxAntes.minus(4)), `dispensação nº ${String(d1.numero)} pela farmacêutica: DIP-2601 −3, AMX-2603 −4`);
  await irPara(n, pf, url);
  conferir((await pf.$('form[data-acao="corrigir-dispensacao"]')) === null, "a farmacêutica não tem a correção na tela (a ação é de outra pessoa)");

  // ── R3-009: a supervisora cancela o registro ──
  const ctxS = await nav.createBrowserContext();
  const ps = await ctxS.newPage();
  ps.setDefaultTimeout(300000);
  await entrar(n, ps, "supervisora.farmacia@ficticio.local", senha);
  await irPara(n, ps, url);
  const consumoOriginal = await prisma.itemDaDispensacao.findMany({ where: { dispensacaoId: d1.id }, select: { id: true, loteId: true, movimentoFisico: { select: { movimentoAlmoxarifado: { select: { lancamentoId: true } } } } } });
  const rc = await preencherEEnviar(ps, `form[data-acao="corrigir-dispensacao"][data-dispensacao="${String(d1.numero)}"]`, [
    { sel: 'input[name="tipo"][value="CANCELAMENTO_DO_REGISTRO"]', valor: "sim", tipo: "marcar" },
    { sel: 'input[name="motivo"]', valor: "Registro lançado para o usuário errado" },
  ], `corrigir-${String(d1.numero)}`);
  const corr1 = await prisma.correcaoDoItemDaDispensacao.findMany({ where: { item: { dispensacaoId: d1.id } }, select: { itemId: true, tipo: true, criadoPor: true, movimentoFisico: { select: { tipo: true, movimentoAlmoxarifado: { select: { tipo: true, lancamentoId: true } } } } } });
  conferir(rc.tipo === "ok" && corr1.length === 2 && corr1.every((c) => c.tipo === "CANCELAMENTO_DO_REGISTRO" && c.criadoPor === "supervisora.farmacia@ficticio.local" && c.movimentoFisico?.tipo === "ESTORNO_SAIDA"), `a supervisora cancela o registro pela tela; os dois itens corrigidos (${rc.texto.slice(0, 90)})`);
  conferir((await saldoDoLote(dip.id)).equals(dipAntes) && (await saldoDoLote(amx.id)).equals(amxAntes), "os dois lotes voltam ao saldo de antes da dispensação (soma dos movimentos)");
  for (const c of corr1) {
    const orig = consumoOriginal.find((o) => o.id === c.itemId);
    const po = await partidas(orig?.movimentoFisico.movimentoAlmoxarifado?.lancamentoId);
    const pe = await partidas(c.movimentoFisico?.movimentoAlmoxarifado?.lancamentoId);
    const invertido = po.map((x) => x.replace(/^DEBITO/, "X").replace(/^CREDITO/, "DEBITO").replace(/^X/, "CREDITO")).sort();
    conferir(c.movimentoFisico?.movimentoAlmoxarifado?.tipo === "ESTORNO_SAIDA_CONSUMO" && pe.length === 2 && JSON.stringify(pe) === JSON.stringify(invertido), `o consumo do item é estornado invertendo o lançamento original (${pe.join("; ")})`);
  }
  conferir((await prisma.itemDaDispensacao.count({ where: { dispensacaoId: d1.id } })) === 2, "a dispensação original continua com os dois itens (nada apagado)");
  await irPara(n, ps, url);
  const linha1 = await ps.$eval(`[data-dispensacao="${String(d1.numero)}"]`, (e) => (e.textContent ?? "").replace(/\s+/g, " ")).catch(() => "");
  conferir(/registro cancelado em .* por supervisora\.farmacia@ficticio\.local; voltou ao estoque/.test(linha1) && (await ps.$(`form[data-acao="corrigir-dispensacao"][data-dispensacao="${String(d1.numero)}"]`)) === null,
    "a tela mostra o cancelamento ao lado do original, e não oferece corrigir de novo");

  // ── R3-009: a devolução conferida (apta volta, inapta não) ──
  const d2 = await dispensar(`Receita D-${marca} (fictícia)`);
  const dipMeio = await saldoDoLote(dip.id);
  const amxMeio = await saldoDoLote(amx.id);
  const itens2 = await prisma.itemDaDispensacao.findMany({ where: { dispensacaoId: d2.id }, select: { id: true, loteId: true } });
  const itemDip = itens2.find((i) => i.loteId === dip.id)!;
  const itemAmx = itens2.find((i) => i.loteId === amx.id)!;
  await irPara(n, ps, url);
  const sel = `form[data-acao="corrigir-dispensacao"][data-dispensacao="${String(d2.numero)}"]`;
  const semConferente = await preencherEEnviar(ps, sel, [
    { sel: 'input[name="tipo"][value="DEVOLUCAO"]', valor: "sim", tipo: "marcar" },
    { sel: `select[name="condicao_${itemDip.id}"]`, valor: "APTO_AO_REUSO", tipo: "select" },
    { sel: 'input[name="motivo"]', valor: "Usuário trouxe o medicamento de volta" },
  ], `corrigir-${String(d2.numero)}`);
  conferir(semConferente.tipo === "erro" && /diga quem conferiu o produto devolvido/.test(semConferente.texto) && (await prisma.correcaoDoItemDaDispensacao.count({ where: { item: { dispensacaoId: d2.id } } })) === 0, `devolução sem o conferente recusada com o motivo, nada gravado (${semConferente.texto.slice(0, 70)})`);
  await irPara(n, ps, url);
  const rd = await preencherEEnviar(ps, sel, [
    { sel: 'input[name="tipo"][value="DEVOLUCAO"]', valor: "sim", tipo: "marcar" },
    { sel: `select[name="condicao_${itemDip.id}"]`, valor: "APTO_AO_REUSO", tipo: "select" },
    { sel: `select[name="condicao_${itemAmx.id}"]`, valor: "INAPTO", tipo: "select" },
    { sel: 'input[name="motivo"]', valor: "Usuário trouxe os medicamentos de volta" },
    { sel: 'input[name="conferidoPor"]', valor: "Supervisora da farmácia, CRF-PB 0000 (fictícia)" },
    { sel: 'input[name="destino"]', valor: "Caixa de descarte de medicamentos, recolhimento mensal (fictício)" },
  ], `corrigir-${String(d2.numero)}`);
  const corr2 = await prisma.correcaoDoItemDaDispensacao.findMany({ where: { item: { dispensacaoId: d2.id } }, select: { itemId: true, condicao: true, movimentoFisicoId: true, destino: true, conferidoPor: true } });
  const apta = corr2.find((c) => c.itemId === itemDip.id);
  const inapta = corr2.find((c) => c.itemId === itemAmx.id);
  conferir(rd.tipo === "ok" && apta?.condicao === "APTO_AO_REUSO" && apta.movimentoFisicoId !== null && inapta?.condicao === "INAPTO" && inapta.movimentoFisicoId === null && inapta.destino?.startsWith("Caixa de descarte") === true,
    `devolução registrada pela tela: dipirona apta (com estorno), amoxicilina inapta (sem estorno, com destino) (${rd.texto.slice(0, 90)})`);
  conferir((await saldoDoLote(dip.id)).equals(dipMeio.plus(3)) && (await saldoDoLote(amx.id)).equals(amxMeio), `só o apto volta ao estoque: DIP-2601 +3, AMX-2603 sem mudança`);
  await ctxF.close();
  await ctxS.close();

  // ── R3-010: a troca do depósito da farmácia distrital ──
  const ctxC = await nav.createBrowserContext();
  const pc = await ctxC.newPage();
  pc.setDefaultTimeout(300000);
  await entrar(n, pc, "coordenador.farmacia@ficticio.local", senha);
  const urlD = `/patrimonio/farmacias/${distrital.id}`;
  const novo = await prisma.deposito.findFirstOrThrow({ where: { codigo: "FARM-R3D" }, select: { id: true } });
  const antigo = await prisma.deposito.findFirstOrThrow({ where: { codigo: "FARM-R3C" }, select: { id: true } });
  const hoje = diaCivil(new Date());
  const amanha = diaCivil(new Date(meioDiaCivil(hoje).getTime() + 86_400_000));
  const jaTrocada = await prisma.trocaDoDepositoDaFarmacia.findFirst({ where: { farmaciaId: distrital.id }, select: { id: true } });
  if (jaTrocada === null) {
    await irPara(n, pc, urlD);
    const rp = await preencherEEnviar(pc, "trocar-deposito", [
      { sel: 'select[name="depositoNovoId"]', valor: novo.id, tipo: "select" },
      { sel: 'input[name="vigenteDesde"]', valor: "2026-01-15", tipo: "data" },
      { sel: 'input[name="fundamento"]', valor: "Mudança da farmácia para a sala nova do posto (fictícia)" },
    ], "trocar-deposito");
    conferir(rp.tipo === "erro" && /A troca vale de hoje em diante/.test(rp.texto) && (await prisma.trocaDoDepositoDaFarmacia.count({ where: { farmaciaId: distrital.id } })) === 0, `troca com data passada recusada com o motivo (${rp.texto.slice(0, 70)})`);
    const movAntes = await prisma.movimentoFisicoDeEstoque.count({ where: { depositoId: { in: [novo.id, antigo.id] } } });
    await irPara(n, pc, urlD);
    const rt = await preencherEEnviar(pc, "trocar-deposito", [
      { sel: 'select[name="depositoNovoId"]', valor: novo.id, tipo: "select" },
      { sel: 'input[name="vigenteDesde"]', valor: amanha, tipo: "data" },
      { sel: 'input[name="fundamento"]', valor: "Mudança da farmácia para a sala nova do posto (fictícia)" },
    ], "trocar-deposito");
    const troca = await prisma.trocaDoDepositoDaFarmacia.findFirst({ where: { farmaciaId: distrital.id }, select: { depositoAnteriorId: true, depositoNovoId: true, vigenteDesde: true, criadoPor: true } });
    conferir(rt.tipo === "ok" && troca?.depositoAnteriorId === antigo.id && troca.depositoNovoId === novo.id && diaCivil(troca.vigenteDesde) === amanha && troca.criadoPor === "coordenador.farmacia@ficticio.local",
      `o coordenador troca o depósito pela tela, de FARM-R3C para FARM-R3D a partir de ${amanha} (${rt.texto.slice(0, 90)})`);
    conferir((await prisma.movimentoFisicoDeEstoque.count({ where: { depositoId: { in: [novo.id, antigo.id] } } })) === movAntes, "a troca não move estoque (nenhum movimento físico novo nos dois depósitos)");
    await irPara(n, pc, urlD);
    const linhaTroca = await pc.$eval("[data-trocas-do-deposito]", (e) => (e.textContent ?? "").replace(/\s+/g, " ")).catch(() => "");
    conferir(/de FARM-R3C para FARM-R3D/.test(linhaTroca), `a tela mostra a troca (${linhaTroca.slice(0, 120)})`);
    conferir(/O estoque desta farmácia é o do depósito FARM-R3C/.test(await pc.$eval("[data-deposito-da-farmacia]", (e) => e.textContent ?? "").catch(() => "")), "hoje a farmácia ainda opera com o depósito anterior (a troca vale de amanhã)");
  } else conferir(true, "a troca do depósito da farmácia distrital já foi feita (corrida anterior)");
  await ctxC.close();
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da correção da dispensação e da troca do depósito completo.");
