import { describe, it, expect } from 'vitest'
import {
  calcularAvosDecimoTerceiro,
  calcularDecimoTerceiroIntegral,
  calcularPrimeiraParcelaDecimoTerceiro,
  calcularSegundaParcelaDecimoTerceiro,
  calcularDecimoTerceiroSuplementar,
} from '../src/calculadoras/decimo-terceiro.js'
import type { FolhaEventoFuncional } from '../src/types.js'

function evento(props: Partial<FolhaEventoFuncional>): FolhaEventoFuncional {
  return {
    id: 'e1',
    vinculoId: 'v1',
    competencia: '2026-05-01',
    tipo: 'FALTA_INJUSTIFICADA',
    dataInicio: '2026-05-10',
    dataFim: null,
    diasComputados: 1,
    documentoComprobatorioUrl: null,
    numeroProtocolo: null,
    observacao: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    createdBy: null,
    ...props,
  } as FolhaEventoFuncional
}

describe('calcularAvosDecimoTerceiro', () => {
  it('vinculo ativo o ano todo sem afastamentos = 12 avos', () => {
    const r = calcularAvosDecimoTerceiro({
      ano: 2026,
      eventosDoAno: [],
      dataAdmissao: new Date('2025-01-01'),
      dataDemissao: null,
    })

    expect(r.avos).toBe(12)
    expect(r.mesesComputados).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })

  it('admitido em maio = 8 avos (mai-dez)', () => {
    const r = calcularAvosDecimoTerceiro({
      ano: 2026,
      eventosDoAno: [],
      dataAdmissao: new Date('2026-05-15'),
      dataDemissao: null,
    })

    // Mai (15 dias trabalhaveis) - eh exatamente 15, conta (regra ">= 15")
    expect(r.avos).toBe(8)
    expect(r.mesesComputados).toEqual([5, 6, 7, 8, 9, 10, 11, 12])
  })

  it('demitido em outubro = 10 avos', () => {
    const r = calcularAvosDecimoTerceiro({
      ano: 2026,
      eventosDoAno: [],
      dataAdmissao: new Date('2025-01-01'),
      dataDemissao: new Date('2026-10-31'),
    })

    expect(r.avos).toBe(10)
  })

  it('mes com afastamento INSS > 15 dias nao conta', () => {
    const r = calcularAvosDecimoTerceiro({
      ano: 2026,
      eventosDoAno: [
        evento({
          tipo: 'AFASTAMENTO_INSS',
          competencia: '2026-03-01',
          dataInicio: '2026-03-01',
          dataFim: '2026-03-30',
          diasComputados: 30,
        }),
      ],
      dataAdmissao: new Date('2025-01-01'),
      dataDemissao: null,
    })

    // Marco perde o avo
    expect(r.avos).toBe(11)
    expect(r.mesesComputados).not.toContain(3)
  })

  it('vinculo ativo desde dezembro do ano anterior conta jan do ano', () => {
    const r = calcularAvosDecimoTerceiro({
      ano: 2026,
      eventosDoAno: [],
      dataAdmissao: new Date('2025-12-01'),
      dataDemissao: null,
    })

    expect(r.mesesComputados).toContain(1) // janeiro 2026 conta
  })
})

describe('valores do 13o', () => {
  it('integral salario 3000 com 12 avos = 3000', () => {
    expect(calcularDecimoTerceiroIntegral({ salarioBase: 3000, avos: 12 })).toBe(3000)
  })

  it('integral salario 3000 com 8 avos = 2000', () => {
    expect(calcularDecimoTerceiroIntegral({ salarioBase: 3000, avos: 8 })).toBe(2000)
  })

  it('primeira parcela eh metade do integral', () => {
    expect(calcularPrimeiraParcelaDecimoTerceiro(3000)).toBe(1500)
  })

  it('segunda parcela = integral - 1a - inss - irrf', () => {
    const r = calcularSegundaParcelaDecimoTerceiro({
      integral: 3000,
      primeiraParcela: 1500,
      inssDecimoTerceiro: 248.61,
      irrfDecimoTerceiro: 100,
    })
    expect(r).toBe(1151.39)
  })
})

describe('13o suplementar', () => {
  it('aumento de 500 com 12 avos gera diferenca de 500', () => {
    const r = calcularDecimoTerceiroSuplementar({
      salarioBaseAntes: 3000,
      salarioBaseDepois: 3500,
      avos: 12,
      parcelasJaPagas: 0,
    })

    expect(r.diferencaSalarial).toBe(500)
    expect(r.diferencaIntegral).toBe(500)
    expect(r.valorSuplementar).toBe(500)
  })

  it('suplementar abate o que ja foi pago', () => {
    const r = calcularDecimoTerceiroSuplementar({
      salarioBaseAntes: 3000,
      salarioBaseDepois: 3500,
      avos: 12,
      parcelasJaPagas: 250, // ja recebeu 1a parcela com salario antigo
    })

    expect(r.valorSuplementar).toBe(250)
  })

  it('suplementar nao pode ser negativo', () => {
    const r = calcularDecimoTerceiroSuplementar({
      salarioBaseAntes: 3000,
      salarioBaseDepois: 3500,
      avos: 12,
      parcelasJaPagas: 1000, // mais que a diferenca (cenario aberrante)
    })

    expect(r.valorSuplementar).toBe(0)
  })
})
