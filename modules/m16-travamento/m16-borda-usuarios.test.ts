import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { PERFIL_ADMIN, PERFIL_EXECUCAO } from "../../test/usuarios-teste.js";
import { ACOES_DE_ADMINISTRACAO } from "./acoes.js";
import { autenticar, definirSenha, validarSessao } from "./autenticacao.js";
import { comOperacaoRegistrada, criarRegistroDeOperacaoPrisma } from "./operacao.js";
import { criarUsuario, resetarSenha } from "./servico-usuarios.js";

/**
 * M16 — A SEPARAÇÃO DA ADMINISTRAÇÃO, FUNCIONANDO (7.14).
 *
 * O 4.55 foi quitado: `resetarSenha` cobra `RESETAR_SENHA` do censo. Este arquivo prova a
 * SEGREGAÇÃO — que quem executa despesa NÃO administra usuários por herança — e a exerce pela BORDA
 * (a mesma cadeia autenticar → validarSessao → comOperacaoRegistrada → serviço da 7.13).
 *
 * ⚠️ O ADMIN DO BOOTSTRAP É A EXCEÇÃO NOMEADA: o perfil de instalação (aqui, o `ADMIN` das fixtures,
 * que recebe `TODAS_AS_ACOES`) TEM as ações de administração — é o superusuário que instala o ente e
 * distribui os crachás. Todo perfil que NÃO seja ele recebe cada ação de administração átomo a
 * átomo, por concessão explícita. É isto que o t1 prova, e o que o `test/usuarios-teste.ts` garante
 * ao excluir a família ADMINISTRACAO do perfil de execução.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const ADMIN = "orcamento@cg.pb.gov.br"; // fixture com o perfil ADMIN (todas as ações)
const SENHA_ADMIN = "SenhaDoAdmin#2026";
const SENHA_EXEC = "SenhaDoExecutor#2026";
const SENHA_ALVO = "SenhaDoAlvo#2026";

async function comRegistro<T>(acao: string, criadoPor: string, ato: () => Promise<T>): Promise<T> {
  return comOperacaoRegistrada(criarRegistroDeOperacaoPrisma(prisma), { usuarioIdent: criadoPor, acao }, ato);
}

/** Cria um usuário vinculado a UM perfil (pelo nome) com senha — para autenticar na borda. */
async function usuarioComPerfil(email: string, nomePerfil: string, senha: string): Promise<string> {
  const perfil = await prisma.perfil.findFirstOrThrow({ where: { nome: nomePerfil }, select: { id: true } });
  const u = await prisma.usuario.create({ data: { identificador: email, nome: email, ativo: true, criadoPor: "TESTE" }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: "TESTE" } });
  await definirSenha(prisma, { usuarioId: u.id, senha, criadoPor: "TESTE" });
  return u.id;
}

