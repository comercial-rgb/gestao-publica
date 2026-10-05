import { randomUUID } from "node:crypto";
import { instanteCivil } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { lancarNoRazao } from "../m01-core-contabil/razao.js";

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/**
 * V35 — A PREVISÃO DA RECEITA NO RAZÃO (subsistema orçamentário), no instante de 1º de janeiro do exercício, como
 * a dotação inicial: pela data da digitação, a MSC de março mostraria a LOA "entrando" em março.
 *
 *   receita (bruta):  D 5.2.1.1.1.00.00 Previsão inicial da receita bruta   / C 6.2.1.1.0.00.00 Receita a realizar
 *   dedução prevista: D 6.2.1.1.0.00.00 Receita a realizar                  / C 5.2.1.1.2.xx    (-) Previsão de deduções
 *
 * Conta fora do plano ou sintética recusa com o motivo, e a transação de quem chama desfaz tudo.
 */
export async function lancarPrevisaoDaReceita(
  tx: Tx,
  p: {
    readonly receitaPrevistaId: string;
    readonly exercicio: number;
    readonly valor: string;
    readonly debito: string;
    readonly credito: string;
    readonly historico: string;
    readonly autor: string;
  }
): Promise<void> {
  const contas = await tx.contaPcasp.findMany({ where: { codigo: { in: [p.debito, p.credito] } }, select: { id: true, codigo: true, analitica: true } });
  const conta = (codigo: string): string => {
    const c = contas.find((x) => x.codigo === codigo);
    if (c === undefined) throw new Error(`A conta ${codigo} da previsão da receita não está no plano carregado. Nada foi gravado.`);
    if (!c.analitica) throw new Error(`A conta ${codigo} da previsão da receita é sintética no plano carregado e não recebe partida. Nada foi gravado.`);
    return c.id;
  };
  await lancarNoRazao(tx, {
    id: randomUUID(),
    numeroControle: `PREV-${String(p.exercicio)}-${p.receitaPrevistaId.slice(-8)}`,
    dataTransacao: instanteCivil(p.exercicio, 1, 1, 12),
    historico: p.historico,
    origemTipo: "PREVISAO_DA_RECEITA",
    origemId: p.receitaPrevistaId,
    criadoPor: p.autor,
    partidas: [
      { contaId: conta(p.debito), tipo: "DEBITO", subsistema: "ORCAMENTARIO", valor: p.valor },
      { contaId: conta(p.credito), tipo: "CREDITO", subsistema: "ORCAMENTARIO", valor: p.valor },
    ],
  });
}

/**
 * V35 — A REPREVISÃO DA RECEITA NO RAZÃO, datada no dia civil do ato. O ajuste com sinal escolhe a perna: aumento
 * D previsão adicional (reestimativa) / C receita a realizar; redução D receita a realizar / C anulação da previsão.
 */
export async function lancarReprevisaoDaReceita(
  tx: Tx,
  p: { readonly reprevisaoId: string; readonly data: Date; readonly ajuste: string; readonly historico: string; readonly autor: string; readonly contas: { readonly reestimativa: string; readonly anulacao: string; readonly aRealizar: string } }
): Promise<void> {
  const negativo = p.ajuste.startsWith("-");
  const valor = negativo ? p.ajuste.slice(1) : p.ajuste;
  const [debito, credito] = negativo ? [p.contas.aRealizar, p.contas.anulacao] : [p.contas.reestimativa, p.contas.aRealizar];
  const contas = await tx.contaPcasp.findMany({ where: { codigo: { in: [debito, credito] } }, select: { id: true, codigo: true, analitica: true } });
  const conta = (codigo: string): string => {
    const c = contas.find((x) => x.codigo === codigo);
    if (c === undefined) throw new Error(`A conta ${codigo} da reprevisão da receita não está no plano carregado. Nada foi gravado.`);
    if (!c.analitica) throw new Error(`A conta ${codigo} da reprevisão da receita é sintética no plano carregado e não recebe partida. Nada foi gravado.`);
    return c.id;
  };
  await lancarNoRazao(tx, {
    id: randomUUID(),
    numeroControle: `REPREV-${p.reprevisaoId.slice(-10)}`,
    dataTransacao: p.data,
    historico: p.historico,
    origemTipo: "REPREVISAO_DA_RECEITA",
    origemId: p.reprevisaoId,
    criadoPor: p.autor,
    partidas: [
      { contaId: conta(debito), tipo: "DEBITO", subsistema: "ORCAMENTARIO", valor },
      { contaId: conta(credito), tipo: "CREDITO", subsistema: "ORCAMENTARIO", valor },
    ],
  });
}
