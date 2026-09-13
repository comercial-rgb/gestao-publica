import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { normalizarDocumento, tipoDeDocumento } from "../../packages/documento/index.js";
import { z } from "zod";
import { ACAO_DO_SERVICO } from "./acoes.js";
import { autorizar, type Tx } from "./autorizacao.js";

/**
 * M16 — O USUÁRIO É UMA PESSOA DO CADASTRO? (orquestração V3, pacote 2)
 *
 * ═══ A PAREDE QUE ISTO DERRUBA ═══
 * Quem autentica é `Usuario` (identificador, perfis, credenciais); quem responde por um
 * bem é `Pessoa` (documento, versões, papéis). Nada ligava os dois — e por isso "visualizar
 * somente os bens sob a SUA responsabilidade" era inderivável (`USUARIO-SEM-PESSOA`).
 *
 * ═══ A DECISÃO, LETRA A LETRA DO PEDIDO ═══
 *   - EXPLÍCITA: o administrador vincula pelo DOCUMENTO (CPF/CNPJ) da pessoa. Nunca por
 *     semelhança de nome — dois "João da Silva" são duas pessoas, e um vínculo por nome
 *     entregaria os bens de um ao outro.
 *   - OPCIONAL: uma conta técnica de integração não representa pessoa física, e continua
 *     sem vínculo. Cadastros antigos sem vínculo ficam identificados como PENDENTES na
 *     tela de usuários — sem associação automática.
 *   - AUDITÁVEL: append-only. Cada vínculo e cada desvínculo é uma linha com autor e
 *     motivo; o vigente é a ÚLTIMA linha do usuário, se for VINCULO.
 *   - NÃO CONCEDE PERMISSÃO: nada aqui toca `PermissaoDePerfil`. O vínculo diz quem o
 *     usuário É; o que ele PODE continua sendo dos perfis. O teste afirma as duas coisas.
 *
 * ═══ UMA PESSOA, UM USUÁRIO ═══
 * A mesma pessoa não pode estar vinculada a dois usuários ao mesmo tempo: "meus bens" de
 * duas contas apontando para a mesma responsabilidade é a confusão que o termo de
 * responsabilidade existe para impedir. Trocar de conta é desvincular e vincular de novo.
 */

const zAtor = z.string().min(1);
const zMotivo = z.string().trim().min(5, "O motivo é obrigatório — quem auditar o vínculo precisa saber por que ele existe.");

export interface PessoaDoUsuario {
  readonly pessoaId: string;
  readonly documento: string;
  readonly nome: string;
  readonly vinculadaEm: Date;
  readonly vinculadaPor: string;
}

/** A pessoa vinculada ao usuário — ou `null` (sem vínculo, ou desvinculada). */
export async function pessoaDoUsuario(tx: Tx, identificador: string): Promise<PessoaDoUsuario | null> {
  const u = await tx.usuario.findUnique({ where: { identificador }, select: { id: true } });
  if (u === null) return null;
  const ultimo = await tx.vinculoUsuarioPessoa.findFirst({
    where: { usuarioId: u.id },
    orderBy: { criadoEm: "desc" },
    select: {
      tipo: true,
      criadoEm: true,
      criadoPor: true,
      pessoa: {
        select: {
          id: true,
          documento: true,
          versoes: { select: { nome: true }, orderBy: { criadoEm: "desc" }, take: 1 },
        },
      },
    },
  });
  if (ultimo === null || ultimo.tipo !== "VINCULO") return null;
  return {
    pessoaId: ultimo.pessoa.id,
    documento: ultimo.pessoa.documento,
    nome: ultimo.pessoa.versoes[0]?.nome ?? ultimo.pessoa.documento,
    vinculadaEm: ultimo.criadoEm,
    vinculadaPor: ultimo.criadoPor,
  };
}

async function vinculoVigenteDoUsuario(tx: Tx, usuarioId: string): Promise<{ readonly pessoaId: string } | null> {
  const ultimo = await tx.vinculoUsuarioPessoa.findFirst({
    where: { usuarioId },
    orderBy: { criadoEm: "desc" },
    select: { tipo: true, pessoaId: true },
  });
  return ultimo !== null && ultimo.tipo === "VINCULO" ? { pessoaId: ultimo.pessoaId } : null;
}

/** O usuário que hoje é esta pessoa — ou `null`. */
async function usuarioVinculadoAPessoa(tx: Tx, pessoaId: string): Promise<{ readonly usuarioId: string; readonly identificador: string } | null> {
  const linhas = await tx.vinculoUsuarioPessoa.findMany({
    where: { pessoaId },
    orderBy: { criadoEm: "desc" },
    select: { usuarioId: true, tipo: true, usuario: { select: { identificador: true } } },
  });
  const vistos = new Set<string>();
  for (const l of linhas) {
    if (vistos.has(l.usuarioId)) continue;
    vistos.add(l.usuarioId);
    // a última linha DESTE usuário decide se ele ainda é a pessoa
    if (l.tipo === "VINCULO") return { usuarioId: l.usuarioId, identificador: l.usuario.identificador };
  }
  return null;
}

export const zVincularPessoaAoUsuarioInput = z.object({
  usuarioId: z.string().min(1),
  /** O CPF da pessoa — com ou sem máscara. (CNPJ é recusado: não é identidade pessoal.) */
  documento: z.string().trim().min(1, "Informe o CPF ou CNPJ da pessoa."),
  motivo: zMotivo,
  criadoPor: zAtor,
});
export type VincularPessoaAoUsuarioInput = z.input<typeof zVincularPessoaAoUsuarioInput>;

