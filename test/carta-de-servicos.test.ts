import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { documentoDaSolicitacaoPara, lerCartaPublica, lerServicoPublicado, minhaSolicitacaoPara, minhasSolicitacoesPara, quemPedePara } from "../lib/portas/carta-de-servicos.js";
import { disponibilidadeDaSolicitacao, listarSolicitacoesDaMesa, verSolicitacaoNaMesa } from "../lib/portas/recursos/solicitacoes-da-mesa-dados.js";
import { vincularPessoaAoUsuario } from "../modules/m16-travamento/servico-pessoa-do-usuario.js";
import { registrarRepresentacao, revogarRepresentacao } from "../modules/m19-pessoas/representacao.js";
import { anexarArquivo } from "../modules/m22-documentos/anexos.js";
import {
  anexarDoRequerente,
  cadastrarServicoDaCarta,
  cadastrarVersaoDoServico,
  decidirSolicitacao,
  emitirExigenciaDaSolicitacao,
  protocolarSolicitacao,
  publicarVersaoDoServico,
  solicitarParecer,
} from "../modules/m21-protocolo/servico.js";

/**
 * ═══ AS PROJEÇÕES DA CARTA DE SERVIÇOS (V6.2 P3) — O QUE CADA PAPEL VÊ ═══
 *
 * N=2: duas requerentes com duas contas, um contador que representa uma empresa (e perde a
 * representação), uma conta da mesa sem visão do setor.
 *
 * O que este arquivo existe para impedir:
 *  · que a projeção do requerente leve o fundamento interno, o parecer ou o anexo interno do processo;
 *  · que a conta B leia a solicitação ou baixe o documento da conta A, pedindo o id certo;
 *  · que o ex-representante continue vendo o que protocolou em nome da empresa;
 *  · que a carta pública mostre rascunho ou identificador interno;
 *  · que a mesa ofereça "decidir" com exigência pendente, a quem é titular ou a quem já decidiu.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const ADMIN = "protocolo@cg.pb.gov.br";
const A = "cidada.a@externo.test";
const B = "cidada.b@externo.test";
const CONTADOR = "contador@externo.test";
const FORA = "mesa.fora@cg.pb.gov.br";
const FUNDAMENTO_INTERNO = "Parecer interno sigiloso numero 77 da procuradoria";
const TEXTO_DO_PARECER = "Peço manifestação jurídica reservada sobre o pedido";

let ids: Record<string, string> = {};
const sessao = (identificador: string) => ({ usuarioId: ids[identificador] ?? "", identificador });

async function conta(identificador: string, acoes: readonly { acao: string; unidadeOrcId?: string }[]): Promise<void> {
  const p = await prisma.perfil.create({ data: { nome: `P-${identificador}`, descricao: "teste", criadoPor: "SEED", permissoes: { create: acoes.map((a) => ({ acao: a.acao as never, unidadeOrcId: a.unidadeOrcId ?? null, criadoPor: "SEED" })) } }, select: { id: true } });
  const u = await prisma.usuario.create({ data: { identificador, nome: identificador, criadoPor: "SEED" }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" } });
  ids[identificador] = u.id;
}

async function pessoa(documento: string, tipo: "FISICA" | "JURIDICA", nome: string): Promise<string> {
  return (await prisma.pessoa.create({ data: { documento, tipo, criadoPor: "SEED", versoes: { create: { nome, criadoPor: "SEED" } } }, select: { id: true } })).id;
}

async function servico(slug: string, tipo: "REQUERIMENTO_ADMINISTRATIVO" | "COMPLEMENTO_DE_FORNECEDOR", publicar: boolean): Promise<void> {
  const { servicoId } = await cadastrarServicoDaCarta(prisma, { slug, titulo: `Serviço ${slug}`, categoria: "Atendimento", publico: "CIDADAO", tipo, assuntoId: ids["assunto"] ?? "", criadoPor: ADMIN });
  const { versaoId } = await cadastrarVersaoDoServico(prisma, {
    servicoId, descricao: "Descrição do serviço ao público.", requisitos: "Conta vinculada.", documentos: [], canais: "Internet.", exigeAutenticacao: true, setorDeEntradaId: "s1",
    campos: [{ nome: "pedido", rotulo: "Pedido", tipo: "textoLongo", obrigatorio: true }], criadoPor: ADMIN,
  });
  if (publicar) await publicarVersaoDoServico(prisma, { versaoId, criadoPor: ADMIN });
}

beforeEach(async () => {
  await limparBanco(prisma);
  ids = {};
  await prisma.orgao.create({ data: { id: "p-org", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.createMany({ data: [{ id: "p-uo", codigo: "01001", descricao: "Administração", orgaoId: "p-org" }, { id: "p-uo2", codigo: "01002", descricao: "Obras", orgaoId: "p-org" }] });
  await prisma.exercicio.create({ data: { id: "p-ex-2026", ano: 2026, criadoPor: "SEED" } });
  await prisma.setor.createMany({ data: [{ id: "s1", codigo: "PROT", nome: "Protocolo Geral", unidadeOrcId: "p-uo", criadoPor: "SEED" }, { id: "s2", codigo: "JUR", nome: "Procuradoria", unidadeOrcId: "p-uo", criadoPor: "SEED" }, { id: "s9", codigo: "OBR", nome: "Obras", unidadeOrcId: "p-uo2", criadoPor: "SEED" }] });
  await prisma.usuarioDoSetor.createMany({ data: [{ usuarioIdent: ADMIN, setorId: "s1", criadoPor: "SEED" }, { usuarioIdent: FORA, setorId: "s9", criadoPor: "SEED" }] });
  ids["assunto"] = (await prisma.assunto.create({ data: { codigo: "REQ", nome: "Requerimento", criadoPor: "SEED", roteiro: { create: [{ ordem: 1, setorId: "s1", prazoDias: 5, descricao: "Triagem", criadoPor: "SEED" }] } }, select: { id: true } })).id;
  ids[ADMIN] = (await prisma.usuario.findUniqueOrThrow({ where: { identificador: ADMIN }, select: { id: true } })).id;

  const REQ = [{ acao: "SOLICITAR_SERVICO" }, { acao: "CONSULTAR_MEUS_SERVICOS" }];
  await conta(A, REQ);
  await conta(B, REQ);
  await conta(CONTADOR, REQ);
  await conta(FORA, [{ acao: "CONSULTAR_PROTOCOLO", unidadeOrcId: "p-uo2" }, { acao: "DECIDIR_SOLICITACAO_DE_SERVICO", unidadeOrcId: "p-uo2" }]);

  await pessoa("11144477735", "FISICA", "Ana Requerente");
  await pessoa("52998224725", "FISICA", "Bia Requerente");
  await pessoa("39053344705", "FISICA", "Caio Contador");
  await pessoa("15350946056", "FISICA", "Dora Servidora");
  ids["empresa"] = await pessoa("11222333000181", "JURIDICA", "Empresa X Ltda");
  for (const [u, doc] of [[A, "11144477735"], [B, "52998224725"], [CONTADOR, "39053344705"], [ADMIN, "15350946056"]] as const) {
    await vincularPessoaAoUsuario(prisma, { usuarioId: ids[u] ?? "", documento: doc, motivo: "Conferido pelo documento.", criadoPor: ADMIN });
  }
  ids["representacao"] = (await registrarRepresentacao(prisma, { representadaId: ids["empresa"] ?? "", representanteUsuario: CONTADOR, fundamento: "Procuração pública livro 3", vigenciaInicio: new Date(Date.UTC(2026, 0, 1, 12)), criadoPor: ADMIN })).representacaoId;
  await servico("requerimento", "REQUERIMENTO_ADMINISTRATIVO", true);
  await servico("complemento", "COMPLEMENTO_DE_FORNECEDOR", true);
  await servico("rascunho", "REQUERIMENTO_ADMINISTRATIVO", false);
}, 120_000);

describe("a carta pública", () => {
  it("t1: só o publicado aparece; o rascunho responde nulo; nenhum id interno viaja", async () => {
    const carta = await lerCartaPublica();
    expect(carta.map((s) => s.slug).sort()).toEqual(["complemento", "requerimento"]);
    // A lista diz, por serviço, se o pedido exige conta — da versão publicada (o lado sem conta está no percurso, 9.12b).
    expect(carta.map((s) => s.exigeAutenticacao)).toEqual([true, true]);
    expect(await lerServicoPublicado("rascunho")).toBeNull();
    const s = await lerServicoPublicado("requerimento");
    expect(s?.etapas).toEqual([{ ordem: 1, setor: "PROT — Protocolo Geral", prazoDias: 5, descricao: "Triagem" }]);
    const json = JSON.stringify([carta, s]);
    expect(json).not.toContain(ids["assunto"]);
    expect(json).not.toContain('"s1"');
  });
});

describe("o requerente", () => {
  it("t2: A vê a própria; B não lê nem baixa a de A — a resposta é a mesma de um id inexistente", async () => {
    const s = await protocolarSolicitacao(prisma, { slug: "requerimento", respostas: { pedido: "Revisão do meu lançamento." }, criadoPor: A });
    const { anexoId } = await anexarDoRequerente(prisma, { solicitacaoId: s.solicitacaoId, nomeOriginal: "comprovante.pdf", mimeType: "application/pdf", conteudo: new TextEncoder().encode("%PDF-1.4 a"), criadoPor: A });
    expect((await minhasSolicitacoesPara(sessao(A))).map((x) => x.protocolo)).toEqual([s.protocolo]);
    expect(await minhasSolicitacoesPara(sessao(B))).toEqual([]);
    expect(await minhaSolicitacaoPara(sessao(B), s.solicitacaoId)).toBeNull();
    expect(await minhaSolicitacaoPara(sessao(B), "nao-existe")).toBeNull();
    expect(await documentoDaSolicitacaoPara(sessao(B), s.solicitacaoId, anexoId)).toBeNull();
    expect((await documentoDaSolicitacaoPara(sessao(A), s.solicitacaoId, anexoId))?.nomeOriginal).toBe("comprovante.pdf");
    // ⚠️ O id certo com a solicitação errada também não passa.
    const outra = await protocolarSolicitacao(prisma, { slug: "requerimento", respostas: { pedido: "Outro pedido meu." }, criadoPor: A });
    expect(await documentoDaSolicitacaoPara(sessao(A), outra.solicitacaoId, anexoId)).toBeNull();
  });

  it("t3: a projeção do requerente NÃO leva fundamento interno, parecer nem anexo interno do processo", async () => {
    const s = await protocolarSolicitacao(prisma, { slug: "requerimento", respostas: { pedido: "Revisão do meu lançamento." }, criadoPor: A });
    await solicitarParecer(prisma, { processoId: s.processoId, setorDestinoId: "s2", texto: TEXTO_DO_PARECER, criadoPor: ADMIN });
    const interno = await anexarArquivo(prisma, { nomeOriginal: "parecer-interno.pdf", mimeType: "application/pdf", conteudo: new TextEncoder().encode("%PDF-1.4 interno"), origem: "UPLOAD", processoId: s.processoId, criadoPor: ADMIN });
    await emitirExigenciaDaSolicitacao(prisma, { solicitacaoId: s.solicitacaoId, mensagemAoRequerente: "Envie o comprovante de pagamento.", criadoPor: ADMIN });

    const d = await minhaSolicitacaoPara(sessao(A), s.solicitacaoId);
    expect(d?.situacao).toBe("AGUARDANDO_VOCE");
    expect(d?.exigencias.map((e) => e.mensagem)).toEqual(["Envie o comprovante de pagamento."]);
    const json = JSON.stringify(d);
    expect(json).not.toContain(TEXTO_DO_PARECER);
    expect(json).not.toContain("parecer-interno.pdf");
    expect(await documentoDaSolicitacaoPara(sessao(A), s.solicitacaoId, interno.anexoId)).toBeNull();

    // A mesa decide com fundamento interno; o requerente lê só a mensagem.
    await prisma.movimentoDoProcesso.create({ data: { processoId: s.processoId, tipo: "PARECER_RESPONDIDO", setorOrigemId: "s2", respondeAId: (await prisma.movimentoDoProcesso.findFirstOrThrow({ where: { processoId: s.processoId, tipo: "PARECER_SOLICITADO" }, select: { id: true } })).id, texto: "Parecer favorável reservado.", criadoPor: ADMIN } });
    await prisma.movimentoDoProcesso.create({ data: { processoId: s.processoId, tipo: "READEQUACAO_ATENDIDA", respondeAId: (await prisma.movimentoDoProcesso.findFirstOrThrow({ where: { processoId: s.processoId, tipo: "READEQUACAO_SOLICITADA" }, select: { id: true } })).id, texto: "Enviado.", criadoPor: A } });
    await decidirSolicitacao(prisma, { solicitacaoId: s.solicitacaoId, resultado: "INDEFERIDA", mensagemAoRequerente: "Pedido indeferido: o lançamento está correto.", fundamentoInterno: FUNDAMENTO_INTERNO, criadoPor: ADMIN });
    const decidida = await minhaSolicitacaoPara(sessao(A), s.solicitacaoId);
    expect(decidida?.decisao?.mensagem).toBe("Pedido indeferido: o lançamento está correto.");
    expect(JSON.stringify(decidida)).not.toContain(FUNDAMENTO_INTERNO);
    expect(JSON.stringify(decidida)).not.toContain("Parecer favorável reservado.");
    // E a mesa vê o fundamento.
    expect(JSON.stringify(await verSolicitacaoNaMesa(sessao(ADMIN), s.solicitacaoId))).toContain(FUNDAMENTO_INTERNO);
  });

  it("t4: o representante vê a solicitação da empresa enquanto vigente; revogada, perde lista, detalhe e titular", async () => {
    const s = await protocolarSolicitacao(prisma, { slug: "complemento", representadaId: ids["empresa"] ?? "", respostas: { pedido: "Certidão atualizada." }, criadoPor: CONTADOR });
    expect((await quemPedePara(sessao(CONTADOR))).titulares.map((t) => t.via)).toEqual(["PROPRIO", "REPRESENTACAO"]);
    expect((await minhasSolicitacoesPara(sessao(CONTADOR))).map((x) => x.protocolo)).toEqual([s.protocolo]);
    await revogarRepresentacao(prisma, { representacaoId: ids["representacao"] ?? "", dataEfeito: new Date(), motivo: "Procuração revogada.", criadoPor: ADMIN });
    expect(await minhasSolicitacoesPara(sessao(CONTADOR))).toEqual([]);
    expect(await minhaSolicitacaoPara(sessao(CONTADOR), s.solicitacaoId)).toBeNull();
    expect((await quemPedePara(sessao(CONTADOR))).titulares.map((t) => t.via)).toEqual(["PROPRIO"]);
  });
});

describe("a mesa", () => {
  it("t5: quem não vê o setor não lista nem abre; a barra trava decidir com exigência, recusa ao titular e some depois de decidido", async () => {
    const s = await protocolarSolicitacao(prisma, { slug: "requerimento", respostas: { pedido: "Revisão." }, criadoPor: A });
    const consulta = { pagina: 1, filtros: {}, ordem: null, direcao: "asc" as const, selecionados: [], aba: "dados" } as never;
    expect((await listarSolicitacoesDaMesa(sessao(FORA), consulta)).total).toBe(0);
    expect(await verSolicitacaoNaMesa(sessao(FORA), s.solicitacaoId)).toBeNull();
    const naMesa = await listarSolicitacoesDaMesa(sessao(ADMIN), consulta);
    expect(naMesa.total).toBe(1);
    expect(naMesa.contagens.find((c) => c.situacao === "RECEBIDA")?.quantidade).toBe(1);

    expect((await disponibilidadeDaSolicitacao(sessao(ADMIN), s.solicitacaoId))?.porAcao["decidir"]?.apresentacao).toBe("disponivel");
    await emitirExigenciaDaSolicitacao(prisma, { solicitacaoId: s.solicitacaoId, mensagemAoRequerente: "Envie o comprovante.", criadoPor: ADMIN });
    const comExigencia = await disponibilidadeDaSolicitacao(sessao(ADMIN), s.solicitacaoId);
    expect(comExigencia?.porAcao["decidir"]).toMatchObject({ apresentacao: "bloqueada" });
    expect(comExigencia?.porAcao["decidir"]?.motivo).toMatch(/exigência sem resposta/);
    expect(comExigencia?.porAcao["emitir-exigencia"]?.apresentacao).toBe("bloqueada");

    const propria = await protocolarSolicitacao(prisma, { slug: "requerimento", respostas: { pedido: "Pedido da própria servidora." }, criadoPor: ADMIN });
    expect((await disponibilidadeDaSolicitacao(sessao(ADMIN), propria.solicitacaoId))?.porAcao["decidir"]?.motivo).toMatch(/titular/);

    const outraDecisao = await protocolarSolicitacao(prisma, { slug: "requerimento", respostas: { pedido: "Terceiro pedido." }, criadoPor: B });
    await decidirSolicitacao(prisma, { solicitacaoId: outraDecisao.solicitacaoId, resultado: "DEFERIDA", mensagemAoRequerente: "Seu pedido foi deferido.", fundamentoInterno: "Confere com o razão.", criadoPor: ADMIN });
    expect((await disponibilidadeDaSolicitacao(sessao(ADMIN), outraDecisao.solicitacaoId))?.porAcao["decidir"]?.apresentacao).toBe("nao-aplicavel");
  });
});
