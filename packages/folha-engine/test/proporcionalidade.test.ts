import { describe, it, expect } from 'vitest'
import { calcularFatorProporcionalidade } from '../src/calculadoras/proporcionalidade.js'
import type { FolhaEventoFuncional } from '../src/types.js'

const COMPETENCIA = new Date('2026-05-01T00:00:00Z')

function evento(props: Partial<FolhaEventoFuncional>): FolhaEventoFuncional {
  return {
    id: 'evt-test',
    vinculoId: 'v1',
    competencia: '2026-05-01',
    tipo: 'FALTA_INJUSTIFICADA',
    dataInicio: '2026-05-15',
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

describe('calcularFatorProporcionalidade', () => {
  it('INTEGRAL sempre retorna fator 1.0', () => {
    const r = calcularFatorProporcionalidade({
      estrategia: 'INTEGRAL',
      rubricaId: 'r1',
      eventos: [evento({ tipo: 'FALTA_INJUSTIFICADA' })],
      competencia: COMPETENCIA,
    })
    expect(r.fator).toBe(1.0)
    expect(r.diasComputados).toBe(30)
  })

  it('DIAS_REGISTRADOS sem eventos = 30/30', () => {
    const r = calcularFatorProporcionalidade({
      estrategia: 'DIAS_REGISTRADOS',
      rubricaId: 'r1',
      eventos: [],
      competencia: COMPETENCIA,
    })
    expect(r.fator).toBe(1.0)
    expect(r.diasComputados).toBe(30)
  })

  it('DIAS_REGISTRADOS com 3 faltas = 27/30', () => {
    const r = calcularFatorProporcionalidade({
      estrategia: 'DIAS_REGISTRADOS',
      rubricaId: 'r1',
      eventos: [
        evento({ id: 'e1', dataInicio: '2026-05-10', diasComputados: 1 }),
        evento({ id: 'e2', dataInicio: '2026-05-15', diasComputados: 1 }),
        evento({ id: 'e3', dataInicio: '2026-05-20', diasComputados: 1 }),
      ],
      competencia: COMPETENCIA,
    })
    expect(r.diasComputados).toBe(27)
    expect(r.fator).toBeCloseTo(0.9, 2)
    expect(r.eventosConsiderados).toHaveLength(3)
  })

  it('Admissao dia 12 sem faltas = 19/30', () => {
    const r = calcularFatorProporcionalidade({
      estrategia: 'DIAS_REGISTRADOS',
      rubricaId: 'r1',
      eventos: [evento({ tipo: 'ADMISSAO', dataInicio: '2026-05-12', diasComputados: 19 })],
      competencia: COMPETENCIA,
    })
    expect(r.diasComputados).toBe(19)
    expect(r.fator).toBeCloseTo(19 / 30, 3)
  })

  it('FALTA_JUSTIFICADA (atestado) NAO conta em DIAS_REGISTRADOS', () => {
    const r = calcularFatorProporcionalidade({
      estrategia: 'DIAS_REGISTRADOS',
      rubricaId: 'r1',
      eventos: [
        evento({ tipo: 'FALTA_JUSTIFICADA', dataInicio: '2026-05-10', diasComputados: 3 }),
      ],
      competencia: COMPETENCIA,
    })
    expect(r.diasComputados).toBe(30) // atestado nao reduz em DIAS_REGISTRADOS
  })

  it('FALTA_JUSTIFICADA conta em DIAS_EFETIVOS_TRABALHADOS', () => {
    const r = calcularFatorProporcionalidade({
      estrategia: 'DIAS_EFETIVOS_TRABALHADOS',
      rubricaId: 'r1',
      eventos: [
        evento({ tipo: 'FALTA_JUSTIFICADA', dataInicio: '2026-05-10', dataFim: '2026-05-12', diasComputados: 3 }),
      ],
      competencia: COMPETENCIA,
    })
    expect(r.diasComputados).toBe(27)
  })

  it('AFASTAMENTO_INSS > 15 dias limita a 15 (empresa)', () => {
    const r = calcularFatorProporcionalidade({
      estrategia: 'DIAS_REGISTRADOS',
      rubricaId: 'r1',
      eventos: [
        evento({
          tipo: 'AFASTAMENTO_INSS',
          dataInicio: '2026-05-01',
          dataFim: '2026-05-30',
          diasComputados: 30,
        }),
      ],
      competencia: COMPETENCIA,
    })
    expect(r.diasComputados).toBe(15) // 30 - 15 dias afastado pela empresa
  })

  it('Sobreposicao de eventos: dedupe por dia (mesmo dia em 2 eventos = 1 dia)', () => {
    const r = calcularFatorProporcionalidade({
      estrategia: 'DIAS_REGISTRADOS',
      rubricaId: 'r1',
      eventos: [
        evento({ id: 'e1', tipo: 'FALTA_INJUSTIFICADA', dataInicio: '2026-05-10', diasComputados: 1 }),
        evento({ id: 'e2', tipo: 'SUSPENSAO_DISCIPLINAR', dataInicio: '2026-05-10', diasComputados: 1 }),
      ],
      competencia: COMPETENCIA,
    })
    expect(r.diasComputados).toBe(29) // dia 10 contado apenas 1x
  })

  it('CUSTOMIZADA_SCRIPT lanca erro no MVP', () => {
    expect(() =>
      calcularFatorProporcionalidade({
        estrategia: 'CUSTOMIZADA_SCRIPT',
        rubricaId: 'r1',
        eventos: [],
        competencia: COMPETENCIA,
      }),
    ).toThrow()
  })
})
