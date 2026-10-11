import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { Decimal } from "../../packages/contracts/index.js";
import { meioDiaCivil } from "../../packages/datas/index.js";
import { roteiroEmpenho, roteiroLiquidacao } from "../m05-despesa/dominio.js";
import { liquidar } from "../m05-despesa/servico-bloco2.js";
import { empenhar } from "../m05-despesa/servico.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { criarM05DepsComAlmoxarifado } from "../m10-patrimonial/adapter-m05-almox.js";
import { cadastrarClasseDeMaterial, conferirAlmoxarifadoContraRazao, estornarMovimentoAlmoxarifado } from "../m10-patrimonial/almoxarifado.js";
import { cadastrarDeposito, cadastrarGrupoDeMaterial, cadastrarMaterial, cadastrarUnidadeDeMedida, chaveDaPosicao, transferirEntreDepositos } from "../m10-patrimonial/estoque-fisico.js";
import { travar } from "../../packages/locks/index.js";
import { cadastrarUnidadeGestora } from "../m01-core-contabil/unidade-gestora.js";
import { anularAbastecimento, cadastrarVeiculo, registrarAbastecimento } from "./servico.js";
import { cadastrarTanqueDeCombustivel } from "./tanque.js";

/**
 * V39-R3 (R3-018, V39-068) — O TANQUE PRÓPRIO DE COMBUSTÍVEL.
 *
 * Fixture (contas à mão): tanque TQ-1 de 1.000 L; entrada de 800 L de diesel a 6,00 = 4.800,00 pela liquidação.
 * Abastecimento interno de 50 L → saldo 750 L, consumo 50 × 6,00 = 300,00 (D VPD combustíveis / C estoque). Anulado →
 * 800 L de novo. Dois abastecimentos simultâneos de 500 L com 800 no tanque: um grava, o outro é recusado pelo saldo.
 */
const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
const POR = "patrimonio@cg.pb.gov.br";
const D = (dia: string): Date => meioDiaCivil(dia);
const ESTOQUE = "1.1.5.6.1.01.00";
const VPD = "3.3.1.1.1.01.00";

let deps: M05Deps;
let veiculoId = "";
let classeId = "";
let depositoId = "";
let diesel = "";
let litro = "";
let grupoId = "";
let tanqueId = "";
let n = 0;

async function entrada(materialId: string, quantidade: string, unitario: string, deposito = depositoId): Promise<void> {
  n += 1;
  const total = new Decimal(quantidade).times(unitario).toFixed(2);
  const e = await empenhar({ fichaId: "ficha-1", numero: `NE-${String(n)}`, tipo: "ORDINARIO", valor: total, data: D("2026-03-10"), credorCpfCnpj: "12345678000195", historico: "compra de combustível", categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: POR }, roteiroEmpenho({ creditoDisponivel: "6.2.2.1.1.00.00", creditoEmpenhado: "6.2.2.1.3.01.00" }), deps);
  await liquidar(
    { empenhoId: e.empenhoId, numero: `NL-${String(n)}`, valor: total, data: D("2026-04-01"), responsavelAtesto: "Garagem", historico: "combustível recebido no tanque", criadoPor: POR,
      entradasDeMaterial: [{ classeDeMaterialId: classeId, valor: total, fisica: { materialId, depositoId: deposito, quantidade, valorUnitario: unitario } }] },
    roteiroLiquidacao({ variacaoDiminutiva: ESTOQUE, obrigacaoAPagar: "2.1.3.1.1.00.00", creditoEmpenhado: "6.2.2.1.3.01.00", creditoLiquidado: "6.2.2.1.3.03.00" }),
    deps
  );
}
async function saldo(): Promise<string> {
  const ms = await prisma.movimentoFisicoDeEstoque.findMany({ where: { depositoId, materialId: diesel }, select: { tipo: true, quantidade: true } });
  const sinal: Record<string, number> = { ENTRADA: 1, SAIDA: -1, AJUSTE_ENTRADA: 1, AJUSTE_SAIDA: -1, ESTORNO_SAIDA: 1, ESTORNO_ENTRADA: -1, TRANSFERENCIA_ENTRADA: 1, TRANSFERENCIA_SAIDA: -1 };
  return ms.reduce((t, m) => t.plus(new Decimal(m.quantidade.toFixed(4)).times(sinal[m.tipo] ?? Number.NaN)), new Decimal(0)).toFixed(2);
}
const abastecer = (quantidade: string, extra: Record<string, unknown> = {}) =>
  registrarAbastecimento(prisma, { veiculoId, data: "2026-04-10", combustivel: "DIESEL", quantidade, documento: "Requisição da garagem", tanqueId, criadoPor: POR, ...extra });

