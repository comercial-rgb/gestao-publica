import "dotenv/config";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { diaCivil } from "../../packages/datas/index.js";
import { criarPrismaDeTeste, criarPrismaDoPapelDeRuntime, exigirBanco } from "../banco.js";
import { limparBanco } from "../limpar-banco.js";
import { vincularPessoaAoUsuario } from "../../modules/m16-travamento/servico-pessoa-do-usuario.js";
import {
  acompanharManifestacao, cadastrarServicoDaCarta, cadastrarVersaoDoServico, decidirSolicitacao, protocolarSolicitacao,
  publicarVersaoDoServico, registrarManifestacaoAnonima, responderManifestacao, triarManifestacao,
} from "../../modules/m21-protocolo/servico.js";
import { avaliarAtendimento, cadastrarMetodologiaDeAvaliacao, opinarSobreServico, removerAvaliacao, resultadoPublicoDasAvaliacoes } from "../../modules/m21-protocolo/avaliacao.js";

/**
 * ═══ A OUVIDORIA SEM CONTA E A AVALIAÇÃO PELO PAPEL DE RUNTIME (V7 M1 U4) ═══
 *
 * Cada ato pela conexão `gestao_app`: manifestação, acompanhamento, triagem, resposta conclusiva
 * (encerramento), metodologia, avaliação do atendimento, revisão, opinião geral e remoção. E as
 * negativas do banco: o runtime não reescreve o hash do segredo, a resposta nem a avaliação.
 */
const dono = criarPrismaDeTeste();
const app = criarPrismaDoPapelDeRuntime();
await exigirBanco(dono);
await exigirBanco(app);
afterAll(async () => { await dono.$disconnect(); await app.$disconnect(); });

const ADMIN = "protocolo@cg.pb.gov.br";
const OUVIDOR = "ouvidor.rt@cg.pb.gov.br";
const CIDADA = "cidada.ouv.rt@externo.test";
const ANO = Number(diaCivil(new Date()).slice(0, 4));
const quota = (s: string) => createHash("sha256").update(`rt:${s}`).digest("hex");

beforeAll(async () => {
  await limparBanco(dono);
  await dono.orgao.create({ data: { id: "o", codigo: "01", nome: "Prefeitura" } });
  await dono.unidadeOrcamentaria.create({ data: { id: "ug", codigo: "01001", descricao: "Adm", orgaoId: "o" } });
  await dono.exercicio.create({ data: { id: "ex", ano: ANO, criadoPor: "SEED" } });
  await dono.setor.createMany({ data: [{ id: "s1", codigo: "PROT", nome: "Protocolo", unidadeOrcId: "ug", criadoPor: "SEED" }, { id: "s-ouv", codigo: "OUV", nome: "Ouvidoria", unidadeOrcId: "ug", criadoPor: "SEED" }] });
  const perfilOuv = await dono.perfil.create({ data: { nome: "OUV-RT", descricao: "ouv", criadoPor: "SEED", permissoes: { create: [{ acao: "TRIAR_MANIFESTACAO_DE_OUVIDORIA", criadoPor: "SEED" }, { acao: "CONSULTAR_PROTOCOLO", criadoPor: "SEED" }] } }, select: { id: true } });
  const perfilReq = await dono.perfil.create({ data: { nome: "REQ-OUV-RT", descricao: "req", criadoPor: "SEED", permissoes: { create: [{ acao: "SOLICITAR_SERVICO", criadoPor: "SEED" }] } }, select: { id: true } });
  for (const [u, perfilId] of [[OUVIDOR, perfilOuv.id], [CIDADA, perfilReq.id]] as const) {
    const x = await dono.usuario.create({ data: { identificador: u, nome: u, criadoPor: "SEED" }, select: { id: true } });
    await dono.vinculoUsuarioPerfil.create({ data: { usuarioId: x.id, perfilId, criadoPor: "SEED" } });
  }
  await dono.usuarioDoSetor.createMany({ data: [{ usuarioIdent: ADMIN, setorId: "s1", criadoPor: "SEED" }, { usuarioIdent: OUVIDOR, setorId: "s-ouv", criadoPor: "SEED" }] });
  await dono.pessoa.create({ data: { documento: "11144477735", tipo: "FISICA", criadoPor: "SEED", versoes: { create: { nome: "Cidadã", criadoPor: "SEED" } } } });
  const idCidada = (await dono.usuario.findUniqueOrThrow({ where: { identificador: CIDADA }, select: { id: true } })).id;
  await vincularPessoaAoUsuario(app, { usuarioId: idCidada, documento: "11144477735", motivo: "Conferido pelo documento.", criadoPor: ADMIN });
  const req = await dono.assunto.create({ data: { codigo: "REQ", nome: "Requerimento", criadoPor: "SEED", roteiro: { create: [{ ordem: 1, setorId: "s1", prazoDias: 5, descricao: "Triagem", criadoPor: "SEED" }] } }, select: { id: true } });
  const ouv = await dono.assunto.create({ data: { codigo: "OUV", nome: "Ouvidoria", permiteAnonimo: true, sigiloPadrao: true, criadoPor: "SEED", roteiro: { create: [{ ordem: 1, setorId: "s-ouv", prazoDias: 30, descricao: "Triagem", criadoPor: "SEED" }] } }, select: { id: true } });
  for (const [slug, tipo, assuntoId, setor] of [["req", "REQUERIMENTO_ADMINISTRATIVO", req.id, "s1"], ["ouvidoria", "MANIFESTACAO_ANONIMA", ouv.id, "s-ouv"]] as const) {
    const { servicoId } = await cadastrarServicoDaCarta(app, { slug, titulo: `Serviço ${slug}`, categoria: "Geral", publico: "CIDADAO", tipo, assuntoId, criadoPor: ADMIN });
    const { versaoId } = await cadastrarVersaoDoServico(app, { servicoId, descricao: "Descrição do serviço.", requisitos: "Nenhum.", documentos: [], canais: "Internet.", exigeAutenticacao: tipo !== "MANIFESTACAO_ANONIMA", setorDeEntradaId: setor, campos: [{ nome: "relato", rotulo: "Relato", tipo: "textoLongo", obrigatorio: true }], criadoPor: ADMIN });
    await publicarVersaoDoServico(app, { versaoId, criadoPor: ADMIN });
  }
}, 180_000);

