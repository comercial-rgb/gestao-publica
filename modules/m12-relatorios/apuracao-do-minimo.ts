import { toMoney, type Money } from "../../packages/contracts/index.js";

/**
 * ═══ A APURAÇÃO DE UM MÍNIMO CONSTITUCIONAL — ASPS 15% (Anexo 12) e profissionais 70% (Anexo 8) ═══
 *
 * Uma só função para a mesma pergunta: "o aplicado alcança `limite`% da base?". Ela devolve o
 * percentual para exibição, o mínimo exigido em dinheiro, a diferença (aplicado − mínimo) e o
 * veredito.
 *
 * ⚠️ O VEREDITO SAI DA COMPARAÇÃO EM DINHEIRO, NUNCA DO PERCENTUAL ARREDONDADO. O percentual é
 * para ler: ele é arredondado a 2 casas e, com base zero, vale "0.00" por convenção (não há razão
 * a calcular). Decidir "atingiu" por ele produzia dois defeitos medidos:
 *   · base zero e aplicado positivo -> "0,00%", "abaixo de 15%" e "Falta para o mínimo" com uma
 *     diferença POSITIVA (o aplicado excede os 15% de uma base nula);
 *   · 14,996% arredondado para "15.00" -> "≥ 15%" com diferença NEGATIVA.
 * Nos dois, o selo contradizia a diferença impressa ao lado. A comparação exata
 * `aplicado × 100 ≥ base × limite` não arredonda nada, e com ela o selo e o sinal da diferença
 * passam a dizer a mesma coisa.
 */
export interface ApuracaoDoMinimo {
  /** aplicado/base × 100, 2 casas (ROUND_HALF_EVEN). Base zero -> "0.00" (convenção de exibição). */
  readonly percentual: string;
  /** limite% da base, em dinheiro (2 casas). */
  readonly minimoExigido: string;
  /** aplicado − mínimo exigido. Negativo = falta; zero ou positivo = cumprido. */
  readonly diferenca: string;
  readonly atingiu: boolean;
  /** Base zero: não há percentual a exibir, e o mínimo exigido é zero. */
  readonly baseNula: boolean;
}

export function apurarMinimo(aplicado: Money, base: Money, limitePercentual: Money): ApuracaoDoMinimo {
  const baseNula = base.isZero();
  const percentual = baseNula ? "0.00" : toMoney(aplicado.dividedBy(base).times(100)).toFixed(2);
  const minimoExigido = toMoney(base.times(limitePercentual).dividedBy(100));
  const diferenca = toMoney(aplicado.minus(minimoExigido));
  return {
    percentual,
    minimoExigido: minimoExigido.toFixed(2),
    diferenca: diferenca.toFixed(2),
    // Exata, sem arredondar nada: aplicado ≥ limite% da base  <=>  aplicado × 100 ≥ base × limite.
    atingiu: aplicado.times(100).greaterThanOrEqualTo(base.times(limitePercentual)),
    baseNula,
  };
}
