import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { toMoney } from "../../packages/contracts/index.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";

/**
 * V26 — A NORMA ORÇAMENTÁRIA NO BANCO DE LEGISLAÇÃO DO TCE-PB (ver `prisma/schema/m03-normas-no-tce.prisma`).
 *
 * O protocolo é o do TCE-PB, no formato 000000/00 com a barra e os zeros — conferido aqui; o sistema não o gera nem o
 * deduz do número da lei. Quando a norma é uma lei de crédito do cadastro, número, ano e tipo têm de bater com ela.
 */

export const zRegistrarNormaNoTce = z
  .object({
    tipo: z.enum(["LOA", "CREDITO_SUPLEMENTAR", "CREDITO_ESPECIAL", "TRANSPOSICAO"]),
    numero: z.string().trim().regex(/^\d{1,5}$/, "O número da lei vai ao Tribunal com até 5 dígitos (NNNNNAAAA)."),
    ano: z.number().int().min(2000).max(2100),
    dataPublicacao: z.coerce.date(),
    protocoloTce: z.string().trim().regex(/^\d{6}\/\d{2}$/, "O protocolo do TCE-PB tem o formato 000000/00, com a barra e os zeros à esquerda."),
    autorizacaoPercentual: z.boolean(),
    valor: z.string().trim().min(1),
    leiCreditoId: z.string().min(1).nullable(),
    fundamento: z.string().trim().min(10, "Diga de onde vêm o protocolo e a autorização (comprovante do TCE, artigo da lei)."),
    criadoPor: z.string().min(1),
  })
  .refine((d) => !(d.autorizacaoPercentual && toMoney(d.valor).greaterThan(100)), { message: "Percentual acima de 100.", path: ["valor"] });
export type RegistrarNormaNoTceInput = z.input<typeof zRegistrarNormaNoTce>;

const TIPO_DO_CREDITO: Readonly<Record<string, "CREDITO_SUPLEMENTAR" | "CREDITO_ESPECIAL" | null>> = {
  SUPLEMENTAR: "CREDITO_SUPLEMENTAR",
  ESPECIAL: "CREDITO_ESPECIAL",
  EXTRAORDINARIO: null,
};

export async function registrarNormaNoTce(prisma: PrismaClient, input: RegistrarNormaNoTceInput): Promise<{ readonly id: string }> {
  const d = zRegistrarNormaNoTce.parse(input);
  const valor = toMoney(d.valor);
  if (!valor.greaterThan(0)) throw new Error("A autorização (valor ou percentual) tem de ser maior que zero. Nada foi gravado.");
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarNormaNoTce, "ENTE");
    if (d.leiCreditoId !== null) {
      const lei = await tx.leiCredito.findUnique({ where: { id: d.leiCreditoId }, select: { numero: true, ano: true, tipoCredito: true } });
      if (lei === null) throw new Error("Lei de crédito não encontrada. Nada foi gravado.");
      if (lei.numero.replace(/\D/g, "") !== d.numero || lei.ano !== d.ano) {
        throw new Error(`A lei de crédito do cadastro é a ${lei.numero}/${lei.ano}, não a ${d.numero}/${d.ano}. Nada foi gravado.`);
      }
      if (TIPO_DO_CREDITO[lei.tipoCredito] !== d.tipo) {
        throw new Error(`A lei ${lei.numero}/${lei.ano} é de crédito ${lei.tipoCredito.toLowerCase()}; a norma não pode ser de outro tipo. Nada foi gravado.`);
      }
    }
    const ja = await tx.normaOrcamentariaNoTce.findFirst({ where: { ano: d.ano, numero: d.numero, tipo: d.tipo }, select: { protocoloTce: true } });
    if (ja !== null) throw new Error(`A lei ${d.numero}/${d.ano} já está registrada com o protocolo ${ja.protocoloTce}. Nada foi gravado.`);
    const c = await tx.normaOrcamentariaNoTce.create({
      data: {
        tipo: d.tipo,
        numero: d.numero,
        ano: d.ano,
        dataPublicacao: d.dataPublicacao,
        protocoloTce: d.protocoloTce,
        autorizacaoPercentual: d.autorizacaoPercentual,
        valor: valor.toFixed(2),
        leiCreditoId: d.leiCreditoId,
        fundamento: d.fundamento,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { id: c.id };
  });
}
