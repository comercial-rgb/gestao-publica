import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { diaCivil } from "../../packages/datas/index.js";
import { criarPrismaDeTeste, criarPrismaDoPapelDeRuntime, exigirBanco } from "../banco.js";
import { limparBanco } from "../limpar-banco.js";
import { vincularPessoaAoUsuario } from "../../modules/m16-travamento/servico-pessoa-do-usuario.js";
import { aprovarMedicao } from "../../modules/m11-licitacoes/medicoes.js";
import {
  acompanhamentoDoContrato, cadastrarItemDoContrato, designarNoContrato, programarFiscalizacao, projecaoPublicaDoContrato,
  registrarMedicaoPorItens, registrarOcorrencia, resolverOcorrencia, revogarDesignacaoNoContrato,
} from "../../modules/m11-licitacoes/fiscalizacao.js";

/**
 * ═══ O CONTRATO ACOMPANHADO PELO PAPEL DE RUNTIME (V7 M2.1) ═══
 *
 * Cada ato pela conexão `gestao_app`: designar, item, agenda, ocorrência com evidência (linha e arquivo),
 * resolução, medição por itens, aprovação por outra pessoa, revogação e as leituras. E as negativas do
 * banco: o runtime não reescreve item, ocorrência, designação nem medição por itens.
 */
const dono = criarPrismaDeTeste();
const app = criarPrismaDoPapelDeRuntime();
await exigirBanco(dono);
await exigirBanco(app);
afterAll(async () => { await dono.$disconnect(); await app.$disconnect(); });

const ADMIN = "contratos.rt@teste.local";
const GESTORA = "gestora.rt@teste.local";
const FISCAL = "fiscal.rt@teste.local";
const APROVA = "aprova.rt@teste.local";
const dia = (d: number): string => diaCivil(new Date(Date.now() + d * 86_400_000));
const negado = /permission denied|permissão negada/i;

beforeAll(async () => {
  await limparBanco(dono);
  const contas: [string, string[], string | null][] = [
    [ADMIN, ["DESIGNAR_NO_CONTRATO", "CADASTRAR_ITEM_DO_CONTRATO"], null],
    [GESTORA, ["PROGRAMAR_FISCALIZACAO_DO_CONTRATO", "RESOLVER_OCORRENCIA_DE_FISCALIZACAO"], "11144477735"],
    [FISCAL, ["REGISTRAR_OCORRENCIA_DE_FISCALIZACAO", "REGISTRAR_MEDICAO_DE_OBRA"], "52998224725"],
    [APROVA, ["APROVAR_MEDICAO_DE_OBRA"], null],
  ];
  for (const [ident, acoes, doc] of contas) {
    const p = await dono.perfil.create({ data: { nome: `RT-${ident}`, descricao: "rt", criadoPor: "SEED", permissoes: { create: acoes.map((acao) => ({ acao: acao as never, criadoPor: "SEED" })) } }, select: { id: true } });
    const u = await dono.usuario.create({ data: { identificador: ident, nome: ident, criadoPor: "SEED" }, select: { id: true } });
    await dono.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" } });
    if (doc !== null) {
      await dono.pessoa.create({ data: { documento: doc, tipo: "FISICA", criadoPor: "SEED", versoes: { create: { nome: ident, criadoPor: "SEED" } } } });
      await vincularPessoaAoUsuario(app, { usuarioId: u.id, documento: doc, motivo: "Conferido pelo documento.", criadoPor: "SEED" });
    }
  }
  await dono.orgao.create({ data: { id: "org", codigo: "01", nome: "Prefeitura" } });
  await dono.processoLicitatorio.create({ data: { id: "proc", numeroProcesso: "RT/1", modalidade: "CONCORRENCIA", objeto: "Obra", valorLicitado: "10000.00", criadoPor: "SEED" } });
  await dono.contrato.create({ data: { id: "ctr", numeroContrato: "CT-RT", processoId: "proc", contratadoDocumento: "12345678000199", contratadoNome: "Alfa", valorInicial: "10000.00", vigenciaInicio: new Date(`${dia(-100)}T15:00:00Z`), vigenciaFimInicial: new Date(`${dia(100)}T15:00:00Z`), categoriaOrdemCronologica: "REALIZACAO_OBRAS", criadoPor: "SEED" } });
  await dono.obra.create({ data: { id: "obra", identificador: "OBR-RT", descricao: "Obra", tipoObraServico: "PAVIMENTACAO_ASFALTICA", orgaoId: "org", criadoPor: "SEED" } });
}, 180_000);

