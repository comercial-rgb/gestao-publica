import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { Decimal } from "../../packages/contracts/index.js";
import { meioDiaCivil } from "../../packages/datas/index.js";
import { cadastrarDeposito, cadastrarGrupoDeMaterial, cadastrarMaterial, cadastrarUnidadeDeMedida } from "../m10-patrimonial/estoque-fisico.js";
import { cadastrarClasseDeMaterial, estornarMovimentoAlmoxarifado, saldoDaClasseDeMaterial } from "../m10-patrimonial/almoxarifado.js";
import { criarM05DepsComAlmoxarifado } from "../m10-patrimonial/adapter-m05-almox.js";
import { roteiroEmpenho, roteiroLiquidacao } from "../m05-despesa/dominio.js";
import { liquidar } from "../m05-despesa/servico-bloco2.js";
import { empenhar } from "../m05-despesa/servico.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { corrigirDispensacao, depositoDaFarmaciaNoDia, dispensarMedicamentos, podeVerDadosDaDispensacao, registrarAjusteDaFarmacia, trocarDepositoDaFarmacia, vincularDepositoAFarmacia } from "./operacao.js";
import { travar } from "../../packages/locks/index.js";
import { diaCivil } from "../../packages/datas/index.js";
import { estornarMovimentoFisico } from "../m10-patrimonial/estoque-fisico.js";