describe("ouvidoria e avaliação pelo papel de runtime", () => {
  it("manifestação sem conta: registrar, acompanhar, triar e responder de forma conclusiva", async () => {
    const m = await registrarManifestacaoAnonima(app, { slug: "ouvidoria", tipo: "RECLAMACAO", respostas: { relato: "Relato pelo runtime." }, chaveDeQuota: quota("m") });
    const mf = await dono.manifestacaoDeOuvidoria.findFirstOrThrow({ select: { id: true } });
    await triarManifestacao(app, { manifestacaoId: mf.id, tipoConfirmado: "RECLAMACAO", anotacaoInterna: "Tratar na ouvidoria.", criadoPor: OUVIDOR });
    await responderManifestacao(app, { manifestacaoId: mf.id, texto: "Resposta conclusiva pelo runtime.", conclusiva: true, criadoPor: OUVIDOR });
    expect((await acompanharManifestacao(app, m.protocolo, m.segredo))?.situacao).toBe("CONCLUIDA");
    await expect(app.$executeRawUnsafe(`UPDATE "ManifestacaoDeOuvidoria" SET "hashDoSegredo" = 'x' WHERE "id" = $1`, mf.id)).rejects.toThrow(/permission denied|permissão negada/i);
    await expect(app.$executeRawUnsafe(`DELETE FROM "RespostaDaOuvidoria"`)).rejects.toThrow(/permission denied|permissão negada/i);
  });

  it("avaliação: metodologia, atendimento com revisão, opinião geral, remoção e resultado", async () => {
    await cadastrarMetodologiaDeAvaliacao(app, { escalaMinima: 1, escalaMaxima: 5, rotulos: [1, 2, 3, 4, 5].map((nota) => ({ nota, rotulo: `Nota ${nota}` })), descricaoDoMetodo: "Média simples da última avaliação de cada avaliador.", periodoMeses: 12, criadoPor: ADMIN });
    const s = await protocolarSolicitacao(app, { slug: "req", respostas: { relato: "Pedido." }, criadoPor: CIDADA });
    await decidirSolicitacao(app, { solicitacaoId: s.solicitacaoId, resultado: "DEFERIDA", mensagemAoRequerente: "Pedido deferido pela mesa.", fundamentoInterno: "Confere.", criadoPor: ADMIN });
    await avaliarAtendimento(app, { solicitacaoId: s.solicitacaoId, satisfacao: 5, atendimento: 5, prazos: 5, criadoPor: CIDADA });
    await avaliarAtendimento(app, { solicitacaoId: s.solicitacaoId, satisfacao: 4, atendimento: 4, prazos: 4, criadoPor: CIDADA });
    const op = await opinarSobreServico(app, { slug: "req", token: "token-runtime-aaaaaaaaaaaaaaaaaaaaaaaaaaaa", satisfacao: 1, atendimento: 1, prazos: 1, descricao: "Abusivo", chaveDeQuota: quota("o") });
    await removerAvaliacao(app, { avaliacaoId: op.avaliacaoId, motivo: "ABUSO", justificativa: "Ofensa a servidor.", criadoPor: ADMIN });
    const servico = await dono.servicoDaCarta.findUniqueOrThrow({ where: { slug: "req" }, select: { id: true } });
    expect(await resultadoPublicoDasAvaliacoes(app, servico.id)).toMatchObject({ atendimentoComprovado: { respostas: 1, satisfacao: "4,0" }, opiniaoGeral: { respostas: 0 }, removidas: 1 });
    await expect(app.$executeRawUnsafe(`UPDATE "AvaliacaoDeServico" SET "satisfacao" = 5`)).rejects.toThrow(/permission denied|permissão negada/i);
  });
});
