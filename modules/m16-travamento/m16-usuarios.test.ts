import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { autenticar, definirSenha, validarSessao } from "./autenticacao.js";
import {
  ativarUsuario,
  concederPerfil,
  criarUsuario,
  inativarUsuario,
  resetarSenha,
  revogarPerfil,
} from "./servico-usuarios.js";

/**
 * M16 — ADMINISTRAÇÃO DE USUÁRIOS (7.13). O DOMÍNIO: cada ato + suas recusas nomeadas + a
 * revogação de sessões PROVADA (o token do alvo deixa de validar).
 *
 * ⚠️ Estes atos ainda NÃO cobram o censo (AUTORIZACAO-ADMIN-SEM-CENSO — o enum aguarda migração).
 * O que se prova aqui é a IDENTIDADE do ator e a mecânica de cada ato; a separação por perfil é a
 * próxima sessão. Ver o cabeçalho de `servico-usuarios.ts`.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const ADMIN = "orcamento@cg.pb.gov.br"; // fixture ativa (semeada pelo limparBanco)
const SENHA_INI = "SenhaInicial#2026"; // ≥12
const SENHA_NOVA = "SenhaTrocadaAdmin#2026";

async function perfilExecucaoId(): Promise<string> {
  const p = await prisma.perfil.findFirstOrThrow({ where: { nome: "EXECUCAO" }, select: { id: true } });
  return p.id;
}
async function perfilControleId(): Promise<string> {
  const p = await prisma.perfil.findFirstOrThrow({ where: { nome: "CONTROLE" }, select: { id: true } });
  return p.id;
}

describe("M16 — administração de usuários (domínio)", () => {
  beforeEach(async () => {
    await limparBanco(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: criarUsuario — cria com perfil e a senha inicial já autentica (reusa o hash do bootstrap)", async () => {
    const perfilId = await perfilExecucaoId();
    const { usuarioId } = await criarUsuario(prisma, { nome: "Fulano", email: "fulano@cg.pb.gov.br", senhaInicial: SENHA_INI, perfilId, criadoPor: ADMIN });

    const u = await prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId }, select: { identificador: true, ativo: true, criadoPor: true, vinculos: { select: { perfilId: true } } } });
    expect(u.identificador).toBe("fulano@cg.pb.gov.br");
    expect(u.ativo).toBe(true);
    expect(u.criadoPor).toBe(ADMIN); // o ator, auditado
    expect(u.vinculos.map((v) => v.perfilId)).toEqual([perfilId]);

    // A senha inicial autentica — o hash é o mesmo caminho do bootstrap/troca-a-própria.
    const sessao = await autenticar(prisma, { identificador: "fulano@cg.pb.gov.br", senha: SENHA_INI });
    expect(sessao.token.length).toBeGreaterThan(0);
  });

  it("t2: criarUsuario — email duplicado e senha curta são recusas NOMEADAS", async () => {
    await criarUsuario(prisma, { nome: "Fulano", email: "fulano@cg.pb.gov.br", senhaInicial: SENHA_INI, criadoPor: ADMIN });
    await expect(
      criarUsuario(prisma, { nome: "Outro", email: "fulano@cg.pb.gov.br", senhaInicial: SENHA_INI, criadoPor: ADMIN })
    ).rejects.toThrow(/EMAIL JÁ CADASTRADO/);

    await expect(
      criarUsuario(prisma, { nome: "Curto", email: "curto@cg.pb.gov.br", senhaInicial: "curta", criadoPor: ADMIN })
    ).rejects.toThrow(/SENHA CURTA|12 caracteres/i);
    // A recusa da senha curta não deixou usuário órfão.
    expect(await prisma.usuario.findUnique({ where: { identificador: "curto@cg.pb.gov.br" } })).toBeNull();
  });

  it("t3: conceder/revogar perfil — idempotência é ERRO nomeado, não silêncio", async () => {
    const exec = await perfilExecucaoId();
    const ctrl = await perfilControleId();
    const { usuarioId } = await criarUsuario(prisma, { nome: "F", email: "f@cg.pb.gov.br", senhaInicial: SENHA_INI, perfilId: exec, criadoPor: ADMIN });

    // Concede um segundo perfil — ok.
    await concederPerfil(prisma, { usuarioId, perfilId: ctrl, criadoPor: ADMIN });
    expect(await prisma.vinculoUsuarioPerfil.count({ where: { usuarioId } })).toBe(2);

    // Conceder o já-concedido → erro.
    await expect(concederPerfil(prisma, { usuarioId, perfilId: ctrl, criadoPor: ADMIN })).rejects.toThrow(/JÁ CONCEDIDO/);

    // Revoga o CONTROLE — ok (DELETE do vínculo).
    await revogarPerfil(prisma, { usuarioId, perfilId: ctrl, criadoPor: ADMIN });
    expect(await prisma.vinculoUsuarioPerfil.count({ where: { usuarioId } })).toBe(1);

    // Revogar o que não tem mais → erro.
    await expect(revogarPerfil(prisma, { usuarioId, perfilId: ctrl, criadoPor: ADMIN })).rejects.toThrow(/NÃO CONCEDIDO/);
  });

  it("t4: inativar — revoga TODAS as sessões do alvo (o token dele deixa de validar) e não se inativa a si mesmo", async () => {
    const { usuarioId } = await criarUsuario(prisma, { nome: "Alvo", email: "alvo@cg.pb.gov.br", senhaInicial: SENHA_INI, criadoPor: ADMIN });

    // O alvo entra (token vivo) e o admin entra (token vivo).
    const sAlvo = await autenticar(prisma, { identificador: "alvo@cg.pb.gov.br", senha: SENHA_INI });
    await expect(validarSessao(prisma, sAlvo.token)).resolves.toMatchObject({ identificador: "alvo@cg.pb.gov.br" });

    const { sessoesRevogadas } = await inativarUsuario(prisma, { usuarioId, criadoPor: ADMIN });
    expect(sessoesRevogadas).toBe(1);
    // ⚠️ A PROVA: o token do alvo NÃO valida mais.
    await expect(validarSessao(prisma, sAlvo.token)).rejects.toThrow(/REVOGADA|INATIVO/);

    // Inativar de novo → erro nomeado.
    await expect(inativarUsuario(prisma, { usuarioId, criadoPor: ADMIN })).rejects.toThrow(/JÁ INATIVO/);

    // Auto-inativação: o ADMIN tentando inativar a si mesmo → recusado.
    const adminId = (await prisma.usuario.findUniqueOrThrow({ where: { identificador: ADMIN }, select: { id: true } })).id;
    await expect(inativarUsuario(prisma, { usuarioId: adminId, criadoPor: ADMIN })).rejects.toThrow(/AUTO-INATIVAÇÃO/);

    // Reativar → ok; ativar o já-ativo → erro.
    await ativarUsuario(prisma, { usuarioId, criadoPor: ADMIN });
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId }, select: { ativo: true } })).ativo).toBe(true);
    await expect(ativarUsuario(prisma, { usuarioId, criadoPor: ADMIN })).rejects.toThrow(/JÁ ATIVO/);
  });

  it("t5: resetarSenha — derruba as sessões do ALVO, NÃO as do admin; a senha nova autentica", async () => {
    // O admin ganha senha e uma sessão VIVA — é ela que tem de sobreviver ao reset do alvo.
    const adminId = (await prisma.usuario.findUniqueOrThrow({ where: { identificador: ADMIN }, select: { id: true } })).id;
    await definirSenha(prisma, { usuarioId: adminId, senha: "SenhaDoAdmin#2026", criadoPor: "TESTE" });
    const sAdmin = await autenticar(prisma, { identificador: ADMIN, senha: "SenhaDoAdmin#2026" });

    const { usuarioId } = await criarUsuario(prisma, { nome: "Alvo", email: "alvo@cg.pb.gov.br", senhaInicial: SENHA_INI, criadoPor: ADMIN });
    const sAlvo = await autenticar(prisma, { identificador: "alvo@cg.pb.gov.br", senha: SENHA_INI });

    const { sessoesRevogadas } = await resetarSenha(prisma, { usuarioId, senhaTemporaria: SENHA_NOVA, criadoPor: ADMIN });
    expect(sessoesRevogadas).toBe(1); // só a do alvo

    // O token do ALVO morreu; o do ADMIN segue VIVO — o reset não derruba quem administra.
    await expect(validarSessao(prisma, sAlvo.token)).rejects.toThrow(/REVOGADA/);
    await expect(validarSessao(prisma, sAdmin.token)).resolves.toMatchObject({ identificador: ADMIN });

    // A senha antiga do alvo não vale mais; a nova, sim.
    await expect(autenticar(prisma, { identificador: "alvo@cg.pb.gov.br", senha: SENHA_INI })).rejects.toThrow();
    const reentrada = await autenticar(prisma, { identificador: "alvo@cg.pb.gov.br", senha: SENHA_NOVA });
    expect(reentrada.token.length).toBeGreaterThan(0);
  });
});