/**
 * V39-R2 (R2-030, R2-031) — A FARMÁCIA OPERANDO SOBRE O ESTOQUE DO ALMOXARIFADO.
 *
 * Fixture: o depósito DEP-F é o estoque da farmácia 0000001. Dipirona (controla lote) com o lote L1 (vence 31/03/2026,
 * 100 a 1,00) e o L2 (vence 31/12/2027, 50 a 2,00); amoxicilina com o lote A1 (30 a 3,00). Entradas em 01/02/2026 pela
 * liquidação (o ato só do M05/M10). Contas feitas à mão:
 *   · dispensação de 10 da dipirona L2 e 5 da amoxicilina A1 em 10/04: dipirona sai ao custo médio da posição
 *     ((100·1 + 50·2)/150 = 1,333333) → 13,33; amoxicilina 5 × 3,00 = 15,00;
 *   · perda dos 100 do L1 vencido, ao custo médio (1,333333) → 133,33;
 *   · sobra de 2 da amoxicilina A1 → 6,00.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
const POR = "almoxarifado@cg.pb.gov.br";
const D = (dia: string): Date => meioDiaCivil(dia);
const ESTOQUE = "1.1.5.1.1.00.00";
const R_EMPENHO = roteiroEmpenho({ creditoDisponivel: "6.2.2.1.1.00.00", creditoEmpenhado: "6.2.2.1.3.01.00" });
const R_LIQUIDACAO = roteiroLiquidacao({ variacaoDiminutiva: ESTOQUE, obrigacaoAPagar: "2.1.3.1.1.00.00", creditoEmpenhado: "6.2.2.1.3.01.00", creditoLiquidado: "6.2.2.1.3.03.00" });

let deps: M05Deps;
let classeId = "";
let depositoId = "";
let outroDepositoId = "";
let dipirona = "";
let amoxicilina = "";
let sequencia = 0;
const lotes: Record<string, string> = {};

async function entrada(materialId: string, quantidade: string, valorUnitario: string, lote: string, validade: string): Promise<void> {
  sequencia += 1;
  const n = String(sequencia).padStart(3, "0");
  const total = new Decimal(quantidade).times(valorUnitario).toFixed(2);
  const e = await empenhar({ fichaId: "ficha-1", numero: `NE-${n}`, tipo: "ORDINARIO", valor: total, data: new Date("2026-01-15T12:00:00Z"), credorCpfCnpj: "12345678000195", historico: "compra de medicamento", categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: POR }, R_EMPENHO, deps);
  await liquidar(
    {
      empenhoId: e.empenhoId, numero: `NL-${n}`, valor: total, data: new Date("2026-02-01T15:00:00.000Z"), responsavelAtesto: "Farmacêutica", historico: "medicamento recebido", criadoPor: POR,
      entradasDeMaterial: [{ classeDeMaterialId: classeId, valor: total, fisica: { materialId, depositoId, quantidade, valorUnitario, loteIdentificacao: lote, loteValidade: D(validade) } }],
    },
    R_LIQUIDACAO,
    deps
  );
  lotes[lote] = (await prisma.loteDeMaterial.findFirstOrThrow({ where: { identificacao: lote }, select: { id: true } })).id;
}

async function usuarioCom(identificador: string, acoes: readonly string[], unidadeOrcId: string | null = null): Promise<string> {
  const u = await prisma.usuario.create({ data: { identificador, nome: identificador, criadoPor: "TESTE" }, select: { id: true } });
  const p = await prisma.perfil.create({ data: { nome: `PERFIL-${identificador}`, descricao: "perfil restrito do teste", criadoPor: "TESTE", permissoes: { create: acoes.map((acao) => ({ acao: acao as "DISPENSAR_MEDICAMENTO", unidadeOrcId, criadoPor: "TESTE" })) } }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "TESTE" } });
  return identificador;
}

async function lote(id: string): Promise<string> {
  const ms = await prisma.movimentoFisicoDeEstoque.findMany({ where: { loteId: id }, select: { tipo: true, quantidade: true } });
  const sinal: Record<string, number> = { ENTRADA: 1, SAIDA: -1, AJUSTE_ENTRADA: 1, AJUSTE_SAIDA: -1, ESTORNO_SAIDA: 1, ESTORNO_ENTRADA: -1 };
  return ms.reduce((t, m) => t.plus(new Decimal(m.quantidade.toFixed(4)).times(sinal[m.tipo] ?? 0)), new Decimal(0)).toFixed(4);
}

beforeEach(async () => {
  await limparBanco(prisma);
  deps = criarM05DepsComAlmoxarifado(prisma);
  sequencia = 0;
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-estoque", codigo: ESTOQUE, nome: "Almoxarifado", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "P" },
      { id: "c-vpd", codigo: "3.3.1.1.1.00.00", nome: "VPD consumo de material", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-vpa", codigo: "4.6.4.1.1.00.00", nome: "VPA sobra de inventário (fixture)", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-forn", codigo: "2.1.3.1.1.00.00", nome: "Fornecedores", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-disp", codigo: "6.2.2.1.1.00.00", nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-emp", codigo: "6.2.2.1.3.01.00", nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-liq", codigo: "6.2.2.1.3.03.00", nome: "Crédito Liquidado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Secretaria de Saúde", orgaoId: "org-01" } });
  await prisma.funcao.create({ data: { id: "fun-10", codigo: "10", nome: "Saúde" } });
  await prisma.subfuncao.create({ data: { id: "sub-303", codigo: "303", nome: "Suporte profilático e terapêutico" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0010", descricao: "Assistência farmacêutica" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2010", descricao: "Medicamentos", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({ data: { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "30", codigoCompleto: "339030", descricao: "Material de consumo" } });
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await criarFichaDeTeste(prisma, { id: "ficha-1", exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-10", subfuncaoId: "sub-303", programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd", fonteId: "fnt-500", valorDotado: "500000.00" });
  classeId = (await cadastrarClasseDeMaterial(prisma, { codigo: "3.09", descricao: "Medicamentos", contaContabilId: "c-estoque", criadoPor: POR })).classeDeMaterialId;
  await prisma.roteiroAlmoxarifado.createMany({
    data: [
      { tipo: "SAIDA_CONSUMO", contaDebitoId: "c-vpd", contaCreditoId: "c-estoque", criadoPor: POR },
      { tipo: "AJUSTE_SAIDA", contaDebitoId: "c-vpd", contaCreditoId: "c-estoque", criadoPor: POR },
      { tipo: "AJUSTE_ENTRADA", contaDebitoId: "c-estoque", contaCreditoId: "c-vpa", criadoPor: POR },
    ],
  });
  ({ depositoId } = await cadastrarDeposito(prisma, { codigo: "DEP-F", nome: "Farmácia básica", unidadeOrcId: "uo-01", criadoPor: POR }));
  ({ depositoId: outroDepositoId } = await cadastrarDeposito(prisma, { codigo: "DEP-X", nome: "Almoxarifado central", unidadeOrcId: "uo-01", criadoPor: POR }));
  const { unidadeDeMedidaId } = await cadastrarUnidadeDeMedida(prisma, { sigla: "CP", descricao: "Comprimido", criadoPor: POR });
  const { grupoId } = await cadastrarGrupoDeMaterial(prisma, { codigo: "09", descricao: "Medicamentos", criadoPor: POR });
  const med = (codigo: string, nome: string) => cadastrarMaterial(prisma, {
    codigo, descricaoSucinta: nome, descricaoDetalhada: `${nome} (fixture)`, grupoId, classificacao: "CONSUMO", categoria: "PERECIVEL", classeDeMaterialId: classeId, controlaLote: true,
    unidades: [{ unidadeDeMedidaId, fatorParaEstoque: "1", ehDeEstoque: true }], criadoPor: POR,
  });
  dipirona = (await med("MED001", "Dipirona 500 mg comprimido")).materialId;
  amoxicilina = (await med("MED002", "Amoxicilina 500 mg cápsula")).materialId;
  await entrada(dipirona, "100", "1.00", "L1", "2026-03-31");
  await entrada(dipirona, "50", "2.00", "L2", "2027-12-31");
  await entrada(amoxicilina, "30", "3.00", "A1", "2027-06-30");
  await prisma.unidadeGestora.create({ data: { id: "ug-pm", codigoTce: "201078", nome: "Prefeitura", naturezaJuridica: "PREFEITURA_OU_SECRETARIA", vigenteDesde: D("2026-01-01"), fundamento: "fixture", criadoPor: "TESTE" } });
  await prisma.farmaciaPublica.create({
    data: { id: "farm-1", ugId: "ug-pm", codigo: "0000001", criadoPor: POR,
      versoes: { create: [{ versao: 1, descricao: "Farmácia Básica Municipal", endereco: "Rua da Saúde, 10", nomeResponsavel: "Farmacêutica de Ensaio", cpfResponsavel: "11144477735", crfResponsavel: "PB-0001", ativa: true, vigenteDesde: D("2026-01-01"), fundamento: "fixture", criadoPor: POR }] } },
  });
}, 120000);
afterAll(async () => prisma.$disconnect());

const dispensar = (itens: { materialId: string; loteId: string; quantidade: string }[], data = "2026-04-10", por = POR) =>
  dispensarMedicamentos(prisma, { farmaciaId: "farm-1", data, identificacaoDoUsuario: "CNS 700000000000005", receita: "Receita 123 de 09/04/2026", prescritor: "Médica de ensaio, CRM-PB 0001", itens, criadoPor: por });
const vincular = () => vincularDepositoAFarmacia(prisma, { farmaciaId: "farm-1", depositoId, fundamento: "Portaria de organização da farmácia (fixture)", criadoPor: POR });

describe("V39-R2 (R2-030) — dispensação pelo estoque do depósito da farmácia", { timeout: 120000 }, () => {
  it("sem depósito vinculado a dispensação é recusada; o vínculo é um para um e não se troca", async () => {
    await expect(dispensar([{ materialId: amoxicilina, loteId: lotes["A1"]!, quantidade: "1" }])).rejects.toThrow(/A farmácia 0000001 não tem depósito vinculado/);
    await vincular();
    await expect(vincularDepositoAFarmacia(prisma, { farmaciaId: "farm-1", depositoId: outroDepositoId, fundamento: "Tentativa de troca (fixture)", criadoPor: POR })).rejects.toThrow(/já tem o depósito DEP-F\. Para mudar, use a troca do depósito/);
    expect(await prisma.depositoDaFarmacia.count()).toBe(1);
  });

  it("N=2 itens numa dispensação: as duas saídas ao custo médio, com o lançamento do consumo; numeração por farmácia", async () => {
    await vincular();
    const saldoAntes = await saldoDaClasseDeMaterial(prisma, classeId);
    const r = await dispensar([{ materialId: dipirona, loteId: lotes["L2"]!, quantidade: "10" }, { materialId: amoxicilina, loteId: lotes["A1"]!, quantidade: "5" }]);
    expect([r.numero, r.itens]).toEqual([1, 2]);
    const disp = await prisma.dispensacaoDeMedicamento.findUniqueOrThrow({ where: { id: r.id }, select: { identificacaoDoUsuario: true, itens: { orderBy: { quantidade: "asc" }, select: { quantidade: true, movimentoFisico: { select: { tipo: true, valorTotal: true, motivo: true, movimentoAlmoxarifadoId: true } } } } } });
    expect(disp.itens.map((i) => [i.quantidade.toFixed(4), i.movimentoFisico.tipo, i.movimentoFisico.valorTotal.toFixed(2), i.movimentoFisico.motivo, i.movimentoFisico.movimentoAlmoxarifadoId !== null])).toEqual([
      ["5.0000", "SAIDA", "15.00", "Dispensação nº 1 da farmácia 0000001", true],
      ["10.0000", "SAIDA", "13.33", "Dispensação nº 1 da farmácia 0000001", true],
    ]);
    expect(saldoAntes.minus(await saldoDaClasseDeMaterial(prisma, classeId)).toFixed(2)).toBe("28.33");
    expect([await lote(lotes["L2"]!), await lote(lotes["A1"]!)]).toEqual(["40.0000", "25.0000"]);
    expect((await dispensar([{ materialId: amoxicilina, loteId: lotes["A1"]!, quantidade: "1" }])).numero).toBe(2);
  });

  it("NEGAÇÃO: lote vencido não se entrega, e o item bom da mesma dispensação também não é gravado (um ato só)", async () => {
    await vincular();
    const antes = await prisma.movimentoFisicoDeEstoque.count();
    await expect(dispensar([{ materialId: amoxicilina, loteId: lotes["A1"]!, quantidade: "2" }, { materialId: dipirona, loteId: lotes["L1"]!, quantidade: "1" }]))
      .rejects.toThrow(/LOTE VENCIDO: o lote L1 venceu em 31\/03\/2026 e a saída é de 10\/04\/2026/);
    expect([await prisma.dispensacaoDeMedicamento.count(), await prisma.movimentoFisicoDeEstoque.count(), await lote(lotes["A1"]!)]).toEqual([0, antes, "30.0000"]);
  });

  it("N=2 lotes do MESMO medicamento: a posição trava uma vez, e o custo do segundo item é o médio DEPOIS da saída do primeiro", async () => {
    await vincular();
    await entrada(dipirona, "20", "1.50", "L3", "2028-06-30");
    await dispensar([{ materialId: dipirona, loteId: lotes["L2"]!, quantidade: "5" }, { materialId: dipirona, loteId: lotes["L3"]!, quantidade: "5" }]);
    const ms = await prisma.movimentoFisicoDeEstoque.findMany({ where: { tipo: "SAIDA", materialId: dipirona }, orderBy: { criadoEm: "asc" }, select: { valorUnitario: true, valorTotal: true } });
    // posição antes: 170 por 230,00 (médio 1,352941); depois do primeiro: 165 por 223,24 (médio 1,352970)
    expect(ms.map((m) => [m.valorUnitario.toFixed(6), m.valorTotal.toFixed(2)])).toEqual([["1.352941", "6.76"], ["1.352970", "6.76"]]);
    expect([await lote(lotes["L2"]!), await lote(lotes["L3"]!)]).toEqual(["45.0000", "15.0000"]);
  });

  it("NEGAÇÃO: data anterior a movimento já gravado, quantidade com ponto decimal e estorno pelo almoxarifado são recusados com o motivo", async () => {
    await vincular();
    const r = await dispensar([{ materialId: amoxicilina, loteId: lotes["A1"]!, quantidade: "1" }], "2026-04-12");
    await expect(dispensar([{ materialId: amoxicilina, loteId: lotes["A1"]!, quantidade: "1" }], "2026-04-11")).rejects.toThrow(/O medicamento MED002 já tem movimento em 12\/04\/2026, depois de 11\/04\/2026/);
    await expect(registrarAjusteDaFarmacia(prisma, { farmaciaId: "farm-1", sentido: "PERDA", materialId: amoxicilina, loteId: lotes["A1"]!, quantidade: "1", data: "2026-04-11", motivo: "Avaria", destino: "Descarte (fixture)", criadoPor: POR }))
      .rejects.toThrow(/já tem movimento em 12\/04\/2026/);
    await expect(dispensar([{ materialId: amoxicilina, loteId: lotes["A1"]!, quantidade: "2.5" }], "2026-04-12")).rejects.toThrow(/Informe a quantidade com vírgula nos decimais/);
    // "1.000" é mil (milhar), e mil passa do saldo do lote: a recusa é a do saldo, não a de um comprimido
    await expect(dispensar([{ materialId: amoxicilina, loteId: lotes["A1"]!, quantidade: "1.000" }], "2026-04-12")).rejects.toThrow(/SAÍDA MAIOR QUE O SALDO DO LOTE A1 em 2026-04-12: sair com 1000\.0000/);
    const mov = await prisma.itemDaDispensacao.findFirstOrThrow({ where: { dispensacaoId: r.id }, select: { movimentoFisicoId: true } });
    await expect(estornarMovimentoFisico(prisma, { movimentoId: mov.movimentoFisicoId, dataMovimento: D("2026-04-12"), motivo: "Tentativa de estorno pelo almoxarifado", criadoPor: POR }))
      .rejects.toThrow(/Este movimento é da dispensação nº 1 da farmácia 0000001: ele não se estorna pelo almoxarifado/);
    expect([await prisma.dispensacaoDeMedicamento.count(), await lote(lotes["A1"]!)]).toEqual([1, "29.0000"]);
  });

  it("DADO DE SAÚDE: o identificador e a receita só para quem dispensa NA UNIDADE do depósito; em outra unidade, não", async () => {
    await vincular();
    await prisma.unidadeOrcamentaria.create({ data: { id: "uo-02", codigo: "01002", descricao: "Secretaria de Educação", orgaoId: "org-01" } });
    const outra = await usuarioCom("farm-outra-ug@cg.pb.gov.br", ["DISPENSAR_MEDICAMENTO"], "uo-02");
    const nesta = await usuarioCom("farm-nesta-ug@cg.pb.gov.br", ["DISPENSAR_MEDICAMENTO"], "uo-01");
    expect([await podeVerDadosDaDispensacao(prisma, outra, "farm-1"), await podeVerDadosDaDispensacao(prisma, nesta, "farm-1"), await podeVerDadosDaDispensacao(prisma, POR, "farm-1")]).toEqual([false, true, true]);
    await expect(dispensar([{ materialId: amoxicilina, loteId: lotes["A1"]!, quantidade: "1" }], "2026-04-10", outra)).rejects.toThrow(/ACESSO NEGADO: o usuário "farm-outra-ug@cg\.pb\.gov\.br" não tem permissão para DISPENSAR_MEDICAMENTO/);
  });

  it("NEGAÇÃO: quem só informa o estoque da farmácia não dispensa; o motivo nomeia a ação", async () => {
    await vincular();
    const so = await usuarioCom("so-estoque@cg.pb.gov.br", ["INFORMAR_ESTOQUE_DA_FARMACIA", "REGISTRAR_SAIDA_FISICA"]);
    await expect(dispensar([{ materialId: amoxicilina, loteId: lotes["A1"]!, quantidade: "1" }], "2026-04-10", so)).rejects.toThrow(/ACESSO NEGADO: o usuário "so-estoque@cg\.pb\.gov\.br" não tem permissão para DISPENSAR_MEDICAMENTO/);
    expect(await prisma.dispensacaoDeMedicamento.count()).toBe(0);
  });
});

describe("V39-R2 (R2-031) — perda e sobra na farmácia, com motivo e destino", { timeout: 120000 }, () => {
  it("o lote vencido sai pela PERDA, com destino, ao custo médio e com o lançamento do ajuste; a SOBRA entra ao custo médio", async () => {
    await vincular();
    const p = await registrarAjusteDaFarmacia(prisma, { farmaciaId: "farm-1", sentido: "PERDA", materialId: dipirona, loteId: lotes["L1"]!, quantidade: "100", data: "2026-04-10", motivo: "Vencimento do lote L1", destino: "Recolhido pela empresa de resíduos de saúde, manifesto 55/2026", criadoPor: POR });
    expect(p.valor).toBe("133.33");
    const s = await registrarAjusteDaFarmacia(prisma, { farmaciaId: "farm-1", sentido: "SOBRA", materialId: amoxicilina, loteId: lotes["A1"]!, quantidade: "2", data: "2026-04-10", motivo: "Contagem do inventário de abril", criadoPor: POR });
    expect(s.valor).toBe("6.00");
    expect([await lote(lotes["L1"]!), await lote(lotes["A1"]!)]).toEqual(["0.0000", "32.0000"]);
    const ajustes = await prisma.ajusteDaFarmacia.findMany({ orderBy: { sentido: "asc" }, select: { sentido: true, destino: true, movimentoFisico: { select: { tipo: true, movimentoAlmoxarifado: { select: { tipo: true, lancamentoId: true } } } } } });
    expect(ajustes.map((a) => [a.sentido, a.destino !== null, a.movimentoFisico.tipo, a.movimentoFisico.movimentoAlmoxarifado?.tipo, a.movimentoFisico.movimentoAlmoxarifado?.lancamentoId !== undefined])).toEqual([
      ["PERDA", true, "AJUSTE_SAIDA", "AJUSTE_SAIDA", true],
      ["SOBRA", false, "AJUSTE_ENTRADA", "AJUSTE_ENTRADA", true],
    ]);
  });

  it("NEGAÇÃO: perda sem destino, perda maior que o lote e ajuste sem permissão são recusados com o motivo; nada é gravado", async () => {
    await vincular();
    await expect(registrarAjusteDaFarmacia(prisma, { farmaciaId: "farm-1", sentido: "PERDA", materialId: dipirona, loteId: lotes["L2"]!, quantidade: "1", data: "2026-04-10", motivo: "Avaria no transporte", criadoPor: POR }))
      .rejects.toThrow(/Na perda, diga para onde foi o produto/);
    await expect(registrarAjusteDaFarmacia(prisma, { farmaciaId: "farm-1", sentido: "PERDA", materialId: dipirona, loteId: lotes["L2"]!, quantidade: "51", data: "2026-04-10", motivo: "Avaria no transporte", destino: "Descarte (fixture)", criadoPor: POR }))
      .rejects.toThrow(/SAÍDA MAIOR QUE O SALDO DO LOTE L2/);
    const so = await usuarioCom("so-dispensa@cg.pb.gov.br", ["DISPENSAR_MEDICAMENTO"]);
    await expect(registrarAjusteDaFarmacia(prisma, { farmaciaId: "farm-1", sentido: "SOBRA", materialId: amoxicilina, loteId: lotes["A1"]!, quantidade: "1", data: "2026-04-10", motivo: "Contagem", criadoPor: so }))
      .rejects.toThrow(/não tem permissão para REGISTRAR_AJUSTE_DA_FARMACIA/);
    expect([await prisma.ajusteDaFarmacia.count(), await lote(lotes["L2"]!)]).toEqual([0, "50.0000"]);
  });

  it("NEGAÇÃO: sobra com a posição zerada não tem custo médio para valorar, e é recusada", async () => {
    await vincular();
    await registrarAjusteDaFarmacia(prisma, { farmaciaId: "farm-1", sentido: "PERDA", materialId: amoxicilina, loteId: lotes["A1"]!, quantidade: "30", data: "2026-04-10", motivo: "Recolhimento do lote pelo fabricante", destino: "Devolução ao fornecedor (fixture)", criadoPor: POR });
    await expect(registrarAjusteDaFarmacia(prisma, { farmaciaId: "farm-1", sentido: "SOBRA", materialId: amoxicilina, loteId: lotes["A1"]!, quantidade: "1", data: "2026-04-10", motivo: "Contagem", criadoPor: POR }))
      .rejects.toThrow(/não tem posição no depósito DEP-F em 2026-04-10: não há custo médio para valorar a sobra/);
    expect(await prisma.ajusteDaFarmacia.count()).toBe(1);
  });
});

/**
 * V39-R3 (R3-009) — A CORREÇÃO DA DISPENSAÇÃO. Contas feitas à mão sobre a fixture: dispensação de 10 da dipirona L2 e
 * 5 da amoxicilina A1 em 10/04 (13,33 e 15,00 ao custo médio). O cancelamento devolve os dois lotes (50 e 30) e o valor
 * da classe (28,33); o estorno do consumo inverte o lançamento original (D estoque / C VPD de consumo).
 */
