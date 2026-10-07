import { toMoney, type Money } from "../../packages/contracts/index.js";
import { somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
import { formatarMoeda } from "../../packages/contracts/moeda.js";
import { diaCivil, diaCivilBr } from "../../packages/datas/index.js";
import type { Tx } from "./adapter-prisma.js";

/**
 * V36 (TR 5.10.1.7) — O QUADRO DO EMPENHO REPARTIDO EM SUBEMPENHOS. Só leitura; quem decide com ele chama sob a trava
 * da ficha do empenho (a emissão e a anulação do subempenho, a liquidação, a anulação do empenho).
 *
 *   empenhado        = o líquido do empenho (o fato menos as anulações parciais vivas).
 *   efetivo do sub   = valor do subempenho − as anulações dele.
 *   liquidado do sub = o líquido das liquidações que o informam (cada uma com a família: parciais e estornos).
 *   saldo do sub     = efetivo − liquidado do sub.
 *   liquidado direto = o líquido das liquidações sem subempenho.
 *   livre            = empenhado − liquidado direto − Σ efetivo dos subs: o que ainda se reparte ou se liquida direto.
 *
 * O liquidado de um sub nunca passa do efetivo dele (a liquidação e a anulação do sub conferem), e por isso a soma
 * do comprometido (liquidado direto + Σ efetivo) cobre todo o liquidado do empenho.
 *
 * Arquivo à parte do serviço porque o adapter do M05 o usa nas guardas da liquidação e da anulação — e o serviço
 * importa o adapter (travarFichas).
 */

export interface SubempenhoNoQuadro {
  readonly id: string;
  readonly numero: number;
  readonly data: Date;
  readonly historico: string;
  readonly valor: Money;
  readonly anulado: Money;
  readonly efetivo: Money;
  readonly liquidado: Money;
  readonly saldo: Money;
}

export interface QuadroDoEmpenhoRepartido {
  readonly empenhado: Money;
  readonly liquidadoDireto: Money;
  readonly repartido: Money;
  readonly livre: Money;
  readonly subempenhos: readonly SubempenhoNoQuadro[];
}

type Linha = { readonly id: string; readonly valor: { toFixed(n: number): string }; readonly estornoDeId: string | null; readonly anulacaoParcialDeId: string | null };
const estornavel = (l: Linha) => ({ id: l.id, valor: toMoney(l.valor.toFixed(2)), estornoDeId: l.estornoDeId, anulacaoParcialDeId: l.anulacaoParcialDeId });

export async function quadroDoEmpenhoRepartido(tx: Tx, empenhoId: string): Promise<QuadroDoEmpenhoRepartido> {
  const [familiaDoEmpenho, liquidacoes, subs] = await Promise.all([
    // A família inteira do empenho (a mesma de `empenhadoLiquidoDoEmpenho`): o fato, as parciais, o estorno total e o estorno de cada parcial.
    tx.empenho.findMany({
      where: { OR: [{ id: empenhoId }, { anulacaoParcialDeId: empenhoId }, { estornoDeId: empenhoId }, { estornoDe: { anulacaoParcialDeId: empenhoId } }] },
      select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true },
    }),
    tx.liquidacao.findMany({ where: { empenhoId }, select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true, subempenhoId: true } }),
    tx.subempenho.findMany({
      where: { empenhoId },
      orderBy: { numero: "asc" },
      select: { id: true, numero: true, data: true, historico: true, valor: true, anulacoes: { select: { valor: true } } },
    }),
  ]);
  const empenhado = somaLiquidaEstornaveis(familiaDoEmpenho.map(estornavel));

  // Cada linha de liquidação pertence ao subempenho da liquidação ORIGINAL da família dela (a anulação não copia a coluna).
  const porId = new Map(liquidacoes.map((l) => [l.id, l]));
  const subDaLinha = (l: (typeof liquidacoes)[number]): string | null => {
    let atual: (typeof liquidacoes)[number] | undefined = l;
    for (let i = 0; i < 3 && atual !== undefined; i += 1) {
      const pai: string | null = atual.estornoDeId ?? atual.anulacaoParcialDeId;
      if (pai === null) return atual.subempenhoId;
      atual = porId.get(pai);
    }
    throw new Error("Há uma anulação de liquidação deste empenho sem a liquidação original: o saldo dos subempenhos não se calcula. Nada foi gravado.");
  };
  const grupos = new Map<string | null, Linha[]>();
  for (const l of liquidacoes) {
    const k = subDaLinha(l);
    grupos.set(k, [...(grupos.get(k) ?? []), l]);
  }
  const liquidadoDe = (k: string | null): Money => somaLiquidaEstornaveis((grupos.get(k) ?? []).map(estornavel));

  const subempenhos = subs.map((s): SubempenhoNoQuadro => {
    const valor = toMoney(s.valor.toFixed(2));
    const anulado = s.anulacoes.reduce((t, a) => toMoney(t.plus(a.valor.toFixed(2))), toMoney("0"));
    const efetivo = toMoney(valor.minus(anulado));
    const liquidado = liquidadoDe(s.id);
    return { id: s.id, numero: s.numero, data: s.data, historico: s.historico, valor, anulado, efetivo, liquidado, saldo: toMoney(efetivo.minus(liquidado)) };
  });
  const liquidadoDireto = liquidadoDe(null);
  const repartido = subempenhos.reduce((t, s) => toMoney(t.plus(s.efetivo)), toMoney("0"));
  return { empenhado, liquidadoDireto, repartido, livre: toMoney(empenhado.minus(liquidadoDireto).minus(repartido)), subempenhos };
}

