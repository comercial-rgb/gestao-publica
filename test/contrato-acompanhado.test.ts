import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { diaCivil } from "../packages/datas/index.js";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { vincularPessoaAoUsuario } from "../modules/m16-travamento/servico-pessoa-do-usuario.js";
import { aprovarMedicao } from "../modules/m11-licitacoes/medicoes.js";
import {
  acompanhamentoDoContrato,
  cadastrarItemDoContrato,
  designarNoContrato,
  programarFiscalizacao,
  projecaoPublicaDoContrato,
  registrarMedicaoPorItens,
  registrarOcorrencia,
  resolverOcorrencia,
  revogarDesignacaoNoContrato,
} from "../modules/m11-licitacoes/fiscalizacao.js";

/**
 * ═══ O CONTRATO ACOMPANHADO (V7 M2.1) — gestor, fiscal, outro setor e visitante ═══
 *
 * Fixture: um contrato VIGENTE (hoje dentro) e um FORA DE VIGÊNCIA (acabou há 10 dias); dois itens no
 * vigente (N=2) para a parcela parcial; quatro contas — o administrador que designa, a GESTORA, o FISCAL
 * e OUTRO SETOR, que tem as MESMAS ações de perfil do fiscal e do gestor e nenhuma designação.
 *
 * O que este arquivo existe para impedir:
 *  · a permissão de perfil valendo como designação (outro setor registrando ocorrência ou medindo);
 *  · o gestor fiscalizando o mesmo contrato; ocorrência e medição em contrato fora de vigência;
 *  · item medido acima do contratado, inclusive por duas medições simultâneas;
 *  · a designação revogada continuando a autorizar;
 *  · a projeção pública levando ocorrência, evidência, conta ou medição não aprovada.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const ADMIN = "contratos.admin@teste.local";
const GESTORA = "gestora@teste.local";
const FISCAL = "fiscal@teste.local";
const OUTRO = "outro.setor@teste.local";
const APROVA = "aprovador.medicao@teste.local";
const dia = (deslocamento: number): string => diaCivil(new Date(Date.now() + deslocamento * 86_400_000));
const HOJE = dia(0);

async function conta(identificador: string, acoes: readonly string[], documento?: string, nome?: string): Promise<void> {
  const p = await prisma.perfil.create({ data: { nome: `P-${identificador}`, descricao: "teste", criadoPor: "SEED", permissoes: { create: acoes.map((acao) => ({ acao: acao as never, criadoPor: "SEED" })) } }, select: { id: true } });
  const u = await prisma.usuario.create({ data: { identificador, nome: identificador, criadoPor: "SEED" }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" } });
  if (documento !== undefined) {
    await prisma.pessoa.create({ data: { documento, tipo: "FISICA", criadoPor: "SEED", versoes: { create: { nome: nome ?? identificador, criadoPor: "SEED" } } } });
    await vincularPessoaAoUsuario(prisma, { usuarioId: u.id, documento, motivo: "Conferido pelo documento.", criadoPor: "SEED" });
  }
}

const ATOS = ["PROGRAMAR_FISCALIZACAO_DO_CONTRATO", "REGISTRAR_OCORRENCIA_DE_FISCALIZACAO", "RESOLVER_OCORRENCIA_DE_FISCALIZACAO", "REGISTRAR_MEDICAO_DE_OBRA", "CONSULTAR_LICITACOES"];
let itens: { a: string; b: string } = { a: "", b: "" };
let designacao: { gestora: string; fiscal: string } = { gestora: "", fiscal: "" };

beforeEach(async () => {
  await limparBanco(prisma);
  await conta(ADMIN, ["DESIGNAR_NO_CONTRATO", "CADASTRAR_ITEM_DO_CONTRATO", "CONCEDER_ACAO_A_PERFIL"]);
  await conta(GESTORA, ATOS, "11144477735", "Gabriela Gestora");
  await conta(FISCAL, ATOS, "52998224725", "Fábio Fiscal");
  await conta(OUTRO, ATOS, "39053344705", "Otávio de Outro Setor");
  await conta(APROVA, ["APROVAR_MEDICAO_DE_OBRA"]);
  await prisma.orgao.create({ data: { id: "org", codigo: "01", nome: "Prefeitura" } });
  await prisma.processoLicitatorio.create({ data: { id: "proc", numeroProcesso: "2026/0100", modalidade: "CONCORRENCIA", objeto: "Pavimentação", valorLicitado: "200000.00", criadoPor: "SEED" } });
  await prisma.contrato.create({ data: { id: "ctr-vigente", numeroContrato: "CT-VIG", processoId: "proc", contratadoDocumento: "12345678000199", contratadoNome: "Construtora Alfa", objeto: "Pavimentação da Rua A", valorInicial: "100000.00", vigenciaInicio: new Date(`${dia(-200)}T15:00:00Z`), vigenciaFimInicial: new Date(`${dia(200)}T15:00:00Z`), categoriaOrdemCronologica: "REALIZACAO_OBRAS", criadoPor: "SEED" } });
  await prisma.contrato.create({ data: { id: "ctr-vencido", numeroContrato: "CT-VENC", processoId: "proc", contratadoDocumento: "12345678000199", contratadoNome: "Construtora Alfa", valorInicial: "50000.00", vigenciaInicio: new Date(`${dia(-300)}T15:00:00Z`), vigenciaFimInicial: new Date(`${dia(-10)}T15:00:00Z`), categoriaOrdemCronologica: "REALIZACAO_OBRAS", criadoPor: "SEED" } });
  await prisma.obra.create({ data: { id: "obra", identificador: "OBR-100", descricao: "Pavimentação da Rua A", tipoObraServico: "PAVIMENTACAO_ASFALTICA", orgaoId: "org", criadoPor: "SEED" } });
  itens = {
    a: (await cadastrarItemDoContrato(prisma, { contratoId: "ctr-vigente", descricao: "Base de brita graduada", unidade: "m3", quantidade: "100", valorUnitario: "300", criadoPor: ADMIN })).itemId,
    b: (await cadastrarItemDoContrato(prisma, { contratoId: "ctr-vigente", descricao: "Revestimento CBUQ", unidade: "t", quantidade: "50", valorUnitario: "1000.5", criadoPor: ADMIN })).itemId,
  };
  designacao = {
    gestora: (await designarNoContrato(prisma, { contratoId: "ctr-vigente", papel: "GESTOR", usuarioIdentificador: GESTORA, atoDesignacao: "Portaria 10/2026", vigenciaInicio: dia(-30), criadoPor: ADMIN })).designacaoId,
    fiscal: (await designarNoContrato(prisma, { contratoId: "ctr-vigente", papel: "FISCAL", usuarioIdentificador: FISCAL, atoDesignacao: "Portaria 11/2026", vigenciaInicio: dia(-30), criadoPor: ADMIN })).designacaoId,
  };
}, 120_000);

const medir = (numero: number, de: string, ate: string, pedidos: { itemId: string; quantidade: string }[], criadoPor = FISCAL) =>
  registrarMedicaoPorItens(prisma, { obraId: "obra", contratoId: "ctr-vigente", numero, diaInicio: de, diaFim: ate, itens: pedidos, responsavelTecnico: "Eng. Marta Nunes", registroProfissional: "CREA-PB 123456", criadoPor });

describe("designação", () => {
  it("d1: itens não passam do valor vigente; gestor não fiscaliza o mesmo contrato; conta sem pessoa não é designada; sem a ação, recusa", async () => {
    // 100 × 300 + 50 × 1000,5 = 80.025,00; mais 20.000 levaria a 100.025 > 100.000.
    await expect(cadastrarItemDoContrato(prisma, { contratoId: "ctr-vigente", descricao: "Sinalização", unidade: "vb", quantidade: "1", valorUnitario: "20000", criadoPor: ADMIN })).rejects.toThrow(/ITENS-ACIMA-DO-CONTRATO: .*100025\.00 .*100000\.00/);
    await expect(designarNoContrato(prisma, { contratoId: "ctr-vigente", papel: "FISCAL", usuarioIdentificador: GESTORA, atoDesignacao: "Portaria 12/2026", vigenciaInicio: HOJE, criadoPor: ADMIN })).rejects.toThrow(/ACUMULO-DE-GESTOR-E-FISCAL/);
    await expect(designarNoContrato(prisma, { contratoId: "ctr-vigente", papel: "FISCAL", usuarioIdentificador: APROVA, atoDesignacao: "Portaria 13/2026", vigenciaInicio: HOJE, criadoPor: ADMIN })).rejects.toThrow(/USUARIO-SEM-PESSOA/);
    await expect(designarNoContrato(prisma, { contratoId: "ctr-vigente", papel: "FISCAL", usuarioIdentificador: OUTRO, atoDesignacao: "Portaria 14/2026", vigenciaInicio: HOJE, criadoPor: GESTORA })).rejects.toThrow(/DESIGNAR_NO_CONTRATO/);
    expect(await prisma.designacaoNoContrato.count()).toBe(2);
  });
});

describe("gestor e fiscal", () => {
  it("f1: a gestora programa para o fiscal; o fiscal registra ocorrência com evidência e encaminha; a gestora resolve — uma vez", async () => {
    const o = await programarFiscalizacao(prisma, { contratoId: "ctr-vigente", fiscalDesignacaoId: designacao.fiscal, dataPrevista: dia(2), objetivo: "Conferir compactação da base no trecho 1", criadoPor: GESTORA });
    const oc = await registrarOcorrencia(prisma, {
      contratoId: "ctr-vigente", ordemId: o.ordemId, data: HOJE, tipo: "NAO_CONFORMIDADE", descricao: "Base com espessura abaixo do projeto no trecho 1", encaminhamento: "GESTOR",
      evidencias: [{ nomeOriginal: "foto-trecho-1.png", mimeType: "image/png", conteudo: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]) }], criadoPor: FISCAL,
    });
    expect(oc).toMatchObject({ numero: 1, evidencias: 1 });
    await expect(resolverOcorrencia(prisma, { ocorrenciaId: oc.ocorrenciaId, texto: "Notificada a contratada para refazer o trecho 1", criadoPor: FISCAL })).rejects.toThrow(/SEM-DESIGNACAO-DE-GESTOR/);
    await resolverOcorrencia(prisma, { ocorrenciaId: oc.ocorrenciaId, texto: "Notificada a contratada para refazer o trecho 1", criadoPor: GESTORA });
    await expect(resolverOcorrencia(prisma, { ocorrenciaId: oc.ocorrenciaId, texto: "Segunda resolução sem sentido nenhum", criadoPor: GESTORA })).rejects.toThrow(/OCORRENCIA-JA-RESOLVIDA/);
    const dossie = await acompanhamentoDoContrato(prisma, "ctr-vigente", "FISCALIZACAO");
    expect(dossie?.ocorrencias[0]).toMatchObject({ numero: 1, ordem: 1, fiscal: FISCAL, evidencias: [{ nome: "foto-trecho-1.png" }], resolucao: { gestor: GESTORA } });
    expect(dossie?.ordens[0]).toMatchObject({ numero: 1, ocorrencias: 1 });
  });

  it("f2: OUTRO SETOR com as mesmas ações de perfil e sem designação — não programa, não registra, não mede; o motivo nomeia a designação", async () => {
    await expect(programarFiscalizacao(prisma, { contratoId: "ctr-vigente", fiscalDesignacaoId: designacao.fiscal, dataPrevista: dia(2), objetivo: "Tentativa de outro setor sem designação", criadoPor: OUTRO })).rejects.toThrow(/SEM-DESIGNACAO-DE-GESTOR: outro\.setor/);
    await expect(registrarOcorrencia(prisma, { contratoId: "ctr-vigente", data: HOJE, tipo: "OUTRO", descricao: "Tentativa de outro setor sem designação", encaminhamento: "NENHUM", criadoPor: OUTRO })).rejects.toThrow(/SEM-DESIGNACAO-DE-FISCAL: outro\.setor/);
    await expect(medir(1, dia(-5), dia(-1), [{ itemId: itens.a, quantidade: "1" }], OUTRO)).rejects.toThrow(/SEM-DESIGNACAO-DE-FISCAL/);
    expect(await prisma.ocorrenciaDeFiscalizacao.count()).toBe(0);
    expect(await prisma.medicaoDeObra.count()).toBe(0);
  });

  it("f3: contrato FORA DE VIGÊNCIA — designado nele, o fiscal não registra ocorrência nem programa agenda com data fora", async () => {
    await expect(designarNoContrato(prisma, { contratoId: "ctr-vencido", papel: "FISCAL", usuarioIdentificador: FISCAL, atoDesignacao: "Portaria 20/2026", vigenciaInicio: HOJE, criadoPor: ADMIN })).rejects.toThrow(/DESIGNACAO-FORA-DA-VIGENCIA-DO-CONTRATO/);
    const f = await designarNoContrato(prisma, { contratoId: "ctr-vencido", papel: "FISCAL", usuarioIdentificador: FISCAL, atoDesignacao: "Portaria 21/2026", vigenciaInicio: dia(-100), criadoPor: ADMIN });
    await expect(registrarOcorrencia(prisma, { contratoId: "ctr-vencido", data: HOJE, tipo: "ATRASO", descricao: "Obra parada após o fim do contrato", encaminhamento: "NENHUM", criadoPor: FISCAL })).rejects.toThrow(/CONTRATO-FORA-DE-VIGENCIA: o contrato CT-VENC/);
    // Dentro da vigência passada, com a designação vigente naquele dia E hoje, o registro histórico é aceito.
    await expect(registrarOcorrencia(prisma, { contratoId: "ctr-vencido", data: dia(-20), tipo: "CONFORMIDADE", descricao: "Serviço executado conforme projeto em data dentro da vigência", encaminhamento: "NENHUM", criadoPor: FISCAL })).resolves.toMatchObject({ numero: 1 });
    await designarNoContrato(prisma, { contratoId: "ctr-vencido", papel: "GESTOR", usuarioIdentificador: GESTORA, atoDesignacao: "Portaria 22/2026", vigenciaInicio: dia(-100), criadoPor: ADMIN });
    await expect(programarFiscalizacao(prisma, { contratoId: "ctr-vencido", fiscalDesignacaoId: f.designacaoId, dataPrevista: dia(3), objetivo: "Vistoria depois do fim da vigência", criadoPor: GESTORA })).rejects.toThrow(/CONTRATO-FORA-DE-VIGENCIA/);
  });

  it("f4: designação REVOGADA hoje deixa de autorizar — a ocorrência de antes continua com lastro", async () => {
    await registrarOcorrencia(prisma, { contratoId: "ctr-vigente", data: dia(-3), tipo: "CONFORMIDADE", descricao: "Vistoria de rotina sem apontamentos no trecho 2", encaminhamento: "NENHUM", criadoPor: FISCAL });
    await revogarDesignacaoNoContrato(prisma, { designacaoId: designacao.fiscal, dataEfeito: HOJE, motivo: "Fiscal removido da função", criadoPor: ADMIN });
    await expect(registrarOcorrencia(prisma, { contratoId: "ctr-vigente", data: dia(-1), tipo: "OUTRO", descricao: "Registro depois da revogação com data anterior", encaminhamento: "NENHUM", criadoPor: FISCAL })).rejects.toThrow(/SEM-DESIGNACAO-DE-FISCAL/);
    await expect(revogarDesignacaoNoContrato(prisma, { designacaoId: designacao.fiscal, dataEfeito: HOJE, motivo: "Revogar de novo", criadoPor: ADMIN })).rejects.toThrow(/DESIGNACAO-JA-REVOGADA/);
    const dossie = await acompanhamentoDoContrato(prisma, "ctr-vigente", "FISCALIZACAO");
    expect(dossie?.ocorrencias).toHaveLength(1);
    expect(dossie?.designacoes.find((d) => d.papel === "FISCAL")).toMatchObject({ vigenteHoje: false, revogadaEm: HOJE.split("-").reverse().join("/") });
  });
});

describe("medição por itens", () => {
  it("m1: N=2 itens, parcela PARCIAL — valor = Σ quantidade × unitário; acumulado por item não passa do contratado; físico ≠ financeiro", async () => {
    // item A 40 × 300 = 12.000,00; item B 10,5 × 1000,5 = 10.505,25 → 22.505,25
    const m = await medir(1, dia(-40), dia(-31), [{ itemId: itens.a, quantidade: "40" }, { itemId: itens.b, quantidade: "10.5" }]);
    expect(m.valorMedido).toBe("22505.25");
    await expect(medir(2, dia(-30), dia(-21), [{ itemId: itens.a, quantidade: "60.0001" }])).rejects.toThrow(/ITEM-ACIMA-DO-CONTRATADO: o item 1 .*100\.0000 contratado\(s\), já comprometeu 40\.0000 \(medido ou autorizado em ordem de serviço\) .*100\.0001/);
    await expect(medir(2, dia(-30), dia(-21), [{ itemId: itens.a, quantidade: "60" }])).resolves.toMatchObject({ valorMedido: "18000.00" });
    const dossie = await acompanhamentoDoContrato(prisma, "ctr-vigente", "FISCALIZACAO");
    expect(dossie?.fisico.itens.map((i) => `${i.numero}:${i.medido}:${i.percentualFisico}`)).toEqual(["1:100.0000:100,0", "2:10.5000:21,0"]);
    expect(dossie?.fisico.medidoTotal).toBe("40505.25");
    // Financeiro é do M05 e continua zero: medir não empenha, não liquida, não paga.
    expect(dossie?.financeiro).toMatchObject({ valorVigente: "100000.00", empenhado: "0.00", liquidado: "0.00", pago: "0.00" });
    await expect(medir(3, dia(-20), dia(-11), [{ itemId: itens.b, quantidade: "1" }, { itemId: itens.b, quantidade: "1" }])).rejects.toThrow(/ITEM-REPETIDO/);
  });

  it("m2: duas medições SIMULTÂNEAS que juntas passariam do item — uma passa, a outra recusa pelo item", async () => {
    const r = await Promise.allSettled([
      medir(1, dia(-40), dia(-31), [{ itemId: itens.b, quantidade: "30" }]),
      medir(2, dia(-30), dia(-21), [{ itemId: itens.b, quantidade: "30" }]),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(String((r.find((x) => x.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/ITEM-ACIMA-DO-CONTRATADO/);
    expect((await acompanhamentoDoContrato(prisma, "ctr-vigente", "FISCALIZACAO"))?.fisico.itens[1]?.medido).toBe("30.0000");
  });

  it("m3: medição com fim depois do fim da vigência recusa; a pública só conta medição APROVADA e não leva ocorrência nem conta", async () => {
    await expect(medir(1, dia(190), dia(210), [{ itemId: itens.a, quantidade: "1" }])).rejects.toThrow(/CONTRATO-FORA-DE-VIGENCIA/);
    const m1 = await medir(1, dia(-40), dia(-31), [{ itemId: itens.a, quantidade: "10" }]);
    await medir(2, dia(-30), dia(-21), [{ itemId: itens.a, quantidade: "5" }]);
    await aprovarMedicao(prisma, { medicaoId: m1.medicaoId, diaAprovacao: HOJE, criadoPor: APROVA });
    await registrarOcorrencia(prisma, { contratoId: "ctr-vigente", data: HOJE, tipo: "NAO_CONFORMIDADE", descricao: "Apontamento interno que não vai ao portal", encaminhamento: "GESTOR", criadoPor: FISCAL });
    const pub = await projecaoPublicaDoContrato(prisma, "ctr-vigente");
    expect(pub?.medicoesAprovadas).toEqual({ quantidade: 1, valor: "3000.00" });
    expect(pub?.execucaoFisica[0]).toMatchObject({ item: 1, medidoAprovado: "10.0000", percentual: "10,0" });
    expect(pub?.responsaveis.map((r) => `${r.papel}:${r.nome}`).sort()).toEqual(["FISCAL:Fábio Fiscal", "GESTOR:Gabriela Gestora"]);
    const json = JSON.stringify(pub);
    for (const proibido of ["Apontamento interno", FISCAL, GESTORA, "52998224725", "11144477735", "CREA-PB"]) expect(json).not.toContain(proibido);
  });
});
