import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { diaCivil, diaCivilBr } from "../../packages/datas/index.js";
import { ugVigenteNoDia } from "../m01-core-contabil/unidade-gestora.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";

/**
 * V26 (ordem, item 2.2) — O CÓDIGO DE AGRUPAMENTO DA FOLHA DE CADA LIQUIDAÇÃO DE FOLHA, como o sistema de origem da
 * folha o informou (ver `prisma/schema/m33-agrupamento-da-folha.prisma`). Nada aqui gera código.
 */

/** MM + oito posições visíveis (sem espaço): o formato do identificador da remessa de pessoal. */
const FORMATO = /^(0[1-9]|1[0-2])[!-~]{8}$/;

export const zRegistrarAgrupamentoDaFolha = z.object({
  liquidacaoId: z.string().min(1),
  codigo: z.string().trim().regex(FORMATO, "O código de agrupamento da folha tem 10 posições: o mês (MM) e oito posições do sistema da folha."),
  ugId: z.string().min(1),
  competencia: z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Informe a competência da folha (AAAA-MM)."),
  sistemaDeOrigem: z.string().trim().min(3, "Informe o sistema que gerou a folha e o código."),
  fundamento: z.string().trim().min(10, "Diga de onde vem o código (remessa de pessoal, arquivo do sistema da folha)."),
  criadoPor: z.string().min(1),
});
export type RegistrarAgrupamentoDaFolhaInput = z.input<typeof zRegistrarAgrupamentoDaFolha>;

export async function registrarAgrupamentoDaFolha(prisma: PrismaClient, input: RegistrarAgrupamentoDaFolhaInput): Promise<{ readonly id: string }> {
  const d = zRegistrarAgrupamentoDaFolha.parse(input);
  if (d.codigo.slice(0, 2) !== d.competencia.slice(5, 7)) {
    throw new Error(`O código ${d.codigo} começa pelo mês ${d.codigo.slice(0, 2)}, e a competência da folha é ${d.competencia}. Nada foi gravado.`);
  }
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarAgrupamentoDaFolha, "ENTE");
    const l = await tx.liquidacao.findUnique({
      where: { id: d.liquidacaoId },
      select: {
        numero: true,
        data: true,
        estornoDeId: true,
        anulacaoParcialDeId: true,
        empenho: { select: { numero: true, ficha: { select: { exercicio: true } } } },
        liquidacaoDaFolha: { select: { empenhoDaFolha: { select: { apropriacao: { select: { folha: { select: { competencia: true } } } } } } } },
        agrupamentoDaFolha: { select: { codigo: true } },
      },
    });
    if (l === null) throw new Error("Liquidação não encontrada. Nada foi gravado.");
    if (l.estornoDeId !== null || l.anulacaoParcialDeId !== null) throw new Error("O código vai na liquidação, não na anulação dela. Nada foi gravado.");
    if (l.agrupamentoDaFolha !== null) throw new Error(`A liquidação ${l.numero} já tem o código ${l.agrupamentoDaFolha.codigo}: a relação é um para um. Nada foi gravado.`);
    const daFolha = l.liquidacaoDaFolha?.empenhoDaFolha.apropriacao.folha ?? null;
    if (daFolha !== null && daFolha.competencia !== d.competencia) {
      throw new Error(`A liquidação ${l.numero} é da folha de ${daFolha.competencia}, não de ${d.competencia}. Nada foi gravado.`);
    }
    const ug = await tx.unidadeGestora.findUnique({ where: { id: d.ugId }, select: { codigoTce: true, entidadeContabilId: true, vigenteDesde: true, encerramento: { select: { vigenteAte: true } } } });
    if (ug === null) throw new Error("Unidade gestora não encontrada. Nada foi gravado.");
    if (ug.entidadeContabilId === null) throw new Error(`A unidade gestora ${ug.codigoTce} é escriturada fora deste sistema; a liquidação é daqui. Nada foi gravado.`);
    if (!ugVigenteNoDia(ug, l.data)) throw new Error(`A unidade gestora ${ug.codigoTce} não está vigente em ${diaCivilBr(l.data)}, dia da liquidação. Nada foi gravado.`);
    const exercicio = l.empenho.ficha.exercicio;
    const ja = await tx.agrupamentoDaFolhaNaLiquidacao.findUnique({ where: { ugId_exercicio_codigo: { ugId: d.ugId, exercicio, codigo: d.codigo } }, select: { liquidacao: { select: { numero: true } } } });
    if (ja !== null) throw new Error(`O código ${d.codigo} já é da liquidação ${ja.liquidacao.numero} em ${exercicio}: a relação é um para um. Nada foi gravado.`);
    const c = await tx.agrupamentoDaFolhaNaLiquidacao.create({
      data: {
        liquidacaoId: d.liquidacaoId,
        codigo: d.codigo,
        ugId: d.ugId,
        exercicio,
        competencia: d.competencia,
        origem: daFolha !== null ? "FOLHA_DESTE_SISTEMA" : "FOLHA_DE_OUTRO_SISTEMA",
        sistemaDeOrigem: d.sistemaDeOrigem,
        fundamento: d.fundamento,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { id: c.id };
  });
}

/** As liquidações de folha deste sistema no mês civil que ainda não têm o código — a pendência que o §4.39 nomeia. */
export async function liquidacoesDeFolhaSemAgrupamento(prisma: PrismaClient, p: { readonly ano: number; readonly mes: number }): Promise<readonly { readonly liquidacaoId: string; readonly numero: string; readonly empenho: string; readonly competencia: string; readonly dia: string }[]> {
  const prefixo = `${String(p.ano)}-${String(p.mes).padStart(2, "0")}`;
  const inicio = new Date(Date.UTC(p.ano, p.mes - 1, 1));
  const fim = new Date(Date.UTC(p.ano, p.mes, 1, 6));
  const ls = await prisma.liquidacaoDaFolha.findMany({
    where: { liquidacao: { data: { gte: inicio, lt: fim }, agrupamentoDaFolha: null } },
    select: { liquidacao: { select: { id: true, numero: true, data: true, empenho: { select: { numero: true } } } }, empenhoDaFolha: { select: { apropriacao: { select: { folha: { select: { competencia: true } } } } } } },
  });
  return ls
    .filter((x) => diaCivil(x.liquidacao.data).startsWith(prefixo))
    .map((x) => ({ liquidacaoId: x.liquidacao.id, numero: x.liquidacao.numero, empenho: x.liquidacao.empenho.numero, competencia: x.empenhoDaFolha.apropriacao.folha.competencia, dia: diaCivilBr(x.liquidacao.data) }))
    .sort((a, b) => a.numero.localeCompare(b.numero));
}
