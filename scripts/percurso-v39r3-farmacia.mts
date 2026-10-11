import "dotenv/config";
import Decimal from "decimal.js";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V39-R3 (R3-005 a R3-008) — PELA TELA, COM ESTOQUE: DISPENSAR, RECUSAR O LOTE VENCIDO, REGISTRAR PERDA E SOBRA.
 *
 * Pré-requisito: a massa `scripts/demonstracao/semear-massa-r3.mts` (farmácia 9001, depósito FARM-R3, medicamentos
 * R3MED001 com os lotes DIP-2601 e DIP-2509 — este vencido em 05/10/2026 — e R3MED002 com o lote AMX-2603, recebidos
 * pela liquidação R3-MED-L1). Quem opera é a farmacêutica da unidade (ação só no Fundo de Saúde), não o administrador.
 *
 * Cada passo confere o EFEITO no banco por conta própria (não pela mensagem da tela):
 *   R3-005 dispensação: número, itens, lote, destinatário (identificador, sem nome), receita; o saldo de cada lote somado
 *          dos movimentos; o consumo no almoxarifado e o lançamento D consumo / C estoque no valor do custo médio
 *          recalculado aqui a partir das entradas;
 *   R3-006 lote vencido: recusa com o motivo, e nenhum movimento físico, contábil ou dispensação a mais;
 *   R3-007 perda: quantidade, motivo e destino; o lote baixa; D perda / C estoque;
 *   R3-008 sobra: o valor unitário gravado é o custo médio da posição (recalculado aqui), a tela diz a origem do custo;
 *          D estoque / C ganho;
 *   e a recusa por unidade: o farmacêutico de outra unidade abre a tela sem os formulários e sem os dados do usuário.
 * GRAVA (base de ensaio ou demonstração, conferida pelo `entrar`). Uma corrida nova grava fatos novos com a data do dia.
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
const SINAL: Record<string, number> = { ENTRADA: 1, SAIDA: -1, AJUSTE_ENTRADA: 1, AJUSTE_SAIDA: -1, TRANSFERENCIA_ENTRADA: 1, TRANSFERENCIA_SAIDA: -1, ESTORNO_ENTRADA: -1, ESTORNO_SAIDA: 1 };

const farmacia = await prisma.farmaciaPublica.findFirst({ where: { codigo: "9001" }, select: { id: true, deposito: { select: { depositoId: true } } } });
if (farmacia === null || farmacia.deposito === null) throw new Error("A massa da R3 não está nesta base (farmácia 9001 com depósito). Rode scripts/demonstracao/semear-massa-r3.mts.");
const depositoId = farmacia.deposito.depositoId;
const lote = async (identificacao: string): Promise<{ id: string; materialId: string }> => prisma.loteDeMaterial.findFirstOrThrow({ where: { identificacao, depositoId }, select: { id: true, materialId: true } });
const [dipValido, dipVencido, amx] = await Promise.all([lote("DIP-2601"), lote("DIP-2509"), lote("AMX-2603")]);