describe("M16 — a separação da administração (não-herança + borda)", () => {
  beforeEach(async () => {
    await limparBanco(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1 (não-herança): o perfil de EXECUÇÃO não tem NENHUMA ação de administração; o ADMIN (bootstrap) tem TODAS", async () => {
    const exec = await prisma.perfil.findFirstOrThrow({ where: { nome: PERFIL_EXECUCAO }, select: { id: true } });
    const admin = await prisma.perfil.findFirstOrThrow({ where: { nome: PERFIL_ADMIN }, select: { id: true } });

    const acoesExec = new Set((await prisma.permissaoDePerfil.findMany({ where: { perfilId: exec.id }, select: { acao: true } })).map((p) => p.acao));
    for (const acao of ACOES_DE_ADMINISTRACAO) {
      expect(acoesExec.has(acao), `EXECUÇÃO não pode herdar ${acao}`).toBe(false);
    }

    // ⚠️ A EXCEÇÃO NOMEADA: o perfil de instalação tem TODAS as de administração — é ele que
    // distribui os crachás. Não é herança: é o superusuário, concedido no bootstrap.
    const acoesAdmin = new Set((await prisma.permissaoDePerfil.findMany({ where: { perfilId: admin.id }, select: { acao: true } })).map((p) => p.acao));
    for (const acao of ACOES_DE_ADMINISTRACAO) {
      expect(acoesAdmin.has(acao), `o ADMIN de instalação concede ${acao}`).toBe(true);
    }
  });

  it("t2 (a separação pela borda): o EXECUTOR tenta RESETAR_SENHA e é NEGADO nomeando; a operação fica auditada como FALHA", async () => {
    await usuarioComPerfil("executor@cg.pb.gov.br", PERFIL_EXECUCAO, SENHA_EXEC);
    const alvoId = await usuarioComPerfil("alvo@cg.pb.gov.br", PERFIL_EXECUCAO, SENHA_ALVO);

    // O executor entra (a IDENTIDADE existe e é válida)…
    const sessao = await autenticar(prisma, { identificador: "executor@cg.pb.gov.br", senha: SENHA_EXEC });
    const ident = (await validarSessao(prisma, sessao.token)).identificador;

    // …e mesmo assim NÃO PODE resetar senha alheia: o perfil de execução não concede a ação.
    await expect(
      comRegistro("RESETAR_SENHA", ident, () => resetarSenha(prisma, { usuarioId: alvoId, senhaTemporaria: "SenhaNova#2026", criadoPor: ident }))
    ).rejects.toThrow(/ACESSO NEGADO.*RESETAR_SENHA/);

    // A tentativa negada ficou auditada como NEGADO (não ERRO — a distinção que o controle filtra):
    // o TCE vê que ele TENTOU e foi barrado pela autorização.
    const op = await prisma.registroDeOperacao.findFirstOrThrow({ where: { acao: "RESETAR_SENHA", usuarioIdent: ident } });
    expect(op.resultado).toBe("NEGADO");
  });

  it("t3 (o admin consegue): reset autorizado — token do ALVO morre, o do ADMIN sobrevive, e fica auditado", async () => {
    // O admin de instalação ganha senha e uma sessão viva.
    const adminId = (await prisma.usuario.findUniqueOrThrow({ where: { identificador: ADMIN }, select: { id: true } })).id;
    await definirSenha(prisma, { usuarioId: adminId, senha: SENHA_ADMIN, criadoPor: "TESTE" });
    const sAdmin = await autenticar(prisma, { identificador: ADMIN, senha: SENHA_ADMIN });
    const identAdmin = (await validarSessao(prisma, sAdmin.token)).identificador;

    // O admin cria um alvo (também via ação autorizada) e o alvo entra.
    const { usuarioId: alvoId } = await comRegistro("CRIAR_USUARIO", identAdmin, () =>
      criarUsuario(prisma, { nome: "Alvo", email: "alvo@cg.pb.gov.br", senhaInicial: SENHA_ALVO, criadoPor: identAdmin })
    );
    const sAlvo = await autenticar(prisma, { identificador: "alvo@cg.pb.gov.br", senha: SENHA_ALVO });

    // O admin reseta a senha do alvo — autorizado.
    const { sessoesRevogadas } = await comRegistro("RESETAR_SENHA", identAdmin, () =>
      resetarSenha(prisma, { usuarioId: alvoId, senhaTemporaria: "SenhaResetada#2026", criadoPor: identAdmin })
    );
    expect(sessoesRevogadas).toBe(1);

    // A prova da 7.13, agora pela borda: o token do ALVO morre; o do ADMIN sobrevive.
    await expect(validarSessao(prisma, sAlvo.token)).rejects.toThrow(/REVOGADA/);
    await expect(validarSessao(prisma, sAdmin.token)).resolves.toMatchObject({ identificador: ADMIN });

    // Auditado como SUCESSO, com o autor certo.
    const op = await prisma.registroDeOperacao.findFirstOrThrow({ where: { acao: "RESETAR_SENHA", usuarioIdent: ADMIN } });
    expect(op.resultado).toBe("SUCESSO");
  });
});
