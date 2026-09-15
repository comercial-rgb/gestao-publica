import "dotenv/config";
import { createHash } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { diaCivil } from "../packages/datas/index.js";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { vincularPessoaAoUsuario } from "../modules/m16-travamento/servico-pessoa-do-usuario.js";
import { registrarRepresentacao, revogarRepresentacao } from "../modules/m19-pessoas/representacao.js";
import { podeVerProcesso, listarProcessos } from "../modules/m21-protocolo/consultas.js";
import { situacaoDoProcesso } from "../modules/m21-protocolo/dominio.js";
import {
  acompanharManifestacao,
  cadastrarServicoDaCarta,
  cadastrarVersaoDoServico,
  decidirSolicitacao,
  protocolarSolicitacao,
  publicarVersaoDoServico,
  QUOTA_DE_ENVIOS_SEM_CONTA_POR_HORA,
  registrarManifestacaoAnonima,
  responderManifestacao,
  triarManifestacao,
} from "../modules/m21-protocolo/servico.js";
import {
  avaliarAtendimento,
  cadastrarMetodologiaDeAvaliacao,
  inicioDaJanela,
  mediaComUmaCasa,
  opinarSobreServico,
  removerAvaliacao,
  resultadoPublicoDasAvaliacoes,
} from "../modules/m21-protocolo/avaliacao.js";

