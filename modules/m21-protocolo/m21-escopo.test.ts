import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { anexarArquivo, baixarAnexo } from "../m22-documentos/anexos.js";
import { loteDeAnexosDoProcesso } from "../m22-documentos/consultas.js";
import { dossieDoProcesso, listarProcessos, podeVerProcesso } from "./consultas.js";
import { abrirProcesso, protocolarSolicitacao, cadastrarServicoDaCarta, cadastrarVersaoDoServico, publicarVersaoDoServico, tramitar } from "./servico.js";
import { vincularPessoaAoUsuario } from "../m16-travamento/servico-pessoa-do-usuario.js";

/**
 * ═══ M21 — O ESCOPO DO PROTOCOLO POR CAPACIDADE (V7 M1 U1) ═══
 *
 * Os sete cenários mínimos do pedido, cada um com um ALVO QUE EXISTE e um ator que O ALCANÇA — lista
 * vazia ou "não encontrado" sozinhos não provariam nada.
 *
 * Duas unidades gestoras (UG-A com o setor A, UG-B com o setor B), três processos (A comum, B comum,
 * B sigiloso), um anexo em B.
 */
const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => { await prisma.$disconnect(); });

const ADMIN = "protocolo@cg.pb.gov.br"; // fixture ADMIN, lotado nos dois setores só para abrir
const CONSULTA_A_E_GLOBAL_ALHEIA = "consulta.a@cg.pb.gov.br";
const SO_GLOBAL_ALHEIA = "empenho.global@cg.pb.gov.br";
const GESTOR_DO_PROTOCOLO = "gestor.protocolo@cg.pb.gov.br";
const OPERADOR_B = "operador.b@cg.pb.gov.br";
const OPERADOR_B2 = "operador.b2@cg.pb.gov.br";
const REQUERENTE = "requerente@externo.test";

let pA = "";
let pB = "";
let pBsig = "";
let anexoB = "";
let pReq = "";

async function conta(identificador: string, permissoes: readonly { acao: string; uo: string | null }[]): Promise<void> {
  const perfil = await prisma.perfil.create({ data: { nome: `P-${identificador}`, descricao: "escopo", criadoPor: "SEED", permissoes: { create: permissoes.map((p) => ({ acao: p.acao as never, unidadeOrcId: p.uo, criadoPor: "SEED" })) } }, select: { id: true } });
  const u = await prisma.usuario.create({ data: { identificador, nome: identificador, criadoPor: "SEED" }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: "SEED" } });
}

