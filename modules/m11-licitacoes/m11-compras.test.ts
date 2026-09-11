import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import {
  emitirOrdemDeCompra,
  estatisticasDaPesquisa,
  estornarOrdemDeCompra,
  movimentarSolicitacaoDeCompra,
  registrarPesquisaDePrecos,
  registrarRecebimentoDeOrdem,
  registrarSolicitacaoDeCompra,
  relacionarElementoAoMaterial,
  saldoDaOrdemDeCompra,
  situacaoDaSolicitacao,
} from "./compras.js";
import {
  cadastrarGrupoDeMaterial,
  cadastrarMaterial,
  cadastrarUnidadeDeMedida,
} from "../m10-patrimonial/estoque-fisico.js";
import { cadastrarClasseDeMaterial } from "../m10-patrimonial/almoxarifado.js";

/**
 * M11 — A COMPRA (TR 5.17): OS CASOS DE USO CONTRA BANCO.
 *
 * ⚠️ AS CONTAS À MÃO, ANTES DO CÓDIGO — a pesquisa de preços:
 *
 *   cotação A ....  R$  9,00
 *   cotação B ....  R$ 11,00
 *   cotação C ....  R$ 13,00
 *   mínimo ....... R$  9,00   máximo ..... R$ 13,00   médio ..... R$ 11,00
 *
 * ⚠️ N = 3 É O MÍNIMO AQUI, e não é capricho: com duas cotações, média e mediana
 * coincidem, e uma implementação que calculasse a mediana passaria. A terceira separa as
 * duas — e a TR 5.17.47 fala em "preço médio, maior preço ou menor preço", que são três
 * números distintos.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "licitacoes@cg.pb.gov.br";
const SEM_PERMISSAO = "estagiario@cg.pb.gov.br";

let materialId: string;
let setorId: string;
let fornecedores: string[] = [];

async function semear(): Promise<void> {
  await limparBanco(prisma);

  await prisma.contaPcasp.create({
    data: { id: "c-estoque", codigo: "1.1.5.6.1.01.00", nome: "Material de Consumo", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true, indicadorSuperavit: "P" },
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Administração", orgaoId: "org-01" },
  });
  await prisma.setor.create({
    data: { id: "set-01", codigo: "S01", nome: "Compras", unidadeOrcId: "uo-01", criadoPor: POR },
  });
  setorId = "set-01";
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm geral" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.createMany({
    data: [
      { id: "nd-30", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "30", codigoCompleto: "339030", descricao: "Material de consumo" },
      { id: "nd-39", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Outros Serviços de Terceiros - PJ" },
    ],
  });
  await prisma.fonteRecurso.create({
    data: { id: "fnt-500", codigo: "500", descricao: "Livre", codigoTce: "500" },
  });
  await criarFichaDeTeste(prisma, {
    id: "ficha-30", exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-04", subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd-30", fonteId: "fnt-500", valorDotado: "500000.00",
  });
  await criarFichaDeTeste(prisma, {
    id: "ficha-39", exercicio: 2026, numero: 2, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-04", subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd-39", fonteId: "fnt-500", valorDotado: "500000.00",
  });

  const perfilVazio = await prisma.perfil.create({
    data: { nome: "SEM_PODERES", descricao: "Perfil sem permissão alguma", criadoPor: POR },
    select: { id: true },
  });
  const estagiario = await prisma.usuario.create({
    data: { identificador: SEM_PERMISSAO, nome: SEM_PERMISSAO, criadoPor: POR },
    select: { id: true },
  });
  await prisma.vinculoUsuarioPerfil.create({
    data: { usuarioId: estagiario.id, perfilId: perfilVazio.id, criadoPor: POR },
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
    descricaoDetalhada: "Papel sulfite A4 75g, pacote com 500 folhas",
    grupoId, classificacao: "CONSUMO", categoria: "ESTOCAVEL",
    classeDeMaterialId: classe.classeDeMaterialId, controlaLote: false,
    unidades: [{ unidadeDeMedidaId, fatorParaEstoque: "1", ehDeEstoque: true }],
    criadoPor: POR,
  }));

  fornecedores = [];
  for (const doc of ["11222333000181", "22333444000172", "33444555000163"]) {
    const p = await prisma.pessoa.create({
      data: { documento: doc, tipo: "JURIDICA", criadoPor: POR },
      select: { id: true },
    });
    fornecedores.push(p.id);
  }
}

beforeEach(semear);

describe("t1 · a solicitação de compra, e a situação DERIVADA", () => {
  it("nasce PENDENTE, vira AUTORIZADA, e o movimento diz quem e quando", async () => {
    const { solicitacaoId } = await registrarSolicitacaoDeCompra(prisma, {
      numero: "SC-001", setorId, data: new Date("2026-03-01T12:00:00Z"),
      justificativa: "reposição do estoque de papel do protocolo",
      solicitante: "Chefe do protocolo",
      itens: [{ materialId, quantidade: "100" }], criadoPor: POR,
    });

    expect(await situacaoDaSolicitacao(prisma, solicitacaoId)).toBe("PENDENTE");

    await movimentarSolicitacaoDeCompra(prisma, {
      solicitacaoId, tipo: "AUTORIZACAO", data: new Date("2026-03-02T12:00:00Z"),
      motivo: "autorizada pelo ordenador de despesa", criadoPor: POR,
    });
    expect(await situacaoDaSolicitacao(prisma, solicitacaoId)).toBe("AUTORIZADA");

    const m = await prisma.movimentoDaSolicitacao.findFirstOrThrow({
      where: { solicitacaoId }, select: { criadoPor: true, data: true, motivo: true },
    });
    expect(
      m.criadoPor,
      "uma coluna `situacao` responderia AUTORIZADA sem dizer por quem — e é isso que o " +
        "controle interno cobra quando a compra é questionada"
    ).toBe(POR);
  });

  it("⚠️ RECUSA autorizar duas vezes e anular o que está pendente", async () => {
    const { solicitacaoId } = await registrarSolicitacaoDeCompra(prisma, {
      numero: "SC-002", setorId, data: new Date("2026-03-01T12:00:00Z"),
      justificativa: "reposição do estoque de papel", solicitante: "Chefe",
      itens: [{ materialId, quantidade: "10" }], criadoPor: POR,
    });

    await expect(
      movimentarSolicitacaoDeCompra(prisma, {
        solicitacaoId, tipo: "ANULACAO", data: new Date("2026-03-02T12:00:00Z"),
        motivo: "anulação sem autorização prévia", criadoPor: POR,
      })
    ).rejects.toThrow(/ainda está PENDENTE/);

    await movimentarSolicitacaoDeCompra(prisma, {
      solicitacaoId, tipo: "AUTORIZACAO", data: new Date("2026-03-02T12:00:00Z"),
      motivo: "autorizada pelo ordenador", criadoPor: POR,
    });
    await expect(
      movimentarSolicitacaoDeCompra(prisma, {
        solicitacaoId, tipo: "AUTORIZACAO", data: new Date("2026-03-03T12:00:00Z"),
        motivo: "autorizada de novo por engano", criadoPor: POR,
      })
    ).rejects.toThrow(/já está AUTORIZADA/);
  });
});

describe("t2 · ⚠️ a pesquisa de preços — N=3 separa média de mediana", () => {
  it("mínimo, máximo e médio são DERIVADOS das cotações", async () => {
    const { pesquisaId } = await registrarPesquisaDePrecos(prisma, {
      numero: "PP-001", objeto: "Aquisição de papel A4 para o exercício",
      data: new Date("2026-03-01T12:00:00Z"),
      itens: [
        {
          materialId, quantidade: "500",
          cotacoes: [
            { fornecedorId: fornecedores[0] as string, valorUnitario: "9.00", origem: "proposta" },
            { fornecedorId: fornecedores[1] as string, valorUnitario: "11.00", origem: "proposta" },
            { fornecedorId: fornecedores[2] as string, valorUnitario: "13.00", origem: "nota fiscal" },
          ],
        },
      ],
      criadoPor: POR,
    });

    const est = await estatisticasDaPesquisa(prisma, pesquisaId);
    expect(est).toHaveLength(1);
    expect(est[0]?.minimo.toFixed(2)).toBe("9.00");
    expect(est[0]?.maximo.toFixed(2)).toBe("13.00");
    expect(
      est[0]?.medio.toFixed(2),
      "com duas cotações a média coincidiria com a mediana; a terceira é o que separa as " +
        "duas, e a TR 5.17.47 pede os três números distintos"
    ).toBe("11.00");
    expect(est[0]?.cotacoes).toBe(3);
  });

  it("⚠️ item SEM cotação não vira zero — ausência não é preço", async () => {
    const { pesquisaId } = await registrarPesquisaDePrecos(prisma, {
      numero: "PP-002", objeto: "Aquisição sem cotação ainda",
      data: new Date("2026-03-01T12:00:00Z"),
      itens: [{ materialId, quantidade: "500", cotacoes: [] }],
      criadoPor: POR,
    });
    expect(
      await estatisticasDaPesquisa(prisma, pesquisaId),
      "zero passaria pela estimativa como se o material fosse de graça"
    ).toEqual([]);
  });

  it("⚠️ RECUSA cotação de valor zero ou negativo", async () => {
    await expect(
      registrarPesquisaDePrecos(prisma, {
        numero: "PP-003", objeto: "Aquisição com cotação inválida",
        data: new Date("2026-03-01T12:00:00Z"),
        itens: [
          {
            materialId, quantidade: "1",
            cotacoes: [
              { fornecedorId: fornecedores[0] as string, valorUnitario: "0", origem: "proposta" },
            ],
          },
        ],
        criadoPor: POR,
      })
    ).rejects.toThrow(/menor do que qualquer proposta real/);
  });
});

describe("t3 · a ordem de compra e o saldo pendente (TR 5.17.105)", () => {
  async function ordem(): Promise<string> {
    const { ordemId } = await emitirOrdemDeCompra(prisma, {
      numero: "OC-001", tipo: "GLOBAL", fornecedorId: fornecedores[0] as string,
      dataEmissao: new Date("2026-03-10T12:00:00Z"),
      finalidade: "Aquisição de papel A4 para o exercício", fichaId: "ficha-30",
      itens: [{ materialId, quantidade: "100", valorUnitario: "11.00" }],
      criadoPor: POR,
    });
    return ordemId;
  }

  it("o saldo pendente cai a cada recebimento, e é Σ — não coluna", async () => {
    const ordemId = await ordem();
    const inicial = await saldoDaOrdemDeCompra(prisma, ordemId);
    expect(inicial[0]?.pendente.toFixed(4)).toBe("100.0000");
    expect(inicial[0]?.valorPendente.toFixed(2)).toBe("1100.00");

    const item = await prisma.itemDeOrdemDeCompra.findFirstOrThrow({
      where: { ordemId }, select: { id: true },
    });
    await registrarRecebimentoDeOrdem(prisma, {
      ordemId, data: new Date("2026-03-20T12:00:00Z"), notaFiscal: "NF-123",
      responsavelRecebimento: "Almoxarife",
      itens: [{ itemDeOrdemId: item.id, quantidade: "30" }], criadoPor: POR,
    });

    const depois = await saldoDaOrdemDeCompra(prisma, ordemId);
    expect(depois[0]?.recebida.toFixed(4)).toBe("30.0000");
    expect(depois[0]?.pendente.toFixed(4)).toBe("70.0000");
    expect(depois[0]?.valorPendente.toFixed(2)).toBe("770.00");
  });

  it("⚠️ o corte por DATA responde o passado — o recebimento de abril não conta em março", async () => {
    const ordemId = await ordem();
    const item = await prisma.itemDeOrdemDeCompra.findFirstOrThrow({
      where: { ordemId }, select: { id: true },
    });
    await registrarRecebimentoDeOrdem(prisma, {
      ordemId, data: new Date("2026-04-05T12:00:00Z"),
      responsavelRecebimento: "Almoxarife",
      itens: [{ itemDeOrdemId: item.id, quantidade: "40" }], criadoPor: POR,
    });

    const emMarco = await saldoDaOrdemDeCompra(prisma, ordemId, "2026-03-31");
    expect(emMarco[0]?.pendente.toFixed(4)).toBe("100.0000");
    const hoje = await saldoDaOrdemDeCompra(prisma, ordemId);
    expect(hoje[0]?.pendente.toFixed(4)).toBe("60.0000");
  });

  it("⚠️ RECEBER ALÉM DO PEDIDO recusa — o ente pagaria mais do que contratou", async () => {
    const ordemId = await ordem();
    const item = await prisma.itemDeOrdemDeCompra.findFirstOrThrow({
      where: { ordemId }, select: { id: true },
    });
    await registrarRecebimentoDeOrdem(prisma, {
      ordemId, data: new Date("2026-03-20T12:00:00Z"),
      responsavelRecebimento: "Almoxarife",
      itens: [{ itemDeOrdemId: item.id, quantidade: "90" }], criadoPor: POR,
    });
    await expect(
      registrarRecebimentoDeOrdem(prisma, {
        ordemId, data: new Date("2026-03-25T12:00:00Z"),
        responsavelRecebimento: "Almoxarife",
        itens: [{ itemDeOrdemId: item.id, quantidade: "11" }], criadoPor: POR,
      })
    ).rejects.toThrow(/RECEBIMENTO MAIOR QUE O PEDIDO/);
  });

  it("⚠️ RECUSA desconto maior que o total — a ordem ficaria negativa", async () => {
    await expect(
      emitirOrdemDeCompra(prisma, {
        numero: "OC-009", tipo: "ORDINARIA", fornecedorId: fornecedores[0] as string,
        dataEmissao: new Date("2026-03-10T12:00:00Z"),
        finalidade: "Aquisição com desconto absurdo", desconto: "9999.00",
        itens: [{ materialId, quantidade: "1", valorUnitario: "11.00" }],
        criadoPor: POR,
      })
    ).rejects.toThrow(/o fornecedor pagaria ao ente/);
  });
});

describe("t4 · ⚠️ O GUARD DO ELEMENTO (TR 5.17.9) — 'impedindo'", () => {
  it("material relacionado ao 30 RECUSA compra pela ficha do 39", async () => {
    await relacionarElementoAoMaterial(prisma, {
      materialId, naturezaDespesaId: "nd-30", criadoPor: POR,
    });

    await expect(
      emitirOrdemDeCompra(prisma, {
        numero: "OC-002", tipo: "ORDINARIA", fornecedorId: fornecedores[0] as string,
        dataEmissao: new Date("2026-03-10T12:00:00Z"),
        finalidade: "Aquisição no elemento errado", fichaId: "ficha-39",
        itens: [{ materialId, quantidade: "10", valorUnitario: "11.00" }],
        criadoPor: POR,
      })
    ).rejects.toThrow(/ELEMENTO NÃO RELACIONADO/);
  });

  it("pela ficha do 30, passa", async () => {
    await relacionarElementoAoMaterial(prisma, {
      materialId, naturezaDespesaId: "nd-30", criadoPor: POR,
    });
    const r = await emitirOrdemDeCompra(prisma, {
      numero: "OC-003", tipo: "ORDINARIA", fornecedorId: fornecedores[0] as string,
      dataEmissao: new Date("2026-03-10T12:00:00Z"),
      finalidade: "Aquisição no elemento certo", fichaId: "ficha-30",
      itens: [{ materialId, quantidade: "10", valorUnitario: "11.00" }],
      criadoPor: POR,
    });
    expect(r.valorTotal.toFixed(2)).toBe("110.00");
  });

  it("⚠️ material SEM relação nenhuma passa — e isso é decisão, não descuido", async () => {
    // Recusar aqui travaria o almoxarifado inteiro no dia em que a tabela nascesse vazia.
    const r = await emitirOrdemDeCompra(prisma, {
      numero: "OC-004", tipo: "ORDINARIA", fornecedorId: fornecedores[0] as string,
      dataEmissao: new Date("2026-03-10T12:00:00Z"),
      finalidade: "Aquisição de material ainda não parametrizado", fichaId: "ficha-39",
      itens: [{ materialId, quantidade: "10", valorUnitario: "11.00" }],
      criadoPor: POR,
    });
    expect(r.ordemId).toBeTruthy();
  });
});

describe("t5 · ⚠️ A CASCATA VAI DO EMPENHO PARA A ORDEM — decisão D12", () => {
  it("ordem COM recurso orçamentário RECUSA estorno por si", async () => {
    const { ordemId } = await emitirOrdemDeCompra(prisma, {
      numero: "OC-005", tipo: "ORDINARIA", fornecedorId: fornecedores[0] as string,
      dataEmissao: new Date("2026-03-10T12:00:00Z"),
      finalidade: "Aquisição empenhável", fichaId: "ficha-30",
      itens: [{ materialId, quantidade: "10", valorUnitario: "11.00" }],
      criadoPor: POR,
    });

    await expect(
      estornarOrdemDeCompra(prisma, {
        ordemId, motivo: "cancelamento pedido pela secretaria", criadoPor: POR,
      })
    ).rejects.toThrow(/só se estorna PELO ESTORNO DO EMPENHO/);
  });

  it("ordem COM recebimento RECUSA — o material já entrou", async () => {
    const { ordemId } = await emitirOrdemDeCompra(prisma, {
      numero: "OC-006", tipo: "ORDINARIA", fornecedorId: fornecedores[0] as string,
      dataEmissao: new Date("2026-03-10T12:00:00Z"),
      finalidade: "Aquisição sem ficha", itens: [{ materialId, quantidade: "10", valorUnitario: "11.00" }],
      criadoPor: POR,
    });
    const item = await prisma.itemDeOrdemDeCompra.findFirstOrThrow({
      where: { ordemId }, select: { id: true },
    });
    await registrarRecebimentoDeOrdem(prisma, {
      ordemId, data: new Date("2026-03-20T12:00:00Z"),
      responsavelRecebimento: "Almoxarife",
      itens: [{ itemDeOrdemId: item.id, quantidade: "3" }], criadoPor: POR,
    });

    await expect(
      estornarOrdemDeCompra(prisma, {
        ordemId, motivo: "cancelamento depois do recebimento", criadoPor: POR,
      })
    ).rejects.toThrow(/o material JÁ ENTROU/);
  });

  it("ordem sem ficha e sem recebimento estorna", async () => {
    const { ordemId } = await emitirOrdemDeCompra(prisma, {
      numero: "OC-007", tipo: "ORDINARIA", fornecedorId: fornecedores[0] as string,
      dataEmissao: new Date("2026-03-10T12:00:00Z"),
      finalidade: "Aquisição cancelada antes de tudo",
      itens: [{ materialId, quantidade: "10", valorUnitario: "11.00" }],
      criadoPor: POR,
    });
    const r = await estornarOrdemDeCompra(prisma, {
      ordemId, motivo: "cancelamento antes de empenhar e de receber", criadoPor: POR,
    });
    expect(r.itensEstornados).toBe(1);
    expect(await prisma.ordemDeCompra.count()).toBe(0);
  });
});

describe("t6 · ⚠️ A AUTORIZAÇÃO É DO SERVIDOR", () => {
  it("usuário sem a ação é recusado, e nada é gravado", async () => {
    const antes = await prisma.ordemDeCompra.count();
    await expect(
      emitirOrdemDeCompra(prisma, {
        numero: "OC-008", tipo: "ORDINARIA", fornecedorId: fornecedores[0] as string,
        dataEmissao: new Date("2026-03-10T12:00:00Z"),
        finalidade: "Aquisição sem permissão", fichaId: "ficha-30",
        itens: [{ materialId, quantidade: "10", valorUnitario: "11.00" }],
        criadoPor: SEM_PERMISSAO,
      })
    ).rejects.toThrow();
    expect(await prisma.ordemDeCompra.count()).toBe(antes);
  });
});
