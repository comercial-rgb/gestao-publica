import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { PERFIL_ADMIN, PERFIL_EXECUCAO } from "../../test/usuarios-teste.js";
import { TODAS_AS_ACOES } from "./acoes.js";
import { derivaDePerfil } from "./deriva-de-perfil.js";
import {
  concederAcaoAoPerfil,
  criarPerfil,
  revogarAcaoDoPerfil,
} from "./servico-perfis.js";

/**
 * M16 — OS PERFIS: criar o crachá e mudar o que ele abre (TR 4.56 · 6.5).
 *
 * ⚠️ O QUE ESTE ARQUIVO PROVA É O CAMINHO QUE NÃO EXISTIA. Antes dele, os únicos escritores
 * de `PermissaoDePerfil` eram o bootstrap de instalação — que recusa rodar em banco povoado —
 * e um teste. Uma instalação já existente não tinha como alcançar as ações de um lote novo.
 *
 * ⚠️ FIXTURE N=2 NA MATRIZ, e não por gosto de simetria: a unicidade é por
 * (perfil, ação, unidade). Com um perfil e uma ação, "concedi ao perfil certo" e "concedi a
 * algum perfil" são a mesma frase, e a regra passaria por vacuidade.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const ADMIN = "orcamento@cg.pb.gov.br"; // fixture com o perfil ADMIN (todas as ações)

// Duas ações reais do censo, de domínios diferentes — a matriz 2x2 com os dois perfis.
const ACAO_A = "CADASTRAR_DEPOSITO";
const ACAO_B = "CADASTRAR_MATERIAL";
const A_CHAVE = "CONCEDER_ACAO_A_PERFIL";

async function idDoPerfil(nome: string): Promise<string> {
  const p = await prisma.perfil.findFirstOrThrow({ where: { nome }, select: { id: true } });
  return p.id;
}

async function permissoesDe(perfilId: string): Promise<readonly { acao: string; unidadeOrcId: string | null }[]> {
  const ps = await prisma.permissaoDePerfil.findMany({
    where: { perfilId },
    select: { acao: true, unidadeOrcId: true },
  });
  return ps.map((p) => ({ acao: String(p.acao), unidadeOrcId: p.unidadeOrcId }));
}

/** Duas unidades gestoras — o recorte do 6.5 só se prova com duas. */
async function duasUnidades(): Promise<{ readonly ugA: string; readonly ugB: string }> {
  await prisma.orgao.create({ data: { id: "p-org", codigo: "03", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "p-ug-a", codigo: "03001", descricao: "Administração", orgaoId: "p-org" },
  });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "p-ug-b", codigo: "03002", descricao: "Saúde", orgaoId: "p-org" },
  });
  return { ugA: "p-ug-a", ugB: "p-ug-b" };
}

/** Um usuário vinculado a UM perfil — para provar a negação pela borda do domínio. */
async function usuarioComPerfil(email: string, nomePerfil: string): Promise<string> {
  const perfilId = await idDoPerfil(nomePerfil);
  const u = await prisma.usuario.create({
    data: { identificador: email, nome: email, ativo: true, criadoPor: "TESTE" },
    select: { id: true },
  });
  await prisma.vinculoUsuarioPerfil.create({
    data: { usuarioId: u.id, perfilId, criadoPor: "TESTE" },
  });
  return u.id;
}

