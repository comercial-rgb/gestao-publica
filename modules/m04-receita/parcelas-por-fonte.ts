/**
 * QUANTO DE UMA GUIA É DE CADA FONTE — a regra de leitura da distribuição (V16/C30).
 *
 * ═══ ⚠️ POR QUE ESTE ARQUIVO É AVULSO, E O QUE ISSO CUSTA ═══
 * Sete leitores produzem número POR FONTE a partir da arrecadação: o arrecadado por fonte (que
 * alimenta o superávit financeiro do Anexo 14, e o superávit AUTORIZA crédito adicional), o
 * arrecadado por natureza × fonte, a DDR disponível por fonte (o número que impede empenhar
 * contra dinheiro que não existe), os ingressos do Balanço Financeiro, a `ReceitaOrcamentaria`
 * do SAGRES, o `COD_REC_VINC` do MANAD L200 e a lista da tela.
 *
 * Um deles mora no **M01** (`saldoDdrPorFonte`), e o M01 não importava módulo nenhum — ele é o
 * núcleo. A alternativa a esta aresta era escrever a regra duas vezes, e a segunda cópia estaria
 * justamente no leitor mais consequente do conjunto. Duas cópias de uma regra é a garantia de
 * que a terceira mudança esquece uma, e a esquecida mente em silêncio — foi assim que o buraco da
 * fonte da ficha nasceu (`m05/guard-fonte.ts`, que existe pelo mesmo motivo e é importado por
 * três módulos).
 *
 * ⚠️ POR ISSO ESTE ARQUIVO NÃO IMPORTA NADA ALÉM DE `packages/contracts`. Nenhum tipo do Prisma,
 * nenhum módulo, nada do M01 — logo **não há ciclo**, e a aresta é fina de verdade, não fina por
 * promessa. O lado da ESCRITA da distribuição (Zod, natureza da fonte, consolidação por natureza)
 * fica em `distribuicao.ts`, que pode importar o que precisar.
 *
 * ⚠️ E A REGRA É FAIL-CLOSED. Parcelas que não somam o total da guia não devolvem "o que der":
 * recusam, nomeando a guia. A conservação já é garantida na ESCRITA pelo motor de partidas
 * dobradas (a classe 7 reparte, a classe 8 leva o total, e o subsistema CONTROLE tem de fechar) —
 * esta segunda barreira existe porque um `INSERT` de manutenção, um importador ou um caminho
 * futuro poderiam gravar parcela sem passar pelo lançamento, e um número por fonte torto é pior
 * do que uma recusa.
 */

import { sumMoney, toMoney, type Money } from "../../packages/contracts/index.js";

/** Um valor como o Prisma (ou o `Money`) o entrega — sem obrigar o chamador a converter. */
interface ValorLido {
  readonly toFixed: (casas: number) => string;
}

export interface ParcelaDeFonte {
  readonly fonteId: string;
  readonly exercicioFonte: number;
  readonly valor: Money;
}

/** A guia como qualquer leitor a seleciona: o total, a fonte padrão e a distribuição. */
export interface GuiaParaParcelas {
  readonly numeroReceita: string;
  readonly fonteId: string;
  readonly exercicioFonte: number;
  readonly valor: ValorLido;
  readonly distribuicao: readonly {
    readonly fonteId: string;
    readonly exercicioFonte: number;
    readonly valor: ValorLido;
  }[];
}

/**
 * AS PARCELAS DE FONTE DE UMA GUIA — a única regra, para todos os leitores.
 *
 * ⚠️ GUIA SEM DISTRIBUIÇÃO TEM EXATAMENTE UMA PARCELA, E ISSO NÃO É SUPOSIÇÃO. `fonteId` é
 * `NOT NULL` e singular no schema: uma guia sem parcela foi registrada pelo caminho de fonte
 * única, e todo o seu valor é daquela fonte. Nada é inventado, nada é rateado.
 */
export function parcelasDaGuia(g: GuiaParaParcelas): readonly ParcelaDeFonte[] {
  const total = toMoney(g.valor.toFixed(2));

  if (g.distribuicao.length === 0) {
    return [{ fonteId: g.fonteId, exercicioFonte: g.exercicioFonte, valor: total }];
  }

  const parcelas = g.distribuicao.map((d) => ({
    fonteId: d.fonteId,
    exercicioFonte: d.exercicioFonte,
    valor: toMoney(d.valor.toFixed(2)),
  }));

  const soma = sumMoney(parcelas.map((p) => p.valor));
  if (!soma.equals(total)) {
    throw new Error(
      `DISTRIBUIÇÃO INCONSISTENTE na guia ${g.numeroReceita}: as ${parcelas.length} parcelas por ` +
        `fonte somam ${soma.toFixed(2)} e a guia é de ${total.toFixed(2)}. Um número por fonte ` +
        `calculado sobre isso estaria errado em toda consulta que o lesse — do superávit por fonte ` +
        `à DDR. Nada foi somado.`
    );
  }
  return parcelas;
}
