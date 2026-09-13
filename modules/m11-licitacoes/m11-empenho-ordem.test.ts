import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { anularEmpenho, empenhar } from "../m05-despesa/servico.js";
import { liquidar } from "../m05-despesa/servico-bloco2.js";
import { roteiroEmpenho, roteiroLiquidacao } from "../m05-despesa/dominio.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { criarM05DepsComContratos } from "./adapter-m05.js";
import { emitirOrdemDeCompra, estornarOrdemDeCompra } from "./compras.js";
import {
  cancelarDocumentoFiscal,
  conferirDocumentoFiscal,
  registrarDocumentoFiscal,
} from "./documento-fiscal.js";
import {
  cadastrarGrupoDeMaterial,
  cadastrarMaterial,
  cadastrarUnidadeDeMedida,
} from "../m10-patrimonial/estoque-fisico.js";
import { cadastrarClasseDeMaterial } from "../m10-patrimonial/almoxarifado.js";

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "licitacoes@cg.pb.gov.br";
const FICHA = "ficha-39";
const CNPJ = "11222333000181";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const VPD = "3.3.1.1.1.00.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const R_EMP = roteiroEmpenho({ creditoDisponivel: C_DISPONIVEL, creditoEmpenhado: C_EMPENHADO });
const R_LIQ = roteiroLiquidacao({
  variacaoDiminutiva: VPD,
  obrigacaoAPagar: FORNECEDOR,
  creditoEmpenhado: C_EMPENHADO,
  creditoLiquidado: C_LIQUIDADO,
});

let deps: M05Deps;
let materialId: string;
let fornecedorId: string;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  deps = criarM05DepsComContratos(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-disp", codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-emp", codigo: C_EMPENHADO, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-liq", codigo: C_LIQUIDADO, nome: "Crédito Liquidado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-vpd", codigo: VPD, nome: "VPD serviços", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-estoque", codigo: "1.1.5.6.1.01.00", nome: "Material de Consumo", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true, indicadorSuperavit: "P" },
    ],
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Administração", orgaoId: "org-01" },
  });
  await prisma.setor.create({
    data: { id: "set-01", codigo: "S01", nome: "Compras", unidadeOrcId: "uo-01", criadoPor: POR },
  });
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm geral" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: { id: "nd-39", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços" },
  });
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await criarFichaDeTeste(prisma, {
    id: FICHA, exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-04", subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd-39", fonteId: "fnt-500", valorDotado: "500000.00",
  });

  const classe = await cadastrarClasseDeMaterial(prisma, {
    codigo: "3.01", descricao: "Material de consumo", contaContabilId: "c-estoque", criadoPor: POR,
  });
  const { unidadeDeMedidaId } = await cadastrarUnidadeDeMedida(prisma, {
    sigla: "UN", descricao: "Unidade", criadoPor: POR,
  });
  const { grupoId } = await cadastrarGrupoDeMaterial(prisma, {
    codigo: "01", descricao: "Expediente", criadoPor: POR,
  });
  ({ materialId } = await cadastrarMaterial(prisma, {
    codigo: "M001", descricaoSucinta: "Resma de papel A4",
    descricaoDetalhada: "Papel sulfite A4 75g",
    grupoId, classificacao: "CONSUMO", categoria: "ESTOCAVEL",
    classeDeMaterialId: classe.classeDeMaterialId, controlaLote: false,
    unidades: [{ unidadeDeMedidaId, fatorParaEstoque: "1", ehDeEstoque: true }],
    criadoPor: POR,
  }));
  const p = await prisma.pessoa.create({
    data: { documento: CNPJ, tipo: "JURIDICA", criadoPor: POR },
    select: { id: true },
  });
  fornecedorId = p.id;
}

beforeEach(semear);
afterAll(() => prisma.$disconnect());

