import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { Tx } from "../m01-core-contabil/adapter-prisma.js";

/**
 * V26 — O IR DA FOLHA RETIDO NO PAGAMENTO.
 *
 * O IRRF do servidor é calculado no contracheque, mas calcular ou fechar a folha não comprova pagamento. Ele vira
 * receita do município (natureza do IR retido sobre o trabalho, decisão do ente) no PAGAMENTO que cobre aquele
 * contracheque: D pessoal a pagar (bruto) × C banco (líquido) × C crédito tributário (IR), com a guia por retenção na
 * mesma transação. A ligação folha → pagamento → retenção → receita fica em `IrDoContrachequeRetido`.
 *
 * ═══ QUAL PAGAMENTO RETÉM ═══
 * A liquidação da folha é por grupo de empenho: por servidor (o empenho de um vínculo) ou do grupo (todos os vínculos
 * com rubricas daquele grupo). O IR é do CONTRACHEQUE inteiro, não de uma rubrica, então ele é retido UMA vez, no
 * primeiro pagamento daquela folha que cobre o servidor. Anulado esse pagamento, o IR volta a ser retido no próximo.
 *
 * O cálculo usado é o do FECHAMENTO da folha — o mesmo que a apropriação empenhou.
 */

export interface IrDaFolhaPendente {
  readonly grupoDaFolhaId: string;
  readonly contracheques: readonly { readonly contrachequeId: string; readonly valor: Money }[];
  readonly total: Money;
}

/** As retenções de IR do contracheque ainda vivas (a retenção própria não foi estornada). */
async function contrachequesJaRetidos(db: Tx, ids: readonly string[]): Promise<ReadonlySet<string>> {
  if (ids.length === 0) return new Set();
  const vivos = await db.irDoContrachequeRetido.findMany({
    where: { contrachequeId: { in: [...ids] }, retencaoPropria: { estornos: { none: {} } } },
    select: { contrachequeId: true },
  });
  return new Set(vivos.map((v) => v.contrachequeId));
}

/**
 * V28 — QUAIS CONTRACHEQUES UMA LIQUIDAÇÃO DE FOLHA COBRE: os do vínculo (grupo por servidor) ou os que têm provento
 * de alguma rubrica do grupo (grupo único). É a MESMA pergunta para o IR e para os demais descontos, e por isso uma
 * resposta só — escrever a conta de novo noutro lugar é o defeito que o MODULO do M33 já pagou duas vezes.
 */
export function filtroDosContrachequesCobertos(
  calculoId: string,
  e: { readonly vinculoId: string | null; readonly grupo: { readonly porServidor: boolean; readonly rubricas: readonly { readonly rubricaId: string }[] } }
) {
  return {
    calculoId,
    ...(e.grupo.porServidor
      ? { vinculoId: e.vinculoId ?? "__nenhum__" }
      : { linhas: { some: { tipo: "PROVENTO" as const, rubricaId: { in: e.grupo.rubricas.map((r) => r.rubricaId) } } } }),
  };
}

/**
 * O IR dos contracheques que ESTA liquidação cobre e que ainda não foi retido. Nulo quando a liquidação não é de folha.
 */
export async function irDaFolhaPendente(db: Tx, liquidacaoId: string): Promise<IrDaFolhaPendente | null> {
  const ld = await db.liquidacaoDaFolha.findUnique({
    where: { liquidacaoId },
    select: {
      empenhoDaFolha: {
        select: {
          grupoId: true,
          vinculoId: true,
          grupo: { select: { porServidor: true, rubricas: { select: { rubricaId: true } } } },
          apropriacao: { select: { folha: { select: { fechamento: { select: { calculoId: true } } } } } },
        },
      },
    },
  });
  if (ld === null) return null;
  const e = ld.empenhoDaFolha;
  const calculoId = e.apropriacao.folha.fechamento?.calculoId;
  if (calculoId === undefined) {
    throw new Error("A folha desta liquidação não está fechada: o IR do servidor sai do cálculo do fechamento. Nada foi gravado.");
  }
  const contracheques = await db.contracheque.findMany({
    where: filtroDosContrachequesCobertos(calculoId, e),
    select: {
      id: true,
      linhas: { where: { tipo: "DESCONTO", rubrica: { natureza: "IMPOSTO_DE_RENDA" } }, select: { valor: true } },
    },
    orderBy: { id: "asc" },
  });
  const ja = await contrachequesJaRetidos(db, contracheques.map((c) => c.id));
  const linhas = contracheques
    .filter((c) => !ja.has(c.id))
    .map((c) => ({ contrachequeId: c.id, valor: c.linhas.reduce((s, l) => toMoney(s.plus(l.valor.toString())), toMoney("0.00")) }))
    .filter((l) => l.valor.greaterThan(0));
  const total = linhas.reduce((s, l) => toMoney(s.plus(l.valor)), toMoney("0.00"));
  return { grupoDaFolhaId: e.grupoId, contracheques: linhas, total };
}

/**
 * A CONFERÊNCIA NA GRAVAÇÃO: os contracheques que o pagamento diz reter ainda estão pendentes (outro pagamento da
 * mesma folha não os reteve entre o cálculo e aqui). Roda depois da trava do número da guia, que serializa toda
 * receita por retenção do exercício.
 */
export async function exigirIrDaFolhaAindaPendente(db: Tx, contrachequeIds: readonly string[]): Promise<void> {
  const ja = await contrachequesJaRetidos(db, contrachequeIds);
  if (ja.size > 0) {
    throw new Error(`O IR de ${ja.size} servidor(es) desta folha acabou de ser retido em outro pagamento. Refaça o pagamento: o valor a reter mudou. Nada foi gravado.`);
  }
}
