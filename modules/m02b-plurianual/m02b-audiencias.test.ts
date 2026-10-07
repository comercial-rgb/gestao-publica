import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { anexarArquivo } from "../m22-documentos/anexos.js";
import { registrarAudienciaPublica, registrarSituacaoDaSolicitacao, registrarSolicitacaoDaAudiencia, situacaoVigente } from "./audiencias.js";

/**
 * V36 — AS AUDIÊNCIAS PÚBLICAS DO PLANEJAMENTO (TR 5.9.1.1-2). N=2 solicitações na mesma audiência, de órgãos
 * diferentes: a situação de uma não mexe na da outra; a vigente é a mais recente; o histórico fica. Recusas com o
 * motivo: decidir sem parecer, repetir a situação vigente, órgão inexistente, quem não cadastra o PPA. O documento da
 * audiência entra pelo M22 com dono único.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "planejamento@cg.pb.gov.br";
const DIA = new Date("2026-05-12T15:00:00.000Z");

async function recusa(f: () => Promise<unknown>): Promise<string> {
  try {
    await f();
    return "gravou";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

let audiencia = "";
let s1 = "";
let s2 = "";

describe("M02b V36 — audiências públicas do planejamento", () => {
  beforeEach(async () => {
    await limparBanco(prisma);
    await prisma.orgao.createMany({ data: [{ id: "org-a", codigo: "02", nome: "Secretaria de Obras" }, { id: "org-b", codigo: "03", nome: "Secretaria de Saúde" }] });
    audiencia = (await registrarAudienciaPublica(prisma, { exercicio: 2027, peca: "LDO", data: DIA, local: "Câmara Municipal", pauta: "Prioridades da LDO 2027", criadoPor: POR })).audienciaId;
    s1 = (await registrarSolicitacaoDaAudiencia(prisma, { audienciaId: audiencia, descricao: "Pavimentar a Rua das Flores", bairro: "Centro", solicitanteNome: "Maria Teste", solicitanteContato: "(83) 99999-0001", orgaoId: "org-a", criadoPor: POR })).solicitacaoId;
    s2 = (await registrarSolicitacaoDaAudiencia(prisma, { audienciaId: audiencia, descricao: "Posto de saúde no bairro", bairro: "Alto", solicitanteNome: "João Teste", solicitanteContato: "joao@exemplo.local", orgaoId: "org-b", criadoPor: POR })).solicitacaoId;
  }, 60000);

  it("t1: as duas solicitações nascem recebidas; a situação de uma não mexe na outra; a vigente é a mais recente", async () => {
    const lerVigente = async (id: string) => situacaoVigente(await prisma.situacaoDaSolicitacao.findMany({ where: { solicitacaoId: id }, select: { id: true, situacao: true, criadoEm: true } }));
    expect([await lerVigente(s1), await lerVigente(s2)]).toEqual(["RECEBIDA", "RECEBIDA"]);
    await registrarSituacaoDaSolicitacao(prisma, { solicitacaoId: s1, situacao: "EM_ANALISE", criadoPor: POR });
    await registrarSituacaoDaSolicitacao(prisma, { solicitacaoId: s1, situacao: "ACOLHIDA", parecer: "Incluída como prioridade na LDO 2027.", criadoPor: POR });
    await registrarSituacaoDaSolicitacao(prisma, { solicitacaoId: s2, situacao: "NAO_ACOLHIDA", parecer: "Sem previsão de recursos no exercício.", criadoPor: POR });
    expect([await lerVigente(s1), await lerVigente(s2)]).toEqual(["ACOLHIDA", "NAO_ACOLHIDA"]);
    expect(await prisma.situacaoDaSolicitacao.count({ where: { solicitacaoId: s1 } })).toBe(2);
  });

  it("t2: recusas com o motivo e nada gravado", async () => {
    expect(await recusa(() => registrarSituacaoDaSolicitacao(prisma, { solicitacaoId: s1, situacao: "ACOLHIDA", criadoPor: POR }))).toMatch(/exige o parecer/);
    await registrarSituacaoDaSolicitacao(prisma, { solicitacaoId: s2, situacao: "EM_ANALISE", criadoPor: POR });
    expect(await recusa(() => registrarSituacaoDaSolicitacao(prisma, { solicitacaoId: s2, situacao: "EM_ANALISE", criadoPor: POR }))).toMatch(/já está em análise/);
    expect(await recusa(() => registrarSolicitacaoDaAudiencia(prisma, { audienciaId: audiencia, descricao: "Praça nova", bairro: "Centro", solicitanteNome: "Ana Teste", solicitanteContato: "(83) 3333-0000", orgaoId: "nao-existe", criadoPor: POR }))).toMatch(/órgão responsável pela análise não existe/);
    expect(await recusa(() => registrarAudienciaPublica(prisma, { exercicio: 2027, peca: "XYZ" as "LDO", data: DIA, local: "Câmara", pauta: "Pauta", criadoPor: POR }))).toMatch(/PPA, LDO ou LOA/);
    expect(await prisma.situacaoDaSolicitacao.count()).toBe(1);
    expect(await prisma.solicitacaoDaAudiencia.count()).toBe(2);
  });

  it("t3: quem só consulta o planejamento não registra audiência nem decide solicitação", async () => {
    const u = await prisma.usuario.create({ data: { identificador: "so.le.plan@cg.pb.gov.br", nome: "Só lê", criadoPor: "TESTE" }, select: { id: true } });
    const p = await prisma.perfil.create({ data: { nome: "SO_LE_PLAN", descricao: "x", criadoPor: "TESTE", permissoes: { create: [{ acao: "CONSULTAR_PLANEJAMENTO" as never, criadoPor: "TESTE" }] } }, select: { id: true } });
    await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "TESTE" } });
    expect(await recusa(() => registrarAudienciaPublica(prisma, { exercicio: 2027, peca: "LOA", data: DIA, local: "Câmara", pauta: "LOA 2027", criadoPor: "so.le.plan@cg.pb.gov.br" }))).toMatch(/CADASTRAR_PPA/);
    expect(await recusa(() => registrarSituacaoDaSolicitacao(prisma, { solicitacaoId: s1, situacao: "EM_ANALISE", criadoPor: "so.le.plan@cg.pb.gov.br" }))).toMatch(/CADASTRAR_PPA/);
    expect(await prisma.audienciaPublica.count()).toBe(1);
  });

  it("t4: o documento da audiência tem dono único, e a audiência tem de existir", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.4\n% ata\n");
    const ok = await anexarArquivo(prisma, { nomeOriginal: "ata.pdf", mimeType: "application/pdf", conteudo: pdf, audienciaPublicaId: audiencia, criadoPor: POR });
    expect((await prisma.anexo.findUniqueOrThrow({ where: { id: ok.anexoId }, select: { audienciaPublicaId: true } })).audienciaPublicaId).toBe(audiencia);
    expect(await recusa(() => anexarArquivo(prisma, { nomeOriginal: "x.pdf", mimeType: "application/pdf", conteudo: pdf, audienciaPublicaId: "nao-existe", criadoPor: POR }))).toMatch(/Audiência pública nao-existe não existe/);
    expect(await recusa(() => anexarArquivo(prisma, { nomeOriginal: "x.pdf", mimeType: "application/pdf", conteudo: pdf, audienciaPublicaId: audiencia, pessoaId: "p", criadoPor: POR }))).toMatch(/EXATAMENTE UM registro/);
  });
});
