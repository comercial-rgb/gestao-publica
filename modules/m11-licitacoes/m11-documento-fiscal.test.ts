import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import {
  cancelarDocumentoFiscal,
  conferirDocumentoFiscal,
  importarDocumentoFiscalDeXml,
  registrarDocumentoFiscal,
  situacaoDoDocumentoFiscal,
} from "./documento-fiscal.js";
import { emitirOrdemDeCompra, registrarRecebimentoDeOrdem } from "./compras.js";
import {
  cadastrarGrupoDeMaterial,
  cadastrarMaterial,
  cadastrarUnidadeDeMedida,
} from "../m10-patrimonial/estoque-fisico.js";
import { cadastrarClasseDeMaterial } from "../m10-patrimonial/almoxarifado.js";

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "licitacoes@cg.pb.gov.br";
const SEM_PERMISSAO = "estagiario@cg.pb.gov.br";
const CNPJ = "11222333000181";

const XML = `<?xml version="1.0"?>
<NFe>
  <infNFe Id="NFe35260214200166000187550010000000011234567890">
    <ide><mod>55</mod><serie>1</serie><nNF>100</nNF><dhEmi>2026-03-01T12:00:00-03:00</dhEmi></ide>
    <emit><CNPJ>${CNPJ}</CNPJ></emit>
    <det nItem="1"><prod><cProd>A</cProd><xProd>Papel</xProd><uCom>UN</uCom><qCom>10.0000</qCom><vUnCom>11.000000</vUnCom><vProd>110.00</vProd></prod></det>
    <det nItem="2"><prod><cProd>B</cProd><xProd>Toner</xProd><uCom>UN</uCom><qCom>2.0000</qCom><vUnCom>50.000000</vUnCom><vProd>100.00</vProd></prod></det>
    <ICMSTot><vProd>210.00</vProd><vDesc>0.00</vDesc><vNF>210.00</vNF></ICMSTot>
  </infNFe>
</NFe>`;

let emitenteId: string;
let materialId: string;
let ordemId: string;

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
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm geral" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: { id: "nd-30", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "30", codigoCompleto: "339030", descricao: "Material de consumo" },
  });
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await criarFichaDeTeste(prisma, {
    id: "ficha-30", exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-04", subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd-30", fonteId: "fnt-500", valorDotado: "500000.00",
  });

  const perfilVazio = await prisma.perfil.create({
    data: { nome: "SEM_PODERES_DF", descricao: "Sem poderes", criadoPor: POR },
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
    descricaoDetalhada: "Papel sulfite A4 75g",
    grupoId, classificacao: "CONSUMO", categoria: "ESTOCAVEL",
    classeDeMaterialId: classe.classeDeMaterialId, controlaLote: false,
    unidades: [{ unidadeDeMedidaId, fatorParaEstoque: "1", ehDeEstoque: true }],
    criadoPor: POR,
  }));

  const emitente = await prisma.pessoa.create({
    data: { documento: CNPJ, tipo: "JURIDICA", criadoPor: POR },
    select: { id: true },
  });
  emitenteId = emitente.id;

  const ordem = await emitirOrdemDeCompra(prisma, {
    numero: "OC-DF-1", tipo: "ORDINARIA", fornecedorId: emitenteId,
    dataEmissao: new Date("2026-03-10T12:00:00Z"),
    finalidade: "Aquisição de expediente", fichaId: "ficha-30",
    itens: [
      { materialId, quantidade: "10", valorUnitario: "11.00" },
      { materialId, quantidade: "2", valorUnitario: "50.00" },
    ],
    criadoPor: POR,
  });
  ordemId = ordem.ordemId;
}

beforeEach(semear);
afterAll(() => prisma.$disconnect());

function itensN2(numero: string) {
  return {
    emitenteId,
    modelo: "NFE" as const,
    serie: "1",
    numero,
    dataEmissao: new Date("2026-03-01T12:00:00Z"),
    dataRecebimento: new Date("2026-03-15T12:00:00Z"),
    ordemId,
    valorBruto: "210.00",
    valorTotal: "210.00",
    itens: [
      { descricao: "Papel", unidade: "UN", quantidade: "10", valorUnitario: "11.00", valorTotal: "110.00" },
      { descricao: "Toner", unidade: "UN", quantidade: "2", valorUnitario: "50.00", valorTotal: "100.00" },
    ],
    criadoPor: POR,
  };
}