export async function vincularPessoaAoUsuario(
  prisma: PrismaClient,
  input: VincularPessoaAoUsuarioInput
): Promise<{ readonly vinculoId: string; readonly pessoaId: string; readonly nome: string }> {
  const d = zVincularPessoaAoUsuarioInput.parse(input);
  await autorizar(prisma, d.criadoPor, ACAO_DO_SERVICO.vincularPessoaAoUsuario);

  const documento = normalizarDocumento(d.documento);
  const tipo = tipoDeDocumento(documento);
  if (tipo === "INVALIDO") {
    throw new Error(
      `DOCUMENTO ILEGÍVEL: "${d.documento}" não é um CPF (11 dígitos) nem um CNPJ (14 caracteres). O vínculo é ` +
        `pelo documento, e nunca pelo nome. Nada foi gravado.`
    );
  }
  // ⚠️ V4 (§7): um USUÁRIO é uma pessoa FÍSICA. CNPJ não é identidade pessoal — representar uma
  // organização é vínculo PRÓPRIO, com escopo (pendência REPRESENTACAO-DE-ORGANIZACAO-PELO-USUARIO).
  if (tipo === "CNPJ") {
    throw new Error(
      `CNPJ NÃO É IDENTIDADE PESSOAL: "${d.documento}" é uma pessoa jurídica, e um usuário é uma pessoa física. ` +
        `Um usuário se vincula ao SEU CPF; representar uma organização é um vínculo próprio, com escopo, que ainda ` +
        `não existe (pendência REPRESENTACAO-DE-ORGANIZACAO-PELO-USUARIO). Nada foi gravado.`
    );
  }

  return prisma.$transaction(async (tx) => {
    const usuario = await tx.usuario.findUnique({ where: { id: d.usuarioId }, select: { id: true, identificador: true } });
    if (usuario === null) throw new Error(`USUÁRIO INEXISTENTE: não há usuário com id "${d.usuarioId}". Nada foi gravado.`);

    const pessoa = await tx.pessoa.findUnique({
      where: { documento },
      select: { id: true, documento: true, versoes: { select: { nome: true }, orderBy: { criadoEm: "desc" }, take: 1 } },
    });
    if (pessoa === null) {
      throw new Error(
        `PESSOA NÃO CADASTRADA: não há pessoa com o documento ${documento} no cadastro. O vínculo ` +
          `não cria pessoa — cadastre-a em Cadastros > Pessoas e vincule depois. Nada foi gravado.`
      );
    }

    const atual = await vinculoVigenteDoUsuario(tx, usuario.id);
    if (atual !== null && atual.pessoaId === pessoa.id) {
      throw new Error(`JÁ VINCULADO: o usuário "${usuario.identificador}" já é a pessoa ${documento}. Nada foi gravado de novo.`);
    }
    if (atual !== null) {
      throw new Error(
        `USUÁRIO JÁ VINCULADO A OUTRA PESSOA: "${usuario.identificador}" está vinculado a outro ` +
          `documento. Desvincule primeiro, com motivo — trocar em silêncio esconderia a troca. Nada foi gravado.`
      );
    }
    const outro = await usuarioVinculadoAPessoa(tx, pessoa.id);
    if (outro !== null) {
      throw new Error(
        `PESSOA JÁ VINCULADA: o documento ${documento} já é o usuário "${outro.identificador}". Uma ` +
          `pessoa, um usuário — "meus bens" de duas contas apontando para a mesma responsabilidade ` +
          `é a confusão que o termo de responsabilidade existe para impedir. Nada foi gravado.`
      );
    }

    const v = await tx.vinculoUsuarioPessoa.create({
      data: { usuarioId: usuario.id, pessoaId: pessoa.id, tipo: "VINCULO", motivo: d.motivo, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { vinculoId: v.id, pessoaId: pessoa.id, nome: pessoa.versoes[0]?.nome ?? pessoa.documento };
  });
}

export const zDesvincularPessoaDoUsuarioInput = z.object({
  usuarioId: z.string().min(1),
  motivo: zMotivo,
  criadoPor: zAtor,
});
export type DesvincularPessoaDoUsuarioInput = z.input<typeof zDesvincularPessoaDoUsuarioInput>;

export async function desvincularPessoaDoUsuario(
  prisma: PrismaClient,
  input: DesvincularPessoaDoUsuarioInput
): Promise<{ readonly vinculoId: string }> {
  const d = zDesvincularPessoaDoUsuarioInput.parse(input);
  await autorizar(prisma, d.criadoPor, ACAO_DO_SERVICO.desvincularPessoaDoUsuario);

  return prisma.$transaction(async (tx) => {
    const usuario = await tx.usuario.findUnique({ where: { id: d.usuarioId }, select: { id: true, identificador: true } });
    if (usuario === null) throw new Error(`USUÁRIO INEXISTENTE: não há usuário com id "${d.usuarioId}". Nada foi gravado.`);
    const atual = await vinculoVigenteDoUsuario(tx, usuario.id);
    if (atual === null) {
      throw new Error(`SEM VÍNCULO: o usuário "${usuario.identificador}" não está vinculado a pessoa nenhuma — não há o que desfazer. Nada foi gravado.`);
    }
    const v = await tx.vinculoUsuarioPessoa.create({
      data: { usuarioId: usuario.id, pessoaId: atual.pessoaId, tipo: "DESVINCULO", motivo: d.motivo, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { vinculoId: v.id };
  });
}
