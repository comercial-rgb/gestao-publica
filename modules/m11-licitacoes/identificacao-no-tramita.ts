import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import type { Tx } from "../m01-core-contabil/adapter-prisma.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { MODALIDADES_DO_TRIBUNAL, MODALIDADES_PERMITIDAS } from "./modalidades-do-tribunal.js";

/**
 * V26 — A LICITAÇÃO COMO ESTÁ NO TRAMITA DO TCE-PB (ver `prisma/schema/m11-tramita.prisma`). O número é o de lá: o
 * operador o copia do cadastro do Tramita, com a UG e a modalidade. O sistema não gera nem deduz esse número.
 */

export const zIdentificarNoTramita = z.object({
  processoId: z.string().min(1),
  numeroNoTramita: z
    .string()
    .trim()
    .min(1, "Informe o número da licitação no Tramita.")
    .max(9, "O número da licitação no Tramita tem até 9 posições.")
    .refine((n) => /^[0-9A-Za-z/.-]+$/.test(n), "Use o número como cadastrado no Tramita, sem espaços."),
  codUnidadeGestora: z.string().trim().regex(/^\d{6}$/, "A unidade gestora do Tramita tem 6 dígitos."),
  modalidadeSagres: z.string().trim().refine((m) => m in MODALIDADES_DO_TRIBUNAL, "Escolha a modalidade da tabela do Tribunal."),
  fundamento: z.string().trim().min(10, "Diga de onde vem o número (consulta ao Tramita, comprovante de cadastro)."),
  criadoPor: z.string().min(1),
});
export type IdentificarNoTramitaInput = z.input<typeof zIdentificarNoTramita>;

export async function identificarNoTramita(prisma: PrismaClient, input: IdentificarNoTramitaInput): Promise<{ readonly id: string }> {
  const d = zIdentificarNoTramita.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.identificarNoTramita, "ENTE");
    const p = await tx.processoLicitatorio.findUnique({ where: { id: d.processoId }, select: { numeroProcesso: true, modalidade: true } });
    if (p === null) throw new Error("Processo licitatório não encontrado. Nada foi gravado.");
    const permitidas = MODALIDADES_PERMITIDAS[p.modalidade];
    if (!permitidas.includes(d.modalidadeSagres)) {
      throw new Error(
        `O processo ${p.numeroProcesso} é de ${p.modalidade.toLowerCase().replace(/_/g, " ")} pela Lei 14.133; a modalidade do Tribunal para ele é ` +
          `${permitidas.map((m) => `${m} (${MODALIDADES_DO_TRIBUNAL[m] ?? ""})`).join(" ou ")}, não ${d.modalidadeSagres}. Nada foi gravado.`
      );
    }
    const c = await tx.identificacaoNoTramita.create({
      data: { processoId: d.processoId, numeroNoTramita: d.numeroNoTramita, codUnidadeGestora: d.codUnidadeGestora, modalidadeSagres: d.modalidadeSagres, fundamento: d.fundamento, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { id: c.id };
  });
}

export interface LicitacaoNoTramita {
  readonly numeroNoTramita: string;
  readonly codUnidadeGestora: string;
  readonly modalidadeSagres: string;
}

/** A identificação vigente do processo (a de maior criadoEm), ou nula. */
export async function licitacaoNoTramita(db: Tx, processoId: string): Promise<LicitacaoNoTramita | null> {
  const v = await db.identificacaoNoTramita.findFirst({ where: { processoId }, orderBy: { criadoEm: "desc" }, select: { numeroNoTramita: true, codUnidadeGestora: true, modalidadeSagres: true } });
  return v;
}