describe("V39-R3 (R3-009) — correção auditável da dispensação", { timeout: 120000 }, () => {
  const corrigir = (input: Partial<Parameters<typeof corrigirDispensacao>[1]> & { dispensacaoId: string }, por: string) =>
    corrigirDispensacao(prisma, { tipo: "CANCELAMENTO_DO_REGISTRO", data: "2026-04-11", motivo: "Registro feito na ficha errada (fixture)", criadoPor: por, ...input });

  it("CANCELAMENTO: quem dispensou não cancela; outra pessoa cancela, os N=2 itens voltam ao lote e o consumo é estornado; o original fica; a segunda correção é recusada", async () => {
    await vincular();
    const supervisora = await usuarioCom("supervisora@cg.pb.gov.br", ["CORRIGIR_DISPENSACAO_DE_MEDICAMENTO"], "uo-01");
    const saldoAntes = await saldoDaClasseDeMaterial(prisma, classeId);
    const r = await dispensar([{ materialId: dipirona, loteId: lotes["L2"]!, quantidade: "10" }, { materialId: amoxicilina, loteId: lotes["A1"]!, quantidade: "5" }]);
    await expect(corrigir({ dispensacaoId: r.id }, POR)).rejects.toThrow(/Quem dispensou não cancela o próprio registro/);
    expect(await prisma.correcaoDoItemDaDispensacao.count()).toBe(0);

    const c = await corrigir({ dispensacaoId: r.id }, supervisora);
    expect(c).toEqual({ corrigidos: 2, devolvidosAoEstoque: 2 });
    expect([await lote(lotes["L2"]!), await lote(lotes["A1"]!)]).toEqual(["50.0000", "30.0000"]);
    expect((await saldoDaClasseDeMaterial(prisma, classeId)).toFixed(2)).toBe(saldoAntes.toFixed(2));
    const corr = await prisma.correcaoDoItemDaDispensacao.findMany({ select: { tipo: true, condicao: true, movimentoFisico: { select: { tipo: true, valorTotal: true, estornoDeId: true, movimentoAlmoxarifado: { select: { tipo: true, lancamentoId: true } } } } } });
    expect(corr.map((x) => [x.tipo, x.condicao, x.movimentoFisico?.tipo, x.movimentoFisico?.movimentoAlmoxarifado?.tipo]).sort()).toEqual([
      ["CANCELAMENTO_DO_REGISTRO", null, "ESTORNO_SAIDA", "ESTORNO_SAIDA_CONSUMO"],
      ["CANCELAMENTO_DO_REGISTRO", null, "ESTORNO_SAIDA", "ESTORNO_SAIDA_CONSUMO"],
    ]);
    expect(corr.map((x) => x.movimentoFisico?.valorTotal.toFixed(2)).sort()).toEqual(["13.33", "15.00"]);
    const lanc = corr[0]!.movimentoFisico!.movimentoAlmoxarifado!.lancamentoId!;
    const ps = await prisma.partidaContabil.findMany({ where: { lancamentoId: lanc }, select: { tipo: true, conta: { select: { codigo: true } } } });
    expect(ps.map((p) => `${p.tipo} ${p.conta.codigo}`).sort()).toEqual(["CREDITO 3.3.1.1.1.00.00", "DEBITO 1.1.5.1.1.00.00"]);
    // o original não muda
    expect(await prisma.itemDaDispensacao.count({ where: { dispensacaoId: r.id } })).toBe(2);
    expect((await prisma.dispensacaoDeMedicamento.findUniqueOrThrow({ where: { id: r.id }, select: { numero: true } })).numero).toBe(1);
    // de novo: cancelamento e devolução recusados nomeando o item
    await expect(corrigir({ dispensacaoId: r.id }, supervisora)).rejects.toThrow(/já foi corrigido \(cancelamento\)\. Cada item se corrige uma vez/);
    const item = await prisma.itemDaDispensacao.findFirstOrThrow({ where: { dispensacaoId: r.id, loteId: lotes["L2"]! }, select: { id: true } });
    await expect(corrigir({ dispensacaoId: r.id, tipo: "DEVOLUCAO", itens: [{ itemId: item.id, condicao: "APTO_AO_REUSO" }], conferidoPor: "Farmacêutica (fixture)" }, supervisora)).rejects.toThrow(/já foi corrigido/);
    expect([await lote(lotes["L2"]!), await prisma.correcaoDoItemDaDispensacao.count()]).toEqual(["50.0000", 2]);
  });

  it("DEVOLUÇÃO: o apto volta ao lote; o inapto NÃO volta e diz o destino; o lote vencido não volta como apto; sem destino ou sem conferência é recusada", async () => {
    await vincular();
    await entrada(amoxicilina, "10", "3.00", "A9", "2026-04-15");
    const r = await dispensar([{ materialId: dipirona, loteId: lotes["L2"]!, quantidade: "4" }, { materialId: amoxicilina, loteId: lotes["A1"]!, quantidade: "3" }, { materialId: amoxicilina, loteId: lotes["A9"]!, quantidade: "2" }], "2026-04-12");
    const itens = await prisma.itemDaDispensacao.findMany({ where: { dispensacaoId: r.id }, select: { id: true, loteId: true } });
    const doLote = (l: string): string => itens.find((i) => i.loteId === lotes[l])!.id;
    const base = { dispensacaoId: r.id, tipo: "DEVOLUCAO" as const, data: "2026-04-20", motivo: "Usuário devolveu na farmácia (fixture)" };
    await expect(corrigir({ ...base, itens: [{ itemId: doLote("A1"), condicao: "INAPTO" }], conferidoPor: "Farmacêutica (fixture)" }, POR)).rejects.toThrow(/diga o destino dado a ele/);
    await expect(corrigir({ ...base, itens: [{ itemId: doLote("L2"), condicao: "APTO_AO_REUSO" }] }, POR)).rejects.toThrow(/diga quem conferiu/);
    await expect(corrigir({ ...base, itens: [{ itemId: doLote("A9"), condicao: "APTO_AO_REUSO" }], conferidoPor: "Farmacêutica (fixture)" }, POR)).rejects.toThrow(/O lote A9 venceu em 15\/04\/2026: o medicamento devolvido não volta ao estoque disponível/);
    expect(await prisma.correcaoDoItemDaDispensacao.count()).toBe(0);

    const antesA1 = await lote(lotes["A1"]!);
    const c = await corrigir({ ...base, itens: [{ itemId: doLote("L2"), condicao: "APTO_AO_REUSO" }, { itemId: doLote("A1"), condicao: "INAPTO" }], conferidoPor: "Farmacêutica (fixture)", destino: "Recolhido para descarte (fixture)" }, POR);
    expect(c).toEqual({ corrigidos: 2, devolvidosAoEstoque: 1 });
    expect([await lote(lotes["L2"]!), await lote(lotes["A1"]!)]).toEqual(["50.0000", antesA1]);
    const inapta = await prisma.correcaoDoItemDaDispensacao.findUniqueOrThrow({ where: { itemId: doLote("A1") }, select: { movimentoFisicoId: true, destino: true, conferidoPor: true } });
    expect(inapta).toEqual({ movimentoFisicoId: null, destino: "Recolhido para descarte (fixture)", conferidoPor: "Farmacêutica (fixture)" });
    // o vencido devolvido entra como inapto, e a segunda devolução do mesmo item é recusada
    await corrigir({ ...base, itens: [{ itemId: doLote("A9"), condicao: "INAPTO" }], conferidoPor: "Farmacêutica (fixture)", destino: "Descarte (fixture)" }, POR);
    await expect(corrigir({ ...base, itens: [{ itemId: doLote("L2"), condicao: "APTO_AO_REUSO" }], conferidoPor: "Farmacêutica (fixture)" }, POR)).rejects.toThrow(/já foi corrigido \(devolução\)/);
    expect(await prisma.correcaoDoItemDaDispensacao.count()).toBe(3);
  });

  it("NEGAÇÃO: quem tem a correção em OUTRA unidade não corrige a dispensação desta; o estorno do consumo pelo almoxarifado é recusado", async () => {
    await vincular();
    await prisma.unidadeOrcamentaria.create({ data: { id: "uo-02", codigo: "01002", descricao: "Secretaria de Educação", orgaoId: "org-01" } });
    const deFora = await usuarioCom("corrige-fora@cg.pb.gov.br", ["CORRIGIR_DISPENSACAO_DE_MEDICAMENTO"], "uo-02");
    const r = await dispensar([{ materialId: amoxicilina, loteId: lotes["A1"]!, quantidade: "2" }]);
    await expect(corrigir({ dispensacaoId: r.id }, deFora)).rejects.toThrow(/ACESSO NEGADO: o usuário "corrige-fora@cg\.pb\.gov\.br" não tem permissão para CORRIGIR_DISPENSACAO_DE_MEDICAMENTO/);
    const consumo = await prisma.itemDaDispensacao.findFirstOrThrow({ where: { dispensacaoId: r.id }, select: { movimentoFisico: { select: { movimentoAlmoxarifadoId: true } } } });
    await expect(estornarMovimentoAlmoxarifado(prisma, { movimentoId: consumo.movimentoFisico.movimentoAlmoxarifadoId!, dataMovimento: D("2026-04-11"), motivo: "Tentativa de estorno pelo almoxarifado", criadoPor: POR }))
      .rejects.toThrow(/Este lançamento é o consumo de uma dispensação da farmácia: corrija a dispensação na tela da farmácia/);
    expect([await prisma.correcaoDoItemDaDispensacao.count(), await lote(lotes["A1"]!)]).toEqual([0, "28.0000"]);
  });

  it("A TRAVA EXISTE: com a farmácia travada por outra transação, a correção espera e só grava depois", async () => {
    await vincular();
    const supervisora = await usuarioCom("supervisora2@cg.pb.gov.br", ["CORRIGIR_DISPENSACAO_DE_MEDICAMENTO"], "uo-01");
    const r = await dispensar([{ materialId: amoxicilina, loteId: lotes["A1"]!, quantidade: "2" }]);
    let liberar: () => void = () => undefined;
    const presa = new Promise<void>((x) => { liberar = x; });
    let travado: () => void = () => undefined;
    const jaTravou = new Promise<void>((x) => { travado = x; });
    const segurando = prisma.$transaction(async (tx) => { await travar(tx, "FarmaciaPublica", ["farm-1"]); travado(); await presa; }, { timeout: 20_000 });
    await jaTravou;
    let terminou = false;
    const corr = corrigir({ dispensacaoId: r.id }, supervisora).then(() => { terminou = true; });
    await new Promise((x) => setTimeout(x, 800));
    expect(terminou).toBe(false);
    liberar();
    await segurando;
    await corr;
    expect([terminou, await prisma.correcaoDoItemDaDispensacao.count()]).toEqual([true, 1]);
  });
});

