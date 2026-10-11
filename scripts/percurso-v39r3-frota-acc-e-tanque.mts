import "dotenv/config";
import Decimal from "decimal.js";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { diaCivil, meioDiaCivil } from "../packages/datas/index.js";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V39-R3 (R3-013, R3-018) — PELA TELA: A ACC COMO CATEGORIA PRÓPRIA E O TANQUE PRÓPRIO DE COMBUSTÍVEL.
 *
 * Pré-requisito: a massa `semear-massa-r3.mts` (caminhão QRT3A01 a diesel, motocicleta QRT3B02, condutora 9001 com CNH
 * B, tanque TQ-R3 de 5.000 L com 3.000 L de diesel recebidos por liquidação; gestor da frota).
 *   R3-013: o gestor cadastra um condutor com ACC, declara que a QRT3B02 aceita ACC; a ordem para a condutora B é
 *           recusada nomeando as categorias; para o condutor ACC, emitida;
 *   R3-018: a tela mostra o saldo do tanque; o abastecimento interno do caminhão (pelo tanque) baixa o tanque uma vez,
 *           com o lançamento do consumo; o abastecimento em posto externo não toca o tanque; gasolina pelo tanque de diesel
 *           é recusada; a anulação do interno devolve o combustível.
 * O saldo do tanque é conferido pela soma dos movimentos, aqui. GRAVA (base de ensaio ou demonstração).
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