describe("M16 — perfis: criar, conceder ação e revogar ação", () => {
  beforeEach(async () => {
    await limparBanco(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: criarPerfil cria um perfil VAZIO — e o vazio é o padrão, não um defeito", async () => {
    const { perfilId } = await criarPerfil(prisma, {
      nome: "TESOURARIA",
      descricao: "Quem opera a conciliação",
      criadoPor: ADMIN,
    });

    const p = await prisma.perfil.findUniqueOrThrow({
      where: { id: perfilId },
      select: { nome: true, descricao: true, criadoPor: true, permissoes: { select: { id: true } } },
    });
    expect(p.nome).toBe("TESOURARIA");
    expect(p.criadoPor).toBe(ADMIN); // o ator, auditado
    // ⚠️ ZERO permissões: não há "copiar de outro perfil", e a ausência é a decisão.
    expect(p.permissoes).toHaveLength(0);
  });

  it("t2: nome repetido é recusado NOMEANDO — dois perfis homônimos fariam a escolha virar sorteio", async () => {
    await criarPerfil(prisma, { nome: "TESOURARIA", descricao: "A primeira", criadoPor: ADMIN });
    await expect(
      criarPerfil(prisma, { nome: "TESOURARIA", descricao: "A segunda", criadoPor: ADMIN })
    ).rejects.toThrow(/PERFIL JÁ EXISTE/);

    expect(await prisma.perfil.count({ where: { nome: "TESOURARIA" } })).toBe(1);
  });

  it("t3 (N=2): a matriz dois perfis x duas ações — cada concessão cai no perfil que a recebeu", async () => {
    const { perfilId: pA } = await criarPerfil(prisma, { nome: "P-A", descricao: "A", criadoPor: ADMIN });
    const { perfilId: pB } = await criarPerfil(prisma, { nome: "P-B", descricao: "B", criadoPor: ADMIN });

    await concederAcaoAoPerfil(prisma, { perfilId: pA, acao: ACAO_A, criadoPor: ADMIN });
    await concederAcaoAoPerfil(prisma, { perfilId: pB, acao: ACAO_B, criadoPor: ADMIN });

    // ⚠️ COM UM PERFIL SÓ, "foi para o certo" e "foi para algum" seriam a mesma frase.
    expect(await permissoesDe(pA)).toEqual([{ acao: ACAO_A, unidadeOrcId: null }]);
    expect(await permissoesDe(pB)).toEqual([{ acao: ACAO_B, unidadeOrcId: null }]);

    const linha = await prisma.permissaoDePerfil.findFirstOrThrow({
      where: { perfilId: pA },
      select: { criadoPor: true },
    });
    expect(linha.criadoPor).toBe(ADMIN); // conceder poder é um ato, e ele tem autor
  });

  it("t4: conceder o que já está concedido é erro NOMEADO — silêncio esconderia o perfil errado", async () => {
    const { perfilId } = await criarPerfil(prisma, { nome: "P-A", descricao: "A", criadoPor: ADMIN });
    await concederAcaoAoPerfil(prisma, { perfilId, acao: ACAO_A, criadoPor: ADMIN });

    await expect(
      concederAcaoAoPerfil(prisma, { perfilId, acao: ACAO_A, criadoPor: ADMIN })
    ).rejects.toThrow(/AÇÃO JÁ CONCEDIDA/);

    expect(await permissoesDe(perfilId)).toHaveLength(1);
  });

  it("t5: ação fora do censo é recusada NOMEANDO — poder sobre o que o sistema não faz é promessa vazia", async () => {
    const { perfilId } = await criarPerfil(prisma, { nome: "P-A", descricao: "A", criadoPor: ADMIN });

    await expect(
      concederAcaoAoPerfil(prisma, { perfilId, acao: "MANDAR_NO_MUNICIPIO", criadoPor: ADMIN })
    ).rejects.toThrow(/AÇÃO INEXISTENTE/);

    expect(await permissoesDe(perfilId)).toHaveLength(0);
  });

  it("t6 (N=2): a MESMA ação em duas unidades coexiste com a global — são três concessões distintas", async () => {
    const { ugA, ugB } = await duasUnidades();
    const { perfilId } = await criarPerfil(prisma, { nome: "P-A", descricao: "A", criadoPor: ADMIN });

    await concederAcaoAoPerfil(prisma, { perfilId, acao: ACAO_A, unidadeOrcId: ugA, criadoPor: ADMIN });
    await concederAcaoAoPerfil(prisma, { perfilId, acao: ACAO_A, unidadeOrcId: ugB, criadoPor: ADMIN });
    await concederAcaoAoPerfil(prisma, { perfilId, acao: ACAO_A, criadoPor: ADMIN });

    const linhas = await permissoesDe(perfilId);
    expect(linhas).toHaveLength(3);
    expect(new Set(linhas.map((l) => l.unidadeOrcId))).toEqual(new Set([ugA, ugB, null]));
  });

  it("t7: unidade inexistente é recusada NOMEANDO — a permissão pareceria concedida e não valeria em lugar nenhum", async () => {
    const { perfilId } = await criarPerfil(prisma, { nome: "P-A", descricao: "A", criadoPor: ADMIN });

    await expect(
      concederAcaoAoPerfil(prisma, { perfilId, acao: ACAO_A, unidadeOrcId: "ug-que-nao-existe", criadoPor: ADMIN })
    ).rejects.toThrow(/UNIDADE GESTORA INEXISTENTE/);

    expect(await permissoesDe(perfilId)).toHaveLength(0);
  });

  it("t8: revogar tira a linha; revogar de novo é erro NOMEADO", async () => {
    const { ugA } = await duasUnidades();
    const { perfilId } = await criarPerfil(prisma, { nome: "P-A", descricao: "A", criadoPor: ADMIN });
    await concederAcaoAoPerfil(prisma, { perfilId, acao: ACAO_A, unidadeOrcId: ugA, criadoPor: ADMIN });
    await concederAcaoAoPerfil(prisma, { perfilId, acao: ACAO_A, criadoPor: ADMIN });

    // ⚠️ REVOGAR A DA UNIDADE NÃO TOCA A GLOBAL — são concessões diferentes.
    await revogarAcaoDoPerfil(prisma, { perfilId, acao: ACAO_A, unidadeOrcId: ugA, criadoPor: ADMIN });
    expect(await permissoesDe(perfilId)).toEqual([{ acao: ACAO_A, unidadeOrcId: null }]);

    await expect(
      revogarAcaoDoPerfil(prisma, { perfilId, acao: ACAO_A, unidadeOrcId: ugA, criadoPor: ADMIN })
    ).rejects.toThrow(/AÇÃO NÃO CONCEDIDA/);
  });

  it("t9: a ÚLTIMA CHAVE não se revoga — e depois de concedida a outro perfil, revoga-se", async () => {
    const admin = await idDoPerfil(PERFIL_ADMIN);

    // O ADMIN das fixtures recebe TODAS as ações: é o único lugar onde a chave está.
    expect(await prisma.permissaoDePerfil.count({ where: { acao: A_CHAVE } })).toBe(1);

    await expect(
      revogarAcaoDoPerfil(prisma, { perfilId: admin, acao: A_CHAVE, criadoPor: ADMIN })
    ).rejects.toThrow(/ÚLTIMA CHAVE/);
    expect(await prisma.permissaoDePerfil.count({ where: { acao: A_CHAVE } })).toBe(1);

    // ⚠️ A OUTRA DIREÇÃO: com a chave em um segundo perfil, a recusa some. Sem esta metade,
    // um guard que recusasse SEMPRE passaria neste arquivo.
    const { perfilId: segundo } = await criarPerfil(prisma, {
      nome: "ADMIN-SUPLENTE",
      descricao: "O segundo que distribui crachás",
      criadoPor: ADMIN,
    });
    await concederAcaoAoPerfil(prisma, { perfilId: segundo, acao: A_CHAVE, criadoPor: ADMIN });

    await revogarAcaoDoPerfil(prisma, { perfilId: admin, acao: A_CHAVE, criadoPor: ADMIN });
    expect(await prisma.permissaoDePerfil.count({ where: { acao: A_CHAVE } })).toBe(1);
  });

  it("t10: quem EXECUTA despesa não distribui crachá — negado, e a mensagem diz o que faltou", async () => {
    await usuarioComPerfil("executor@cg.pb.gov.br", PERFIL_EXECUCAO);
    const { perfilId } = await criarPerfil(prisma, { nome: "P-A", descricao: "A", criadoPor: ADMIN });

    // ⚠️ A NEGAÇÃO AFIRMA O MOTIVO: "não completou" é compatível com o servidor ter gravado.
    await expect(
      concederAcaoAoPerfil(prisma, { perfilId, acao: ACAO_A, criadoPor: "executor@cg.pb.gov.br" })
    ).rejects.toThrow(/ACESSO NEGADO[\s\S]*CONCEDER_ACAO_A_PERFIL/);

    expect(await permissoesDe(perfilId)).toHaveLength(0);
  });

  it("t11: o caso de uso FECHA a deriva que o detector acusa — é o efeito, não a papelada", async () => {
    const { perfilId } = await criarPerfil(prisma, { nome: "P-A", descricao: "A", criadoPor: ADMIN });

    // Um mundo onde só este perfil concede: falta tudo, menos o que ele tem.
    const antes = derivaDePerfil((await permissoesDe(perfilId)).map((p) => p.acao));
    expect(antes.semPerfil).toHaveLength(TODAS_AS_ACOES.length);

    await concederAcaoAoPerfil(prisma, { perfilId, acao: ACAO_A, criadoPor: ADMIN });
    const depois = derivaDePerfil((await permissoesDe(perfilId)).map((p) => p.acao));

    expect(depois.semPerfil).toHaveLength(TODAS_AS_ACOES.length - 1);
    expect(depois.semPerfil).not.toContain(ACAO_A);
    expect(depois.foraDoCenso).toEqual([]);
  });
});
