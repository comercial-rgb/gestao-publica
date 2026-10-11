import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { Decimal } from "../../packages/contracts/index.js";
import { meioDiaCivil } from "../../packages/datas/index.js";
import { travar } from "../../packages/locks/index.js";
import { roteiroEmpenho, roteiroLiquidacao } from "../m05-despesa/dominio.js";
import { liquidar } from "../m05-despesa/servico-bloco2.js";
import { empenhar } from "../m05-despesa/servico.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { criarM05DepsComAlmoxarifado } from "./adapter-m05-almox.js";
import { cadastrarClasseDeMaterial, conferirAlmoxarifadoContraRazao, estornarMovimentoAlmoxarifado } from "./almoxarifado.js";
import {
  abrirInventarioDeEstoque,
  aplicarAjusteDoInventario,
  cadastrarDeposito,
  cadastrarGrupoDeMaterial,
  cadastrarMaterial,
  cadastrarUnidadeDeMedida,
  chaveDaPosicao,
  estornarMovimentoFisico,
  fecharInventarioDeEstoque,
  registrarContagemDeInventario,
  registrarSaidaFisica,
} from "./estoque-fisico.js";

/**
 * V39-R3 (R3-012) — O AJUSTE DO INVENTÁRIO DO ALMOXARIFADO GERAL, pelo motor da farmácia.
 *
 * Fixture (contas à mão): papel A4 (sem lote) 100 resmas a 25,00 = 2.500,00; caneta (controla lote) lote C1 com 50 a
 * 2,00 = 100,00. Inventário aberto em 01/05 e fechado em 02/05: contado papel 95 (falta 5), caneta C1 52 (sobra 2).
 * Aplicado em 03/05 por quem não contou: falta 5 × 25,00 = 125,00 (D VPD / C estoque); sobra 2 × 2,00 = 4,00 (D estoque /
 * C VPA). Estoque no razão: 2.600,00 − 125,00 + 4,00 = 2.479,00.
 */
const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
const POR = "almoxarifado@cg.pb.gov.br";
const D = (dia: string): Date => meioDiaCivil(dia);
const ESTOQUE = "1.1.5.6.1.01.00";
const VPD = "3.3.1.1.1.99.00";
const VPD_PERDA = "3.6.3.3.1.99.00";
const VPA = "4.6.3.9.1.00.00";

let deps: M05Deps;
let classeId = "";
let depositoId = "";
let papel = "";
let caneta = "";
let loteC1 = "";
let contador = "";
let chefe = "";
let n = 0;

async function entrada(materialId: string, quantidade: string, unitario: string, lote?: { identificacao: string; validade: string }): Promise<void> {
  n += 1;
  const total = new Decimal(quantidade).times(unitario).toFixed(2);
  const e = await empenhar({ fichaId: "ficha-1", numero: `NE-${String(n)}`, tipo: "ORDINARIO", valor: total, data: D("2026-03-10"), credorCpfCnpj: "12345678000195", historico: "compra de material", categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: POR }, roteiroEmpenho({ creditoDisponivel: "6.2.2.1.1.00.00", creditoEmpenhado: "6.2.2.1.3.01.00" }), deps);
  await liquidar(
    { empenhoId: e.empenhoId, numero: `NL-${String(n)}`, valor: total, data: D("2026-04-01"), responsavelAtesto: "Almoxarife", historico: "material recebido", criadoPor: POR,
      entradasDeMaterial: [{ classeDeMaterialId: classeId, valor: total, fisica: { materialId, depositoId, quantidade, valorUnitario: unitario, ...(lote === undefined ? {} : { loteIdentificacao: lote.identificacao, loteValidade: D(lote.validade) }) } }] },
    roteiroLiquidacao({ variacaoDiminutiva: ESTOQUE, obrigacaoAPagar: "2.1.3.1.1.00.00", creditoEmpenhado: "6.2.2.1.3.01.00", creditoLiquidado: "6.2.2.1.3.03.00" }),
    deps
  );
}

async function usuarioCom(identificador: string, acoes: readonly string[], unidadeOrcId: string | null = null): Promise<string> {
  const u = await prisma.usuario.create({ data: { identificador, nome: identificador, criadoPor: "TESTE" }, select: { id: true } });
  const p = await prisma.perfil.create({ data: { nome: `PERFIL-${identificador}`, descricao: "perfil restrito do teste", criadoPor: "TESTE", permissoes: { create: acoes.map((acao) => ({ acao: acao as "REGISTRAR_AJUSTE_ALMOXARIFADO", unidadeOrcId, criadoPor: "TESTE" })) } }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "TESTE" } });
  return identificador;
}