/** Saldo do lote pela soma dos movimentos físicos — leitura independente da tela. */
async function saldoDoLote(id: string): Promise<Decimal> {
  const ms = await prisma.movimentoFisicoDeEstoque.findMany({ where: { loteId: id }, select: { tipo: true, quantidade: true } });
  return ms.reduce((t, m) => t.plus(new Decimal(m.quantidade.toString()).times(SINAL[m.tipo] ?? Number.NaN)), new Decimal(0));
}
/** Custo médio da posição (material no depósito): Σ valor / Σ quantidade dos movimentos, recalculado aqui. */
async function custoMedio(materialId: string): Promise<Decimal> {
  const ms = await prisma.movimentoFisicoDeEstoque.findMany({ where: { materialId, depositoId }, select: { tipo: true, quantidade: true, valorTotal: true } });
  let q = new Decimal(0);
  let v = new Decimal(0);
  for (const m of ms) {
    const s = SINAL[m.tipo] ?? Number.NaN;
    q = q.plus(new Decimal(m.quantidade.toString()).times(s));
    v = v.plus(new Decimal(m.valorTotal?.toString() ?? "NaN").times(s));
  }
  return v.dividedBy(q);
}
/** As partidas de um lançamento, "TIPO conta valor", ordenadas. */
async function partidas(lancamentoId: string | null): Promise<string[]> {
  if (lancamentoId === null) return [];
  const ps = await prisma.partidaContabil.findMany({ where: { lancamentoId }, select: { tipo: true, valor: true, conta: { select: { codigo: true } } } });
  return ps.map((p) => `${p.tipo} ${p.conta.codigo} ${p.valor.toFixed(2)}`).sort();
}
const contagem = async (): Promise<string> => [await prisma.movimentoFisicoDeEstoque.count(), await prisma.lancamentoContabil.count(), await prisma.dispensacaoDeMedicamento.count()].join("/");

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(300000);
  await entrar(n, page, "farmaceutica@ficticio.local", senha);
  const url = `/patrimonio/farmacias/${farmacia.id}`;
  const t0 = await irPara(n, page, url);
  const noLote = await page.$$eval("[data-estoque-por-lote] tr[data-lote]", (ts) => ts.map((t) => `${t.getAttribute("data-lote") ?? ""}:${t.getAttribute("data-vencido") ?? ""}`));
  conferir(noLote.includes("DIP-2601:nao") && noLote.includes("DIP-2509:sim") && noLote.includes("AMX-2603:nao"), `a farmacêutica da unidade abre a farmácia com o estoque por lote, e o vencido marcado (${noLote.join(", ")})`);
  conferir(/o estoque desta farmácia é o do depósito/.test(t0), "a tela diz de que depósito é o estoque");

  // ── R3-005 — dispensação com estoque ──
  const antesDip = await saldoDoLote(dipValido.id);
  const antesAmx = await saldoDoLote(amx.id);
  const cmDip = await custoMedio(dipValido.materialId);
  const cmAmx = await custoMedio(amx.materialId);
  const nAntes = await prisma.dispensacaoDeMedicamento.count({ where: { farmaciaId: farmacia.id } });
  const usuarioSintetico = `CNS 7000${String(Date.now()).slice(-11)}`;
  const rd = await preencherEEnviar(page, "dispensar", [
    { sel: 'input[name="identificacaoDoUsuario"]', valor: usuarioSintetico },
    { sel: 'input[name="receita"]', valor: "Receita 4512 de 09/10/2026 (fictícia)" },
    { sel: 'input[name="prescritor"]', valor: "Médica da UBS Centro, CRM-PB 0000 (fictícia)" },
    { sel: 'select[name="lote_1"]', valor: dipValido.id, tipo: "select" },
    { sel: 'input[name="quantidade_1"]', valor: "10" },
    { sel: 'select[name="lote_2"]', valor: amx.id, tipo: "select" },
    { sel: 'input[name="quantidade_2"]', valor: "21" },
  ], "dispensar");
  const disp = await prisma.dispensacaoDeMedicamento.findFirst({
    where: { farmaciaId: farmacia.id }, orderBy: { numero: "desc" },
    select: { numero: true, identificacaoDoUsuario: true, receita: true, criadoPor: true, itens: { select: { quantidade: true, loteId: true, movimentoFisico: { select: { valorTotal: true, movimentoAlmoxarifado: { select: { tipo: true, valor: true, lancamentoId: true } } } } } } },
  });
  conferir(rd.tipo === "ok" && disp !== null && (await prisma.dispensacaoDeMedicamento.count({ where: { farmaciaId: farmacia.id } })) === nAntes + 1, `dispensação nº ${String(disp?.numero ?? "?")} registrada pela tela (${rd.texto.slice(0, 70)})`);
  if (disp === null) throw new Error("sem dispensação");
  conferir(disp.identificacaoDoUsuario === usuarioSintetico && disp.receita?.startsWith("Receita 4512") === true && disp.criadoPor === "farmaceutica@ficticio.local", "destinatário pelo identificador sintético (sem nome), receita e quem dispensou gravados");
  const itemDip = disp.itens.find((i) => i.loteId === dipValido.id);
  const itemAmx = disp.itens.find((i) => i.loteId === amx.id);
  conferir(disp.itens.length === 2 && itemDip?.quantidade.toFixed(4) === "10.0000" && itemAmx?.quantidade.toFixed(4) === "21.0000", "os dois itens com lote e quantidade");
  const depoisDip = await saldoDoLote(dipValido.id);
  const depoisAmx = await saldoDoLote(amx.id);
  conferir(antesDip.minus(depoisDip).equals(10) && antesAmx.minus(depoisAmx).equals(21), `saldo dos lotes pela soma dos movimentos: DIP-2601 ${antesDip.toFixed(0)} → ${depoisDip.toFixed(0)}, AMX-2603 ${antesAmx.toFixed(0)} → ${depoisAmx.toFixed(0)}`);
  for (const [item, cm, q, rotulo] of [[itemDip, cmDip, 10, "dipirona"], [itemAmx, cmAmx, 21, "amoxicilina"]] as const) {
    const esperado = cm.times(q).toDecimalPlaces(2).toFixed(2);
    const ma = item?.movimentoFisico.movimentoAlmoxarifado;
    const ps = await partidas(ma?.lancamentoId ?? null);
    conferir(ma?.tipo === "SAIDA_CONSUMO" && ma.valor.toFixed(2) === esperado && JSON.stringify(ps) === JSON.stringify([`CREDITO 1.1.5.6.1.01.00 ${esperado}`, `DEBITO 3.3.1.1.1.99.00 ${esperado}`]),
      `consumo de ${rotulo} no almoxarifado e no razão: ${String(q)} × custo médio ${cm.toFixed(6)} = ${esperado} (${ps.join("; ")})`);
  }
  await irPara(n, page, url);
  const linha = await page.$eval(`[data-dispensacao="${String(disp.numero)}"]`, (e) => (e.textContent ?? "").replace(/\s+/g, " ").trim()).catch(() => "");
  conferir(linha.includes(usuarioSintetico) && /R3MED001 lote DIP-2601: 10\.0000/.test(linha) && /R3MED002 lote AMX-2603: 21\.0000/.test(linha), `a dispensação aparece na tela com o identificador e os itens para quem dispensa na unidade (${linha.slice(0, 140)})`);

  // ── R3-006 — o lote vencido não sai ──
  const antesVenc = await contagem();
  const saldoVencAntes = await saldoDoLote(dipVencido.id);
  const rv = await preencherEEnviar(page, "dispensar", [
    { sel: 'input[name="identificacaoDoUsuario"]', valor: usuarioSintetico },
    { sel: 'input[name="receita"]', valor: "Receita 4513 de 09/10/2026 (fictícia)" },
    { sel: 'input[name="prescritor"]', valor: "Médica da UBS Centro, CRM-PB 0000 (fictícia)" },
    { sel: 'select[name="lote_1"]', valor: dipVencido.id, tipo: "select" },
    { sel: 'input[name="quantidade_1"]', valor: "5" },
  ], "dispensar");
  conferir(rv.tipo === "erro" && /o lote DIP-2509 venceu em 05\/10\/2026[\s\S]*vencido não se entrega\. Nada foi gravado\./.test(rv.texto), `o lote vencido é recusado pela tela com o motivo (${rv.texto.slice(0, 90)})`);
  conferir((await contagem()) === antesVenc && (await saldoDoLote(dipVencido.id)).equals(saldoVencAntes), `nenhuma saída física, lançamento ou dispensação a mais (movimentos/lançamentos/dispensações ${antesVenc}), e o lote vencido segue com ${saldoVencAntes.toFixed(0)}`);

  // ── R3-007 — perda (o vencido sai pela perda, com o destino) ──
  await irPara(n, page, url);
  const cmVenc = await custoMedio(dipVencido.materialId);
  const nAj = await prisma.ajusteDaFarmacia.count({ where: { farmaciaId: farmacia.id } });
  const rp = await preencherEEnviar(page, "ajustar", [
    { sel: 'input[name="sentido"][value="PERDA"]', valor: "sim", tipo: "marcar" },
    { sel: 'select[name="loteId"]', valor: dipVencido.id, tipo: "select" },
    { sel: 'input[name="quantidade"]', valor: "50" },
    { sel: 'input[name="motivo"]', valor: "Vencimento do lote em 05/10/2026" },
    { sel: 'input[name="destino"]', valor: "Descarte por empresa licenciada, manifesto 77/2026 (fictício)" },
  ], "ajustar");
  const perda = await prisma.ajusteDaFarmacia.findFirst({ where: { farmaciaId: farmacia.id, sentido: "PERDA" }, orderBy: { criadoEm: "desc" }, select: { quantidade: true, motivo: true, destino: true, movimentoFisico: { select: { valorTotal: true, movimentoAlmoxarifado: { select: { tipo: true, lancamentoId: true } } } } } });
  const vPerda = cmVenc.times(50).toDecimalPlaces(2).toFixed(2);
  conferir(rp.tipo === "ok" && (await prisma.ajusteDaFarmacia.count({ where: { farmaciaId: farmacia.id } })) === nAj + 1 && perda?.quantidade.toFixed(4) === "50.0000" && perda.destino?.startsWith("Descarte") === true, `perda registrada pela tela com quantidade, motivo e destino (${rp.texto.slice(0, 80)})`);
  conferir((await saldoDoLote(dipVencido.id)).equals(saldoVencAntes.minus(50)), `o lote vencido baixa 50 (${saldoVencAntes.toFixed(0)} → ${(await saldoDoLote(dipVencido.id)).toFixed(0)})`);
  const psPerda = await partidas(perda?.movimentoFisico.movimentoAlmoxarifado?.lancamentoId ?? null);
  conferir(perda?.movimentoFisico.movimentoAlmoxarifado?.tipo === "AJUSTE_SAIDA" && JSON.stringify(psPerda) === JSON.stringify([`CREDITO 1.1.5.6.1.01.00 ${vPerda}`, `DEBITO 3.6.3.3.1.99.00 ${vPerda}`]), `a perda no razão: D perdas involuntárias / C estoque, ${vPerda} (${psPerda.join("; ")})`);

  // ── R3-008 — sobra, ao custo médio da posição ──
  await irPara(n, page, url);
  const cmAmx2 = await custoMedio(amx.materialId);
  const antesSobra = await saldoDoLote(amx.id);
  const rs = await preencherEEnviar(page, "ajustar", [
    { sel: 'input[name="sentido"][value="SOBRA"]', valor: "sim", tipo: "marcar" },
    { sel: 'select[name="loteId"]', valor: amx.id, tipo: "select" },
    { sel: 'input[name="quantidade"]', valor: "2" },
    { sel: 'input[name="motivo"]', valor: "Contagem física achou duas cápsulas a mais" },
  ], "ajustar");
  const sobra = await prisma.ajusteDaFarmacia.findFirst({ where: { farmaciaId: farmacia.id, sentido: "SOBRA" }, orderBy: { criadoEm: "desc" }, select: { movimentoFisico: { select: { valorUnitario: true, valorTotal: true, movimentoAlmoxarifado: { select: { tipo: true, lancamentoId: true } } } } } });
  const vSobra = cmAmx2.times(2).toDecimalPlaces(2).toFixed(2);
  conferir(rs.tipo === "ok" && sobra !== null && new Decimal(sobra.movimentoFisico.valorUnitario?.toString() ?? "NaN").minus(cmAmx2).abs().lessThan("0.000001"),
    `sobra registrada pela tela; o custo unitário gravado (${sobra?.movimentoFisico.valorUnitario?.toString() ?? "?"}) é o custo médio da posição recalculado aqui (${cmAmx2.toFixed(6)}) (${rs.texto.slice(0, 80)})`);
  conferir((await saldoDoLote(amx.id)).equals(antesSobra.plus(2)), "o lote sobe 2");
  const psSobra = await partidas(sobra?.movimentoFisico.movimentoAlmoxarifado?.lancamentoId ?? null);
  conferir(JSON.stringify(psSobra) === JSON.stringify([`CREDITO 4.6.3.9.1.00.00 ${vSobra}`, `DEBITO 1.1.5.6.1.01.00 ${vSobra}`]), `a sobra no razão: D estoque / C outros ganhos, ${vSobra} (${psSobra.join("; ")})`);
  await irPara(n, page, url);
  const custos = await page.$$eval("[data-ajuste] [data-custo-do-ajuste]", (s) => s.map((e) => (e.textContent ?? "").trim()));
  conferir(custos.some((c) => /ao custo médio de R\$ [\d,]+ por unidade \(posição do depósito no dia\)/.test(c)), `a tela diz a origem do valor do ajuste (${custos[0] ?? "nada"})`);

  // ── a recusa por unidade: o farmacêutico de outra unidade ──
  const ctx = await nav.createBrowserContext();
  const outra = await ctx.newPage();
  outra.setDefaultTimeout(300000);
  await entrar(n, outra, "farmaceutico.assistencia@ficticio.local", senha);
  const tOutra = await irPara(n, outra, url);
  const formsNaOutra = (await outra.$('form[data-acao="dispensar"]')) !== null || (await outra.$('form[data-acao="ajustar"]')) !== null;
  conferir(!formsNaOutra && !tOutra.includes(usuarioSintetico), "o farmacêutico de outra unidade não vê os formulários nem o identificador do usuário");
  await ctx.close();
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da farmácia com estoque completo.");
