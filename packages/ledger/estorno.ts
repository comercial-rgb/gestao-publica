import type {
  LancamentoContabil,
  Partida,
  TipoPartida,
} from "./lancamento.js";
import { validarLancamento } from "./motor.js";

export interface GerarEstornoParams {
  /** id do novo lançamento de estorno (gerado pela borda; domain não gera id). */
  readonly idEstorno: string;
  /** numeroControle do novo lançamento de estorno. */
  readonly numeroControleEstorno: string;
  /**
   * A data do ATO de estornar — **não** a do fato original.
   *
   * ⚠️ NÃO EXISTE MAIS `competenciaEstorno`, e é preciso dizer por quê: ele prometia fazer o
   * estorno "cair na competência aberta" quando a original estivesse encerrada. A promessa
   * nunca foi cumprida — **nada lia a competência**, então o estorno não caía em lugar nenhum;
   * ele só gravava um segundo carimbo de data que ninguém consultava. Em produção, ninguém
   * jamais o passou.
   *
   * Quem decide onde o estorno cai é ESTA data: o travamento (M16) e todos os relatórios
   * cortam por `dataTransacao`. Estornar em janeiro um fato de dezembro grava um lançamento
   * NOVO, com a data de janeiro — e é assim que deve ser (a semântica de `a4f2bd6`).
   */
  readonly dataEstorno: Date;
}

const INVERSO: Record<TipoPartida, TipoPartida> = {
  DEBITO: "CREDITO",
  CREDITO: "DEBITO",
};

/**
 * INVARIANTE 3: estorno NUNCA escreve de volta no original. Produz um NOVO
 * lançamento com o tipo de cada partida invertido (DEBITO <-> CREDITO), mesma
 * conta, mesmo subsistema, mesmo valor, referenciando o original via
 * `estornoDeId`.
 *
 * "Já estornado?" é lido de `original.estornos` — DERIVADO da relação inversa,
 * pois não existe `estornadoPorId`. Quem carrega o original do banco é
 * responsável por preencher `estornos`; um repositório que devolva a lista
 * vazia por preguiça reabre a porta do duplo estorno.
 */
export function gerarEstorno(
  original: LancamentoContabil,
  params: GerarEstornoParams
): LancamentoContabil {
  if (original.estornos.length > 0) {
    throw new Error(
      `Lançamento ${original.id} já foi estornado ` +
        `(por ${original.estornos.join(", ")}).`
    );
  }

  const partidasInvertidas: readonly Partida[] = original.partidas.map(
    (partida) => ({
      conta: partida.conta,
      tipo: INVERSO[partida.tipo],
      subsistema: partida.subsistema,
      valor: partida.valor,
    })
  );

  return {
    id: params.idEstorno,
    numeroControle: params.numeroControleEstorno,
    partidas: validarLancamento(partidasInvertidas),
    dataTransacao: params.dataEstorno,
    historico: `ESTORNO de ${original.numeroControle}: ${original.historico}`,
    estornoDeId: original.id,
    estornos: [],
  };
}

/**
 * O LANÇAMENTO DA ANULAÇÃO PARCIAL (TR 5.35) — as pernas do fato original,
 * INVERTIDAS, com o valor PARCIAL.
 *
 * ═══ POR QUE NÃO É `gerarEstorno` ═══
 * O estorno NEGA o fato inteiro e recusa um segundo estorno (`original.estornos`).
 * A anulação parcial REDUZ o fato — e um fato pode ser reduzido VÁRIAS vezes, até
 * o saldo acabar. São operações diferentes, e misturá-las faria a segunda parcial
 * ser recusada como "já estornado".
 *
 * ⚠️ FAIL-CLOSED: todas as pernas do original TÊM de ter o MESMO valor.
 *
 * Um lançamento com pernas de valores diferentes é um lançamento COMPOSTO — e o
 * único que existe no repositório é o pagamento COM RETENÇÃO (M07): o caixa leva o
 * líquido, a obrigação morre pelo bruto, e o retido vira passivo do consignatário.
 * Reduzir isso proporcionalmente exigiria decidir de QUEM sai o pedaço anulado — do
 * fornecedor ou do INSS —, e a resposta não está no lançamento. É por isso que a
 * anulação parcial de pagamento COM RETENÇÃO é uma porta fechada no serviço, e é por
 * isso que a checagem se repete AQUI: o motor não confia no chamador.
 */
export function gerarAnulacaoParcial(
  original: LancamentoContabil,
  valorParcial: { readonly toFixed: (n: number) => string; greaterThan(o: unknown): boolean },
  params: GerarEstornoParams
): LancamentoContabil {
  const valores = new Set(original.partidas.map((p) => p.valor.toFixed(2)));
  if (valores.size !== 1) {
    throw new Error(
      `ANULAÇÃO PARCIAL DE LANÇAMENTO COMPOSTO: o lançamento ` +
        `${original.numeroControle} tem pernas de valores diferentes ` +
        `(${[...valores].join(", ")}) — é um pagamento com retenção, ou coisa ` +
        `equivalente. Reduzi-lo proporcionalmente exigiria decidir de QUEM sai o ` +
        `pedaço anulado, e essa resposta não está no lançamento. Anule o fato ` +
        `INTEIRO e refaça-o pelo valor certo.`
    );
  }

  const total = original.partidas[0]!.valor;
  if (valorParcial.greaterThan(total)) {
    throw new Error(
      `ANULAÇÃO PARCIAL MAIOR QUE O LANÇAMENTO: ${valorParcial.toFixed(2)} excede ` +
        `${total.toFixed(2)} (${original.numeroControle}).`
    );
  }

  const partidasInvertidas: readonly Partida[] = original.partidas.map((p) => ({
    conta: p.conta,
    tipo: INVERSO[p.tipo],
    subsistema: p.subsistema,
    valor: valorParcial as never,
  }));

  return {
    id: params.idEstorno,
    numeroControle: params.numeroControleEstorno,
    partidas: validarLancamento(partidasInvertidas),
    dataTransacao: params.dataEstorno,
    historico: `ANULAÇÃO PARCIAL de ${original.numeroControle}: ${original.historico}`,
    // ⚠️ SEM `estornoDeId`: a parcial NÃO é um estorno. O vínculo com o fato original
    // vive na coluna `anulacaoParcialDeId` do registro do M05 — e é ela que a soma
    // líquida (packages/estornaveis) lê para SUBTRAIR em vez de ZERAR.
    estornos: [],
  };
}
