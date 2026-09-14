import { z } from "zod";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import type { Tx } from "../m16-travamento/autorizacao.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { diaCivil, diaCivilBr } from "../../packages/datas/index.js";
import { pessoaDoUsuario } from "../m16-travamento/servico-pessoa-do-usuario.js";

/**
 * ═══ M19 — A REPRESENTAÇÃO DE PESSOA (V6.2 U2 — P3) ═══
 *
 * Quem age em nome de uma pessoa jurídica (o fornecedor que complementa documentos, o contador que
 * acompanha um pedido) só o faz por uma REPRESENTAÇÃO explícita: a conta de uma pessoa física, a
 * pessoa representada, o documento que fundamenta e a vigência. CNPJ digitado não autentica ninguém.
 *
 * ⚠️ A CONTA TEM DE SER A PESSOA. A representação liga um USUÁRIO ao representado, e o usuário tem de
 * estar vinculado (vínculo explícito do M16) a uma pessoa FÍSICA. Senão o pedido sairia assinado por
 * uma conta que o cadastro não sabe de quem é.
 *
 * ⚠️ REVOGAR É FATO, E VALE PARA O QUE VEM DEPOIS. O que foi protocolado sob a representação continua
 * com lastro (a solicitação grava qual representação usou); consultas, downloads e respostas NOVAS
 * param no dia do efeito — a vigência é derivada a cada pergunta, pelo dia civil do ente.
 */

export interface VigenciaDeRepresentacao {
  readonly vigenciaInicio: Date;
  readonly vigenciaFim: Date | null;
  readonly revogacao: { readonly dataEfeito: Date } | null;
}

/** A representação valia naquele dia? Derivação, nunca coluna. */
export function representacaoVigenteEm(r: VigenciaDeRepresentacao, quando: Date): boolean {
  const dia = diaCivil(quando);
  if (diaCivil(r.vigenciaInicio) > dia) return false;
  if (r.vigenciaFim !== null && diaCivil(r.vigenciaFim) < dia) return false;
  if (r.revogacao !== null && diaCivil(r.revogacao.dataEfeito) <= dia) return false;
  return true;
}

export const zRegistrarRepresentacao = z
  .object({
    representadaId: z.string().min(1),
    representanteUsuario: z.string().trim().min(1),
    fundamento: z.string().trim().min(5, "o documento que fundamenta a representação é obrigatório"),
    vigenciaInicio: z.coerce.date(),
    vigenciaFim: z.coerce.date().optional(),
    criadoPor: z.string().min(1),
  })
  .refine((d) => d.vigenciaFim === undefined || d.vigenciaFim >= d.vigenciaInicio, { message: "o fim da vigência não pode ser anterior ao início" });
export type RegistrarRepresentacaoInput = z.input<typeof zRegistrarRepresentacao>;

export async function registrarRepresentacao(prisma: PrismaClient, input: RegistrarRepresentacaoInput): Promise<{ readonly representacaoId: string }> {
  const d = zRegistrarRepresentacao.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarRepresentacao, "ENTE");
    const representada = await tx.pessoa.findUnique({ where: { id: d.representadaId }, select: { id: true, tipo: true, documento: true } });
    if (representada === null) throw new Error(`Pessoa ${d.representadaId} não existe no cadastro. Nada foi gravado.`);
    const usuario = await tx.usuario.findUnique({ where: { identificador: d.representanteUsuario }, select: { id: true, ativo: true } });
    if (usuario === null || !usuario.ativo) throw new Error(`REPRESENTANTE-SEM-CONTA-ATIVA: a conta ${d.representanteUsuario} não existe ou está desativada. Nada foi gravado.`);
    const pessoa = await pessoaDoUsuario(tx, d.representanteUsuario);
    if (pessoa === null) {
      throw new Error(`REPRESENTANTE-SEM-PESSOA: a conta ${d.representanteUsuario} não está vinculada a uma pessoa do cadastro. A representação sairia assinada por uma conta que o cadastro não sabe de quem é. Vincule antes. Nada foi gravado.`);
    }
    const tipoDoRepresentante = await tx.pessoa.findUnique({ where: { id: pessoa.pessoaId }, select: { tipo: true } });
    if (tipoDoRepresentante?.tipo !== "FISICA") throw new Error("REPRESENTANTE-NAO-E-PESSOA-FISICA: quem representa é gente, com CPF. Nada foi gravado.");
    if (pessoa.pessoaId === representada.id) throw new Error("REPRESENTACAO-DE-SI-MESMO: a pessoa já age por si. Nada foi gravado.");
    const r = await tx.representacaoDePessoa.create({
      data: { representadaId: d.representadaId, representanteUsuarioId: usuario.id, fundamento: d.fundamento, vigenciaInicio: d.vigenciaInicio, vigenciaFim: d.vigenciaFim ?? null, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { representacaoId: r.id };
  });
}

export const zRevogarRepresentacao = z.object({
  representacaoId: z.string().min(1),
  dataEfeito: z.coerce.date(),
  motivo: z.string().trim().min(5),
  criadoPor: z.string().min(1),
});
export type RevogarRepresentacaoInput = z.input<typeof zRevogarRepresentacao>;

export async function revogarRepresentacao(prisma: PrismaClient, input: RevogarRepresentacaoInput): Promise<{ readonly revogacaoId: string }> {
  const d = zRevogarRepresentacao.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.revogarRepresentacao, "ENTE");
    const r = await tx.representacaoDePessoa.findUnique({ where: { id: d.representacaoId }, select: { vigenciaInicio: true, revogacao: { select: { dataEfeito: true } } } });
    if (r === null) throw new Error(`Representação ${d.representacaoId} não existe. Nada foi gravado.`);
    if (r.revogacao !== null) throw new Error(`REPRESENTACAO-JA-REVOGADA: com efeito em ${diaCivilBr(r.revogacao.dataEfeito)}. Nada foi gravado.`);
    if (diaCivil(d.dataEfeito) < diaCivil(r.vigenciaInicio)) throw new Error("REVOGACAO-ANTES-DO-INICIO: o efeito não pode ser anterior ao início da representação. Nada foi gravado.");
    const rev = await tx.revogacaoDeRepresentacao.create({ data: { representacaoId: d.representacaoId, dataEfeito: d.dataEfeito, motivo: d.motivo, criadoPor: d.criadoPor }, select: { id: true } });
    return { revogacaoId: rev.id };
  });
}

/** As representações que a conta exerce HOJE (ou no dia pedido), com a pessoa representada. */
export async function representacoesVigentesDoUsuario(tx: Tx, usuarioIdentificador: string, quando: Date = new Date()): Promise<readonly { readonly id: string; readonly representadaId: string; readonly representada: string; readonly documento: string; readonly fundamento: string }[]> {
  const rs = await tx.representacaoDePessoa.findMany({
    where: { representanteUsuario: { identificador: usuarioIdentificador, ativo: true } },
    select: { id: true, representadaId: true, fundamento: true, vigenciaInicio: true, vigenciaFim: true, revogacao: { select: { dataEfeito: true } }, representada: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } } },
  });
  return rs
    .filter((r) => representacaoVigenteEm(r, quando))
    .map((r) => ({ id: r.id, representadaId: r.representadaId, representada: r.representada.versoes[0]?.nome ?? r.representada.documento, documento: r.representada.documento, fundamento: r.fundamento }));
}
