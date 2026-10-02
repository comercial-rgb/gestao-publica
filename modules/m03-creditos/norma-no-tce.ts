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
 *
 * V27 — a lei se registra (com o PDF) ANTES do comprovante do Tribunal: o protocolo é opcional no registro e chega depois
 * por `informarProtocoloDaNorma`, uma vez, como fato próprio. Sem ele, a lei fica nomeada na prévia da remessa.
 */

export const zRegistrarNormaNoTce = z
  .object({
    tipo: z.enum(["LOA", "CREDITO_SUPLEMENTAR", "CREDITO_ESPECIAL", "TRANSPOSICAO"]),
    numero: z.string().trim().regex(/^\d{1,5}$/, "O número da lei vai ao Tribunal com até 5 dígitos (NNNNNAAAA)."),
    ano: z.number().int().min(2000).max(2100),
    dataPublicacao: z.coerce.date(),
    protocoloTce: z
      .string()
      .trim()
      .transform((s) => (s === "" ? null : s))
      .pipe(z.string().regex(/^\d{6}\/\d{2}$/, "O protocolo do TCE-PB tem o formato 000000/00, com a barra e os zeros à esquerda.").nullable())
      .nullable()
      .optional()
      .transform((s) => s ?? null),
    autorizacaoPercentual: z.boolean(),
    valor: z.string().trim().min(1),
    leiCreditoId: z.string().min(1).nullable(),
    fundamento: z.string().trim().min(10, "Diga de onde vêm a lei e a autorização (o artigo da lei, a publicação; o comprovante do TCE, se já houver)."),
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
    const ja = await tx.normaOrcamentariaNoTce.findFirst({ where: { ano: d.ano, numero: d.numero, tipo: d.tipo }, select: { protocoloTce: true, protocolo: { select: { protocoloTce: true } } } });
    if (ja !== null) {
      const p = ja.protocoloTce ?? ja.protocolo?.protocoloTce ?? null;
      throw new Error(`A lei ${d.numero}/${d.ano} já está registrada${p === null ? ", sem o protocolo do Tribunal (informe-o na lista)" : ` com o protocolo ${p}`}. Nada foi gravado.`);
    }
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

/** O protocolo da norma: o do registro ou o informado depois. Nulo enquanto o comprovante do Tribunal não chega. */
export function protocoloDaNorma(n: { readonly protocoloTce: string | null; readonly protocolo?: { readonly protocoloTce: string } | null }): string | null {
  return n.protocoloTce ?? n.protocolo?.protocoloTce ?? null;
}

export const zInformarProtocoloDaNorma = z.object({
  normaId: z.string().min(1),
  protocoloTce: z.string().trim().regex(/^\d{6}\/\d{2}$/, "O protocolo do TCE-PB tem o formato 000000/00, com a barra e os zeros à esquerda."),
  fundamento: z.string().trim().min(10, "Diga de onde vem o protocolo (o comprovante de envio ao banco de legislação do Tribunal)."),
  criadoPor: z.string().min(1),
});

/** O protocolo que chegou depois do registro da lei. Uma vez: a norma que já tem protocolo recusa outro. */
export async function informarProtocoloDaNorma(prisma: PrismaClient, input: z.input<typeof zInformarProtocoloDaNorma>): Promise<void> {
  const d = zInformarProtocoloDaNorma.parse(input);
  await prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.informarProtocoloDaNorma, "ENTE");
    const n = await tx.normaOrcamentariaNoTce.findUnique({ where: { id: d.normaId }, select: { numero: true, ano: true, protocoloTce: true, protocolo: { select: { protocoloTce: true } } } });
    if (n === null) throw new Error("Lei não encontrada no cadastro de normas. Nada foi gravado.");
    const atual = protocoloDaNorma(n);
    if (atual !== null) throw new Error(`A lei ${n.numero}/${String(n.ano)} já tem o protocolo ${atual}. Nada foi gravado.`);
    await tx.protocoloDaNormaNoTce.create({ data: { normaId: d.normaId, protocoloTce: d.protocoloTce, fundamento: d.fundamento, criadoPor: d.criadoPor } });
  });
}