describe("empenho a partir da ordem de compra", () => {
  it("ordinária: um empenho pelo total; anulação copia a ordem; empenho vivo bloqueia estorno", async () => {
    const { ordemId } = await emitirOrdemDeCompra(prisma, {
      numero: "OC-E1", tipo: "ORDINARIA", fornecedorId,
      dataEmissao: new Date("2026-03-10T12:00:00Z"),
      finalidade: "Serviço empenhável", fichaId: FICHA,
      itens: [
        { materialId, quantidade: "10", valorUnitario: "11.00" },
        { materialId, quantidade: "2", valorUnitario: "50.00" },
      ],
      criadoPor: POR,
    });

    const r = await empenhar({
      fichaId: FICHA, numero: "2026NE000101", tipo: "ORDINARIO", valor: "210.00",
      data: new Date("2026-03-11T12:00:00Z"), credorCpfCnpj: CNPJ,
      historico: "Empenho da ordem OC-E1", categoriaOrdemCronologica: "FORNECIMENTO_BENS",
      ordemDeCompraId: ordemId, criadoPor: POR,
    }, R_EMP, deps);

    const e = await prisma.empenho.findUniqueOrThrow({
      where: { id: r.empenhoId },
      select: { ordemDeCompraId: true, valor: true },
    });
    expect(e.ordemDeCompraId).toBe(ordemId);
    expect(e.valor.toFixed(2)).toBe("210.00");

    await expect(
      empenhar({
        fichaId: FICHA, numero: "2026NE000102", tipo: "ORDINARIO", valor: "210.00",
        data: new Date("2026-03-11T12:00:00Z"), credorCpfCnpj: CNPJ,
        historico: "segundo", categoriaOrdemCronologica: "FORNECIMENTO_BENS",
        ordemDeCompraId: ordemId, criadoPor: POR,
      }, R_EMP, deps)
    ).rejects.toThrow(/já tem empenho vivo/);

    await expect(
      estornarOrdemDeCompra(prisma, { ordemId, motivo: "tenta estornar empenhada", criadoPor: POR })
    ).rejects.toThrow(/só se estorna PELO ESTORNO DO EMPENHO/);

    await anularEmpenho({
      empenhoId: r.empenhoId, numero: "2026NE000101A", data: new Date("2026-03-12T12:00:00Z"),
      historico: "anulação da ordem", criadoPor: POR,
    }, deps);

    const anul = await prisma.empenho.findFirstOrThrow({
      where: { estornoDeId: r.empenhoId },
      select: { ordemDeCompraId: true },
    });
    expect(anul.ordemDeCompraId).toBe(ordemId);

    const est = await estornarOrdemDeCompra(prisma, {
      ordemId, motivo: "cancelamento depois da anulação", criadoPor: POR,
    });
    expect(est.itensEstornados).toBe(2);
  });

  it("global N=2: dois empenhos cabem no residual; o terceiro estoura", async () => {
    const { ordemId } = await emitirOrdemDeCompra(prisma, {
      numero: "OC-E2", tipo: "GLOBAL", fornecedorId,
      dataEmissao: new Date("2026-03-10T12:00:00Z"),
      finalidade: "Ordem global", fichaId: FICHA,
      itens: [
        { materialId, quantidade: "10", valorUnitario: "10.00" },
        { materialId, quantidade: "10", valorUnitario: "10.00" },
      ],
      criadoPor: POR,
    });

    await empenhar({
      fichaId: FICHA, numero: "2026NE000201", tipo: "GLOBAL", valor: "80.00",
      data: new Date("2026-03-11T12:00:00Z"), credorCpfCnpj: CNPJ,
      historico: "parcela 1", categoriaOrdemCronologica: "FORNECIMENTO_BENS",
      ordemDeCompraId: ordemId, criadoPor: POR,
    }, R_EMP, deps);
    await empenhar({
      fichaId: FICHA, numero: "2026NE000202", tipo: "GLOBAL", valor: "120.00",
      data: new Date("2026-03-11T12:00:00Z"), credorCpfCnpj: CNPJ,
      historico: "parcela 2", categoriaOrdemCronologica: "FORNECIMENTO_BENS",
      ordemDeCompraId: ordemId, criadoPor: POR,
    }, R_EMP, deps);

    await expect(
      empenhar({
        fichaId: FICHA, numero: "2026NE000203", tipo: "GLOBAL", valor: "0.01",
        data: new Date("2026-03-11T12:00:00Z"), credorCpfCnpj: CNPJ,
        historico: "estoura", categoriaOrdemCronologica: "FORNECIMENTO_BENS",
        ordemDeCompraId: ordemId, criadoPor: POR,
      }, R_EMP, deps)
    ).rejects.toThrow(/SALDO DA ORDEM INSUFICIENTE/);
  });

  it("credor diferente do fornecedor recusa; ordem sem ficha recusa", async () => {
    const { ordemId } = await emitirOrdemDeCompra(prisma, {
      numero: "OC-E3", tipo: "ORDINARIA", fornecedorId,
      dataEmissao: new Date("2026-03-10T12:00:00Z"),
      finalidade: "Sem empenho errado", fichaId: FICHA,
      itens: [{ materialId, quantidade: "1", valorUnitario: "10.00" }],
      criadoPor: POR,
    });
    await expect(
      empenhar({
        fichaId: FICHA, numero: "2026NE000301", tipo: "ORDINARIO", valor: "10.00",
        data: new Date("2026-03-11T12:00:00Z"), credorCpfCnpj: "22333444000172",
        historico: "credor errado", categoriaOrdemCronologica: "FORNECIMENTO_BENS",
        ordemDeCompraId: ordemId, criadoPor: POR,
      }, R_EMP, deps)
    ).rejects.toThrow(/não é o fornecedor/);

    const semFicha = await emitirOrdemDeCompra(prisma, {
      numero: "OC-E4", tipo: "ORDINARIA", fornecedorId,
      dataEmissao: new Date("2026-03-10T12:00:00Z"),
      finalidade: "Sem ficha",
      itens: [{ materialId, quantidade: "1", valorUnitario: "10.00" }],
      criadoPor: POR,
    });
    await expect(
      empenhar({
        fichaId: FICHA, numero: "2026NE000401", tipo: "ORDINARIO", valor: "10.00",
        data: new Date("2026-03-11T12:00:00Z"), credorCpfCnpj: CNPJ,
        historico: "sem ficha na ordem", categoriaOrdemCronologica: "FORNECIMENTO_BENS",
        ordemDeCompraId: semFicha.ordemId, criadoPor: POR,
      }, R_EMP, deps)
    ).rejects.toThrow(/não tem ficha/);
  });

  it("liquidação N=2: recusa nota não conferida; duas parcelas cabem; a terceira e o cancelamento recusam", async () => {
    const { ordemId } = await emitirOrdemDeCompra(prisma, {
      numero: "OC-E5", tipo: "ORDINARIA", fornecedorId,
      dataEmissao: new Date("2026-03-10T12:00:00Z"),
      finalidade: "Serviço com nota", fichaId: FICHA,
      itens: [
        { materialId, quantidade: "10", valorUnitario: "11.00" },
        { materialId, quantidade: "2", valorUnitario: "50.00" },
      ],
      criadoPor: POR,
    });
    const emp = await empenhar({
      fichaId: FICHA, numero: "2026NE000501", tipo: "ORDINARIO", valor: "210.00",
      data: new Date("2026-03-11T12:00:00Z"), credorCpfCnpj: CNPJ,
      historico: "Empenho da ordem OC-E5", categoriaOrdemCronologica: "FORNECIMENTO_BENS",
      ordemDeCompraId: ordemId, criadoPor: POR,
    }, R_EMP, deps);

    const { documentoId } = await registrarDocumentoFiscal(prisma, {
      emitenteId: fornecedorId,
      modelo: "NFE",
      serie: "1",
      numero: "501",
      dataEmissao: new Date("2026-03-12T12:00:00Z"),
      dataRecebimento: new Date("2026-03-13T12:00:00Z"),
      ordemId,
      empenhoId: emp.empenhoId,
      valorBruto: "150.00",
      valorTotal: "150.00",
      itens: [
        { descricao: "Serviço A", unidade: "UN", quantidade: "8", valorUnitario: "10.00", valorTotal: "80.00" },
        { descricao: "Serviço B", unidade: "UN", quantidade: "7", valorUnitario: "10.00", valorTotal: "70.00" },
      ],
      criadoPor: POR,
    });

    await expect(
      liquidar({
        empenhoId: emp.empenhoId, numero: "2026NL000501", valor: "80.00",
        data: new Date("2026-03-14T12:00:00Z"), responsavelAtesto: "Fiscal",
        historico: "sem conferência", documentoFiscalId: documentoId, criadoPor: POR,
      }, R_LIQ, deps)
    ).rejects.toThrow(/ainda não foi conferido/);

    await conferirDocumentoFiscal(prisma, {
      documentoId, data: new Date("2026-03-14T12:00:00Z"), motivo: "Conferência com a origem", criadoPor: POR,
    });

    const l1 = await liquidar({
      empenhoId: emp.empenhoId, numero: "2026NL000501", valor: "80.00",
      data: new Date("2026-03-15T12:00:00Z"), responsavelAtesto: "Fiscal",
      historico: "parcela 1 da nota", documentoFiscalId: documentoId, criadoPor: POR,
    }, R_LIQ, deps);
    const liq1 = await prisma.liquidacao.findUniqueOrThrow({
      where: { id: l1.liquidacaoId },
      select: { documentoFiscalId: true, notaFiscalNum: true },
    });
    expect(liq1.documentoFiscalId).toBe(documentoId);
    expect(liq1.notaFiscalNum).toBe("501");

    await liquidar({
      empenhoId: emp.empenhoId, numero: "2026NL000502", valor: "70.00",
      data: new Date("2026-03-16T12:00:00Z"), responsavelAtesto: "Fiscal",
      historico: "parcela 2 da nota", documentoFiscalId: documentoId, criadoPor: POR,
    }, R_LIQ, deps);

    await expect(
      liquidar({
        empenhoId: emp.empenhoId, numero: "2026NL000503", valor: "0.01",
        data: new Date("2026-03-17T12:00:00Z"), responsavelAtesto: "Fiscal",
        historico: "estoura a nota", documentoFiscalId: documentoId, criadoPor: POR,
      }, R_LIQ, deps)
    ).rejects.toThrow(/saldo do documento/);

    await expect(
      cancelarDocumentoFiscal(prisma, {
        documentoId, data: new Date("2026-03-18T12:00:00Z"), motivo: "já liquidada", criadoPor: POR,
      })
    ).rejects.toThrow(/já foi[\s\S]*utilizada|liquidação/);
  });
});
