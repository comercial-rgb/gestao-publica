import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, criarPrismaDoPapelDeRuntime, exigirBanco } from "../banco.js";
import { limparBanco } from "../limpar-banco.js";
import { vincularPessoaAoUsuario } from "../../modules/m16-travamento/servico-pessoa-do-usuario.js";
import { registrarRepresentacao, revogarRepresentacao } from "../../modules/m19-pessoas/representacao.js";
import { anexarArquivo, baixarAnexo } from "../../modules/m22-documentos/anexos.js";
import {
  anexarDoRequerente, cadastrarServicoDaCarta, cadastrarVersaoDoServico, decidirSolicitacao, disponibilizarRespostaDaSolicitacao,
  emitirExigenciaDaSolicitacao, protocolarSolicitacao, publicarVersaoDoServico, responderExigenciaDaSolicitacao,
} from "../../modules/m21-protocolo/servico.js";

/**
 * ═══ P3, M22 E A ATUALIZAÇÃO CADASTRAL PELO PAPEL DE RUNTIME (V7 M1 U0 §2.3) ═══
 *
 * A carta, o pedido, a exigência, o anexo (linha + arquivo), a resposta, a decisão que cria a versão
 * do cadastro e a representação — cada ato pela conexão `gestao_app`. O dono só limpa e cria o que
 * nenhuma tela cria (setor, assunto, contas e pessoas de fixture).
 *
 * E as NEGATIVAS do banco: o runtime não reescreve versão publicada, decisão, anexo nem proposta.
 */
const dono = criarPrismaDeTeste();
const app = criarPrismaDoPapelDeRuntime();
await exigirBanco(dono);
await exigirBanco(app);
afterAll(async () => { await dono.$disconnect(); await app.$disconnect(); });

const ADMIN = "protocolo@cg.pb.gov.br";
const CIDADA = "cidada.rt@externo.test";
const CONTADOR = "contador.rt@externo.test";
let empresa = "";

beforeAll(async () => {
  await limparBanco(dono);
  await dono.orgao.create({ data: { id: "o", codigo: "01", nome: "Prefeitura" } });
  await dono.unidadeOrcamentaria.create({ data: { id: "ug", codigo: "01001", descricao: "Adm", orgaoId: "o" } });
  await dono.exercicio.create({ data: { id: "ex", ano: 2026, criadoPor: "SEED" } });
  await dono.setor.create({ data: { id: "s1", codigo: "PROT", nome: "Protocolo", unidadeOrcId: "ug", criadoPor: "SEED" } });
  await dono.usuarioDoSetor.create({ data: { usuarioIdent: ADMIN, setorId: "s1", criadoPor: "SEED" } });
  const perfil = await dono.perfil.create({ data: { nome: "REQ-RT", descricao: "req", criadoPor: "SEED", permissoes: { create: [{ acao: "SOLICITAR_SERVICO", criadoPor: "SEED" }, { acao: "CONSULTAR_MEUS_SERVICOS", criadoPor: "SEED" }] } }, select: { id: true } });
  for (const u of [CIDADA, CONTADOR]) {
    const x = await dono.usuario.create({ data: { identificador: u, nome: u, criadoPor: "SEED" }, select: { id: true } });
    await dono.vinculoUsuarioPerfil.create({ data: { usuarioId: x.id, perfilId: perfil.id, criadoPor: "SEED" } });
  }
  await dono.pessoa.create({ data: { documento: "11144477735", tipo: "FISICA", criadoPor: "SEED", versoes: { create: { nome: "Cidadã", email: "antigo@exemplo.test", criadoPor: "SEED" } } } });
  await dono.pessoa.create({ data: { documento: "39053344705", tipo: "FISICA", criadoPor: "SEED", versoes: { create: { nome: "Contador", criadoPor: "SEED" } } } });
  empresa = (await dono.pessoa.create({ data: { documento: "11222333000181", tipo: "JURIDICA", criadoPor: "SEED", versoes: { create: { nome: "Empresa", criadoPor: "SEED" } } }, select: { id: true } })).id;
  const assunto = await dono.assunto.create({ data: { codigo: "REQ", nome: "Requerimento", criadoPor: "SEED", roteiro: { create: [{ ordem: 1, setorId: "s1", prazoDias: 5, descricao: "Triagem", criadoPor: "SEED" }] } }, select: { id: true } });

  for (const [u, doc] of [[CIDADA, "11144477735"], [CONTADOR, "39053344705"]] as const) {
    const x = await dono.usuario.findUniqueOrThrow({ where: { identificador: u }, select: { id: true } });
    await vincularPessoaAoUsuario(app, { usuarioId: x.id, documento: doc, motivo: "Conferido pelo documento.", criadoPor: ADMIN });
  }
  const servico = async (slug: string, tipo: "REQUERIMENTO_ADMINISTRATIVO" | "ATUALIZACAO_CADASTRAL" | "COMPLEMENTO_DE_FORNECEDOR", campos: unknown) => {
    const { servicoId } = await cadastrarServicoDaCarta(app, { slug, titulo: `Serviço ${slug}`, categoria: "Geral", publico: "CIDADAO", tipo, assuntoId: assunto.id, criadoPor: ADMIN });
    const { versaoId } = await cadastrarVersaoDoServico(app, { servicoId, descricao: "Descrição do serviço.", requisitos: "Conta.", documentos: [], canais: "Internet.", exigeAutenticacao: true, setorDeEntradaId: "s1", campos, criadoPor: ADMIN });
    await publicarVersaoDoServico(app, { versaoId, criadoPor: ADMIN });
    return versaoId;
  };
  await servico("req", "REQUERIMENTO_ADMINISTRATIVO", [{ nome: "pedido", rotulo: "Pedido", tipo: "texto", obrigatorio: true }]);
  await servico("cad", "ATUALIZACAO_CADASTRAL", [{ nome: "email", rotulo: "E-mail", tipo: "email", obrigatorio: true }]);
  await servico("comp", "COMPLEMENTO_DE_FORNECEDOR", [{ nome: "documento", rotulo: "Documento", tipo: "texto", obrigatorio: true }]);
}, 180_000);

