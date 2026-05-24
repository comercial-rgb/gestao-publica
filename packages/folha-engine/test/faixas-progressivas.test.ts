import { describe, it, expect } from 'vitest'
import {
  aplicarFaixasProgressivas,
  aplicarFormulaSimplificada,
  type Faixa,
} from '../src/calculadoras/faixas-progressivas.js'

// Faixas INSS 2026 pra testes
const FAIXAS_INSS_2026: Faixa[] = [
  { ordem: 1, inicio: 0, fim: 1621.0, aliquota: 0.075 },
  { ordem: 2, inicio: 1621.01, fim: 2902.84, aliquota: 0.09 },
  { ordem: 3, inicio: 2902.85, fim: 4354.27, aliquota: 0.12 },
  { ordem: 4, inicio: 4354.28, fim: 8475.55, aliquota: 0.14 },
]

const FAIXAS_INSS_2026_COM_DEDUZIR = FAIXAS_INSS_2026.map((f, i) => ({
  ...f,
  parcelaDeduzir: [0, 24.32, 111.41, 198.5][i]!,
}))

describe('aplicarFaixasProgressivas', () => {
  it('base 0 retorna valor 0', () => {
    const r = aplicarFaixasProgressivas(0, FAIXAS_INSS_2026)
    expect(r.valor).toBe(0)
    expect(r.detalhamento).toHaveLength(0)
  })

  it('base 1.000 cai inteira na faixa 1 (7.5%)', () => {
    const r = aplicarFaixasProgressivas(1000, FAIXAS_INSS_2026)
    expect(r.valor).toBe(75.0)
    expect(r.detalhamento).toHaveLength(1)
    expect(r.detalhamento[0]!.aliquota).toBe(0.075)
    expect(r.faixaMaxima).toBe(1)
  })

  it('base 3.000 abrange 3 faixas (caso classico)', () => {
    const r = aplicarFaixasProgressivas(3000, FAIXAS_INSS_2026)
    // Faixa 1: 1621 x 7.5% = 121.58
    // Faixa 2: (2902.84 - 1621) x 9% = 1281.84 x 9% = 115.37
    // Faixa 3: (3000 - 2902.84) x 12% = 97.16 x 12% = 11.66
    // Total: ~248.61 (diferenca de centavo por arredondamento faixa-a-faixa)
    expect(r.valor).toBeCloseTo(248.61, 1)
    expect(r.detalhamento).toHaveLength(3)
    expect(r.faixaMaxima).toBe(3)
  })

  it('base no teto (8475.55) usa todas as 4 faixas', () => {
    const r = aplicarFaixasProgressivas(8475.55, FAIXAS_INSS_2026)
    // Desconto maximo INSS 2026 = ~R$ 988,08 (centavo de diferenca por arredondamento)
    expect(r.valor).toBeCloseTo(988.08, 1)
    expect(r.detalhamento).toHaveLength(4)
  })

  it('base acima do teto trava no teto', () => {
    const r = aplicarFaixasProgressivas(15000, FAIXAS_INSS_2026)
    // Trava em 8475.55 -> desconto ~988.08
    expect(r.valor).toBeCloseTo(988.08, 1)
  })

  it('formula simplificada da resultado proximo (epsilon < 0.05)', () => {
    const r1 = aplicarFaixasProgressivas(3000, FAIXAS_INSS_2026)
    const r2 = aplicarFormulaSimplificada(3000, FAIXAS_INSS_2026_COM_DEDUZIR)
    expect(Math.abs(r1.valor - r2)).toBeLessThan(0.05)
  })
})
