import { z } from "zod";
import { toMoney, type Money, type Percentual } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { suplementacaoLiquida } from "./adapter-prisma.js";

/**
 * V35 — O LIMITE PERCENTUAL DE SUPLEMENTAÇÃO DA LOA (Lei 4.320, art. 7º, I).
 *
 * A LOA autoriza o Executivo a abrir créditos suplementares por decreto até um percentual da despesa fixada (em
 * Esperança, Lei 613/2025, art. 5º, II: 50%). O sistema já conferia o teto EM REAIS de cada lei de crédito
 * (`valorAutorizado`); o percentual (`LeiCredito.percentualLimite`) era gravado e nunca lido. Agora:
 *
 *   limite     = percentualLimite × Σ DOTACAO_INICIAL das fichas do exercício do decreto (a despesa fixada na LOA)
 *   consumido  = suplementação LÍQUIDA (a mesma `suplementacaoLiquida` do teto em reais) dos decretos desta lei,
 *                fora as fichas de fonte que a própria LOA exclui do limite (art. 5º, § 2º em Esperança)
 *   recusa     quando consumido + o suplementado agora (fora as fontes excluídas) > limite
 *
 * As fontes excluídas são DECLARAÇÃO DO ENTE, com fundamento, por exercício (`FonteForaDoLimiteDeSuplementacao`).
 * Fonte não declarada conta no limite. LOA sem dotação inicial lançada no exercício: recusa — não há base.
 * Só vale para lei de crédito SUPLEMENTAR com percentual: especial e extraordinário têm lei própria (art. 41).
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export const zDeclararFonteForaDoLimite = z.object({
  exercicio: z.number().int().min(2000).max(2100),
  fonteCodigo: z.string().trim().min(1),
  fundamento: z.string().trim().min(10, "Diga o dispositivo da LOA e a origem do recurso."),
  criadoPor: z.string().min(1),
});

export async function declararFonteForaDoLimiteDeSuplementacao(
  prisma: PrismaClient,
  input: z.input<typeof zDeclararFonteForaDoLimite>
): Promise<{ readonly id: string; readonly jaDeclarada: boolean }> {
  const d = zDeclararFonteForaDoLimite.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.declararFonteForaDoLimiteDeSuplementacao, "ENTE");
    const fonte = await tx.fonteRecurso.findFirst({ where: { codigo: d.fonteCodigo }, select: { id: true } });
    if (fonte === null) throw new Error(`Fonte ${d.fonteCodigo} não cadastrada. Nada foi gravado.`);
    const ja = await tx.fonteForaDoLimiteDeSuplementacao.findUnique({
      where: { exercicio_fonteId: { exercicio: d.exercicio, fonteId: fonte.id } },
      select: { id: true },
    });
    if (ja !== null) return { id: ja.id, jaDeclarada: true };
    const c = await tx.fonteForaDoLimiteDeSuplementacao.create({
      data: { exercicio: d.exercicio, fonteId: fonte.id, fundamento: d.fundamento, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { id: c.id, jaDeclarada: false };
  });
}

export interface ItemNovoNoLimite {
  readonly fonteId: string;
  readonly tipo: string;
  readonly valor: Money;
}

export interface SituacaoDoLimite {
  readonly despesaFixada: Money;
  readonly limite: Money;
  readonly consumido: Money;
}

/** A despesa fixada, o limite e o já consumido de uma lei com percentual — a mesma leitura que o guard usa. */
export async function situacaoDoLimiteDaLoa(
  tx: Tx,
  p: { readonly leiId: string; readonly exercicio: number; readonly percentual: Percentual }
): Promise<SituacaoDoLimite> {
  const fixada = await tx.movimentoDotacao.aggregate({
    where: { tipo: "DOTACAO_INICIAL", ficha: { exercicio: p.exercicio } },
    _sum: { valor: true },
  });
  const despesaFixada = toMoney(fixada._sum.valor?.toFixed(2) ?? "0.00");
  const excluidas = new Set(
    (await tx.fonteForaDoLimiteDeSuplementacao.findMany({ where: { exercicio: p.exercicio }, select: { fonteId: true } })).map((f) => f.fonteId)
  );
  const itens = await tx.itemCredito.findMany({
    where: { decreto: { leiId: p.leiId } },
    select: { id: true, tipo: true, valor: true, estornoDeId: true, ficha: { select: { fonteId: true } } },
  });
  // O estorno herda a fonte do item que estorna (mesma ficha): filtrar pela ficha mantém o par junto.
  const consumido = suplementacaoLiquida(itens.filter((i) => !excluidas.has(i.ficha.fonteId)));
  const limite = toMoney(despesaFixada.times(p.percentual).dividedBy(100));
  return { despesaFixada, limite, consumido };
}

/** O guard. Chamado dentro da transação do `executarCredito`, depois das fichas travadas. */
export async function conferirLimiteDaLoa(
  tx: Tx,
  p: { readonly leiId: string; readonly leiNumero: string; readonly exercicio: number; readonly percentual: Percentual; readonly itens: readonly ItemNovoNoLimite[] }
): Promise<void> {
  const s = await situacaoDoLimiteDaLoa(tx, p);
  if (s.despesaFixada.isZero()) {
    throw new Error(
      `LIMITE DA LOA: a lei ${p.leiNumero} autoriza suplementar ${p.percentual.toFixed(2)}% da despesa fixada, e o exercício ` +
        `${String(p.exercicio)} não tem dotação inicial lançada. Sem a base não há limite a conferir; carregue a LOA primeiro.`
    );
  }
  const excluidas = new Set(
    (await tx.fonteForaDoLimiteDeSuplementacao.findMany({ where: { exercicio: p.exercicio }, select: { fonteId: true } })).map((f) => f.fonteId)
  );
  const agora = p.itens
    .filter((i) => i.tipo === "SUPLEMENTACAO" && !excluidas.has(i.fonteId))
    .reduce((acc, i) => toMoney(acc.plus(i.valor)), toMoney("0.00"));
  if (agora.isZero()) return;
  const restante = toMoney(s.limite.minus(s.consumido));
  if (agora.greaterThan(restante)) {
    throw new Error(
      `SUPLEMENTAÇÃO ACIMA DO LIMITE DA LOA: ${agora.toFixed(2)} excede o restante de ${restante.toFixed(2)} ` +
        `(${p.percentual.toFixed(2)}% de ${s.despesaFixada.toFixed(2)} fixados = ${s.limite.toFixed(2)}; já suplementado ` +
        `${s.consumido.toFixed(2)}, fora as fontes que a lei exclui do limite).`
    );
  }
}
