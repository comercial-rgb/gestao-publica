import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { vincularPessoaAoUsuario } from "../m16-travamento/servico-pessoa-do-usuario.js";
import { registrarRepresentacao, revogarRepresentacao } from "../m19-pessoas/representacao.js";
import { situacaoDoProcesso } from "./dominio.js";
import {
  anexarDoRequerente,
  cadastrarServicoDaCarta,
  cadastrarVersaoDoServico,
  decidirSolicitacao,
  disponibilizarRespostaDaSolicitacao,
  emitirExigenciaDaSolicitacao,
  protocolarSolicitacao,
  publicarVersaoDoServico,
  receberProcesso,
  responderExigenciaDaSolicitacao,
  tramitar,
} from "./servico.js";

/**
 * ═══ M21 — A CARTA DE SERVIÇOS E AS SOLICITAÇÕES DO REQUERENTE (V6.2 P3), CONTRA BANCO ═══
 *
 * FIXTURE N=2 onde a regra só aparece em conjunto: DUAS pessoas requerentes com duas contas, DUAS
 * empresas (uma representada, outra não), DUAS versões do serviço, DOIS setores.
 *
 * O que este arquivo existe para impedir:
 *  · que o titular venha do formulário (a conta decide, ou a representação vigente);
 *  · que a conta de B responda, anexe ou veja a solicitação de A;
 *  · que a representação revogada continue agindo;
 *  · que a atualização cadastral mude o cadastro no envio, ou sobrescreva uma alteração posterior;
 *  · que a mesa decida com exigência pendente, ou que quem pediu decida o próprio pedido;
 *  · que duas exigências (ou duas decisões) simultâneas passem juntas;
 *  · que a publicação de uma versão nova reescreva a versão de um pedido já feito.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const ADMIN = "protocolo@cg.pb.gov.br"; // fixture ADMIN global, lotado na entrada
const JURIDICO = "juridico@cg.pb.gov.br";
const CIDADA_A = "cidada.a@externo.test";
const CIDADA_B = "cidada.b@externo.test";
const CONTADOR = "contador@externo.test";
const SEM_PESSOA = "sem.pessoa@externo.test";
const MESA_RESTRITA = "mesa.restrita@cg.pb.gov.br";
const CPF_A = "11144477735";
const CPF_B = "52998224725";
const CPF_CONTADOR = "39053344705";
const CPF_ADMIN = "15350946056";
const CNPJ_X = "11222333000181";
const CNPJ_Y = "11444777000161";

let assuntoId = "";
let pessoaA = "";
let empresaX = "";
let empresaY = "";
let representacaoX = "";

async function usuarioComPerfil(identificador: string, perfil: string, acoes: readonly string[]): Promise<void> {
  const p = await prisma.perfil.create({
    data: { nome: perfil, descricao: perfil, criadoPor: "SEED", permissoes: { create: acoes.map((acao) => ({ acao: acao as never, criadoPor: "SEED" })) } },
    select: { id: true },
  });
  const u = await prisma.usuario.create({ data: { identificador, nome: identificador, criadoPor: "SEED" }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" } });
}

async function pessoa(documento: string, tipo: "FISICA" | "JURIDICA", nome: string): Promise<string> {
  return (await prisma.pessoa.create({ data: { documento, tipo, criadoPor: "SEED", versoes: { create: { nome, email: "antigo@exemplo.test", criadoPor: "SEED" } } }, select: { id: true } })).id;
}

async function vincular(identificador: string, documento: string): Promise<void> {
  const u = await prisma.usuario.findUniqueOrThrow({ where: { identificador }, select: { id: true } });
  await vincularPessoaAoUsuario(prisma, { usuarioId: u.id, documento, motivo: "Conferido pelo documento de identidade.", criadoPor: ADMIN });
}

const CAMPOS_DO_REQUERIMENTO = [
  { nome: "assunto", rotulo: "Assunto do pedido", tipo: "texto", obrigatorio: true },
  { nome: "detalhes", rotulo: "Detalhes", tipo: "textoLongo", obrigatorio: true },
  { nome: "contato", rotulo: "E-mail para contato", tipo: "email", obrigatorio: false },
];

async function servico(slug: string, tipo: "REQUERIMENTO_ADMINISTRATIVO" | "ATUALIZACAO_CADASTRAL" | "COMPLEMENTO_DE_FORNECEDOR", campos: unknown): Promise<{ servicoId: string; versaoId: string }> {
  const { servicoId } = await cadastrarServicoDaCarta(prisma, { slug, titulo: `Serviço ${slug}`, categoria: "Atendimento", publico: tipo === "COMPLEMENTO_DE_FORNECEDOR" ? "FORNECEDOR" : "CIDADAO", tipo, assuntoId, criadoPor: ADMIN });
  const { versaoId } = await cadastrarVersaoDoServico(prisma, {
    servicoId, descricao: "Descrição do serviço ao público.", requisitos: "Documento de identificação.", documentos: ["Documento de identidade"], canais: "Pela internet, com a sua conta.",
    prazoDias: 15, fundamentoDoPrazo: "Lei municipal de processo administrativo, art. 10", exigeAutenticacao: true, setorDeEntradaId: "s1", campos, criadoPor: ADMIN,
  });
  await publicarVersaoDoServico(prisma, { versaoId, criadoPor: ADMIN });
  return { servicoId, versaoId };
}

const PEDIDO = { assunto: "Revisão de lançamento", detalhes: "Peço a revisão do lançamento do exercício." };

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.orgao.create({ data: { id: "p-org", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "p-uo", codigo: "01001", descricao: "Administração", orgaoId: "p-org" } });
  await prisma.exercicio.create({ data: { id: "p-ex-2026", ano: 2026, criadoPor: "SEED" } });
  await prisma.setor.createMany({
    data: [
      { id: "s1", codigo: "PROT", nome: "Protocolo Geral", unidadeOrcId: "p-uo", criadoPor: "SEED" },
      { id: "s2", codigo: "JUR", nome: "Procuradoria", unidadeOrcId: "p-uo", criadoPor: "SEED" },
    ],
  });
  await prisma.usuarioDoSetor.createMany({ data: [{ usuarioIdent: ADMIN, setorId: "s1", criadoPor: "SEED" }, { usuarioIdent: JURIDICO, setorId: "s2", criadoPor: "SEED" }] });
  assuntoId = (await prisma.assunto.create({
    data: { codigo: "REQ", nome: "Requerimento geral", criadoPor: "SEED", roteiro: { create: [{ ordem: 1, setorId: "s1", prazoDias: 3, descricao: "Triagem", criadoPor: "SEED" }, { ordem: 2, setorId: "s2", prazoDias: 10, descricao: "Análise", criadoPor: "SEED" }] } },
    select: { id: true },
  })).id;

  const REQUERENTE = ["SOLICITAR_SERVICO", "CONSULTAR_MEUS_SERVICOS"];
  await usuarioComPerfil(CIDADA_A, "REQUERENTE_A", REQUERENTE);
  await usuarioComPerfil(CIDADA_B, "REQUERENTE_B", REQUERENTE);
  await usuarioComPerfil(CONTADOR, "REQUERENTE_C", REQUERENTE);
  await usuarioComPerfil(SEM_PESSOA, "REQUERENTE_D", REQUERENTE);
  // A mesa com a ação só na UG — sem lotação no setor da solicitação, não despacha.
  const perfil = await prisma.perfil.create({ data: { nome: "MESA_UG", descricao: "mesa", criadoPor: "SEED", permissoes: { create: [{ acao: "DECIDIR_SOLICITACAO_DE_SERVICO", unidadeOrcId: "p-uo", criadoPor: "SEED" }] } }, select: { id: true } });
  const mesa = await prisma.usuario.create({ data: { identificador: MESA_RESTRITA, nome: "Mesa", criadoPor: "SEED" }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: mesa.id, perfilId: perfil.id, criadoPor: "SEED" } });

  pessoaA = await pessoa(CPF_A, "FISICA", "Ana Requerente");
  await pessoa(CPF_B, "FISICA", "Bia Requerente");
  await pessoa(CPF_CONTADOR, "FISICA", "Caio Contador");
  await pessoa(CPF_ADMIN, "FISICA", "Dora Servidora");
  empresaX = await pessoa(CNPJ_X, "JURIDICA", "Empresa X Ltda");
  empresaY = await pessoa(CNPJ_Y, "JURIDICA", "Empresa Y Ltda");
  await vincular(CIDADA_A, CPF_A);
  await vincular(CIDADA_B, CPF_B);
  await vincular(CONTADOR, CPF_CONTADOR);
  await vincular(ADMIN, CPF_ADMIN);
  representacaoX = (await registrarRepresentacao(prisma, { representadaId: empresaX, representanteUsuario: CONTADOR, fundamento: "Procuração por instrumento público, livro 3, folha 12", vigenciaInicio: new Date(Date.UTC(2026, 0, 1, 12)), criadoPor: ADMIN })).representacaoId;
}

beforeEach(semear, 120_000);

describe("a carta: versão, formulário e publicação", () => {
  it("t1: publicar COPIA o roteiro real; versão publicada não republica; a solicitação fica na versão em que foi feita", async () => {
    const { servicoId, versaoId } = await servico("requerimento-geral", "REQUERIMENTO_ADMINISTRATIVO", CAMPOS_DO_REQUERIMENTO);
    const v1 = await prisma.versaoDoServico.findUniqueOrThrow({ where: { id: versaoId }, select: { etapasPublicadas: true } });
    expect(v1.etapasPublicadas).toEqual([
      { ordem: 1, setor: "PROT — Protocolo Geral", prazoDias: 3, descricao: "Triagem" },
      { ordem: 2, setor: "JUR — Procuradoria", prazoDias: 10, descricao: "Análise" },
    ]);
    await expect(publicarVersaoDoServico(prisma, { versaoId, criadoPor: ADMIN })).rejects.toThrow(/VERSAO-JA-PUBLICADA/);

    const s1 = await protocolarSolicitacao(prisma, { slug: "requerimento-geral", respostas: PEDIDO, criadoPor: CIDADA_A });
    const { versaoId: v2 } = await cadastrarVersaoDoServico(prisma, {
      servicoId, descricao: "Descrição revista do serviço.", requisitos: "Documento.", documentos: [], canais: "Pela internet.", exigeAutenticacao: true, setorDeEntradaId: "s1",
      campos: [{ nome: "assunto", rotulo: "Assunto", tipo: "texto", obrigatorio: true }], criadoPor: ADMIN,
    });
    // Rascunho não vale: o pedido seguinte ainda usa a v1.
    expect((await protocolarSolicitacao(prisma, { slug: "requerimento-geral", respostas: PEDIDO, criadoPor: CIDADA_B })).versao).toBe(1);
    await publicarVersaoDoServico(prisma, { versaoId: v2, criadoPor: ADMIN });
    // Publicada a v2, o formulário da v1 é recusado — e o pedido antigo continua na v1.
    await expect(protocolarSolicitacao(prisma, { slug: "requerimento-geral", respostas: PEDIDO, criadoPor: CIDADA_B })).rejects.toThrow(/"detalhes" não é campo deste formulário/);
    expect((await prisma.solicitacaoDeServico.findUniqueOrThrow({ where: { id: s1.solicitacaoId }, select: { versao: { select: { numero: true } } } })).versao.numero).toBe(1);
  });

  it("t2: o cadastro da versão recusa campo fora do cadastro, prazo sem fundamento e serviço sem autenticação", async () => {
    const { servicoId } = await cadastrarServicoDaCarta(prisma, { slug: "atualizar-cadastro", titulo: "Atualizar cadastro", categoria: "Cadastro", publico: "CIDADAO", tipo: "ATUALIZACAO_CADASTRAL", assuntoId, criadoPor: ADMIN });
    const base = { servicoId, descricao: "Atualize seus dados de contato.", requisitos: "Conta vinculada.", documentos: [], canais: "Internet.", exigeAutenticacao: true, setorDeEntradaId: "s1", criadoPor: ADMIN };
    await expect(cadastrarVersaoDoServico(prisma, { ...base, campos: [{ nome: "renda", rotulo: "Renda", tipo: "texto", obrigatorio: true }] })).rejects.toThrow(/"renda" não é campo do cadastro de pessoa/);
    await expect(cadastrarVersaoDoServico(prisma, { ...base, prazoDias: 10, campos: [{ nome: "email", rotulo: "E-mail", tipo: "email", obrigatorio: true }] })).rejects.toThrow(/prazo e fundamento do prazo vêm juntos/);
    await expect(cadastrarVersaoDoServico(prisma, { ...base, exigeAutenticacao: false, campos: [{ nome: "email", rotulo: "E-mail", tipo: "email", obrigatorio: true }] })).rejects.toThrow(/SERVICO-SEM-AUTENTICACAO/);
    // Quem só pede não configura a carta.
    await expect(cadastrarServicoDaCarta(prisma, { slug: "outro", titulo: "Outro serviço", categoria: "Outros", publico: "CIDADAO", tipo: "REQUERIMENTO_ADMINISTRATIVO", assuntoId, criadoPor: CIDADA_A })).rejects.toThrow(/CONFIGURAR_CARTA_DE_SERVICOS/);
    expect(await prisma.versaoDoServico.count()).toBe(0);
  });
});

describe("o pedido: titular, formulário e processo", () => {
  beforeEach(async () => {
    await servico("requerimento-geral", "REQUERIMENTO_ADMINISTRATIVO", CAMPOS_DO_REQUERIMENTO);
  });

  it("t3: o titular é a pessoa da CONTA; o processo nasce no setor de entrada, com as respostas e o requerente", async () => {
    const s = await protocolarSolicitacao(prisma, { slug: "requerimento-geral", respostas: { ...PEDIDO, contato: "ana@exemplo.test" }, criadoPor: CIDADA_A });
    expect(s.titular).toBe("Ana Requerente");
    expect(s.viaRepresentacao).toBe(false);
    const p = await prisma.processo.findUniqueOrThrow({ where: { id: s.processoId }, select: { requerenteId: true, setorAberturaId: true, textoAbertura: true, etapas: { select: { ordem: true } } } });
    expect(p.requerenteId).toBe(pessoaA);
    expect(p.setorAberturaId).toBe("s1");
    expect(p.textoAbertura).toContain("Assunto do pedido: Revisão de lançamento");
    expect(p.textoAbertura).toContain("E-mail para contato: ana@exemplo.test");
    expect(p.etapas).toHaveLength(2);
    // A mesa do setor de entrada é avisada.
    expect(await prisma.notificacao.count({ where: { destinatario: ADMIN, evento: "SOLICITACAO_PROTOCOLADA" } })).toBe(1);
  });

  it("t4: formulário incompleto, conta sem pessoa e conta sem a ação são recusados com o motivo — e nada é protocolado", async () => {
    await expect(protocolarSolicitacao(prisma, { slug: "requerimento-geral", respostas: { assunto: "Só o assunto" }, criadoPor: CIDADA_A })).rejects.toThrow(/FORMULARIO-INCOMPLETO: Detalhes: obrigatório/);
    await expect(protocolarSolicitacao(prisma, { slug: "requerimento-geral", respostas: { ...PEDIDO, contato: "não é e-mail" }, criadoPor: CIDADA_A })).rejects.toThrow(/E-mail para contato: e-mail inválido/);
    await expect(protocolarSolicitacao(prisma, { slug: "requerimento-geral", respostas: PEDIDO, criadoPor: SEM_PESSOA })).rejects.toThrow(/CONTA-SEM-PESSOA/);
    await expect(protocolarSolicitacao(prisma, { slug: "requerimento-geral", respostas: PEDIDO, criadoPor: MESA_RESTRITA })).rejects.toThrow(/SOLICITAR_SERVICO/);
    await expect(protocolarSolicitacao(prisma, { slug: "nao-existe", respostas: PEDIDO, criadoPor: CIDADA_A })).rejects.toThrow(/SERVICO-NAO-PUBLICADO/);
    // ⚠️ O titular não vem do formulário: um id de outra pessoa sem representação é recusado.
    await expect(protocolarSolicitacao(prisma, { slug: "requerimento-geral", representadaId: pessoaA, respostas: PEDIDO, criadoPor: CIDADA_B })).rejects.toThrow(/SEM-REPRESENTACAO-VIGENTE/);
    expect(await prisma.processo.count()).toBe(0);
    expect(await prisma.solicitacaoDeServico.count()).toBe(0);
  });

  it("t5: exigência → resposta → decisão; a mesa não decide com exigência pendente; o requerente de OUTRA conta não responde", async () => {
    const s = await protocolarSolicitacao(prisma, { slug: "requerimento-geral", respostas: PEDIDO, criadoPor: CIDADA_A });
    await emitirExigenciaDaSolicitacao(prisma, { solicitacaoId: s.solicitacaoId, mensagemAoRequerente: "Anexe o comprovante do lançamento.", criadoPor: ADMIN });
    expect(await prisma.notificacao.count({ where: { destinatario: CIDADA_A, evento: "EXIGENCIA_NA_SOLICITACAO" } })).toBe(1);
    expect(await prisma.notificacao.count({ where: { destinatario: CIDADA_B } })).toBe(0);

    await expect(emitirExigenciaDaSolicitacao(prisma, { solicitacaoId: s.solicitacaoId, mensagemAoRequerente: "Outra exigência qualquer.", criadoPor: ADMIN })).rejects.toThrow(/EXIGENCIA-PENDENTE/);
    await expect(decidirSolicitacao(prisma, { solicitacaoId: s.solicitacaoId, resultado: "INDEFERIDA", mensagemAoRequerente: "Pedido indeferido por falta de documento.", fundamentoInterno: "Sem comprovante.", criadoPor: ADMIN })).rejects.toThrow(/EXIGENCIA-PENDENTE/);
    await expect(responderExigenciaDaSolicitacao(prisma, { solicitacaoId: s.solicitacaoId, texto: "Resposta de quem não é titular.", criadoPor: CIDADA_B })).rejects.toThrow(/SEM-ACESSO-A-SOLICITACAO/);
    await expect(anexarDoRequerente(prisma, { solicitacaoId: s.solicitacaoId, nomeOriginal: "x.pdf", mimeType: "application/pdf", conteudo: new TextEncoder().encode("%PDF-1.4 x"), criadoPor: CIDADA_B })).rejects.toThrow(/SEM-ACESSO-A-SOLICITACAO/);

    await anexarDoRequerente(prisma, { solicitacaoId: s.solicitacaoId, nomeOriginal: "comprovante.pdf", mimeType: "application/pdf", conteudo: new TextEncoder().encode("%PDF-1.4 comprovante"), criadoPor: CIDADA_A });
    await responderExigenciaDaSolicitacao(prisma, { solicitacaoId: s.solicitacaoId, texto: "Comprovante anexado.", criadoPor: CIDADA_A });
    await expect(responderExigenciaDaSolicitacao(prisma, { solicitacaoId: s.solicitacaoId, texto: "Respondendo de novo.", criadoPor: CIDADA_A })).rejects.toThrow(/SEM-EXIGENCIA-PENDENTE/);

    // A mesa sem lotação no setor não decide, mesmo com a ação.
    await expect(decidirSolicitacao(prisma, { solicitacaoId: s.solicitacaoId, resultado: "DEFERIDA", mensagemAoRequerente: "Seu pedido foi deferido.", fundamentoInterno: "Comprovante confere.", criadoPor: MESA_RESTRITA })).rejects.toThrow(/LOTAÇÃO/);
    await disponibilizarRespostaDaSolicitacao(prisma, { solicitacaoId: s.solicitacaoId, nomeOriginal: "resposta.pdf", mimeType: "application/pdf", conteudo: new TextEncoder().encode("%PDF-1.4 resposta"), criadoPor: ADMIN });
    await decidirSolicitacao(prisma, { solicitacaoId: s.solicitacaoId, resultado: "DEFERIDA", mensagemAoRequerente: "Seu pedido foi deferido.", fundamentoInterno: "Comprovante confere com o razão.", criadoPor: ADMIN });

    const movimentos = await prisma.movimentoDoProcesso.findMany({ where: { processoId: s.processoId }, select: { id: true, tipo: true, setorOrigemId: true, setorDestinoId: true, respondeAId: true, tornaSemEfeitoId: true, criadoEm: true } });
    expect(situacaoDoProcesso(movimentos)).toBe("ENCERRADO");
    expect(await prisma.anexoDaSolicitacao.groupBy({ by: ["origem"], _count: true, orderBy: { origem: "asc" } })).toEqual([{ origem: "REQUERENTE", _count: 1 }, { origem: "RESPOSTA", _count: 1 }]);
    await expect(decidirSolicitacao(prisma, { solicitacaoId: s.solicitacaoId, resultado: "INDEFERIDA", mensagemAoRequerente: "Mudança de ideia da mesa.", fundamentoInterno: "Nada.", criadoPor: ADMIN })).rejects.toThrow(/SOLICITACAO-JA-DECIDIDA/);
    await expect(anexarDoRequerente(prisma, { solicitacaoId: s.solicitacaoId, nomeOriginal: "tarde.pdf", mimeType: "application/pdf", conteudo: new TextEncoder().encode("%PDF-1.4 t"), criadoPor: CIDADA_A })).rejects.toThrow(/SOLICITACAO-ENCERRADA/);
  });

  it("t6: tramitada e não recebida, a mesa não age; recebida, age no setor em que o processo está", async () => {
    const s = await protocolarSolicitacao(prisma, { slug: "requerimento-geral", respostas: PEDIDO, criadoPor: CIDADA_A });
    await tramitar(prisma, { processoId: s.processoId, setorDestinoId: "s2", texto: "À procuradoria.", criadoPor: ADMIN });
    await expect(emitirExigenciaDaSolicitacao(prisma, { solicitacaoId: s.solicitacaoId, mensagemAoRequerente: "Exigência antes do recebimento.", criadoPor: JURIDICO })).rejects.toThrow(/SOLICITACAO-EM-TRAMITE/);
    await receberProcesso(prisma, { processoId: s.processoId, criadoPor: JURIDICO });
    await emitirExigenciaDaSolicitacao(prisma, { solicitacaoId: s.solicitacaoId, mensagemAoRequerente: "Exigência depois do recebimento.", criadoPor: JURIDICO });
  });

  it("t7: quem é titular não decide o próprio pedido — mesmo com a ação e a lotação", async () => {
    const s = await protocolarSolicitacao(prisma, { slug: "requerimento-geral", respostas: PEDIDO, criadoPor: ADMIN });
    await expect(decidirSolicitacao(prisma, { solicitacaoId: s.solicitacaoId, resultado: "DEFERIDA", mensagemAoRequerente: "Deferido para mim mesmo.", fundamentoInterno: "Autodecisão.", criadoPor: ADMIN })).rejects.toThrow(/AUTODECISAO/);
    expect(await prisma.decisaoDaSolicitacao.count()).toBe(0);
  });

  it("t8: CONCORRÊNCIA — duas exigências e duas decisões simultâneas: exatamente uma de cada passa", async () => {
    const s = await protocolarSolicitacao(prisma, { slug: "requerimento-geral", respostas: PEDIDO, criadoPor: CIDADA_A });
    const exig = await Promise.allSettled([1, 2].map((n) => emitirExigenciaDaSolicitacao(prisma, { solicitacaoId: s.solicitacaoId, mensagemAoRequerente: `Exigência simultânea ${n}.`, criadoPor: ADMIN })));
    expect(exig.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(String((exig.find((r) => r.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/EXIGENCIA-PENDENTE/);
    await responderExigenciaDaSolicitacao(prisma, { solicitacaoId: s.solicitacaoId, texto: "Atendida.", criadoPor: CIDADA_A });

    const dec = await Promise.allSettled((["DEFERIDA", "INDEFERIDA"] as const).map((resultado) => decidirSolicitacao(prisma, { solicitacaoId: s.solicitacaoId, resultado, mensagemAoRequerente: `Decisão simultânea: ${resultado}.`, fundamentoInterno: "Concorrência.", criadoPor: ADMIN })));
    expect(dec.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(String((dec.find((r) => r.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/SOLICITACAO-JA-DECIDIDA/);
    expect(await prisma.movimentoDoProcesso.count({ where: { processoId: s.processoId, tipo: "ENCERRAMENTO" } })).toBe(1);
  });
});

describe("a representação e o complemento de fornecedor", () => {
  beforeEach(async () => {
    await servico("complemento-fornecedor", "COMPLEMENTO_DE_FORNECEDOR", [{ nome: "documento", rotulo: "Documento complementado", tipo: "texto", obrigatorio: true }]);
  });

  it("t9: só por representação VIGENTE da pessoa jurídica; por si ou pela empresa não representada, recusa", async () => {
    await expect(protocolarSolicitacao(prisma, { slug: "complemento-fornecedor", respostas: { documento: "Certidão" }, criadoPor: CONTADOR })).rejects.toThrow(/COMPLEMENTO-SO-POR-REPRESENTACAO/);
    await expect(protocolarSolicitacao(prisma, { slug: "complemento-fornecedor", representadaId: empresaY, respostas: { documento: "Certidão" }, criadoPor: CONTADOR })).rejects.toThrow(/SEM-REPRESENTACAO-VIGENTE/);
    const s = await protocolarSolicitacao(prisma, { slug: "complemento-fornecedor", representadaId: empresaX, respostas: { documento: "Certidão negativa federal" }, criadoPor: CONTADOR });
    expect(s.viaRepresentacao).toBe(true);
    expect(s.titular).toBe("Empresa X Ltda");
    expect((await prisma.processo.findUniqueOrThrow({ where: { id: s.processoId }, select: { requerenteId: true } })).requerenteId).toBe(empresaX);
  });

  it("t10: REVOGADA a representação, o representante não responde mais — e o pedido guarda a representação usada", async () => {
    const s = await protocolarSolicitacao(prisma, { slug: "complemento-fornecedor", representadaId: empresaX, respostas: { documento: "Certidão" }, criadoPor: CONTADOR });
    await emitirExigenciaDaSolicitacao(prisma, { solicitacaoId: s.solicitacaoId, mensagemAoRequerente: "A certidão está vencida.", criadoPor: ADMIN });
    // O representante vigente é avisado da exigência sobre a empresa.
    expect(await prisma.notificacao.count({ where: { destinatario: CONTADOR, evento: "EXIGENCIA_NA_SOLICITACAO" } })).toBe(1);
    await revogarRepresentacao(prisma, { representacaoId: representacaoX, dataEfeito: new Date(), motivo: "Procuração revogada pela empresa.", criadoPor: ADMIN });
    await expect(responderExigenciaDaSolicitacao(prisma, { solicitacaoId: s.solicitacaoId, texto: "Nova certidão.", criadoPor: CONTADOR })).rejects.toThrow(/SEM-ACESSO-A-SOLICITACAO/);
    await expect(revogarRepresentacao(prisma, { representacaoId: representacaoX, dataEfeito: new Date(), motivo: "De novo.", criadoPor: ADMIN })).rejects.toThrow(/REPRESENTACAO-JA-REVOGADA/);
    expect((await prisma.solicitacaoDeServico.findUniqueOrThrow({ where: { id: s.solicitacaoId }, select: { representacaoId: true } })).representacaoId).toBe(representacaoX);
  });

  it("t11: a representação exige conta vinculada a pessoa FÍSICA e não representa a si mesma", async () => {
    await expect(registrarRepresentacao(prisma, { representadaId: empresaY, representanteUsuario: SEM_PESSOA, fundamento: "Contrato social", vigenciaInicio: new Date(), criadoPor: ADMIN })).rejects.toThrow(/REPRESENTANTE-SEM-PESSOA/);
    await expect(registrarRepresentacao(prisma, { representadaId: pessoaA, representanteUsuario: CIDADA_A, fundamento: "Ela mesma", vigenciaInicio: new Date(), criadoPor: ADMIN })).rejects.toThrow(/REPRESENTACAO-DE-SI-MESMO/);
    await expect(registrarRepresentacao(prisma, { representadaId: empresaY, representanteUsuario: CIDADA_A, fundamento: "Contrato social", vigenciaInicio: new Date(), criadoPor: CIDADA_A })).rejects.toThrow(/REGISTRAR_REPRESENTACAO/);
  });
});

describe("a atualização cadastral", () => {
  beforeEach(async () => {
    await servico("atualizar-contato", "ATUALIZACAO_CADASTRAL", [
      { nome: "email", rotulo: "Novo e-mail", tipo: "email", obrigatorio: true },
      { nome: "cep", rotulo: "CEP", tipo: "texto", obrigatorio: false },
    ]);
  });

  const versaoAtual = async () => prisma.versaoDePessoa.findFirstOrThrow({ where: { pessoaId: pessoaA }, orderBy: { criadoEm: "desc" }, select: { id: true, email: true } });

  it("t12: o envio NÃO muda o cadastro; o deferimento cria a versão nova com o motivo; o indeferimento não cria", async () => {
    const s = await protocolarSolicitacao(prisma, { slug: "atualizar-contato", respostas: { email: "ana.nova@exemplo.test" }, criadoPor: CIDADA_A });
    expect((await versaoAtual()).email).toBe("antigo@exemplo.test");
    const { versaoDoCadastro } = await decidirSolicitacao(prisma, { solicitacaoId: s.solicitacaoId, resultado: "DEFERIDA", mensagemAoRequerente: "Cadastro atualizado.", fundamentoInterno: "Titular autenticada.", criadoPor: ADMIN });
    const v = await versaoAtual();
    expect(v.id).toBe(versaoDoCadastro);
    expect(v.email).toBe("ana.nova@exemplo.test");
    expect((await prisma.propostaDeAlteracaoCadastral.findUniqueOrThrow({ where: { solicitacaoId: s.solicitacaoId }, select: { versaoAplicadaId: true } })).versaoAplicadaId).toBe(v.id);

    const s2 = await protocolarSolicitacao(prisma, { slug: "atualizar-contato", respostas: { email: "outra@exemplo.test" }, criadoPor: CIDADA_A });
    expect((await decidirSolicitacao(prisma, { solicitacaoId: s2.solicitacaoId, resultado: "INDEFERIDA", mensagemAoRequerente: "Pedido indeferido.", fundamentoInterno: "Duplicado.", criadoPor: ADMIN })).versaoDoCadastro).toBeNull();
    expect((await versaoAtual()).email).toBe("ana.nova@exemplo.test");
  });

  it("t13: se o cadastro mudou depois da proposta, deferir RECUSA e nada é gravado; proposta inválida é recusada no envio", async () => {
    await expect(protocolarSolicitacao(prisma, { slug: "atualizar-contato", respostas: { email: "a@exemplo.test", cep: "123" }, criadoPor: CIDADA_A })).rejects.toThrow(/PROPOSTA-CADASTRAL-INVALIDA: cep: CEP deve ter 8 dígitos/);
    const s = await protocolarSolicitacao(prisma, { slug: "atualizar-contato", respostas: { email: "ana.nova@exemplo.test" }, criadoPor: CIDADA_A });
    await prisma.versaoDePessoa.create({ data: { pessoaId: pessoaA, nome: "Ana Requerente", email: "balcao@exemplo.test", motivo: "Correção no balcão", criadoPor: ADMIN } });
    await expect(decidirSolicitacao(prisma, { solicitacaoId: s.solicitacaoId, resultado: "DEFERIDA", mensagemAoRequerente: "Cadastro atualizado.", fundamentoInterno: "Titular autenticada.", criadoPor: ADMIN })).rejects.toThrow(/CADASTRO-MUDOU-DESDE-A-PROPOSTA/);
    expect((await versaoAtual()).email).toBe("balcao@exemplo.test");
    expect(await prisma.decisaoDaSolicitacao.count()).toBe(0);
    expect(await prisma.movimentoDoProcesso.count({ where: { processoId: s.processoId, tipo: "ENCERRAMENTO" } })).toBe(0);
  });
});
