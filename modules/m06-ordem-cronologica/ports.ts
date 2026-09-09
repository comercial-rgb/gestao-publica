import type { Money } from "../../packages/contracts/index.js";
import type {
  CategoriaOrdemCronologica,
  HipoteseQuebraOrdem,
  JustificativaQuebraOrdemInput,
  LiquidacaoNaFila,
} from "./dominio.js";

/**
 * PORTS do M06. Sem Prisma.
 *
 * ATENÇÃO À DIREÇÃO DA DEPENDÊNCIA: o M06 **não importa o M05**. É o `pagar()`
 * do M05 que chama `validarOrdemCronologica` — dentro da transação dele, antes
 * de gravar. O M06 lê as tabelas do M05 pelo Prisma, mas não conhece o módulo.
 */

/** O `tx` do Prisma, tipado de forma opaca para não vazar Prisma na port. */
export type TransacaoOpaca = unknown;

export interface QuebraRegistrada {
  readonly id: string;
  readonly liquidacaoId: string;
  readonly hipotese: HipoteseQuebraOrdem;
  readonly justificativa: string;
  readonly autorizadoPor: string;
  readonly criadoEm: Date;
}

export interface FilaPorFonteCategoria {
  readonly fonteId: string;
  readonly fonteCodigo: string;
  readonly categoria: CategoriaOrdemCronologica;
  readonly liquidacoes: readonly LiquidacaoNaFila[];
}

/**
 * A fila NUMA DATA DE CORTE — como ela ERA naquele instante.
 *
 * Existe porque o §3º manda publicar a fila DO MÊS, e o mês fecha. Reconstituir
 * a fila de março em julho não é "a fila de hoje": é a fila com as liquidações
 * que existiam até 31/03 e os pagamentos feitos até 31/03.
 *
 * `exclusivo` = estritamente ANTES do instante. Serve para responder "qual era a
 * posição desta liquidação QUANDO ela furou a fila?": o pagamento que furou e a
 * justificativa nascem na MESMA transação (e o Postgres dá a ambos o mesmo
 * `now()`), então incluí-lo faria a própria liquidação sumir da fila que ela
 * furou.
 */
export interface CorteDaFila {
  readonly instante: Date;
  readonly exclusivo?: boolean | undefined;
}

/** O dataset do §3º — divulgação mensal da ordem + justificativas. */
export interface ConsultaOrdemCronologica {
  readonly competencia: { readonly inicio: Date; readonly fim: Date };
  /** A fila de cada (fonte, categoria) com pagamento pendente. */
  readonly filas: readonly FilaPorFonteCategoria[];
  /** As quebras de ordem autorizadas no mês. */
  readonly quebras: readonly QuebraRegistrada[];
}

export interface OrdemCronologicaPort {
  /**
   * A fila de uma (fonte, categoria): liquidações com saldo a pagar > 0
   * (valor liquidado − SUM real dos pagamentos), ordenadas pela data de
   * liquidação. Derivada — nunca lida de coluna.
   */
  filaDePagamentos(
    fonteId: string,
    categoria: CategoriaOrdemCronologica
  ): Promise<readonly LiquidacaoNaFila[]>;

  /** Posição (1-based) da liquidação na sua fila; `null` se não está nela. */
  posicaoNaFila(liquidacaoId: string): Promise<number | null>;

  /**
   * TODAS as filas (fonte × categoria) numa data de corte. `null` = AGORA.
   *
   * É o que permite ao M12 publicar o dataset do §3º de um mês já fechado sem
   * reimplementar a derivação da fila — a fila é do M06, e continua sendo.
   */
  filasEm(corte: CorteDaFila | null): Promise<readonly FilaPorFonteCategoria[]>;

  /**
   * A REGRA (art. 141), dentro da transação do pagamento:
   *   - cabeça da fila                       -> segue;
   *   - fora de ordem + justificativa válida -> grava a JustificativaQuebraOrdem
   *                                             NA MESMA tx e segue;
   *   - fora de ordem SEM justificativa      -> LANÇA (fail-closed, §2º).
   *
   * Recebe o `tx` porque a justificativa e o pagamento têm de ser atômicos: se o
   * pagamento falhar, a justificativa não pode sobrar; se a justificativa falhar,
   * o pagamento não acontece.
   */
  validarOrdemCronologica(
    tx: TransacaoOpaca,
    liquidacaoId: string,
    justificativa?: JustificativaQuebraOrdemInput | undefined
  ): Promise<void>;

  /** Dataset do §3º. Consumidor futuro: M13 (transparência). */
  consultaOrdemCronologica(competencia: {
    readonly inicio: Date;
    readonly fim: Date;
  }): Promise<ConsultaOrdemCronologica>;
}

export interface SaldoLiquidacao {
  readonly liquidacaoId: string;
  readonly valorLiquidado: Money;
  readonly pago: Money;
  readonly saldoAPagar: Money;
}