async function posicao(materialId: string): Promise<string> {
  const ms = await prisma.movimentoFisicoDeEstoque.findMany({ where: { materialId, depositoId }, select: { tipo: true, quantidade: true } });
  const sinal: Record<string, number> = { ENTRADA: 1, SAIDA: -1, AJUSTE_ENTRADA: 1, AJUSTE_SAIDA: -1, ESTORNO_SAIDA: 1, ESTORNO_ENTRADA: -1 };
  return ms.reduce((t, m) => t.plus(new Decimal(m.quantidade.toFixed(4)).times(sinal[m.tipo] ?? Number.NaN)), new Decimal(0)).toFixed(4);
}

/** Abre em 01/05, conta papel 95 e caneta C1 52 (pelo contador), fecha em 02/05. */
async function inventarioContado(): Promise<string> {
  const { inventarioId } = await abrirInventarioDeEstoque(prisma, { depositoId, dataAbertura: D("2026-05-01"), criadoPor: contador });
  await registrarContagemDeInventario(prisma, { inventarioId, materialId: papel, quantidadeContada: "95", criadoPor: contador });
  await registrarContagemDeInventario(prisma, { inventarioId, materialId: caneta, loteId: loteC1, quantidadeContada: "52", criadoPor: contador });
  await fecharInventarioDeEstoque(prisma, { inventarioId, dataFechamento: D("2026-05-02"), criadoPor: contador });
  return inventarioId;
}

beforeEach(async () => {
  await limparBanco(prisma);
  deps = criarM05DepsComAlmoxarifado(prisma);
  n = 0;
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-estoque", codigo: ESTOQUE, nome: "Material de consumo", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true, indicadorSuperavit: "P" },
      { id: "c-vpd", codigo: VPD, nome: "Outros materiais de consumo", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true },
      { id: "c-perda", codigo: VPD_PERDA, nome: "Perdas involuntárias com outros estoques", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true },
      { id: "c-vpa", codigo: VPA, nome: "Outros ganhos com incorporação de ativos", naturezaSaldo: "CREDORA", nivel: 7, analitica: true },
      { id: "c-forn", codigo: "2.1.3.1.1.00.00", nome: "Fornecedores", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-disp", codigo: "6.2.2.1.1.00.00", nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-emp", codigo: "6.2.2.1.3.01.00", nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-liq", codigo: "6.2.2.1.3.03.00", nome: "Crédito Liquidado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "02004", descricao: "Secretaria de Administração", orgaoId: "org-01" } });
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Administração geral" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "Gestão" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2004", descricao: "Manutenção", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({ data: { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "30", codigoCompleto: "339030", descricao: "Material de consumo" } });
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await criarFichaDeTeste(prisma, { id: "ficha-1", exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-04", subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd", fonteId: "fnt-500", valorDotado: "500000.00" });
  classeId = (await cadastrarClasseDeMaterial(prisma, { codigo: "30.16", descricao: "Material de expediente", contaContabilId: "c-estoque", criadoPor: POR })).classeDeMaterialId;
  await prisma.roteiroAlmoxarifado.createMany({
    data: [
      { tipo: "SAIDA_CONSUMO", contaDebitoId: "c-vpd", contaCreditoId: "c-estoque", criadoPor: POR },
      { tipo: "AJUSTE_SAIDA", contaDebitoId: "c-perda", contaCreditoId: "c-estoque", criadoPor: POR },
      { tipo: "AJUSTE_ENTRADA", contaDebitoId: "c-estoque", contaCreditoId: "c-vpa", criadoPor: POR },
    ],
  });
  ({ depositoId } = await cadastrarDeposito(prisma, { codigo: "ALM-G", nome: "Almoxarifado central", unidadeOrcId: "uo-01", criadoPor: POR }));
  const { unidadeDeMedidaId } = await cadastrarUnidadeDeMedida(prisma, { sigla: "UN", descricao: "Unidade", criadoPor: POR });
  const { grupoId } = await cadastrarGrupoDeMaterial(prisma, { codigo: "16", descricao: "Expediente", criadoPor: POR });
  const mat = async (codigo: string, nome: string, controlaLote: boolean) => (await cadastrarMaterial(prisma, {
    codigo, descricaoSucinta: nome, descricaoDetalhada: `${nome} (fixture)`, grupoId, classificacao: "CONSUMO", categoria: "ESTOCAVEL", classeDeMaterialId: classeId, controlaLote,
    unidades: [{ unidadeDeMedidaId, fatorParaEstoque: "1", ehDeEstoque: true }], criadoPor: POR,
  })).materialId;
  papel = await mat("EXP001", "Papel A4, resma", false);
  caneta = await mat("EXP002", "Caneta esferográfica", true);
  await entrada(papel, "100", "25.00");
  await entrada(caneta, "50", "2.00", { identificacao: "C1", validade: "2028-12-31" });
  loteC1 = (await prisma.loteDeMaterial.findFirstOrThrow({ where: { identificacao: "C1" }, select: { id: true } })).id;
  contador = await usuarioCom("contador.estoque@cg.pb.gov.br", ["ABRIR_INVENTARIO_DE_ESTOQUE", "REGISTRAR_CONTAGEM_DE_INVENTARIO", "FECHAR_INVENTARIO_DE_ESTOQUE", "REGISTRAR_AJUSTE_ALMOXARIFADO"], "uo-01");
  chefe = await usuarioCom("chefe.almoxarifado@cg.pb.gov.br", ["REGISTRAR_AJUSTE_ALMOXARIFADO"], "uo-01");
}, 120000);
afterAll(async () => prisma.$disconnect());