/**
 * V39-R3 (R3-010) — A TROCA DO DEPÓSITO DA FARMÁCIA, com vigência. O estoque não se transfere pela troca; os fatos
 * passados continuam no depósito em que aconteceram.
 */
describe("V39-R3 (R3-010) — troca do depósito da farmácia", { timeout: 120000 }, () => {
  const amanha = (): string => diaCivil(new Date(meioDiaCivil(diaCivil(new Date())).getTime() + 86_400_000));
  const depois = (): string => diaCivil(new Date(meioDiaCivil(diaCivil(new Date())).getTime() + 2 * 86_400_000));
  const trocar = (vigenteDesde: string, deposito = outroDepositoId) => trocarDepositoDaFarmacia(prisma, { farmaciaId: "farm-1", depositoNovoId: deposito, vigenteDesde, fundamento: "Reorganização da farmácia (fixture)", criadoPor: POR });

  it("vale a partir do dia: antes dele o depósito é o anterior, depois o novo; o estoque NÃO muda de depósito; o fato passado continua no depósito dele", async () => {
    await vincular();
    const r = await dispensar([{ materialId: amoxicilina, loteId: lotes["A1"]!, quantidade: "5" }]);
    const t = await trocar(amanha());
    expect(t.materiaisNoAnterior).toBe(2);
    expect([await depositoDaFarmaciaNoDia(prisma, "farm-1", diaCivil(new Date())), await depositoDaFarmaciaNoDia(prisma, "farm-1", amanha())]).toEqual([depositoId, outroDepositoId]);
    expect(await lote(lotes["A1"]!)).toBe("25.0000");
    expect(await prisma.movimentoFisicoDeEstoque.count({ where: { depositoId: outroDepositoId } })).toBe(0);
    const mov = await prisma.itemDaDispensacao.findFirstOrThrow({ where: { dispensacaoId: r.id }, select: { movimentoFisico: { select: { depositoId: true } } } });
    expect(mov.movimentoFisico.depositoId).toBe(depositoId);
    // depois da vigência, o lote do depósito anterior não sai pela farmácia (o estoque dela é o do depósito novo)
    await expect(dispensar([{ materialId: amoxicilina, loteId: lotes["A1"]!, quantidade: "1" }], amanha())).rejects.toThrow(/O lote A1 é de outro material ou de outro depósito/);
    // a segunda troca para o mesmo dia é recusada nomeando a que já existe
    await expect(trocar(amanha(), depositoId)).rejects.toThrow(/Já há troca do depósito da farmácia 0000001 vigente a partir de/);
    expect(await lote(lotes["A1"]!)).toBe("25.0000");
  });

  it("CORRIDA: a troca que entra enquanto a dispensação espera a trava da farmácia faz a dispensação recusar, sem gravar no depósito errado", async () => {
    await vincular();
    let liberar: () => void = () => undefined;
    const presa = new Promise<void>((x) => { liberar = x; });
    let travado: () => void = () => undefined;
    const jaTravou = new Promise<void>((x) => { travado = x; });
    const segurando = prisma.$transaction(async (tx) => {
      await travar(tx, "FarmaciaPublica", ["farm-1"]);
      travado();
      await presa;
      // a troca grava dentro da trava (como o serviço faria), vigente no dia da dispensação que está esperando
      await tx.trocaDoDepositoDaFarmacia.create({ data: { farmaciaId: "farm-1", depositoAnteriorId: depositoId, depositoNovoId: outroDepositoId, vigenteDesde: meioDiaCivil(amanha()), fundamento: "Troca concorrente (fixture)", criadoPor: POR } });
    }, { timeout: 20_000 });
    await jaTravou;
    const espera = dispensar([{ materialId: amoxicilina, loteId: lotes["A1"]!, quantidade: "1" }], amanha()).then(() => "gravou", (e: unknown) => String(e));
    await new Promise((x) => setTimeout(x, 300));
    liberar();
    await segurando;
    expect(await espera).toMatch(/O depósito da farmácia foi trocado enquanto o registro era feito/);
    expect([await prisma.dispensacaoDeMedicamento.count(), await lote(lotes["A1"]!)]).toEqual([0, "30.0000"]);
  });

  it("NEGAÇÃO: data passada, data até o último fato, inventário aberto, depósito de outra farmácia e o mesmo depósito são recusados com o motivo", async () => {
    await vincular();
    await expect(trocar("2026-04-01")).rejects.toThrow(/A troca vale de hoje em diante/);
    await dispensar([{ materialId: amoxicilina, loteId: lotes["A1"]!, quantidade: "1" }], amanha());
    await expect(trocar(amanha())).rejects.toThrow(/já registrou fato em .*: a troca vale a partir do dia seguinte ao último fato/);
    await expect(trocar(depois(), depositoId)).rejects.toThrow(/já é o da farmácia nessa data/);
    await prisma.inventarioDeEstoque.create({ data: { depositoId, dataAbertura: D("2026-04-30"), criadoPor: POR } });
    await expect(trocar(depois())).rejects.toThrow(/Há inventário aberto em 30\/04\/2026 no depósito atual da farmácia/);
    await prisma.inventarioDeEstoque.updateMany({ where: { depositoId }, data: { dataFechamento: D("2026-05-01") } });
    await prisma.farmaciaPublica.create({ data: { id: "farm-2", ugId: "ug-pm", codigo: "0000002", criadoPor: POR } });
    await prisma.depositoDaFarmacia.create({ data: { farmaciaId: "farm-2", depositoId: outroDepositoId, fundamento: "fixture", criadoPor: POR } });
    await expect(trocar(depois())).rejects.toThrow(/O depósito DEP-X já é ou foi o estoque de outra farmácia/);
    expect(await prisma.trocaDoDepositoDaFarmacia.count()).toBe(0);
  });
});
