import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { CONTA_PREVISAO_DEDUCAO_FUNDEB, CONTA_PREVISAO_OUTRAS_DEDUCOES, CONTA_RECEITA_A_REALIZAR } from "../m01-core-contabil/roteiros.js";
import { lancarPrevisaoDaReceita } from "./previsao-no-razao.js";

/**
 * V26 — O DETALHE DE UMA LINHA DA RECEITA PREVISTA para a prestação de contas (SAGRES §4.7 e §4.44): o subtipo da dedução
 * na tabela §5.23 e o código como está no documento de origem. A linha publicada não muda; o detalhe a descreve.
 *
 * ⚠️ Nenhuma linha é inventada para cobrir os tipos da tabela: o detalhe só existe para a linha que a LOA traz.
 */

/** §5.23 TipoReceitaLancada — os subtipos de dedução (o 1 é o lançamento da receita; não há 2). */
export const DEDUCAO_SAGRES: Readonly<Record<"3" | "4" | "5", string>> = {
  "3": "Dedução de Receita do Fundeb",
  "4": "Dedução de Receita de Rendimentos de Investimentos",
  "5": "Outras Deduções de Receita",
};

export const zDetalharReceitaPrevista = z.object({
  receitaPrevistaId: z.string().min(1),
  tipoDeducaoSagres: z.enum(["3", "4", "5"]).nullable(),
  codigoNoDocumento: z.string().trim().max(40).nullable(),
  documento: z.string().trim().min(5, "Informe o documento de onde vem a linha (ex.: Lei 613/2025, Anexo II)."),
  criadoPor: z.string().min(1),
});
export type DetalharReceitaPrevistaInput = z.input<typeof zDetalharReceitaPrevista>;

export async function detalharReceitaPrevista(prisma: PrismaClient, input: DetalharReceitaPrevistaInput): Promise<{ readonly id: string }> {
  const d = zDetalharReceitaPrevista.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.detalharReceitaPrevista, "ENTE");
    const r = await tx.receitaPrevista.findUnique({ where: { id: d.receitaPrevistaId }, select: { tipoReceita: true, exercicio: true, valorPrevisto: true, naturezaReceita: { select: { codigo: true } }, detalhe: { select: { id: true } } } });
    if (r === null) throw new Error("Linha da receita prevista não encontrada. Nada foi gravado.");
    if (r.detalhe !== null) throw new Error("Esta linha já tem o detalhe registrado. Nada foi gravado.");
    if (r.tipoReceita === "DEDUCAO" && d.tipoDeducaoSagres === null) {
      throw new Error("A linha é uma dedução: diga qual (dedução para o Fundeb, de rendimentos de investimentos ou outra). Nada foi gravado.");
    }
    if (r.tipoReceita !== "DEDUCAO" && d.tipoDeducaoSagres !== null) {
      throw new Error("A linha não é uma dedução: ela não tem subtipo de dedução. Nada foi gravado.");
    }
    if (d.codigoNoDocumento !== null && !d.codigoNoDocumento.replace(/\D/g, "").startsWith(r.naturezaReceita.codigo)) {
      throw new Error(`O código do documento (${d.codigoNoDocumento}) não é desdobramento da natureza ${r.naturezaReceita.codigo} da linha. Nada foi gravado.`);
    }
    const c = await tx.detalheDaReceitaPrevista.create({
      data: { receitaPrevistaId: d.receitaPrevistaId, tipoDeducaoSagres: d.tipoDeducaoSagres, codigoNoDocumento: d.codigoNoDocumento, documento: d.documento, criadoPor: d.criadoPor },
      select: { id: true },
    });
    // V35 — a dedução prevista no razão: a conta depende do tipo, por isso o lançamento nasce aqui e não na linha.
    if (r.tipoReceita === "DEDUCAO" && r.valorPrevisto.greaterThan(0)) {
      await lancarPrevisaoDaReceita(tx, {
        receitaPrevistaId: d.receitaPrevistaId,
        exercicio: r.exercicio,
        valor: r.valorPrevisto.toFixed(2),
        debito: CONTA_RECEITA_A_REALIZAR,
        credito: d.tipoDeducaoSagres === "3" ? CONTA_PREVISAO_DEDUCAO_FUNDEB : CONTA_PREVISAO_OUTRAS_DEDUCOES,
        historico: `Previsão de dedução da receita ${r.naturezaReceita.codigo} (${d.tipoDeducaoSagres === "3" ? "FUNDEB" : "outras deduções"}, LOA ${String(r.exercicio)})`,
        autor: d.criadoPor,
      });
    }
    return { id: c.id };
  });
}