beforeEach(async () => {
  await limparBanco(prisma);
  deps = criarM05DepsComAlmoxarifado(prisma);
  n = 0;
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-estoque", codigo: ESTOQUE, nome: "Material de consumo", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true, indicadorSuperavit: "P" },
      { id: "c-vpd", codigo: VPD, nome: "Combustíveis e lubrificantes automotivos", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true },
      { id: "c-forn", codigo: "2.1.3.1.1.00.00", nome: "Fornecedores", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-disp", codigo: "6.2.2.1.1.00.00", nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-emp", codigo: "6.2.2.1.3.01.00", nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-liq", codigo: "6.2.2.1.3.03.00", nome: "Crédito Liquidado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "02011", descricao: "Obras e Transportes", orgaoId: "org-01" } });
  await prisma.funcao.create({ data: { id: "fun-26", codigo: "26", nome: "Transporte" } });
  await prisma.subfuncao.create({ data: { id: "sub-782", codigo: "782", nome: "Transporte rodoviário" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0026", descricao: "Transporte" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2026", descricao: "Frota", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({ data: { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "30", codigoCompleto: "339030", descricao: "Material de consumo" } });
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await criarFichaDeTeste(prisma, { id: "ficha-1", exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-26", subfuncaoId: "sub-782", programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd", fonteId: "fnt-500", valorDotado: "500000.00" });
  classeId = (await cadastrarClasseDeMaterial(prisma, { codigo: "30.01", descricao: "Combustíveis", contaContabilId: "c-estoque", criadoPor: POR })).classeDeMaterialId;
  await prisma.roteiroAlmoxarifado.create({ data: { tipo: "SAIDA_CONSUMO", contaDebitoId: "c-vpd", contaCreditoId: "c-estoque", criadoPor: POR } });
  ({ depositoId } = await cadastrarDeposito(prisma, { codigo: "TQ-GAR", nome: "Tanque da garagem", unidadeOrcId: "uo-01", criadoPor: POR }));
  litro = (await cadastrarUnidadeDeMedida(prisma, { sigla: "L", descricao: "Litro", criadoPor: POR })).unidadeDeMedidaId;
  grupoId = (await cadastrarGrupoDeMaterial(prisma, { codigo: "01", descricao: "Combustíveis", criadoPor: POR })).grupoId;
  diesel = (await cadastrarMaterial(prisma, { codigo: "CMB001", descricaoSucinta: "Óleo diesel S10", descricaoDetalhada: "Óleo diesel S10 (fixture)", grupoId, classificacao: "CONSUMO", categoria: "COMBUSTIVEL", classeDeMaterialId: classeId, controlaLote: false, unidades: [{ unidadeDeMedidaId: litro, fatorParaEstoque: "1", ehDeEstoque: true }], criadoPor: POR })).materialId;
  await prisma.entidadeContabil.create({ data: { id: "ent-pref", codigo: "0001", criadoPor: POR } });
  const ugId = (await cadastrarUnidadeGestora(prisma, { codigoTce: "201001", nome: "Prefeitura Municipal", cnpj: "11222333000181", naturezaJuridica: "PREFEITURA_OU_SECRETARIA", entidadeContabilId: "ent-pref", vigenteDesde: meioDiaCivil("2026-01-01"), fundamento: "Cadastro de UG do Tribunal (fixture do teste)", criadoPor: POR })).id;
  veiculoId = (await cadastrarVeiculo(prisma, { ugId, placa: "CAM1234", anoModelo: 2021, renavam: "987654321", numeroModelo: "4321", tipoFrota: "PROPRIO", combustivelPrincipal: "DIESEL", vigenteDesde: "2026-03-01", situacaoInicial: "EM_USO", fundamento: "Documento do caminhão (fixture)", criadoPor: POR })).id;
  tanqueId = (await cadastrarTanqueDeCombustivel(prisma, { codigo: "TQ-1", descricao: "Tanque aéreo da garagem", depositoId, materialId: diesel, combustivel: "DIESEL", capacidade: "1000", fundamento: "Placa do tanque (fixture)", criadoPor: POR })).id;
}, 120000);
afterAll(async () => prisma.$disconnect());

describe("V39-R3 (R3-018) — o tanque próprio de combustível", { timeout: 120000 }, () => {
  it("recebimento até a capacidade, só do combustível do tanque; o abastecimento interno consome UMA vez com o lançamento; o externo não toca o tanque; a anulação devolve", async () => {
    await entrada(diesel, "800", "6.00");
    await expect(entrada(diesel, "300", "6.00")).rejects.toThrow(/O tanque TQ-1 tem 800\.00 L e capacidade de 1000\.00 L: a entrada de 300\.00 L passa da capacidade/);
    const gasolina = (await cadastrarMaterial(prisma, { codigo: "CMB002", descricaoSucinta: "Gasolina comum", descricaoDetalhada: "Gasolina (fixture)", grupoId, classificacao: "CONSUMO", categoria: "COMBUSTIVEL", classeDeMaterialId: classeId, controlaLote: false, unidades: [{ unidadeDeMedidaId: litro, fatorParaEstoque: "1", ehDeEstoque: true }], criadoPor: POR })).materialId;
    await expect(entrada(gasolina, "10", "6.50")).rejects.toThrow(/O tanque TQ-1 guarda outro combustível: a entrada de CMB002 não cabe nele/);
    expect(await saldo()).toBe("800.00");

    const a = await abastecer("50");
    const ab = await prisma.abastecimentoDaFrota.findUniqueOrThrow({ where: { id: a.id }, select: { tanqueId: true, movimentoFisico: { select: { tipo: true, quantidade: true, movimentoAlmoxarifado: { select: { lancamentoId: true } } } } } });
    expect([ab.tanqueId, ab.movimentoFisico?.tipo, ab.movimentoFisico?.quantidade.toFixed(2)]).toEqual([tanqueId, "SAIDA", "50.00"]);
    const ps = await prisma.partidaContabil.findMany({ where: { lancamentoId: ab.movimentoFisico?.movimentoAlmoxarifado?.lancamentoId ?? "" }, select: { tipo: true, valor: true, conta: { select: { codigo: true } } } });
    expect(ps.map((p) => `${p.tipo} ${p.conta.codigo} ${p.valor.toFixed(2)}`).sort()).toEqual([`CREDITO ${ESTOQUE} 300.00`, `DEBITO ${VPD} 300.00`]);
    expect(await saldo()).toBe("750.00");
    await registrarAbastecimento(prisma, { veiculoId, data: "2026-04-11", combustivel: "DIESEL", quantidade: "40", documento: "Cupom do posto (fixture)", criadoPor: POR });
    expect(await saldo()).toBe("750.00");
    await expect(abastecer("10", { combustivel: "GASOLINA" })).rejects.toThrow(/O tanque TQ-1 guarda diesel, e o abastecimento é de gasolina/);
    await expect(abastecer("751")).rejects.toThrow(/SAÍDA MAIOR QUE/);

    const mov = await prisma.abastecimentoDaFrota.findUniqueOrThrow({ where: { id: a.id }, select: { movimentoFisico: { select: { movimentoAlmoxarifadoId: true } } } });
    await expect(estornarMovimentoAlmoxarifado(prisma, { movimentoId: mov.movimentoFisico!.movimentoAlmoxarifadoId!, dataMovimento: D("2026-04-12"), motivo: "Tentativa pelo almoxarifado", criadoPor: POR })).rejects.toThrow(/é o consumo de um abastecimento pelo tanque da frota: anule o abastecimento/);
    await anularAbastecimento(prisma, { id: a.id, motivo: "Requisição lançada em duplicidade (fixture)", criadoPor: POR });
    expect(await saldo()).toBe("800.00");
    await expect(anularAbastecimento(prisma, { id: a.id, motivo: "De novo (fixture)", criadoPor: POR })).rejects.toThrow(/já foi anulado/);
    expect(await saldo()).toBe("800.00");
    const conf = await conferirAlmoxarifadoContraRazao(prisma, "c-estoque");
    expect([conf.pelosMovimentos.toFixed(2), conf.peloRazao.toFixed(2)]).toEqual(["4800.00", "4800.00"]);
  });

  it("A TRAVA DO TANQUE EXISTE: com a posição do tanque travada por outra transação, o abastecimento interno espera", async () => {
    await entrada(diesel, "800", "6.00");
    let liberar: () => void = () => undefined;
    const presa = new Promise<void>((x) => { liberar = x; });
    let travado: () => void = () => undefined;
    const jaTravou = new Promise<void>((x) => { travado = x; });
    const segurando = prisma.$transaction(async (tx) => { await travar(tx, "PosicaoFisicaDeEstoque", [chaveDaPosicao(diesel, depositoId)]); travado(); await presa; }, { timeout: 20_000 });
    await jaTravou;
    let terminou = false;
    const ab = abastecer("10").then(() => { terminou = true; });
    await new Promise((x) => setTimeout(x, 800));
    expect(terminou).toBe(false);
    liberar();
    await segurando;
    await ab;
    expect([terminou, await saldo()]).toEqual([true, "790.00"]);
  });

  it("CONCORRÊNCIA: dois VEÍCULOS abastecem 500 L do mesmo tanque com 800 — um grava, o outro é recusado pelo saldo", async () => {
    await entrada(diesel, "800", "6.00");
    const ugId = (await prisma.unidadeGestora.findFirstOrThrow({ select: { id: true } })).id;
    const outro = (await cadastrarVeiculo(prisma, { ugId, placa: "CAM5678", anoModelo: 2021, renavam: "987654322", numeroModelo: "4322", tipoFrota: "PROPRIO", combustivelPrincipal: "DIESEL", vigenteDesde: "2026-03-01", situacaoInicial: "EM_USO", fundamento: "Documento do segundo caminhão (fixture)", criadoPor: POR })).id;
    const r = await Promise.allSettled([abastecer("500"), abastecer("500", { veiculoId: outro })]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(String((r.find((x) => x.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/SAÍDA MAIOR QUE/);
    expect(await saldo()).toBe("300.00");
  });

  it("TODA ENTRADA NO TANQUE é conferida: a transferência acima da capacidade ou de outro material, e a devolução da anulação durante o inventário, são recusadas", async () => {
    await entrada(diesel, "900", "6.00");
    const { depositoId: almox } = await cadastrarDeposito(prisma, { codigo: "ALM-1", nome: "Almoxarifado", unidadeOrcId: "uo-01", criadoPor: POR });
    await entrada(diesel, "300", "6.00", almox);
    await expect(transferirEntreDepositos(prisma, { materialId: diesel, depositoOrigemId: almox, depositoDestinoId: depositoId, quantidade: "200", dataMovimento: D("2026-04-05"), motivo: "Reabastecer o tanque", criadoPor: POR }))
      .rejects.toThrow(/O tanque TQ-1 tem 900\.00 L e capacidade de 1000\.00 L: a entrada de 200\.00 L passa da capacidade/);
    await transferirEntreDepositos(prisma, { materialId: diesel, depositoOrigemId: almox, depositoDestinoId: depositoId, quantidade: "100", dataMovimento: D("2026-04-05"), motivo: "Reabastecer o tanque", criadoPor: POR });
    expect(await saldo()).toBe("1000.00");
    const papel = (await cadastrarMaterial(prisma, { codigo: "EXP001", descricaoSucinta: "Papel A4", descricaoDetalhada: "Papel (fixture)", grupoId, classificacao: "CONSUMO", categoria: "ESTOCAVEL", classeDeMaterialId: classeId, controlaLote: false, unidades: [{ unidadeDeMedidaId: litro, fatorParaEstoque: "1", ehDeEstoque: true }], criadoPor: POR })).materialId;
    await entrada(papel, "10", "1.00", almox);
    await expect(transferirEntreDepositos(prisma, { materialId: papel, depositoOrigemId: almox, depositoDestinoId: depositoId, quantidade: "1", dataMovimento: D("2026-04-06"), motivo: "Engano de depósito", criadoPor: POR }))
      .rejects.toThrow(/O tanque TQ-1 guarda outro combustível: a entrada de EXP001 não cabe nele/);
    // a anulação devolve ao tanque: durante o inventário do tanque, o bloqueio vale para ela
    const a = await abastecer("100");
    await prisma.inventarioDeEstoque.create({ data: { depositoId, dataAbertura: D("2026-04-01"), criadoPor: POR } });
    await expect(anularAbastecimento(prisma, { id: a.id, motivo: "Lançado em duplicidade (fixture)", criadoPor: POR })).rejects.toThrow(/MOVIMENTAÇÃO BLOQUEADA/);
    expect([await saldo(), await prisma.anulacaoDeAbastecimento.count()]).toEqual(["900.00", 0]);
  });

  it("UNIDADES COERENTES: material que não é combustível em litros, gás natural e depósito já tanque são recusados com o motivo", async () => {
    const { depositoId: outro } = await cadastrarDeposito(prisma, { codigo: "TQ-2", nome: "Outro tanque", unidadeOrcId: "uo-01", criadoPor: POR });
    const un = (await cadastrarUnidadeDeMedida(prisma, { sigla: "UN", descricao: "Unidade", criadoPor: POR })).unidadeDeMedidaId;
    const galao = (await cadastrarMaterial(prisma, { codigo: "CMB009", descricaoSucinta: "Diesel em galão", descricaoDetalhada: "Galão (fixture)", grupoId, classificacao: "CONSUMO", categoria: "COMBUSTIVEL", classeDeMaterialId: classeId, controlaLote: false, unidades: [{ unidadeDeMedidaId: un, fatorParaEstoque: "1", ehDeEstoque: true }], criadoPor: POR })).materialId;
    const tq = (extra: Record<string, unknown>) => cadastrarTanqueDeCombustivel(prisma, { codigo: "TQ-2", descricao: "Tanque reserva", depositoId: outro, materialId: diesel, combustivel: "DIESEL", capacidade: "500", fundamento: "Placa (fixture)", criadoPor: POR, ...extra });
    await expect(tq({ materialId: galao })).rejects.toThrow(/tem UN como unidade de estoque: o tanque se mede em litros/);
    await expect(tq({ combustivel: "GAS_NATURAL" })).rejects.toThrow(/gás natural e eletricidade não se estocam em tanque/);
    await expect(tq({ depositoId })).rejects.toThrow(/já é o tanque TQ-1/);
    await expect(tq({ codigo: "TQ-1" })).rejects.toThrow(/Já há tanque com o código TQ-1/);
    const comLote = (await cadastrarMaterial(prisma, { codigo: "CMB010", descricaoSucinta: "Diesel por lote", descricaoDetalhada: "Lote (fixture)", grupoId, classificacao: "CONSUMO", categoria: "COMBUSTIVEL", classeDeMaterialId: classeId, controlaLote: true, unidades: [{ unidadeDeMedidaId: litro, fatorParaEstoque: "1", ehDeEstoque: true }], criadoPor: POR })).materialId;
    await expect(tq({ materialId: comLote })).rejects.toThrow(/controla lote: o combustível do tanque se mistura/);
    await entrada(diesel, "5", "6.00", outro);
    const gasolina = (await cadastrarMaterial(prisma, { codigo: "CMB011", descricaoSucinta: "Gasolina", descricaoDetalhada: "Gasolina (fixture)", grupoId, classificacao: "CONSUMO", categoria: "COMBUSTIVEL", classeDeMaterialId: classeId, controlaLote: false, unidades: [{ unidadeDeMedidaId: litro, fatorParaEstoque: "1", ehDeEstoque: true }], criadoPor: POR })).materialId;
    await expect(tq({ materialId: gasolina, combustivel: "GASOLINA" })).rejects.toThrow(/O depósito TQ-2 já guarda CMB001: o tanque guarda só o combustível dele/);
    expect(await prisma.tanqueDeCombustivel.count()).toBe(1);
  });
});