beforeAll(async () => {
  await limparBanco(prisma);
  await prisma.orgao.create({ data: { id: "o", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.createMany({ data: [{ id: "ug-a", codigo: "01001", descricao: "Administração", orgaoId: "o" }, { id: "ug-b", codigo: "01002", descricao: "Saúde", orgaoId: "o" }] });
  await prisma.exercicio.create({ data: { id: "ex", ano: 2026, criadoPor: "SEED" } });
  await prisma.setor.createMany({ data: [{ id: "sa", codigo: "SA", nome: "Setor A", unidadeOrcId: "ug-a", criadoPor: "SEED" }, { id: "sb", codigo: "SB", nome: "Setor B", unidadeOrcId: "ug-b", criadoPor: "SEED" }, { id: "sb2", codigo: "SB2", nome: "Setor B2", unidadeOrcId: "ug-b", criadoPor: "SEED" }] });
  const assunto = await prisma.assunto.create({ data: { codigo: "REQ", nome: "Requerimento", criadoPor: "SEED" }, select: { id: true } });

  await conta(CONSULTA_A_E_GLOBAL_ALHEIA, [{ acao: "CONSULTAR_PROTOCOLO", uo: "ug-a" }, { acao: "EMPENHAR", uo: null }]);
  await conta(SO_GLOBAL_ALHEIA, [{ acao: "EMPENHAR", uo: null }, { acao: "CONSULTAR_DESPESA", uo: null }]);
  await conta(GESTOR_DO_PROTOCOLO, [{ acao: "CONSULTAR_PROTOCOLO", uo: null }, { acao: "TRAMITAR_PROCESSO", uo: null }]);
  await conta(OPERADOR_B, [{ acao: "CONSULTAR_PROTOCOLO", uo: "ug-b" }, { acao: "TRAMITAR_PROCESSO", uo: "ug-b" }]);
  await conta(OPERADOR_B2, [{ acao: "CONSULTAR_PROTOCOLO", uo: "ug-b" }, { acao: "TRAMITAR_PROCESSO", uo: "ug-b" }]);
  await conta(REQUERENTE, [{ acao: "SOLICITAR_SERVICO", uo: null }, { acao: "CONSULTAR_MEUS_SERVICOS", uo: null }]);
  await prisma.usuarioDoSetor.createMany({ data: [{ usuarioIdent: ADMIN, setorId: "sa", criadoPor: "SEED" }, { usuarioIdent: ADMIN, setorId: "sb", criadoPor: "SEED" }, { usuarioIdent: OPERADOR_B, setorId: "sb", criadoPor: "SEED" }, { usuarioIdent: OPERADOR_B2, setorId: "sb2", criadoPor: "SEED" }] });

  const interessada = await prisma.pessoa.create({ data: { documento: "52998224725", tipo: "FISICA", criadoPor: "SEED", versoes: { create: { nome: "Interessada", criadoPor: "SEED" } } }, select: { id: true } });
  const base = { exercicio: 2026, assuntoId: assunto.id, requerenteId: interessada.id, finalidade: "INTERNO" as const, textoAbertura: "Processo para a prova de escopo.", criadoPor: ADMIN };
  pA = (await abrirProcesso(prisma, { ...base, setorAberturaId: "sa" })).processoId;
  pB = (await abrirProcesso(prisma, { ...base, setorAberturaId: "sb" })).processoId;
  pBsig = (await abrirProcesso(prisma, { ...base, setorAberturaId: "sb", sigiloso: true })).processoId;
  anexoB = (await anexarArquivo(prisma, { nomeOriginal: "parecer.pdf", mimeType: "application/pdf", conteudo: new TextEncoder().encode("%PDF-1.4 b"), origem: "UPLOAD", processoId: pB, criadoPor: ADMIN })).anexoId;

  // O requerente protocola pela carta: o processo nasce com criadoPor = requerente.
  const pessoa = await prisma.pessoa.create({ data: { documento: "11144477735", tipo: "FISICA", criadoPor: "SEED", versoes: { create: { nome: "Req", criadoPor: "SEED" } } }, select: { id: true } });
  void pessoa;
  const u = await prisma.usuario.findUniqueOrThrow({ where: { identificador: REQUERENTE }, select: { id: true } });
  await vincularPessoaAoUsuario(prisma, { usuarioId: u.id, documento: "11144477735", motivo: "Conferido pelo documento.", criadoPor: ADMIN });
  const { servicoId } = await cadastrarServicoDaCarta(prisma, { slug: "req", titulo: "Requerimento geral", categoria: "Geral", publico: "CIDADAO", tipo: "REQUERIMENTO_ADMINISTRATIVO", assuntoId: assunto.id, criadoPor: ADMIN });
  const { versaoId } = await cadastrarVersaoDoServico(prisma, { servicoId, descricao: "Pedido administrativo geral.", requisitos: "Conta.", documentos: [], canais: "Internet.", exigeAutenticacao: true, setorDeEntradaId: "sb", campos: [{ nome: "pedido", rotulo: "Pedido", tipo: "texto", obrigatorio: true }], criadoPor: ADMIN });
  await publicarVersaoDoServico(prisma, { versaoId, criadoPor: ADMIN });
  pReq = (await protocolarSolicitacao(prisma, { slug: "req", respostas: { pedido: "Quero revisão" }, criadoPor: REQUERENTE })).processoId;
}, 180_000);

const ids = async (u: string): Promise<string[]> => (await listarProcessos(prisma, u)).map((l) => l.id).sort();

describe("escopo do protocolo — os sete cenários", () => {
  it("1. consulta SÓ na UG-A + permissão global de outra área: vê A, NÃO vê B — nem por id, nem na caixa, nem o anexo", async () => {
    expect(await podeVerProcesso(prisma, pA, CONSULTA_A_E_GLOBAL_ALHEIA)).toMatchObject({ pode: true, codigo: "CONSULTA-NA-UG" });
    expect(await podeVerProcesso(prisma, pB, CONSULTA_A_E_GLOBAL_ALHEIA)).toMatchObject({ pode: false, codigo: "FORA-DO-ESCOPO" });
    expect(await ids(CONSULTA_A_E_GLOBAL_ALHEIA)).toEqual([pA]);
    expect(await dossieDoProcesso(prisma, pB, CONSULTA_A_E_GLOBAL_ALHEIA)).toBeNull();
    expect(await baixarAnexo(prisma, anexoB, CONSULTA_A_E_GLOBAL_ALHEIA)).toBeNull();
    expect(await loteDeAnexosDoProcesso(prisma, pB, CONSULTA_A_E_GLOBAL_ALHEIA)).toBeNull();
  });

  it("2. só permissão global de outra área: NÃO alcança o protocolo — nem o processo comum", async () => {
    expect(await podeVerProcesso(prisma, pA, SO_GLOBAL_ALHEIA)).toMatchObject({ pode: false, codigo: "SEM-CONSULTA-DO-PROTOCOLO" });
    expect(await ids(SO_GLOBAL_ALHEIA)).toEqual([]);
    expect(await baixarAnexo(prisma, anexoB, SO_GLOBAL_ALHEIA)).toBeNull();
  });

  it("3. gestor do protocolo (consulta e tramitação no ENTE): alcança A e B e tramita B sem lotação", async () => {
    expect(await ids(GESTOR_DO_PROTOCOLO)).toEqual([pA, pB, pReq].sort());
    expect((await baixarAnexo(prisma, anexoB, GESTOR_DO_PROTOCOLO))?.nomeOriginal).toBe("parecer.pdf");
    expect((await dossieDoProcesso(prisma, pB, GESTOR_DO_PROTOCOLO))?.numero).toBeGreaterThan(0);
    await tramitar(prisma, { processoId: pB, setorDestinoId: "sb2", texto: "Encaminho ao setor B2.", criadoPor: GESTOR_DO_PROTOCOLO });
  });

  it("4. gestor do protocolo SEM participação: o sigilo prevalece — não vê, não baixa, não tramita", async () => {
    expect(await podeVerProcesso(prisma, pBsig, GESTOR_DO_PROTOCOLO)).toMatchObject({ pode: false, codigo: "SIGILO-PREVALECE" });
    await expect(tramitar(prisma, { processoId: pBsig, setorDestinoId: "sb2", texto: "Tentativa sobre sigiloso.", criadoPor: GESTOR_DO_PROTOCOLO })).rejects.toThrow(/LOTAÇÃO/);
    // ...e quem PARTICIPA (lotado no setor B) alcança o sigiloso.
    expect(await podeVerProcesso(prisma, pBsig, OPERADOR_B)).toMatchObject({ pode: true, codigo: "PARTICIPANTE" });
  });

  it("5. requerente que protocolou pela carta NÃO alcança o processo interno; operador de outro setor também não", async () => {
    expect(await podeVerProcesso(prisma, pReq, REQUERENTE)).toMatchObject({ pode: false, codigo: "SEM-CONSULTA-DO-PROTOCOLO" });
    expect(await ids(REQUERENTE)).toEqual([]);
    expect(await podeVerProcesso(prisma, pA, OPERADOR_B)).toMatchObject({ pode: false, codigo: "FORA-DO-ESCOPO" });
    // O operador de B alcança o pedido que entrou no setor B.
    expect(await podeVerProcesso(prisma, pReq, OPERADOR_B)).toMatchObject({ pode: true });
  });

  it("6. a ação na UG certa sem lotação não despacha: a dispensa de lotação é da AÇÃO DO ATO no ente, não da unidade", async () => {
    // pReq está no setor B; o operador de B2 tem TRAMITAR_PROCESSO na UG-B (a autorização passa) e não é lotado em B.
    await expect(tramitar(prisma, { processoId: pReq, setorDestinoId: "sb2", texto: "Tentativa de fora do setor.", criadoPor: OPERADOR_B2 })).rejects.toThrow(/LOTAÇÃO/);
    // e ele alcança o processo pela consulta da UG-B (não sigiloso), mas o anexo sigiloso de ninguém.
    expect(await podeVerProcesso(prisma, pReq, OPERADOR_B2)).toMatchObject({ pode: true, codigo: "CONSULTA-NA-UG" });
    expect(await podeVerProcesso(prisma, pBsig, OPERADOR_B2)).toMatchObject({ pode: false, codigo: "SIGILO-PREVALECE" });
  });

  it("7. revogação entre a leitura e o ato: o gestor lê A, perde o perfil, e o ato seguinte é recusado", async () => {
    expect(await podeVerProcesso(prisma, pA, GESTOR_DO_PROTOCOLO)).toMatchObject({ pode: true });
    const u = await prisma.usuario.findUniqueOrThrow({ where: { identificador: GESTOR_DO_PROTOCOLO }, select: { id: true } });
    await prisma.vinculoUsuarioPerfil.deleteMany({ where: { usuarioId: u.id } });
    await expect(tramitar(prisma, { processoId: pA, setorDestinoId: "sb", texto: "Depois da revogação.", criadoPor: GESTOR_DO_PROTOCOLO })).rejects.toThrow();
    expect(await podeVerProcesso(prisma, pA, GESTOR_DO_PROTOCOLO)).toMatchObject({ pode: false, codigo: "SEM-CONSULTA-DO-PROTOCOLO" });
    expect(await baixarAnexo(prisma, anexoB, GESTOR_DO_PROTOCOLO)).toBeNull();
  });
});