describe("P3 e M22 pelo papel de runtime", () => {
  it("requerimento: protocolo, exigência, anexo do requerente (linha e arquivo), resposta, documento do ente e decisão", async () => {
    const s = await protocolarSolicitacao(app, { slug: "req", respostas: { pedido: "Revisão do lançamento" }, criadoPor: CIDADA });
    await emitirExigenciaDaSolicitacao(app, { solicitacaoId: s.solicitacaoId, mensagemAoRequerente: "Envie o comprovante.", criadoPor: ADMIN });
    const { anexoId } = await anexarDoRequerente(app, { solicitacaoId: s.solicitacaoId, nomeOriginal: "c.pdf", mimeType: "application/pdf", conteudo: new TextEncoder().encode("%PDF-1.4 rt"), criadoPor: CIDADA });
    await responderExigenciaDaSolicitacao(app, { solicitacaoId: s.solicitacaoId, texto: "Enviado.", criadoPor: CIDADA });
    await disponibilizarRespostaDaSolicitacao(app, { solicitacaoId: s.solicitacaoId, nomeOriginal: "r.pdf", mimeType: "application/pdf", conteudo: new TextEncoder().encode("%PDF-1.4 resp"), criadoPor: ADMIN });
    await decidirSolicitacao(app, { solicitacaoId: s.solicitacaoId, resultado: "DEFERIDA", mensagemAoRequerente: "Pedido deferido pela mesa.", fundamentoInterno: "Confere.", criadoPor: ADMIN });
    // O arquivo gravado pelo runtime é lido pelo runtime, com o hash conferido.
    expect((await baixarAnexo(app, anexoId, ADMIN))?.nomeOriginal).toBe("c.pdf");
  });

  it("atualização cadastral deferida: a versão nova do cadastro nasce pelo runtime (INSERT), sem UPDATE", async () => {
    const s = await protocolarSolicitacao(app, { slug: "cad", respostas: { email: "novo@exemplo.test" }, criadoPor: CIDADA });
    const r = await decidirSolicitacao(app, { solicitacaoId: s.solicitacaoId, resultado: "DEFERIDA", mensagemAoRequerente: "Cadastro atualizado.", fundamentoInterno: "Titular autenticada.", criadoPor: ADMIN });
    expect(r.versaoDoCadastro).not.toBeNull();
    const v = await dono.versaoDePessoa.findUniqueOrThrow({ where: { id: r.versaoDoCadastro ?? "" }, select: { email: true } });
    expect(v.email).toBe("novo@exemplo.test");
  });

  it("representação: registrar, protocolar pela empresa e revogar — pelo runtime", async () => {
    const { representacaoId } = await registrarRepresentacao(app, { representadaId: empresa, representanteUsuario: CONTADOR, fundamento: "Procuração pública", vigenciaInicio: new Date(Date.UTC(2026, 0, 1, 12)), criadoPor: ADMIN });
    await protocolarSolicitacao(app, { slug: "comp", representadaId: empresa, respostas: { documento: "Certidão" }, criadoPor: CONTADOR });
    await revogarRepresentacao(app, { representacaoId, dataEfeito: new Date(), motivo: "Procuração revogada.", criadoPor: ADMIN });
  });

  it("anexo genérico do M22 (processo) pelo runtime", async () => {
    const p = await dono.processo.findFirstOrThrow({ select: { id: true } });
    const r = await anexarArquivo(app, { nomeOriginal: "interno.pdf", mimeType: "application/pdf", conteudo: new TextEncoder().encode("%PDF-1.4 int"), origem: "UPLOAD", processoId: p.id, criadoPor: ADMIN });
    expect(r.sha256).toHaveLength(64);
  });

  it("NEGATIVAS DO BANCO: o runtime não reescreve versão, publicação, decisão, anexo, ligação nem proposta", async () => {
    for (const sql of [
      `UPDATE "VersaoDoServico" SET "descricao" = 'x'`,
      `UPDATE "PublicacaoDoServico" SET "etapas" = '[]'`,
      `UPDATE "DecisaoDaSolicitacao" SET "fundamentoInterno" = 'x'`,
      `UPDATE "Anexo" SET "nomeOriginal" = 'x'`,
      `DELETE FROM "AnexoDaSolicitacao"`,
      `UPDATE "PropostaDeAlteracaoCadastral" SET "versaoAplicadaId" = 'x'`,
      `DELETE FROM "RevogacaoDeRepresentacao"`,
    ]) {
      await expect(app.$executeRawUnsafe(sql), sql).rejects.toThrow(/permission denied/);
    }
  });
});
