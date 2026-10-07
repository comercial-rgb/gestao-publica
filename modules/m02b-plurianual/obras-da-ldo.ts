import { z } from "zod";
import { emProsa, zMoney } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";

/**
 * V36 — AS OBRAS PREVISTAS NA LDO (TR 5.9.2.16). LRF art. 45: a LOA só inclui projeto novo depois de atendidos os em
 * andamento e contempladas as despesas de conservação do patrimônio, nos termos da LDO. Cada linha é uma obra com a
 * entidade responsável (o órgão), a descrição, a data de início e os quatro valores que o TR pede. O demonstrativo
 * (TR 5.9.2.17) é o anexo `obras-e-conservacao` da LDO (`anexos/ldo.ts`).
 *
 * Ato do ENTE sob CADASTRAR_LDO: a obra prevista é parte da peça que o setor da LDO digita.
 */

const zValor = zMoney.refine((v) => v.greaterThanOrEqualTo(0), { message: "Valor não pode ser negativo." });

const zObraPrevista = z
  .object({
    ldoId: z.string().min(1),
    orgaoId: z.string().min(1, "Informe a entidade responsável pela obra."),
    obraId: z.string().min(1).optional(),
    descricao: z.string().trim().min(3, "Descreva a obra."),
    dataInicio: z.date(),
    valorPrevisto: zValor,
    valorConservacao: zValor,
    valorNovosProjetos: zValor,
    valorNoExercicio: zValor,
    criadoPor: z.string().min(1),
  })
  .superRefine((v, ctx) => {
    if (v.valorNoExercicio.greaterThan(v.valorPrevisto)) {
      ctx.addIssue({
        code: "custom",
        path: ["valorNoExercicio"],
        message: `O valor no exercício da LDO (R$ ${emProsa(v.valorNoExercicio.toFixed(2))}) excede o valor previsto da obra (R$ ${emProsa(v.valorPrevisto.toFixed(2))}).`,
      });
    }
  });

export async function criarObraPrevistaLdo(prisma: PrismaClient, input: z.input<typeof zObraPrevista>): Promise<{ readonly obraPrevistaId: string }> {
  const d = zObraPrevista.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.criarObraPrevistaLdo, "ENTE");
    const [ldo, orgao, obra] = await Promise.all([
      tx.leiDiretrizesOrcamentarias.findUnique({ where: { id: d.ldoId }, select: { id: true } }),
      tx.orgao.findUnique({ where: { id: d.orgaoId }, select: { id: true } }),
      d.obraId === undefined ? Promise.resolve({ id: "" }) : tx.obra.findUnique({ where: { id: d.obraId }, select: { id: true } }),
    ]);
    if (ldo === null) throw new Error(`LDO ${d.ldoId} não existe.`);
    if (orgao === null) throw new Error("A entidade responsável não existe. Nada foi gravado.");
    if (obra === null) throw new Error("A obra cadastrada escolhida não existe. Nada foi gravado.");
    const o = await tx.obraPrevistaLdo.create({
      data: {
        ldoId: d.ldoId,
        orgaoId: d.orgaoId,
        ...(d.obraId !== undefined ? { obraId: d.obraId } : {}),
        descricao: d.descricao,
        dataInicio: d.dataInicio,
        valorPrevisto: d.valorPrevisto.toFixed(2),
        valorConservacao: d.valorConservacao.toFixed(2),
        valorNovosProjetos: d.valorNovosProjetos.toFixed(2),
        valorNoExercicio: d.valorNoExercicio.toFixed(2),
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { obraPrevistaId: o.id };
  });
}
