import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";

/**
 * V39-R3 (R3-017, V39-033) — A REFERÊNCIA EXTERNA DO EMPENHO.
 *
 * O empenho pode ter um identificador em outro sistema (o processo no sistema de compras, a requisição no da saúde, o
 * protocolo de outro órgão). A referência é DECLARADA: sistema de origem, identificador e o documento que a traz. Ela
 * não vira protocolo confirmado por estar escrita — a CONFERÊNCIA é fato à parte, de outra pessoa, que diz como conferiu
 * e se confirmou ou divergiu. A tela mostra sempre a condição ("declarada, não conferida" até haver conferência). Os
 * vínculos internos do empenho ficam como estão. Append-only; escopo: a ação na UG do empenho.
 */

const texto = (min: number, msg: string) => z.string().trim().min(min, msg);

export const zRegistrarReferenciaExterna = z.object({
  empenhoId: z.string().min(1),
  sistemaDeOrigem: texto(2, "Diga o sistema ou órgão de origem.").max(80, "O sistema de origem tem até 80 caracteres."),
  identificador: texto(1, "Informe o identificador no sistema de origem.").max(80, "O identificador tem até 80 caracteres."),
  documento: texto(3, "Diga o documento que traz a referência (ofício, despacho, tela impressa)."),
  observacao: z.string().trim().optional(),
  criadoPor: z.string().min(1),
});

export async function registrarReferenciaExterna(prisma: PrismaClient, input: z.input<typeof zRegistrarReferenciaExterna>): Promise<{ readonly id: string }> {
  const d = zRegistrarReferenciaExterna.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarReferenciaExterna, { empenho: d.empenhoId });
    const emp = await tx.empenho.findUnique({ where: { id: d.empenhoId }, select: { numero: true, estornoDeId: true } });
    if (emp === null) throw new Error("Empenho não encontrado. Nada foi gravado.");
    if (emp.estornoDeId !== null) throw new Error("A referência externa é do empenho, não da anulação dele. Nada foi gravado.");
    const ja = await tx.referenciaExternaDoEmpenho.findUnique({ where: { empenhoId_sistemaDeOrigem_identificador: { empenhoId: d.empenhoId, sistemaDeOrigem: d.sistemaDeOrigem, identificador: d.identificador } }, select: { id: true } });
    if (ja !== null) throw new Error(`O empenho ${emp.numero} já tem a referência ${d.identificador} de ${d.sistemaDeOrigem}. Nada foi gravado.`);
    return tx.referenciaExternaDoEmpenho.create({
      data: { empenhoId: d.empenhoId, sistemaDeOrigem: d.sistemaDeOrigem, identificador: d.identificador, documento: d.documento, observacao: d.observacao === "" ? null : (d.observacao ?? null), criadoPor: d.criadoPor },
      select: { id: true },
    });
  });
}

export const zConferirReferenciaExterna = z.object({
  referenciaId: z.string().min(1),
  resultado: z.enum(["CONFIRMADA", "DIVERGENTE"]),
  meio: texto(5, "Diga como conferiu (consulta ao sistema de origem, ofício de resposta, processo físico)."),
  observacao: z.string().trim().optional(),
  criadoPor: z.string().min(1),
}).refine((x) => x.resultado === "CONFIRMADA" || (x.observacao ?? "").length >= 5, { message: "Na divergência, diga o que não confere.", path: ["observacao"] });

export async function conferirReferenciaExterna(prisma: PrismaClient, input: z.input<typeof zConferirReferenciaExterna>): Promise<{ readonly id: string }> {
  const d = zConferirReferenciaExterna.parse(input);
  return prisma.$transaction(async (tx) => {
    const ref = await tx.referenciaExternaDoEmpenho.findUnique({ where: { id: d.referenciaId }, select: { empenhoId: true, identificador: true, criadoPor: true, conferencia: { select: { resultado: true } } } });
    if (ref === null) throw new Error("Referência não encontrada. Nada foi gravado.");
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.conferirReferenciaExterna, { empenho: ref.empenhoId });
    if (ref.criadoPor === d.criadoPor) throw new Error(`Quem declarou a referência ${ref.identificador} não a confere: a conferência é de outra pessoa. Nada foi gravado.`);
    if (ref.conferencia !== null) throw new Error(`A referência ${ref.identificador} já foi conferida (${ref.conferencia.resultado === "CONFIRMADA" ? "confirmada" : "divergente"}). Nada foi gravado.`);
    try {
      return await tx.conferenciaDaReferenciaExterna.create({ data: { referenciaId: d.referenciaId, resultado: d.resultado, meio: d.meio, observacao: d.observacao === "" ? null : (d.observacao ?? null), criadoPor: d.criadoPor }, select: { id: true } });
    } catch (e) {
      // duas conferências ao mesmo tempo: a segunda bate no único do banco e sai com o motivo
      if (e instanceof Error && /Unique constraint/i.test(e.message)) throw new Error(`A referência ${ref.identificador} já foi conferida. Nada foi gravado.`);
      throw e;
    }
  });
}
