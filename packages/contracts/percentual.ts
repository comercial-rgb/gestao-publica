import { Decimal } from "decimal.js";
import { z } from "zod";

/**
 * PERCENTUAL E ÍNDICE — `Decimal` com SEIS casas, nunca duas, nunca float.
 *
 * ═══ ⚠️ POR QUE ISTO EXISTE, E O DEFEITO QUE ELE CORRIGE ═══
 * `toMoney` arredonda a DUAS casas (`toDecimalPlaces(2, HALF_EVEN)`), porque dinheiro tem duas.
 * Percentual não: o schema declara `@db.Decimal(9, 6)` desde o `_base.prisma` ("alíquotas/índices:
 * Decimal(9,6)"). Passar um percentual por `toMoney` o achata em silêncio — e o achatamento é
 * exatamente do tipo que não aparece em teste fácil:
 *
 *   · 33,333333 % viraria 33,33 %, e um rateio em três partes iguais somaria 99,99 e seria
 *     RECUSADO por não fechar em 100 — com uma mensagem que acusa o usuário de um erro que o
 *     contrato cometeu;
 *   · uma alíquota de 0,0575 % viraria 0,06 %, um erro de 4 % no tributo calculado.
 *
 * Nenhuma das duas falha alto. A primeira recusa pelo motivo errado; a segunda grava.
 *
 * ⚠️ E A UNIDADE FICA NO NOME DO CAMPO, não aqui. Este contrato não sabe se 50 significa "50 %" ou
 * "5.000 %": ele garante a PRECISÃO e a ausência de float. Quem lê `percentual` divide por 100;
 * quem lê `fracao` não divide. Misturar as duas leituras já custou um defeito no M10.
 */

/** Um percentual, índice, alíquota ou fração: `Decimal` com 6 casas decimais. */
export type Percentual = Decimal;

export type PercentualInput = Decimal | string | number;

/** O número de casas de todo percentual do projeto — o mesmo do `@db.Decimal(9, 6)`. */
export const CASAS_DO_PERCENTUAL = 6;

/**
 * Converte entrada em `Decimal` de SEIS casas (half-even, o mesmo arredondamento do dinheiro).
 * Rejeita NaN e infinito — fail-closed, como `toMoney`.
 */
export function toPercentual(input: PercentualInput): Percentual {
  const d = new Decimal(input);
  if (!d.isFinite()) {
    throw new Error(`Percentual inválido: ${String(input)}`);
  }
  return d.toDecimalPlaces(CASAS_DO_PERCENTUAL, Decimal.ROUND_HALF_EVEN);
}

/** A forma serializada de um percentual — string com 6 casas, nunca `number`. */
export function serializarPercentual(v: Percentual): string {
  return v.toFixed(CASAS_DO_PERCENTUAL);
}

/**
 * Zod para percentual: aceita `Decimal` ou string decimal e produz `Decimal` de 6 casas.
 *
 * ⚠️ `number` NÃO é aceito na borda, ao contrário de `zMoney`: um percentual que chega como
 * `0.1` de JSON já perdeu a discussão sobre precisão antes de entrar. Em teste, escreva a string.
 */
export const zPercentual = z
  .union([
    z.instanceof(Decimal),
    z.string().regex(/^-?\d+(\.\d+)?$/, "String decimal inválida"),
  ])
  .transform((v) => toPercentual(v));

/** Percentual estritamente entre 0 e 100, o recorte de quem reparte um todo. */
export const zPercentualDeRateio = zPercentual.refine(
  (v) => v.greaterThan(0) && v.lessThanOrEqualTo(100),
  { message: "O percentual fica entre 0 (exclusive) e 100" }
);