describe("documento fiscal recebido", () => {
  it("t1 · N=2: registra duas linhas, não liquida nem recebe, situação REGISTRADO", async () => {
    const { documentoId } = await registrarDocumentoFiscal(prisma, itensN2("1"));
    expect(await prisma.itemDeDocumentoFiscal.count({ where: { documentoId } })).toBe(2);
    expect(await prisma.liquidacao.count()).toBe(0);
    expect(await prisma.recebimentoDeOrdem.count()).toBe(0);
    expect(await situacaoDoDocumentoFiscal(prisma, documentoId)).toBe("REGISTRADO");
  });

  it("t2 · recusa diferença de linha maior que 0,01", async () => {
    await expect(
      registrarDocumentoFiscal(prisma, {
        ...itensN2("2"),
        itens: [
          { descricao: "Papel", unidade: "UN", quantidade: "10", valorUnitario: "11.00", valorTotal: "200.00" },
          { descricao: "Toner", unidade: "UN", quantidade: "2", valorUnitario: "50.00", valorTotal: "100.00" },
        ],
      })
    ).rejects.toThrow(/Diferença/);
    expect(await prisma.documentoFiscalRecebido.count()).toBe(0);
  });

  it("t3 · duplicidade da chave natural é recusada com motivo", async () => {
    await registrarDocumentoFiscal(prisma, itensN2("3"));
    await expect(registrarDocumentoFiscal(prisma, itensN2("3"))).rejects.toThrow(/Já existe o documento/);
    expect(await prisma.documentoFiscalRecebido.count()).toBe(1);
  });

  it("t4 · duas gravações concorrentes da mesma chave: exatamente uma vence", async () => {
    const r = await Promise.allSettled([
      registrarDocumentoFiscal(prisma, itensN2("4")),
      registrarDocumentoFiscal(prisma, itensN2("4")),
    ]);
    const ok = r.filter((x) => x.status === "fulfilled");
    const falha = r.filter((x) => x.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(falha).toHaveLength(1);
    expect((falha[0] as PromiseRejectedResult).reason).toBeInstanceOf(Error);
    expect(String((falha[0] as PromiseRejectedResult).reason)).toMatch(/Já existe o documento/);
    expect(await prisma.documentoFiscalRecebido.count()).toBe(1);
  });

  it("t5 · emitente ≠ fornecedor da ordem recusa", async () => {
    const outro = await prisma.pessoa.create({
      data: { documento: "22333444000181", tipo: "JURIDICA", criadoPor: POR },
      select: { id: true },
    });
    await expect(
      registrarDocumentoFiscal(prisma, { ...itensN2("5"), emitenteId: outro.id })
    ).rejects.toThrow(/não é o fornecedor/);
  });

  it("t6 · XML importa N=2; conferir e cancelar (sem uso) são fatos novos", async () => {
    const { documentoId } = await importarDocumentoFiscalDeXml(prisma, {
      xml: XML,
      nomeArquivo: "nfe.xml",
      dataRecebimento: new Date("2026-03-15T12:00:00Z"),
      ordemId,
      criadoPor: POR,
    });
    expect(await prisma.itemDeDocumentoFiscal.count({ where: { documentoId } })).toBe(2);
    expect(await prisma.anexo.count({ where: { documentoFiscalId: documentoId } })).toBe(1);
    expect(await situacaoDoDocumentoFiscal(prisma, documentoId)).toBe("REGISTRADO");

    await conferirDocumentoFiscal(prisma, {
      documentoId, data: new Date("2026-03-16T12:00:00Z"), motivo: "Conferência com a origem", criadoPor: POR,
    });
    expect(await situacaoDoDocumentoFiscal(prisma, documentoId)).toBe("CONFERIDO");

    await cancelarDocumentoFiscal(prisma, {
      documentoId, data: new Date("2026-03-17T12:00:00Z"), motivo: "Nota emitida por engano", criadoPor: POR,
    });
    expect(await situacaoDoDocumentoFiscal(prisma, documentoId)).toBe("CANCELADO");
    expect(await prisma.documentoFiscalRecebido.count({ where: { id: documentoId } })).toBe(1);
  });

  it("t7 · autorização: sem a ação, nada é gravado", async () => {
    await expect(
      registrarDocumentoFiscal(prisma, { ...itensN2("7"), criadoPor: SEM_PERMISSAO })
    ).rejects.toThrow(/ACESSO NEGADO[\s\S]*REGISTRAR_DOCUMENTO_FISCAL/);
    expect(await prisma.documentoFiscalRecebido.count()).toBe(0);
  });

  it("t8 · recebimento aponta para a nota; cancelar com uso recusa o motivo", async () => {
    const { documentoId } = await registrarDocumentoFiscal(prisma, itensN2("8"));
    const item = await prisma.itemDeOrdemDeCompra.findFirstOrThrow({
      where: { ordemId },
      select: { id: true },
    });
    await registrarRecebimentoDeOrdem(prisma, {
      ordemId,
      data: new Date("2026-03-18T12:00:00Z"),
      documentoFiscalId: documentoId,
      responsavelRecebimento: "Almoxarife de teste",
      itens: [{ itemDeOrdemId: item.id, quantidade: "5" }],
      criadoPor: POR,
    });
    const rec = await prisma.recebimentoDeOrdem.findFirstOrThrow({
      where: { documentoFiscalId: documentoId },
      select: { id: true, notaFiscal: true },
    });
    expect(rec.notaFiscal).toBe("8/1");
    await expect(
      cancelarDocumentoFiscal(prisma, {
        documentoId,
        data: new Date("2026-03-19T12:00:00Z"),
        motivo: "tentativa depois do recebimento",
        criadoPor: POR,
      })
    ).rejects.toThrow(/já lastreia/);
    expect(await situacaoDoDocumentoFiscal(prisma, documentoId)).toBe("REGISTRADO");
  });

  it("t9 · XML com DTD recusa antes de gravar", async () => {
    await expect(
      importarDocumentoFiscalDeXml(prisma, {
        xml: `<!DOCTYPE nfe [<!ENTITY x SYSTEM "file:///etc/passwd">]><NFe></NFe>`,
        nomeArquivo: "evil.xml",
        dataRecebimento: new Date("2026-03-15T12:00:00Z"),
        criadoPor: POR,
      })
    ).rejects.toThrow(/DTD|entidade|externa/);
    expect(await prisma.documentoFiscalRecebido.count()).toBe(0);
    expect(await prisma.anexo.count()).toBe(0);
  });
});
