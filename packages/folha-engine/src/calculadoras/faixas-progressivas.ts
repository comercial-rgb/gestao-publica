/**
 * Aplicacao de faixas progressivas (algoritmo compartilhado INSS + IRRF).
 *
 * Algoritmo "faixa-a-faixa" (mais auditavel que formula simplificada).
 *
 * Implementa precedencia por LIMITE SUPERIOR -- cada faixa contribui apenas
 * com a parcela da base que cai entre o limite anterior e o seu proprio limite.
 *
 * Exemplo INSS 2026 para R$ 3.000:
 *   Faixa 1 (ate 1.621,00) -> 7,5% sobre 1.621,00       = 121,58
 *   Faixa 2 (ate 2.902,84) -> 9,0% sobre 1.281,84       = 115,37
 *   Faixa 3 (ate 4.354,27) -> 12% sobre 97,16           =  11,66
 *   Total                                              = 248,61
 */

import { arredondar2 } from '../utils/decimal.js'

export type Faixa = {
  ordem: number
  /** Limite inferior INCLUSIVO (informativo -- nao usado no calculo) */
  inicio: number
  /** Limite superior INCLUSIVO. `null` na ultima faixa (sem teto). */
  fim: number | null
  /** Aliquota decimal: 0.0750 = 7,5% */
  aliquota: number
}

export type DetalhamentoFaixa = {
  ordem: number
  /** Limite inferior aplicado (limite superior da faixa anterior) */
  limiteInferior: number
  /** Limite superior aplicado (limite real OU base, o que for menor) */
  limiteSuperior: number
  /** Valor da base que caiu nesta faixa */
  baseNaFaixa: number
  aliquota: number
  valor: number
}

export type ResultadoFaixasProgressivas = {
  base: number
  valor: number
  detalhamento: DetalhamentoFaixa[]
  aliquotaEfetiva: number
  faixaMaxima: number | null
}

/**
 * Aplica faixas progressivas a base.
 *
 * Preserva 2 casas decimais com arredondamento half-up POR FAIXA
 * (auditavel, mesmo padrao da Receita Federal).
 */
export function aplicarFaixasProgressivas(
  base: number,
  faixas: Faixa[],
): ResultadoFaixasProgressivas {
  if (base <= 0) {
    return {
      base: 0,
      valor: 0,
      detalhamento: [],
      aliquotaEfetiva: 0,
      faixaMaxima: null,
    }
  }

  // Ordena por ordem (defensivo -- caller pode passar fora de ordem)
  const faixasOrdenadas = [...faixas].sort((a, b) => a.ordem - b.ordem)

  const detalhamento: DetalhamentoFaixa[] = []
  let valorTotal = 0
  let limiteAnterior = 0
  let faixaMaxima: number | null = null

  for (const faixa of faixasOrdenadas) {
    const limiteAtual = faixa.fim ?? Number.POSITIVE_INFINITY

    // Parcela da base que cai nesta faixa
    const limiteEfetivo = Math.min(base, limiteAtual)
    const baseNaFaixa = Math.max(0, limiteEfetivo - limiteAnterior)

    if (baseNaFaixa > 0) {
      const valorFaixa = arredondar2(baseNaFaixa * faixa.aliquota)
      valorTotal += valorFaixa
      detalhamento.push({
        ordem: faixa.ordem,
        limiteInferior: limiteAnterior,
        limiteSuperior: limiteEfetivo,
        baseNaFaixa: arredondar2(baseNaFaixa),
        aliquota: faixa.aliquota,
        valor: valorFaixa,
      })
      faixaMaxima = faixa.ordem
    }

    limiteAnterior = limiteAtual
    if (base <= limiteAtual) break
  }

  const valorFinal = arredondar2(valorTotal)

  return {
    base: arredondar2(base),
    valor: valorFinal,
    detalhamento,
    aliquotaEfetiva: base > 0 ? valorFinal / base : 0,
    faixaMaxima,
  }
}

/**
 * Calculo cruzado usando formula simplificada (parcela_deduzir).
 *
 * Usar pra VALIDACAO em testes -- deve dar valor proximo ao
 * `aplicarFaixasProgressivas` (diferenca <= R$ 0,02 por arredondamento).
 *
 * Formula: valor = base x aliquota_da_faixa_max - parcela_deduzir_da_faixa_max
 */
export function aplicarFormulaSimplificada(
  base: number,
  faixas: Array<Faixa & { parcelaDeduzir: number }>,
): number {
  if (base <= 0) return 0

  // Acha a faixa onde a base cai
  const faixasOrdenadas = [...faixas].sort((a, b) => a.ordem - b.ordem)
  let faixaAplicavel: (Faixa & { parcelaDeduzir: number }) | null = null

  for (const faixa of faixasOrdenadas) {
    const limite = faixa.fim ?? Number.POSITIVE_INFINITY
    if (base <= limite) {
      faixaAplicavel = faixa
      break
    }
  }

  if (!faixaAplicavel) {
    // Base acima do teto -- usa ultima faixa
    faixaAplicavel = faixasOrdenadas[faixasOrdenadas.length - 1] ?? null
    if (!faixaAplicavel) return 0
    const limite = faixaAplicavel.fim ?? base
    return arredondar2(limite * faixaAplicavel.aliquota - faixaAplicavel.parcelaDeduzir)
  }

  return arredondar2(base * faixaAplicavel.aliquota - faixaAplicavel.parcelaDeduzir)
}