/** "NE 123/2" — o número do empenho e o sequencial do subempenho. */
export function rotuloDoSubempenho(numeroDoEmpenho: string, numero: number): string {
  return `${numeroDoEmpenho}/${String(numero)}`;
}

/** O valor em reais para as mensagens (R$ 1.234,56). */
export const reais = (v: { toFixed(n: number): string }): string => `R$ ${formatarMoeda(v.toFixed(2)).texto}`;

/**
 * A guarda da LIQUIDAÇÃO, chamada pelo adapter do M05 dentro da transação dela, depois da trava da ficha e das
 * conferências do empenho (o limite do empenhado continua lá):
 *   - informado o subempenho: ele é deste empenho, a data não o antecede e o valor cabe no saldo dele;
 *   - sem subempenho, num empenho ESTIMATIVO repartido: o valor cabe no livre (o repartido está reservado aos subempenhos);
 *   - sem subempenho, num empenho GLOBAL com valor repartido: recusa. É a outra face da regra da emissão (o global
 *     liquidado direto não aceita subempenho): sem ela, subempenho → liquidação direta → novo subempenho recusado deixaria
 *     a ordem das operações decidir se a regra vale. O global se liquida OU direto OU pelos subempenhos.
 */
export function conferirSubempenhoDaLiquidacao(
  q: QuadroDoEmpenhoRepartido,
  p: { readonly numeroDoEmpenho: string; readonly tipo: string; readonly subempenhoId?: string | undefined; readonly valor: { greaterThan(v: unknown): boolean; toFixed(n: number): string }; readonly data: Date }
): void {
  if (p.subempenhoId === undefined) {
    if (p.tipo === "GLOBAL" && q.repartido.greaterThan(0)) {
      throw new Error(
        `O empenho global ${p.numeroDoEmpenho} está repartido em subempenhos (${reais(q.repartido)}): ele se liquida pelos subempenhos, informando ` +
          "na liquidação qual deles ela consome. Para liquidar direto, anule antes o saldo dos subempenhos. Nada foi gravado."
      );
    }
    if (q.subempenhos.length > 0 && p.valor.greaterThan(q.livre)) {
      throw new Error(
        `A liquidação de ${reais(p.valor)} direto no empenho ${p.numeroDoEmpenho} passa do saldo livre dele (${reais(q.livre)}): ` +
          `${reais(q.repartido)} estão repartidos em subempenhos. Na tela de liquidação, informe o subempenho que esta liquidação consome, ou anule o saldo do subempenho que não será usado. Nada foi gravado.`
      );
    }
    return;
  }
  const s = q.subempenhos.find((x) => x.id === p.subempenhoId);
  if (s === undefined) throw new Error(`O subempenho informado não é do empenho ${p.numeroDoEmpenho}. Nada foi gravado.`);
  const rotulo = rotuloDoSubempenho(p.numeroDoEmpenho, s.numero);
  if (diaCivil(p.data) < diaCivil(s.data)) {
    throw new Error(`A data da liquidação (${diaCivilBr(p.data)}) é anterior à do subempenho ${rotulo} (${diaCivilBr(s.data)}). Nada foi gravado.`);
  }
  if (p.valor.greaterThan(s.saldo)) {
    throw new Error(
      `A liquidação de ${reais(p.valor)} passa do saldo do subempenho ${rotulo}: valor ${reais(s.efetivo)}, já liquidado ${reais(s.liquidado)}, ` +
        `saldo ${reais(s.saldo)}. Nada foi gravado.`
    );
  }
}
