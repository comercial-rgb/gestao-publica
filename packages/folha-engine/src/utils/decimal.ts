/**
 * Aritmetica decimal com arredondamento fiscal.
 *
 * IMPORTANTE: para folha de pagamento, o padrao BR e
 * "half-up" (arredondamento aritmetico) com 2 casas decimais.
 *
 * Bankers' rounding (half-to-even) e mais usado em financas mas
 * causa divergencia com calculos de contabilidade municipal -- nao usar aqui.
 *
 * Limite: JavaScript number suporta ate ~15 digitos significativos.
 * Para folha (limite teto INSS ~10k, multiplicacoes), esta OK.
 * Nao usar Decimal.js -- overhead desnecessario e seedDB usa string mesmo.
 */

const FATOR_2_CASAS = 100
const FATOR_4_CASAS = 10000

/** Converte string do DB pra number (preserva precisao ate 15 digitos) */
export function parseNumeric(value: string | null | undefined): number {
  if (value == null || value === '') return 0
  const n = Number(value)
  if (!Number.isFinite(n)) {
    throw new Error(`Valor numeric invalido: "${value}"`)
  }
  return n
}

/** Arredonda para 2 casas decimais (padrao fiscal BR -- half-up) */
export function arredondar2(value: number): number {
  // Evita erro de ponto flutuante em casos como 0.1 + 0.2
  // Multiplica -> arredonda inteiro -> divide
  return Math.round((value + Number.EPSILON) * FATOR_2_CASAS) / FATOR_2_CASAS
}

/** Arredonda para 4 casas (uso interno em aliquotas) */
export function arredondar4(value: number): number {
  return Math.round((value + Number.EPSILON) * FATOR_4_CASAS) / FATOR_4_CASAS
}

/** Formata para string com 2 casas (volta pro DB) */
export function formatarNumeric(value: number, casas: 2 | 4 = 2): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Nao e possivel formatar valor nao finito: ${value}`)
  }
  return value.toFixed(casas)
}

/** Soma uma lista de numeros com arredondamento progressivo */
export function somarArredondado(valores: number[]): number {
  return arredondar2(valores.reduce((soma, v) => soma + v, 0))
}

/**
 * Aplica percentual com arredondamento fiscal.
 * Ex: aplicarPercentual(1000, 0.14) -> 140.00
 */
export function aplicarPercentual(base: number, aliquota: number): number {
  return arredondar2(base * aliquota)
}

/**
 * Calcula o MINIMO entre dois valores (util pra teto INSS).
 * Diferente de Math.min -- preserva sinal e tipo number.
 */
export function aplicarTeto(valor: number, teto: number): number {
  return Math.min(valor, teto)
}

/**
 * Compara dois numeros com tolerancia (epsilon).
 * Util pra testes de igualdade financeira.
 */
export function igualFinanceiro(a: number, b: number, epsilon = 0.01): boolean {
  return Math.abs(a - b) < epsilon
}