describe("contrato acompanhado pelo papel de runtime", () => {
  it("designar, item, agenda, ocorrência com evidência, resolução, medição por itens, aprovação, revogação e leituras", async () => {
    const item = await cadastrarItemDoContrato(app, { contratoId: "ctr", descricao: "Base", unidade: "m3", quantidade: "10", valorUnitario: "100", criadoPor: ADMIN });
    await designarNoContrato(app, { contratoId: "ctr", papel: "GESTOR", usuarioIdentificador: GESTORA, atoDesignacao: "Portaria RT-G", vigenciaInicio: dia(-10), criadoPor: ADMIN });
    const f = await designarNoContrato(app, { contratoId: "ctr", papel: "FISCAL", usuarioIdentificador: FISCAL, atoDesignacao: "Portaria RT-F", vigenciaInicio: dia(-10), criadoPor: ADMIN });
    const o = await programarFiscalizacao(app, { contratoId: "ctr", fiscalDesignacaoId: f.designacaoId, dataPrevista: dia(1), objetivo: "Vistoria pelo runtime", criadoPor: GESTORA });
    const oc = await registrarOcorrencia(app, { contratoId: "ctr", ordemId: o.ordemId, data: dia(0), tipo: "NAO_CONFORMIDADE", descricao: "Apontamento pelo runtime", encaminhamento: "GESTOR", evidencias: [{ nomeOriginal: "e.pdf", mimeType: "application/pdf", conteudo: new TextEncoder().encode("%PDF-1.4 runtime") }], criadoPor: FISCAL });
    await resolverOcorrencia(app, { ocorrenciaId: oc.ocorrenciaId, texto: "Resolvida pelo runtime", criadoPor: GESTORA });
    const m = await registrarMedicaoPorItens(app, { obraId: "obra", contratoId: "ctr", numero: 1, diaInicio: dia(-5), diaFim: dia(-1), itens: [{ itemId: item.itemId, quantidade: "4" }], responsavelTecnico: "Eng. RT", registroProfissional: "CREA-RT", criadoPor: FISCAL });
    expect(m.valorMedido).toBe("400.00");
    await aprovarMedicao(app, { medicaoId: m.medicaoId, diaAprovacao: dia(0), criadoPor: APROVA });
    await revogarDesignacaoNoContrato(app, { designacaoId: f.designacaoId, dataEfeito: dia(0), motivo: "Revogação pelo runtime", criadoPor: ADMIN });
    expect((await acompanhamentoDoContrato(app, "ctr"))?.fisico.itens[0]?.percentualFisico).toBe("40,0");
    expect((await projecaoPublicaDoContrato(app, "ctr"))?.medicoesAprovadas).toEqual({ quantidade: 1, valor: "400.00" });

    await expect(app.$executeRawUnsafe(`UPDATE "ItemDoContrato" SET "quantidade" = 99`)).rejects.toThrow(negado);
    await expect(app.$executeRawUnsafe(`UPDATE "OcorrenciaDeFiscalizacao" SET "descricao" = 'apagado pelo runtime'`)).rejects.toThrow(negado);
    await expect(app.$executeRawUnsafe(`DELETE FROM "RevogacaoDeDesignacaoNoContrato"`)).rejects.toThrow(negado);
    await expect(app.$executeRawUnsafe(`UPDATE "ItemMedido" SET "quantidade" = 1`)).rejects.toThrow(negado);
  });
});