const [caminhao, moto, bruna, tanque] = await Promise.all([
  prisma.veiculoDaFrota.findFirst({ where: { placa: "QRT3A01" }, select: { id: true } }),
  prisma.veiculoDaFrota.findFirst({ where: { placa: "QRT3B02" }, select: { id: true } }),
  prisma.condutorDaFrota.findFirst({ where: { matricula: "9001" }, select: { id: true } }),
  prisma.tanqueDeCombustivel.findUnique({ where: { codigo: "TQ-R3" }, select: { id: true, depositoId: true, materialId: true } }),
]);
if (caminhao === null || moto === null || bruna === null || tanque === null) throw new Error("A massa da frota da R3 não está nesta base. Rode scripts/demonstracao/semear-massa-r3.mts.");
async function saldoDoTanque(): Promise<Decimal> {
  const ms = await prisma.movimentoFisicoDeEstoque.findMany({ where: { depositoId: tanque!.depositoId, materialId: tanque!.materialId }, select: { tipo: true, quantidade: true } });
  return ms.reduce((t, m) => t.plus(new Decimal(m.quantidade.toString()).times(SINAL[m.tipo] ?? Number.NaN)), new Decimal(0));
}
const hoje = diaCivil(new Date());
const daqui = (dias: number): string => diaCivil(new Date(meioDiaCivil(hoje).getTime() + dias * 86_400_000));

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(300000);
  await entrar(n, page, "gestor.frota@ficticio.local", senha);

  // ── R3-013: a ACC ──
  let caio = await prisma.condutorDaFrota.findFirst({ where: { matricula: "9002" }, select: { id: true } });
  if (caio === null) {
    await irPara(n, page, "/patrimonio/frota/operacao");
    const r = await preencherEEnviar(page, "cadastrar-condutor", [
      { sel: 'input[name="nome"]', valor: "Caio Entregador (fictício)" },
      { sel: 'input[name="matricula"]', valor: "9002" },
      { sel: 'input[name="cnhNumero"]', valor: "66677788899" },
      { sel: 'select[name="cnhCategoria"]', valor: "ACC", tipo: "select" },
      { sel: 'input[name="cnhValidade"]', valor: "2029-12-31", tipo: "data" },
      { sel: 'input[name="vinculo"]', valor: "Servidor efetivo" },
      { sel: 'input[name="fundamento"]', valor: "ACC apresentada (fictícia)" },
    ]);
    caio = await prisma.condutorDaFrota.findFirst({ where: { matricula: "9002" }, select: { id: true } });
    const cat = caio === null ? "" : (await prisma.versaoDoCondutor.findFirst({ where: { condutorId: caio.id }, select: { cnhCategoria: true } }))?.cnhCategoria;
    conferir(r.tipo === "ok" && cat === "ACC", `condutor com ACC cadastrado pela tela, gravado como ACC (${r.texto.slice(0, 60)})`);
  } else conferir(true, "condutor com ACC já cadastrado (corrida anterior)");
  if (caio === null) throw new Error("sem condutor ACC");
  if ((await prisma.exigenciaDeHabilitacaoDaFrota.count({ where: { veiculoId: moto.id } })) === 0) {
    await irPara(n, page, "/patrimonio/frota/operacao");
    const r = await preencherEEnviar(page, "exigencia-de-habilitacao", [
      { sel: 'select[name="bem"]', valor: `v:${moto.id}`, tipo: "select" },
      { sel: 'input[name="categorias"][value="ACC"]', valor: "sim", tipo: "marcar" },
      { sel: 'input[name="vigenteDesde"]', valor: "2026-01-02", tipo: "data" },
      { sel: 'input[name="fundamento"]', valor: "Ciclomotor de entregas (fictício)" },
    ]);
    const ex = await prisma.exigenciaDeHabilitacaoDaFrota.findFirst({ where: { veiculoId: moto.id }, select: { categoriasAceitas: true } });
    conferir(r.tipo === "ok" && JSON.stringify(ex?.categoriasAceitas) === JSON.stringify(["ACC"]), `a motocicleta passa a aceitar só ACC, declarado pela tela (${r.texto.slice(0, 50)})`);
  } else conferir(true, "exigência da motocicleta já declarada (corrida anterior)");
  const emitir = async (condutorId: string): Promise<{ tipo: string; texto: string }> => {
    await irPara(n, page, "/patrimonio/frota/operacao");
    return preencherEEnviar(page, "emitir-ordem", [
      { sel: 'select[name="bem"]', valor: `v:${moto.id}`, tipo: "select" },
      { sel: 'select[name="condutorId"]', valor: condutorId, tipo: "select" },
      { sel: 'select[name="combustivel"]', valor: "GASOLINA", tipo: "select" },
      { sel: 'input[name="quantidadeAutorizada"]', valor: "10" },
      { sel: 'input[name="validaAte"]', valor: daqui(5), tipo: "data" },
      { sel: 'input[name="local"]', valor: "Posto do contrato de combustível (fictício)" },
    ]);
  };
  const ordensAntes = await prisma.ordemDeAbastecimento.count({ where: { veiculoId: moto.id } });
  const rb = await emitir(bruna.id);
  conferir(rb.tipo === "erro" && /é da categoria B, e o veículo QRT3B02 aceita ACC/.test(rb.texto) && (await prisma.ordemDeAbastecimento.count({ where: { veiculoId: moto.id } })) === ordensAntes, `a ordem para a condutora com CNH B é recusada pela tela: a ACC não é presumida (${rb.texto.slice(0, 90)})`);
  const rc = await emitir(caio.id);
  conferir(rc.tipo === "ok" && (await prisma.ordemDeAbastecimento.count({ where: { veiculoId: moto.id } })) === ordensAntes + 1, `a ordem para o condutor com ACC é emitida pela tela (${rc.texto.slice(0, 60)})`);

  // ── R3-018: o tanque ──
  await irPara(n, page, "/patrimonio/frota/operacao");
  const saldo0 = await saldoDoTanque();
  const naTela = await page.$eval('[data-tanque="TQ-R3"] [data-saldo-do-tanque]', (e) => e.textContent ?? "").catch(() => "");
  conferir(naTela.startsWith(`${saldo0.toFixed(2).replace(".", ",")} L de 5000,00 L`), `a tela mostra o saldo do tanque pela soma dos movimentos (${naTela})`);
  const abastecer = async (extra: { sel: string; valor: string; tipo?: "select" | "data" | "marcar" }[], quantidade: string, documento: string): Promise<{ tipo: string; texto: string }> => {
    await irPara(n, page, "/patrimonio/frota");
    return preencherEEnviar(page, 'form[data-acao="registrar-abastecimento"][aria-label="Registrar abastecimento de QRT3A01"]', [
      { sel: 'input[name="data"]', valor: hoje, tipo: "data" },
      { sel: 'select[name="combustivel"]', valor: "DIESEL", tipo: "select" },
      { sel: 'input[name="quantidade"]', valor: quantidade },
      { sel: 'input[name="documento"]', valor: documento },
      ...extra,
    ], "registrar-abastecimento");
  };
  const marca = String(Date.now()).slice(-6);
  const ri = await abastecer([{ sel: 'select[name="tanqueId"]', valor: tanque.id, tipo: "select" }], "50", `Requisição interna ${marca} (fictícia)`);
  const interno = await prisma.abastecimentoDaFrota.findFirst({ where: { documento: `Requisição interna ${marca} (fictícia)` }, select: { id: true, tanqueId: true, movimentoFisico: { select: { tipo: true, quantidade: true, valorTotal: true, movimentoAlmoxarifado: { select: { lancamentoId: true } } } } } });
  conferir(ri.tipo === "ok" && interno?.tanqueId === tanque.id && interno.movimentoFisico?.tipo === "SAIDA" && interno.movimentoFisico.quantidade.toFixed(2) === "50.00", `abastecimento interno pela tela, ligado à saída do tanque (${ri.texto.slice(0, 60)})`);
  conferir((await saldoDoTanque()).equals(saldo0.minus(50)), `o tanque baixa 50 L uma vez: ${saldo0.toFixed(2)} → ${(await saldoDoTanque()).toFixed(2)}`);
  const ps = await prisma.partidaContabil.findMany({ where: { lancamentoId: interno?.movimentoFisico?.movimentoAlmoxarifado?.lancamentoId ?? "" }, select: { tipo: true, valor: true, conta: { select: { codigo: true } } } });
  const v = interno?.movimentoFisico?.valorTotal.toFixed(2) ?? "?";
  conferir(JSON.stringify(ps.map((p) => `${p.tipo} ${p.conta.codigo} ${p.valor.toFixed(2)}`).sort()) === JSON.stringify([`CREDITO 1.1.5.6.1.01.00 ${v}`, `DEBITO 3.3.1.1.1.99.00 ${v}`]), `o consumo do diesel no razão, ao custo do tanque (${v})`);
  const saldo1 = await saldoDoTanque();
  const re = await abastecer([], "40", `Cupom do posto ${marca} (fictício)`);
  conferir(re.tipo === "ok" && (await saldoDoTanque()).equals(saldo1), `abastecimento em posto externo pela tela não toca o tanque (${re.texto.slice(0, 50)})`);
  await irPara(n, page, "/patrimonio/frota");
  const rg = await preencherEEnviar(page, 'form[data-acao="registrar-abastecimento"][aria-label="Registrar abastecimento de QRT3A01"]', [
    { sel: 'input[name="data"]', valor: hoje, tipo: "data" },
    { sel: 'select[name="combustivel"]', valor: "GASOLINA", tipo: "select" },
    { sel: 'input[name="quantidade"]', valor: "10" },
    { sel: 'input[name="documento"]', valor: `Gasolina pelo tanque ${marca}` },
    { sel: 'select[name="tanqueId"]', valor: tanque.id, tipo: "select" },
  ], "registrar-abastecimento");
  conferir(rg.tipo === "erro" && /O tanque TQ-R3 guarda diesel, e o abastecimento é de gasolina/.test(rg.texto) && (await saldoDoTanque()).equals(saldo1), `gasolina pelo tanque de diesel é recusada pela tela, nada sai do tanque (${rg.texto.slice(0, 70)})`);
  // a anulação do interno devolve o combustível
  await irPara(n, page, "/patrimonio/frota");
  const formAnular = `form[data-acao="anular-abastecimento"]:has(input[name="id"][value="${interno?.id ?? ""}"])`;
  const ra = await preencherEEnviar(page, formAnular, [{ sel: 'input[name="motivo"]', valor: "Requisição lançada em duplicidade (fictícia)" }]);
  conferir(ra.tipo !== "erro" && (await prisma.anulacaoDeAbastecimento.count({ where: { abastecimentoId: interno?.id ?? "" } })) === 1 && (await saldoDoTanque()).equals(saldo0), `a anulação do abastecimento interno pela tela devolve os 50 L ao tanque (${(await saldoDoTanque()).toFixed(2)})`);
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da ACC e do tanque completo.");