/**
 * ═══ A OUVIDORIA SEM CONTA E A AVALIAÇÃO DOS SERVIÇOS (V7 M1 U4) ═══
 *
 * N=2 em tudo que se manifesta em conjunto: duas manifestações (o segredo de uma não abre a outra),
 * duas requerentes (a média), dois tokens de opinião (a contagem separada), duas versões da metodologia.
 *
 * O que este arquivo existe para impedir:
 *  · uma Pessoa fictícia criada para a manifestação sem conta, ou o segredo gravado em claro;
 *  · o gestor com consulta no ente lendo a manifestação sigilosa;
 *  · quem tem a ação no ente, sem lotação na ouvidoria, triando ou respondendo;
 *  · o acompanhamento público levando a anotação interna ou o texto original;
 *  · a revisão da avaliação contada como segundo voto; a opinião geral somada ao atendimento;
 *  · a descrição privada da avaliação no resultado público; notas de escalas diferentes misturadas;
 *  · o ex-representante avaliando o atendimento da empresa.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const ADMIN = "protocolo@cg.pb.gov.br";
const OUVIDOR = "ouvidor@cg.pb.gov.br";
const OUVIDOR_FORA = "ouvidor.fora@cg.pb.gov.br";
const GESTOR = "gestor.protocolo@cg.pb.gov.br";
const MODERADOR = "moderador@cg.pb.gov.br";
const A = "cidada.a@externo.test";
const B = "cidada.b@externo.test";
const CONTADOR = "contador@externo.test";
const ANOTACAO_INTERNA = "Anotação interna: encaminhar ao controle interno com reserva";
const DESCRICAO_PRIVADA = "Fui atendida pela servidora Joana, telefone 83 99999-0000";
const ANO = Number(diaCivil(new Date()).slice(0, 4));

const quota = (s: string) => createHash("sha256").update(`teste:${s}`).digest("hex");
const TOKEN_1 = "token-do-navegador-1-aaaaaaaaaaaaaaaaaaaaaaaa";
const TOKEN_2 = "token-do-navegador-2-bbbbbbbbbbbbbbbbbbbbbbbb";

let ids: Record<string, string> = {};

async function conta(identificador: string, acoes: readonly { acao: string; unidadeOrcId?: string }[]): Promise<void> {
  const p = await prisma.perfil.create({ data: { nome: `P-${identificador}`, descricao: "teste", criadoPor: "SEED", permissoes: { create: acoes.map((a) => ({ acao: a.acao as never, unidadeOrcId: a.unidadeOrcId ?? null, criadoPor: "SEED" })) } }, select: { id: true } });
  const u = await prisma.usuario.create({ data: { identificador, nome: identificador, criadoPor: "SEED" }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" } });
  ids[identificador] = u.id;
}

async function pessoa(documento: string, tipo: "FISICA" | "JURIDICA", nome: string): Promise<string> {
  return (await prisma.pessoa.create({ data: { documento, tipo, criadoPor: "SEED", versoes: { create: { nome, criadoPor: "SEED" } } }, select: { id: true } })).id;
}

const CAMPOS_OUVIDORIA = [{ nome: "relato", rotulo: "Relato", tipo: "textoLongo", obrigatorio: true }] as const;

async function servico(slug: string, tipo: "REQUERIMENTO_ADMINISTRATIVO" | "COMPLEMENTO_DE_FORNECEDOR" | "MANIFESTACAO_ANONIMA", assunto: string, setor: string): Promise<string> {
  const { servicoId } = await cadastrarServicoDaCarta(prisma, { slug, titulo: `Serviço ${slug}`, categoria: "Atendimento", publico: "CIDADAO", tipo, assuntoId: ids[assunto] ?? "", criadoPor: ADMIN });
  const anonimo = tipo === "MANIFESTACAO_ANONIMA";
  const { versaoId } = await cadastrarVersaoDoServico(prisma, {
    servicoId, descricao: "Descrição do serviço ao público.", requisitos: anonimo ? "Nenhum." : "Conta vinculada.", documentos: [], canais: "Internet.", exigeAutenticacao: !anonimo, setorDeEntradaId: setor,
    campos: anonimo ? [...CAMPOS_OUVIDORIA] : [{ nome: "pedido", rotulo: "Pedido", tipo: "textoLongo", obrigatorio: true }], criadoPor: ADMIN,
  });
  await publicarVersaoDoServico(prisma, { versaoId, criadoPor: ADMIN });
  return servicoId;
}

const manifestar = (relato: string, chave = "origem-1") =>
  registrarManifestacaoAnonima(prisma, { slug: "ouvidoria", tipo: "DENUNCIA", respostas: { relato }, chaveDeQuota: quota(chave) });

const idDaManifestacao = async (protocolo: string) =>
  (await prisma.manifestacaoDeOuvidoria.findFirstOrThrow({ where: { processo: { numero: Number(protocolo.split("/")[0]) } }, select: { id: true, processoId: true } }));

const METODOLOGIA = {
  escalaMinima: 1, escalaMaxima: 5,
  rotulos: [{ nota: 1, rotulo: "Muito ruim" }, { nota: 2, rotulo: "Ruim" }, { nota: 3, rotulo: "Regular" }, { nota: 4, rotulo: "Bom" }, { nota: 5, rotulo: "Muito bom" }],
  descricaoDoMetodo: "Média simples por dimensão da última avaliação de cada avaliador, nos últimos 12 meses.",
  periodoMeses: 12,
};

beforeEach(async () => {
  await limparBanco(prisma);
  ids = {};
  await prisma.orgao.create({ data: { id: "p-org", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.createMany({ data: [{ id: "p-uo", codigo: "01001", descricao: "Administração", orgaoId: "p-org" }] });
  await prisma.exercicio.create({ data: { id: "p-ex", ano: ANO, criadoPor: "SEED" } });
  await prisma.setor.createMany({ data: [{ id: "s1", codigo: "PROT", nome: "Protocolo Geral", unidadeOrcId: "p-uo", criadoPor: "SEED" }, { id: "s-ouv", codigo: "OUV", nome: "Ouvidoria", unidadeOrcId: "p-uo", criadoPor: "SEED" }] });
  ids["assunto"] = (await prisma.assunto.create({ data: { codigo: "REQ", nome: "Requerimento", criadoPor: "SEED", roteiro: { create: [{ ordem: 1, setorId: "s1", prazoDias: 5, descricao: "Triagem", criadoPor: "SEED" }] } }, select: { id: true } })).id;
  ids["assunto-ouv"] = (await prisma.assunto.create({ data: { codigo: "OUV", nome: "Ouvidoria", permiteAnonimo: true, sigiloPadrao: true, criadoPor: "SEED", roteiro: { create: [{ ordem: 1, setorId: "s-ouv", prazoDias: 30, descricao: "Triagem da ouvidoria", criadoPor: "SEED" }] } }, select: { id: true } })).id;
  ids["assunto-publico"] = (await prisma.assunto.create({ data: { codigo: "PUB", nome: "Anônimo mas público", permiteAnonimo: true, sigiloPadrao: false, criadoPor: "SEED" } , select: { id: true } })).id;
  ids[ADMIN] = (await prisma.usuario.findUniqueOrThrow({ where: { identificador: ADMIN }, select: { id: true } })).id;

  const REQ = [{ acao: "SOLICITAR_SERVICO" }, { acao: "CONSULTAR_MEUS_SERVICOS" }];
  await conta(A, REQ);
  await conta(B, REQ);
  await conta(CONTADOR, REQ);
  await conta(OUVIDOR, [{ acao: "CONSULTAR_PROTOCOLO", unidadeOrcId: "p-uo" }, { acao: "TRIAR_MANIFESTACAO_DE_OUVIDORIA", unidadeOrcId: "p-uo" }]);
  await conta(OUVIDOR_FORA, [{ acao: "CONSULTAR_PROTOCOLO" }, { acao: "TRIAR_MANIFESTACAO_DE_OUVIDORIA" }]);
  await conta(GESTOR, [{ acao: "CONSULTAR_PROTOCOLO" }, { acao: "ENCERRAR_PROCESSO" }]);
  await conta(MODERADOR, [{ acao: "MODERAR_AVALIACAO_DE_SERVICO" }]);
  await prisma.usuarioDoSetor.createMany({ data: [{ usuarioIdent: ADMIN, setorId: "s1", criadoPor: "SEED" }, { usuarioIdent: OUVIDOR, setorId: "s-ouv", criadoPor: "SEED" }] });

  await pessoa("11144477735", "FISICA", "Ana Requerente");
  await pessoa("52998224725", "FISICA", "Bia Requerente");
  await pessoa("39053344705", "FISICA", "Caio Contador");
  ids["empresa"] = await pessoa("11222333000181", "JURIDICA", "Empresa X Ltda");
  for (const [u, doc] of [[A, "11144477735"], [B, "52998224725"], [CONTADOR, "39053344705"]] as const) {
    await vincularPessoaAoUsuario(prisma, { usuarioId: ids[u] ?? "", documento: doc, motivo: "Conferido pelo documento.", criadoPor: ADMIN });
  }
  ids["representacao"] = (await registrarRepresentacao(prisma, { representadaId: ids["empresa"] ?? "", representanteUsuario: CONTADOR, fundamento: "Procuração pública livro 3", vigenciaInicio: new Date(Date.UTC(2026, 0, 1, 12)), criadoPor: ADMIN })).representacaoId;
  ids["srv-req"] = await servico("requerimento", "REQUERIMENTO_ADMINISTRATIVO", "assunto", "s1");
  ids["srv-comp"] = await servico("complemento", "COMPLEMENTO_DE_FORNECEDOR", "assunto", "s1");
  ids["srv-ouv"] = await servico("ouvidoria", "MANIFESTACAO_ANONIMA", "assunto-ouv", "s-ouv");
}, 120_000);

describe("a natureza do serviço decide a entrada", () => {
  it("o1: sem conta só a ouvidoria anônima, sobre assunto anônimo e sigiloso; o protocolo autenticado recusa o serviço anônimo", async () => {
    const versao = (servicoId: string, exigeAutenticacao: boolean) =>
      cadastrarVersaoDoServico(prisma, { servicoId, descricao: "Descrição do serviço ao público.", requisitos: "Nenhum.", documentos: [], canais: "Internet.", exigeAutenticacao, setorDeEntradaId: "s-ouv", campos: [...CAMPOS_OUVIDORIA], criadoPor: ADMIN });
    await expect(versao(ids["srv-ouv"] ?? "", true)).rejects.toThrow(/MANIFESTACAO-ANONIMA-SEM-CONTA/);
    await expect(versao(ids["srv-req"] ?? "", false)).rejects.toThrow(/SERVICO-SEM-AUTENTICACAO/);
    const { servicoId } = await cadastrarServicoDaCarta(prisma, { slug: "anonimo-publico", titulo: "Anônimo público", categoria: "Atendimento", publico: "CIDADAO", tipo: "MANIFESTACAO_ANONIMA", assuntoId: ids["assunto-publico"] ?? "", criadoPor: ADMIN });
    await expect(versao(servicoId, false)).rejects.toThrow(/ASSUNTO-INADEQUADO-PARA-OUVIDORIA/);
    await expect(protocolarSolicitacao(prisma, { slug: "ouvidoria", respostas: { relato: "Relato com conta." }, criadoPor: A })).rejects.toThrow(/SERVICO-DE-OUVIDORIA-ANONIMA/);
    await expect(registrarManifestacaoAnonima(prisma, { slug: "requerimento", tipo: "DUVIDA", respostas: { pedido: "x" }, chaveDeQuota: quota("o") })).rejects.toThrow(/OUVIDORIA-NAO-PUBLICADA/);
  });
});

describe("a manifestação sem conta", () => {
  it("o2: N=2 — nenhuma Pessoa criada, processo sigiloso sem requerente, segredo só por hash; o segredo de uma não abre a outra", async () => {
    const pessoasAntes = await prisma.pessoa.count();
    const m1 = await manifestar("Relato um: cobrança indevida na unidade de saúde.");
    const m2 = await manifestar("Relato dois: atraso recorrente no atendimento.");
    expect(await prisma.pessoa.count()).toBe(pessoasAntes);
    expect(m1.segredo).toMatch(/^[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/);
    expect(m1.segredo).not.toBe(m2.segredo);
    const processos = await prisma.processo.findMany({ where: { manifestacaoDeOuvidoria: { isNot: null } }, select: { sigiloso: true, requerenteId: true, setorAberturaId: true, criadoPor: true } });
    expect(processos).toEqual([
      { sigiloso: true, requerenteId: null, setorAberturaId: "s-ouv", criadoPor: "OUVIDORIA-SEM-CONTA" },
      { sigiloso: true, requerenteId: null, setorAberturaId: "s-ouv", criadoPor: "OUVIDORIA-SEM-CONTA" },
    ]);
    // O segredo em claro não está em linha nenhuma que o ato gravou.
    const gravado = JSON.stringify([await prisma.manifestacaoDeOuvidoria.findMany(), await prisma.processo.findMany(), await prisma.movimentoDoProcesso.findMany(), await prisma.notificacao.findMany(), await prisma.envioPublicoSemConta.findMany()]);
    expect(gravado).not.toContain(m1.segredo);
    expect(gravado).not.toContain(m1.segredo.replace(/-/g, ""));

    const a1 = await acompanharManifestacao(prisma, m1.protocolo, m1.segredo);
    expect(a1).toMatchObject({ protocolo: m1.protocolo, situacao: "RECEBIDA", respostas: [] });
    expect(JSON.stringify(a1)).not.toContain("cobrança indevida");
    expect(await acompanharManifestacao(prisma, m1.protocolo, m1.segredo.toLowerCase())).not.toBeNull();
    expect(await acompanharManifestacao(prisma, m2.protocolo, m1.segredo)).toBeNull();
    expect(await acompanharManifestacao(prisma, m1.protocolo, "AAAAA-AAAAA-AAAAA-AAAAA")).toBeNull();
    expect(await acompanharManifestacao(prisma, "abc", m1.segredo)).toBeNull();

    // ⚠️ O SIGILO É DO ATO, NÃO SÓ DO ASSUNTO: se o assunto for rebaixado depois da publicação, a
    // manifestação sem conta continua nascendo sigilosa.
    await prisma.assunto.update({ where: { id: ids["assunto-ouv"] ?? "" }, data: { sigiloPadrao: false } });
    const m3 = await manifestar("Relato três: depois do assunto rebaixado.");
    expect((await prisma.processo.findFirstOrThrow({ where: { numero: Number(m3.protocolo.split("/")[0]) }, select: { sigiloso: true } })).sigiloso).toBe(true);
  });

  it("o3: sigilo — o gestor com consulta no ente não lê; quem tem a ação no ente sem lotação não tria; a ouvidoria tria e responde", async () => {
    const m = await manifestar("Relato: servidor pediu vantagem para agilizar o processo.");
    const { id, processoId } = await idDaManifestacao(m.protocolo);

    const doGestor = await prisma.$transaction((tx) => podeVerProcesso(tx, processoId, GESTOR));
    expect(doGestor).toMatchObject({ pode: false, codigo: "SIGILO-PREVALECE" });
    expect((await prisma.$transaction((tx) => listarProcessos(tx, GESTOR))).map((p) => p.id)).not.toContain(processoId);
    expect(await prisma.$transaction((tx) => podeVerProcesso(tx, processoId, OUVIDOR))).toMatchObject({ pode: true, codigo: "PARTICIPANTE" });

    await expect(triarManifestacao(prisma, { manifestacaoId: id, tipoConfirmado: "DENUNCIA", anotacaoInterna: ANOTACAO_INTERNA, criadoPor: OUVIDOR_FORA })).rejects.toThrow(/lota|setor/i);
    await expect(triarManifestacao(prisma, { manifestacaoId: id, tipoConfirmado: "DENUNCIA", anotacaoInterna: ANOTACAO_INTERNA, criadoPor: GESTOR })).rejects.toThrow(/TRIAR_MANIFESTACAO_DE_OUVIDORIA/);
    await expect(responderManifestacao(prisma, { manifestacaoId: id, texto: "Recebemos e vamos apurar.", conclusiva: false, criadoPor: OUVIDOR })).rejects.toThrow(/MANIFESTACAO-SEM-TRIAGEM/);
    expect(await prisma.respostaDaOuvidoria.count()).toBe(0);

    await triarManifestacao(prisma, { manifestacaoId: id, tipoConfirmado: "DENUNCIA", anotacaoInterna: ANOTACAO_INTERNA, criadoPor: OUVIDOR });
    await expect(triarManifestacao(prisma, { manifestacaoId: id, tipoConfirmado: "RECLAMACAO", anotacaoInterna: "Outra triagem.", criadoPor: OUVIDOR })).rejects.toThrow(/MANIFESTACAO-JA-TRIADA/);
    expect((await acompanharManifestacao(prisma, m.protocolo, m.segredo))?.situacao).toBe("EM_TRIAGEM");

    await responderManifestacao(prisma, { manifestacaoId: id, texto: "Recebemos e encaminhamos para apuração.", conclusiva: false, criadoPor: OUVIDOR });
    const respondida = await acompanharManifestacao(prisma, m.protocolo, m.segredo);
    expect(respondida?.situacao).toBe("RESPONDIDA");
    expect(respondida?.respostas.map((r) => r.texto)).toEqual(["Recebemos e encaminhamos para apuração."]);
    expect(JSON.stringify(respondida)).not.toContain(ANOTACAO_INTERNA);

    await responderManifestacao(prisma, { manifestacaoId: id, texto: "Apuração concluída; providências adotadas.", conclusiva: true, criadoPor: OUVIDOR });
    expect((await acompanharManifestacao(prisma, m.protocolo, m.segredo))?.situacao).toBe("CONCLUIDA");
    const movimentos = await prisma.movimentoDoProcesso.findMany({ where: { processoId } });
    expect(situacaoDoProcesso(movimentos)).toBe("ENCERRADO");
    await expect(responderManifestacao(prisma, { manifestacaoId: id, texto: "Mais uma resposta depois do fim.", conclusiva: false, criadoPor: OUVIDOR })).rejects.toThrow(/ENCERRADO e não aceita resposta/);
  });

  it("o4: quota local por origem — a sexta na mesma hora recusa sem gravar; outra origem passa", async () => {
    for (let i = 0; i < QUOTA_DE_ENVIOS_SEM_CONTA_POR_HORA; i += 1) await manifestar(`Relato número ${i} sobre a iluminação.`, "origem-q");
    const processos = await prisma.processo.count();
    await expect(manifestar("Relato além da quota.", "origem-q")).rejects.toThrow(/QUOTA-DE-ENVIOS/);
    expect(await prisma.processo.count()).toBe(processos);
    await expect(manifestar("Relato de outra origem.", "origem-r")).resolves.toMatchObject({ protocolo: expect.any(String) });
  });

  it("o5: duas respostas conclusivas simultâneas — uma encerra, a outra recusa", async () => {
    const m = await manifestar("Relato para a corrida das respostas.");
    const { id, processoId } = await idDaManifestacao(m.protocolo);
    await triarManifestacao(prisma, { manifestacaoId: id, tipoConfirmado: "RECLAMACAO", anotacaoInterna: "Tratar direto.", criadoPor: OUVIDOR });
    const r = await Promise.allSettled([
      responderManifestacao(prisma, { manifestacaoId: id, texto: "Resposta conclusiva número um.", conclusiva: true, criadoPor: OUVIDOR }),
      responderManifestacao(prisma, { manifestacaoId: id, texto: "Resposta conclusiva número dois.", conclusiva: true, criadoPor: OUVIDOR }),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const falha = r.find((x) => x.status === "rejected") as PromiseRejectedResult;
    expect(String(falha.reason)).toMatch(/ENCERRADO e não aceita resposta/);
    expect(await prisma.respostaDaOuvidoria.count()).toBe(1);
    expect(await prisma.movimentoDoProcesso.count({ where: { processoId, tipo: "ENCERRAMENTO" } })).toBe(1);
  });
});

describe("a avaliação dos serviços", () => {
  async function decidida(quem: string, representadaId?: string): Promise<string> {
    const s = await protocolarSolicitacao(prisma, { slug: representadaId === undefined ? "requerimento" : "complemento", representadaId, respostas: { pedido: "Pedido para avaliar." }, criadoPor: quem });
    await decidirSolicitacao(prisma, { solicitacaoId: s.solicitacaoId, resultado: "DEFERIDA", mensagemAoRequerente: "Seu pedido foi deferido.", fundamentoInterno: "Confere.", criadoPor: ADMIN });
    return s.solicitacaoId;
  }

  it("a1: a metodologia é versionada, cobre todos os pontos da escala e exige a configuração da carta", async () => {
    expect(await resultadoPublicoDasAvaliacoes(prisma, ids["srv-req"] ?? "")).toEqual({ situacao: "SEM-METODOLOGIA" });
    await expect(cadastrarMetodologiaDeAvaliacao(prisma, { ...METODOLOGIA, rotulos: METODOLOGIA.rotulos.slice(1), criadoPor: ADMIN })).rejects.toThrow(/ROTULO-AUSENTE: .*nota 1/);
    await expect(cadastrarMetodologiaDeAvaliacao(prisma, { ...METODOLOGIA, criadoPor: A })).rejects.toThrow(/CONFIGURAR_CARTA_DE_SERVICOS/);
    expect(await prisma.metodologiaDeAvaliacao.count()).toBe(0);
    expect((await cadastrarMetodologiaDeAvaliacao(prisma, { ...METODOLOGIA, criadoPor: ADMIN })).versao).toBe(1);
    expect((await cadastrarMetodologiaDeAvaliacao(prisma, { ...METODOLOGIA, periodoMeses: 6, criadoPor: ADMIN })).versao).toBe(2);
  });

  it("a2: atendimento — só decidida, só o titular ou quem representa hoje; avaliar de novo é revisão; nota fora da escala recusa", async () => {
    await cadastrarMetodologiaDeAvaliacao(prisma, { ...METODOLOGIA, criadoPor: ADMIN });
    const aberta = await protocolarSolicitacao(prisma, { slug: "requerimento", respostas: { pedido: "Ainda não decidido." }, criadoPor: A });
    const notas = { satisfacao: 4, atendimento: 5, prazos: 3 };
    await expect(avaliarAtendimento(prisma, { solicitacaoId: aberta.solicitacaoId, ...notas, criadoPor: A })).rejects.toThrow(/SOLICITACAO-SEM-DECISAO/);
    const deA = await decidida(A);
    await expect(avaliarAtendimento(prisma, { solicitacaoId: deA, ...notas, criadoPor: B })).rejects.toThrow(/SEM-ACESSO-A-SOLICITACAO/);
    await expect(avaliarAtendimento(prisma, { solicitacaoId: deA, ...notas, prazos: 6, criadoPor: A })).rejects.toThrow(/NOTA-FORA-DA-ESCALA: .*prazos.*entre 1 e 5/);
    const primeira = await avaliarAtendimento(prisma, { solicitacaoId: deA, ...notas, criadoPor: A });
    const revisao = await avaliarAtendimento(prisma, { solicitacaoId: deA, ...notas, satisfacao: 2, criadoPor: A });
    expect([primeira.revisao, revisao.revisao]).toEqual([false, true]);
    expect((await prisma.avaliacaoDeServico.findUniqueOrThrow({ where: { id: revisao.avaliacaoId }, select: { revisaoDeId: true } })).revisaoDeId).toBe(primeira.avaliacaoId);

    const daEmpresa = await decidida(CONTADOR, ids["empresa"]);
    await revogarRepresentacao(prisma, { representacaoId: ids["representacao"] ?? "", dataEfeito: new Date(), motivo: "Procuração revogada.", criadoPor: ADMIN });
    await expect(avaliarAtendimento(prisma, { solicitacaoId: daEmpresa, ...notas, criadoPor: CONTADOR })).rejects.toThrow(/SEM-ACESSO-A-SOLICITACAO/);
    expect(await prisma.avaliacaoDeServico.count()).toBe(2);
  });

  it("a3: resultado público N=2 — última da cadeia, origens separadas, removidas contadas, descrição fora, outra metodologia de fora", async () => {
    await cadastrarMetodologiaDeAvaliacao(prisma, { ...METODOLOGIA, criadoPor: ADMIN });
    const deA = await decidida(A);
    const deB = await decidida(B);
    await avaliarAtendimento(prisma, { solicitacaoId: deA, satisfacao: 5, atendimento: 5, prazos: 5, descricao: DESCRICAO_PRIVADA, criadoPor: A });
    await avaliarAtendimento(prisma, { solicitacaoId: deA, satisfacao: 3, atendimento: 4, prazos: 2, descricao: DESCRICAO_PRIVADA, criadoPor: A });
    await avaliarAtendimento(prisma, { solicitacaoId: deB, satisfacao: 4, atendimento: 4, prazos: 4, criadoPor: B });
    await opinarSobreServico(prisma, { slug: "requerimento", token: TOKEN_1, satisfacao: 1, atendimento: 1, prazos: 1, chaveDeQuota: quota("op") });
    const abusiva = await opinarSobreServico(prisma, { slug: "requerimento", token: TOKEN_2, satisfacao: 1, atendimento: 2, prazos: 1, descricao: "Texto abusivo", chaveDeQuota: quota("op") });

    let r = await resultadoPublicoDasAvaliacoes(prisma, ids["srv-req"] ?? "");
    expect(r).toMatchObject({
      situacao: "PUBLICADO",
      atendimentoComprovado: { respostas: 2, satisfacao: "3,5", atendimento: "4,0", prazos: "3,0" },
      opiniaoGeral: { respostas: 2, satisfacao: "1,0", atendimento: "1,5", prazos: "1,0" },
      removidas: 0, deOutraMetodologia: 0,
    });
    expect(JSON.stringify(r)).not.toContain("Joana");
    expect(JSON.stringify(r)).not.toContain(A);

    await expect(removerAvaliacao(prisma, { avaliacaoId: abusiva.avaliacaoId, motivo: "ABUSO", justificativa: "Ofensa a servidor.", criadoPor: A })).rejects.toThrow(/MODERAR_AVALIACAO_DE_SERVICO/);
    await removerAvaliacao(prisma, { avaliacaoId: abusiva.avaliacaoId, motivo: "ABUSO", justificativa: "Ofensa a servidor.", criadoPor: MODERADOR });
    await expect(removerAvaliacao(prisma, { avaliacaoId: abusiva.avaliacaoId, motivo: "ABUSO", justificativa: "Ofensa a servidor.", criadoPor: MODERADOR })).rejects.toThrow(/AVALIACAO-JA-REMOVIDA/);
    r = await resultadoPublicoDasAvaliacoes(prisma, ids["srv-req"] ?? "");
    expect(r).toMatchObject({ opiniaoGeral: { respostas: 1, atendimento: "1,0" }, removidas: 1 });

    // Uma escala nova não mistura: o que foi avaliado na v1 sai da média e é contado à parte.
    await cadastrarMetodologiaDeAvaliacao(prisma, { ...METODOLOGIA, escalaMinima: 0, escalaMaxima: 10, rotulos: Array.from({ length: 11 }, (_, n) => ({ nota: n, rotulo: `Nota ${n}` })), criadoPor: ADMIN });
    r = await resultadoPublicoDasAvaliacoes(prisma, ids["srv-req"] ?? "");
    expect(r).toMatchObject({ atendimentoComprovado: { respostas: 0, satisfacao: null }, opiniaoGeral: { respostas: 0 }, deOutraMetodologia: 3 });
    // Fora da janela não conta.
    expect(await resultadoPublicoDasAvaliacoes(prisma, ids["srv-req"] ?? "", new Date(Date.now() + 400 * 86_400_000))).toMatchObject({ removidas: 0, deOutraMetodologia: 0 });
  });

  it("a4: opinião sem conta — serviço publicado, uma raiz por token mesmo em corrida, quota, token nunca gravado em claro", async () => {
    await cadastrarMetodologiaDeAvaliacao(prisma, { ...METODOLOGIA, criadoPor: ADMIN });
    await expect(opinarSobreServico(prisma, { slug: "nao-existe", token: TOKEN_1, satisfacao: 3, atendimento: 3, prazos: 3, chaveDeQuota: quota("x") })).rejects.toThrow(/SERVICO-NAO-PUBLICADO/);
    const corrida = await Promise.allSettled([1, 2].map((n) => opinarSobreServico(prisma, { slug: "requerimento", token: TOKEN_1, satisfacao: n, atendimento: 3, prazos: 3, chaveDeQuota: quota(`c${n}`) })));
    const raizes = await prisma.avaliacaoDeServico.count({ where: { revisaoDeId: null } });
    expect(raizes).toBe(1);
    for (const x of corrida) if (x.status === "rejected") expect(String(x.reason)).toMatch(/AVALIACAO-CONCORRENTE/);
    expect(JSON.stringify(await prisma.avaliacaoDeServico.findMany())).not.toContain(TOKEN_1);

    for (let i = 0; i < 10; i += 1) {
      await opinarSobreServico(prisma, { slug: "requerimento", token: `token-quota-${i}-cccccccccccccccccccccccccccc`, satisfacao: 3, atendimento: 3, prazos: 3, chaveDeQuota: quota("q") });
    }
    await expect(opinarSobreServico(prisma, { slug: "requerimento", token: TOKEN_2, satisfacao: 3, atendimento: 3, prazos: 3, chaveDeQuota: quota("q") })).rejects.toThrow(/QUOTA-DE-ENVIOS/);
  });

  it("a5: as regras puras — média meio-para-cima em inteiros e a janela no fim do mês", () => {
    expect(mediaComUmaCasa(7, 2)).toBe("3,5");
    expect(mediaComUmaCasa(10, 3)).toBe("3,3");
    expect(mediaComUmaCasa(11, 3)).toBe("3,7");
    expect(mediaComUmaCasa(1, 20)).toBe("0,1"); // 0,05 sobe
    expect(mediaComUmaCasa(0, 0)).toBeNull();
    // Por DIA CIVIL do ente: 31/03 às 23:30 de Fortaleza já é 01/04 em UTC — a janela de 1 mês começa em 28/02.
    expect(diaCivil(inicioDaJanela(new Date("2026-04-01T02:30:00Z"), 1))).toBe("2026-02-28");
    expect(diaCivil(inicioDaJanela(new Date("2026-01-15T15:00:00Z"), 12))).toBe("2025-01-15");
    expect(diaCivil(inicioDaJanela(new Date("2024-03-31T15:00:00Z"), 1))).toBe("2024-02-29");
  });
});
