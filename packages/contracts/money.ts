import { Decimal } from "decimal.js";
import { z } from "zod";

/**
 * REGRA DE OURO: dinheiro NUNCA é number/float.
 * Todo valor monetário circula como Decimal (decimal.js).
 * Proibido +, -, *, / nativos — use sempre os helpers deste arquivo
 * ou os métodos plus/minus/times/div do Decimal.
 */
export type Money = Decimal;

export type MoneyInput = Decimal | string | number;

/**
 * Converte entrada em Decimal monetário com 2 casas (arredondamento
 * half-even, padrão bancário). Rejeita NaN e infinito (fail-closed).
 * `number` é aceito apenas como conveniência de borda (ex.: literais em
 * testes); internamente vira Decimal imediatamente.
 */
export function toMoney(input: MoneyInput): Money {
  const d = new Decimal(input);
  if (!d.isFinite()) {
    throw new Error(`Valor monetário inválido: ${String(input)}`);
  }
  return d.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
}

/** Soma uma lista de valores monetários. Lista vazia soma zero. */
export function sumMoney(list: readonly MoneyInput[]): Money {
  return list.reduce<Decimal>((acc, v) => acc.plus(toMoney(v)), new Decimal(0));
}

/** true se soma dos débitos == soma dos créditos. */
export function isBalanced(
  debitos: readonly MoneyInput[],
  creditos: readonly MoneyInput[]
): boolean {
  return sumMoney(debitos).equals(sumMoney(creditos));
}

/**
 * FAIL-CLOSED: lança erro descritivo se soma dos débitos != soma dos créditos.
 */
export function assertBalanced(
  debitos: readonly MoneyInput[],
  creditos: readonly MoneyInput[]
): void {
  const totalDebitos = sumMoney(debitos);
  const totalCreditos = sumMoney(creditos);
  if (!totalDebitos.equals(totalCreditos)) {
    throw new Error(
      `Lançamento desbalanceado: débitos = ${totalDebitos.toFixed(2)}, ` +
        `créditos = ${totalCreditos.toFixed(2)} ` +
        `(diferença = ${totalDebitos.minus(totalCreditos).toFixed(2)})`
    );
  }
}

/**
 * DINHEIRO SERIALIZADO — string decimal com 2 casas ("1234.56").
 *
 * Mora aqui, e não num módulo, porque é CONTRATO DO PROJETO: dinheiro nunca sai
 * como `number` (float num relatório oficial é o mesmo pecado do float no banco).
 * O M12 (relatórios) e o M09 (conciliação) serializam pela MESMA função — se um
 * dia a convenção mudar, muda num lugar só.
 */
export type Dinheiro = string;

export function serializar(v: Money): Dinheiro {
  return v.toFixed(2);
}

/**
 * Zod para valores monetários: aceita Decimal ou string decimal
 * (ex.: "1234.56") e produz Decimal com 2 casas.
 * String é a forma segura de transportar dinheiro em JSON.
 */
export const zMoney = z
  .union([
    z.instanceof(Decimal),
    z.string().regex(/^-?\d+(\.\d+)?$/, "String decimal inválida"),
  ])
  .transform((v) => toMoney(v));

export { Decimal };