describe("V39-R3 (R3-012) — o ajuste do inventário do almoxarifado", { timeout: 120000 }, () => {
  it("N=2 diferenças (falta sem lote, sobra no lote): perda e sobra ao custo médio, com o lançamento e o rastro; o razão fecha com o estoque", async () => {
    const inv = await inventarioContado();
    const r = await aplicarAjusteDoInventario(prisma, { inventarioId: inv, data: "2026-05-03", fundamento: "Termo de fechamento 01/2026 (fixture)", criadoPor: chefe });
    expect([r.ajustes, r.semDiferenca]).toEqual([2, 0]);
    expect([await posicao(papel), await posicao(caneta)]).toEqual(["95.0000", "52.0000"]);
    const rastro = await prisma.ajusteDoInventario.findMany({ orderBy: { quantidadeContada: "asc" }, select: { quantidadeRegistrada: true, quantidadeContada: true, movimentoFisico: { select: { tipo: true, loteId: true, valorTotal: true, movimentoAlmoxarifado: { select: { lancamentoId: true } } } } } });
    expect(rastro.map((x) => [x.quantidadeRegistrada.toFixed(4), x.quantidadeContada.toFixed(4), x.movimentoFisico.tipo, x.movimentoFisico.loteId, x.movimentoFisico.valorTotal.toFixed(2)])).toEqual([
      ["50.0000", "52.0000", "AJUSTE_ENTRADA", loteC1, "4.00"],
      ["100.0000", "95.0000", "AJUSTE_SAIDA", null, "125.00"],
    ]);
    const contas = async (id: string | null | undefined): Promise<string[]> => (await prisma.partidaContabil.findMany({ where: { lancamentoId: id ?? "" }, select: { tipo: true, valor: true, conta: { select: { codigo: true } } } })).map((p) => `${p.tipo} ${p.conta.codigo} ${p.valor.toFixed(2)}`).sort();
    expect(await contas(rastro[0]?.movimentoFisico.movimentoAlmoxarifado?.lancamentoId)).toEqual([`CREDITO ${VPA} 4.00`, `DEBITO ${ESTOQUE} 4.00`]);
    expect(await contas(rastro[1]?.movimentoFisico.movimentoAlmoxarifado?.lancamentoId)).toEqual([`CREDITO ${ESTOQUE} 125.00`, `DEBITO ${VPD_PERDA} 125.00`]);
    const conf = await conferirAlmoxarifadoContraRazao(prisma, "c-estoque");
    expect([conf.pelosMovimentos.toFixed(2), conf.peloRazao.toFixed(2)]).toEqual(["2479.00", "2479.00"]);
    const ap = await prisma.aplicacaoDoAjusteDoInventario.findUniqueOrThrow({ where: { inventarioId: inv }, select: { criadoPor: true, fundamento: true } });
    expect(ap).toEqual({ criadoPor: chefe, fundamento: "Termo de fechamento 01/2026 (fixture)" });
  });

  it("NEGAÇÃO: aberto, no dia do fechamento, por quem contou, de novo, ou com material de lote contado sem lote — recusado com o motivo e nada gravado", async () => {
    const { inventarioId: aberto } = await abrirInventarioDeEstoque(prisma, { depositoId, dataAbertura: D("2026-05-01"), criadoPor: contador });
    await registrarContagemDeInventario(prisma, { inventarioId: aberto, materialId: papel, quantidadeContada: "95", criadoPor: contador });
    await expect(aplicarAjusteDoInventario(prisma, { inventarioId: aberto, data: "2026-05-03", fundamento: "Tentativa com o inventário aberto", criadoPor: chefe })).rejects.toThrow(/ainda está aberto: feche-o antes de aplicar o ajuste/);
    await registrarContagemDeInventario(prisma, { inventarioId: aberto, materialId: caneta, quantidadeContada: "49", criadoPor: contador });
    await fecharInventarioDeEstoque(prisma, { inventarioId: aberto, dataFechamento: D("2026-05-02"), criadoPor: contador });
    await expect(aplicarAjusteDoInventario(prisma, { inventarioId: aberto, data: "2026-05-02", fundamento: "Tentativa no dia do fechamento", criadoPor: chefe })).rejects.toThrow(/o dia do fechamento ainda é da janela em que o depósito fica bloqueado/);
    await expect(aplicarAjusteDoInventario(prisma, { inventarioId: aberto, data: "2026-05-03", fundamento: "Tentativa de quem contou", criadoPor: contador })).rejects.toThrow(/Quem contou não autoriza o próprio ajuste/);
    await expect(aplicarAjusteDoInventario(prisma, { inventarioId: aberto, data: "2026-05-03", fundamento: "Caneta contada sem lote", criadoPor: chefe })).rejects.toThrow(/O material EXP002 controla lote e foi contado sem lote/);
    expect([await prisma.aplicacaoDoAjusteDoInventario.count(), await posicao(papel)]).toEqual([0, "100.0000"]);

    const inv = await inventarioContado();
    await aplicarAjusteDoInventario(prisma, { inventarioId: inv, data: "2026-05-03", fundamento: "Termo de fechamento 01/2026 (fixture)", criadoPor: chefe });
    await expect(aplicarAjusteDoInventario(prisma, { inventarioId: inv, data: "2026-05-04", fundamento: "Segunda aplicação (fixture)", criadoPor: chefe })).rejects.toThrow(/já foi aplicado em 03\/05\/2026 por chefe\.almoxarifado@cg\.pb\.gov\.br\. Um inventário se aplica uma vez/);
    expect([await prisma.ajusteDoInventario.count(), await posicao(papel)]).toEqual([2, "95.0000"]);
  });

  it("RECONTAGEM: guarda o anterior e quem recontou; quem recontou não aplica; lote de outro material é recusado; o ajuste aplicado não se estorna pelo almoxarifado", async () => {
    const recontador = await usuarioCom("recontador@cg.pb.gov.br", ["REGISTRAR_CONTAGEM_DE_INVENTARIO", "REGISTRAR_AJUSTE_ALMOXARIFADO"], "uo-01");
    const { inventarioId } = await abrirInventarioDeEstoque(prisma, { depositoId, dataAbertura: D("2026-05-01"), criadoPor: contador });
    await registrarContagemDeInventario(prisma, { inventarioId, materialId: papel, quantidadeContada: "95", criadoPor: contador });
    await expect(registrarContagemDeInventario(prisma, { inventarioId, materialId: papel, loteId: loteC1, quantidadeContada: "1", criadoPor: contador })).rejects.toThrow(/O lote informado não é deste material neste depósito/);
    await registrarContagemDeInventario(prisma, { inventarioId, materialId: papel, quantidadeContada: "60", criadoPor: recontador });
    const rec = await prisma.recontagemDeInventario.findMany({ select: { quantidadeAnterior: true, quantidadeNova: true, criadoPor: true } });
    expect(rec.map((r) => [r.quantidadeAnterior.toFixed(4), r.quantidadeNova.toFixed(4), r.criadoPor])).toEqual([["95.0000", "60.0000", recontador]]);
    await fecharInventarioDeEstoque(prisma, { inventarioId, dataFechamento: D("2026-05-02"), criadoPor: contador });
    await expect(fecharInventarioDeEstoque(prisma, { inventarioId, dataFechamento: D("2026-05-03"), criadoPor: contador })).rejects.toThrow(/já foi fechado/);
    await expect(aplicarAjusteDoInventario(prisma, { inventarioId, data: "2026-05-03", fundamento: "Aplicação por quem recontou", criadoPor: recontador })).rejects.toThrow(/Quem recontou não autoriza o próprio ajuste/);
    await aplicarAjusteDoInventario(prisma, { inventarioId, data: "2026-05-03", fundamento: "Termo de fechamento (fixture)", criadoPor: chefe });
    expect(await posicao(papel)).toBe("60.0000");
    const mov = await prisma.ajusteDoInventario.findFirstOrThrow({ select: { movimentoFisicoId: true, movimentoFisico: { select: { movimentoAlmoxarifadoId: true } } } });
    await expect(estornarMovimentoFisico(prisma, { movimentoId: mov.movimentoFisicoId, dataMovimento: D("2026-05-04"), motivo: "Tentativa de estorno do ajuste", criadoPor: POR })).rejects.toThrow(/é o ajuste de um inventário aplicado/);
    await expect(estornarMovimentoAlmoxarifado(prisma, { movimentoId: mov.movimentoFisico.movimentoAlmoxarifadoId!, dataMovimento: D("2026-05-04"), motivo: "Tentativa de estorno do ajuste", criadoPor: POR })).rejects.toThrow(/é de um ajuste de inventário/);
    expect(await posicao(papel)).toBe("60.0000");
  });

  it("A TRAVA DO INVENTÁRIO EXISTE: com o inventário travado por outra transação, a recontagem espera e só grava depois", async () => {
    const { inventarioId } = await abrirInventarioDeEstoque(prisma, { depositoId, dataAbertura: D("2026-05-01"), criadoPor: contador });
    await registrarContagemDeInventario(prisma, { inventarioId, materialId: papel, quantidadeContada: "95", criadoPor: contador });
    let liberar: () => void = () => undefined;
    const presa = new Promise<void>((x) => { liberar = x; });
    let travado: () => void = () => undefined;
    const jaTravou = new Promise<void>((x) => { travado = x; });
    const segurando = prisma.$transaction(async (tx) => { await travar(tx, "InventarioDeEstoque", [inventarioId]); travado(); await presa; }, { timeout: 20_000 });
    await jaTravou;
    let terminou = false;
    const r = registrarContagemDeInventario(prisma, { inventarioId, materialId: papel, quantidadeContada: "96", criadoPor: contador }).then(() => { terminou = true; });
    await new Promise((x) => setTimeout(x, 800));
    expect(terminou).toBe(false);
    liberar();
    await segurando;
    await r;
    expect([terminou, await prisma.recontagemDeInventario.count()]).toEqual([true, 1]);
  });

  it("MOVIMENTO CONCORRENTE: a saída depois do fechamento soma por cima — a diferença aplicada é a da contagem (100 − 10 − 5 = 85); e a aplicação espera a posição travada", async () => {
    const inv = await inventarioContado();
    const consumidor = await usuarioCom("saida@cg.pb.gov.br", ["REGISTRAR_SAIDA_FISICA"], "uo-01");
    await registrarSaidaFisica(prisma, { materialId: papel, depositoId, quantidade: "10", dataMovimento: D("2026-05-03"), motivo: "Requisição da secretaria (fixture)", criadoPor: consumidor });
    let liberar: () => void = () => undefined;
    const presa = new Promise<void>((x) => { liberar = x; });
    let travado: () => void = () => undefined;
    const jaTravou = new Promise<void>((x) => { travado = x; });
    const segurando = prisma.$transaction(async (tx) => { await travar(tx, "PosicaoFisicaDeEstoque", [chaveDaPosicao(papel, depositoId)]); travado(); await presa; }, { timeout: 20_000 });
    await jaTravou;
    let terminou = false;
    const ap = aplicarAjusteDoInventario(prisma, { inventarioId: inv, data: "2026-05-04", fundamento: "Termo de fechamento 01/2026 (fixture)", criadoPor: chefe }).then(() => { terminou = true; });
    await new Promise((x) => setTimeout(x, 800));
    expect(terminou).toBe(false);
    liberar();
    await segurando;
    await ap;
    expect([terminou, await posicao(papel), await posicao(caneta)]).toEqual([true, "85.0000", "52.0000"]);
  });
});
