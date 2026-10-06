import { toMoney, type Money } from "../../packages/contracts/index.js";
import { somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { valorAtualizadoDoContrato } from "./contratos.js";

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/**
 * V36 — A POSIÇÃO FINANCEIRA DA OBRA (TR 5.10.1.53): valor da obra, valor contratado, valor empenhado e percentual
 * executado. Leitura pura; cada número vem do seu dono.
 *
 *   valor da obra       → a planilha orçamentária VIGENTE (a de maior versão). Sem planilha, `null` — e a tela diz
 *                         que falta a planilha, não mostra zero;
 *   valor contratado    → Σ do valor ATUALIZADO (com aditivos e supressões, `valorAtualizadoDoContrato`) dos
 *                         contratos ligados à obra por medição, planilha ou empenho — cada contrato uma vez só;
 *   valor empenhado     → Σ LÍQUIDA dos empenhos da obra (a anulação copia o `obraId`, e por isso sai da soma);
 *   percentual executado → medido APROVADO ÷ valor contratado. A base é o contratado porque é sobre ele que a
 *                         medição se faz; sem contrato, `null` (dividir por zero não é zero por cento).
 */
export interface PosicaoFinanceiraDaObra {
  readonly valorDaObra: Money | null;
  readonly versaoDaPlanilha: number | null;
  readonly contratos: readonly { readonly id: string; readonly numero: string; readonly valorAtualizado: Money }[];
  readonly valorContratado: Money;
  readonly valorEmpenhado: Money;
  readonly medidoAprovado: Money;
  /** Percentual com duas casas ("37.50"), ou `null` sem valor contratado. */
  readonly percentualExecutado: string | null;
}

export async function posicaoFinanceiraDaObra(prisma: Tx, obraId: string): Promise<PosicaoFinanceiraDaObra> {
  const [planilha, medicoes, planilhas, empenhos] = await Promise.all([
    prisma.planilhaOrcamentariaDaObra.findFirst({ where: { obraId }, orderBy: { versao: "desc" }, select: { versao: true, valorTotal: true } }),
    prisma.medicaoDeObra.findMany({ where: { obraId }, select: { contratoId: true, valorMedido: true, aprovadaEm: true, aprovacao: { select: { id: true } } } }),
    prisma.planilhaOrcamentariaDaObra.findMany({ where: { obraId, contratoId: { not: null } }, select: { contratoId: true } }),
    prisma.empenho.findMany({ where: { obraId }, select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true, contratoId: true } }),
  ]);

  const ids = new Set<string>();
  for (const m of medicoes) ids.add(m.contratoId);
  for (const p of planilhas) if (p.contratoId !== null) ids.add(p.contratoId);
  for (const e of empenhos) if (e.contratoId !== null) ids.add(e.contratoId);
  const numeros = await prisma.contrato.findMany({ where: { id: { in: [...ids] } }, select: { id: true, numeroContrato: true }, orderBy: { numeroContrato: "asc" } });
  const contratos = [];
  for (const c of numeros) contratos.push({ id: c.id, numero: c.numeroContrato, valorAtualizado: await valorAtualizadoDoContrato(prisma, c.id) });

  const zero = toMoney("0.00");
  const valorContratado = contratos.reduce((a, c) => toMoney(a.plus(c.valorAtualizado)), zero);
  const medidoAprovado = medicoes
    .filter((m) => m.aprovadaEm !== null || m.aprovacao !== null)
    .reduce((a, m) => toMoney(a.plus(toMoney(m.valorMedido.toFixed(2)))), zero);
  const valorEmpenhado = somaLiquidaEstornaveis(
    empenhos.map((e) => ({ id: e.id, valor: toMoney(e.valor.toFixed(2)), estornoDeId: e.estornoDeId, anulacaoParcialDeId: e.anulacaoParcialDeId }))
  );

  return {
    valorDaObra: planilha === null ? null : toMoney(planilha.valorTotal.toFixed(2)),
    versaoDaPlanilha: planilha?.versao ?? null,
    contratos,
    valorContratado,
    valorEmpenhado,
    medidoAprovado,
    percentualExecutado: valorContratado.isZero() ? null : medidoAprovado.times(100).dividedBy(valorContratado).toFixed(2),
  };
}
