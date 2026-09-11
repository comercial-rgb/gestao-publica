/**
 * Calculadora IRRF -- 3 cenarios paralelos (Reforma do IR Lei 15.270/2025).
 *
 * Decisao B34.5 bonus B4:
 *   CENARIO A -- PROGRESSIVO_DEDUCOES
 *     base = bruto - inss - (n_dep x deducao_dep) - pensao_alimenticia
 *     valor = aplicar faixas progressivas
 *
 *   CENARIO B -- PROGRESSIVO_COM_REDUTOR (so 2026+)
 *     redutor = max(0, redutor_base - redutor_fator x renda_bruta)
 *     valor = max(0, valor_A - redutor)
 *
 *   CENARIO C -- SIMPLIFICADO (so a partir de 2024-02)
 *     base = bruto - inss - desconto_simplificado
 *     valor = aplicar faixas progressivas
 *
 * Engine escolhe o MENOR -- beneficio do contribuinte (regra Receita Federal).
 *
 * Edge cases:
 *   - Servidor >= 65 anos: isencao previdenciaria extra (isencaoMaior65Anos)
 *   - Sem dependentes -> cenario C tipicamente vence
 *   - Com 3+ dependentes -> cenario A tipicamente vence
 *   - Reforma 2026 com renda <= 5000 -> cenario B zera
 */

import { parseNumeric, arredondar2 } from '../utils/decimal.js'
import { aplicarFaixasProgressivas, type Faixa } from './faixas-progressivas.js'
import {
  temDescontoSimplificadoAplicavel,
  temRedutorReforma,
} from '../resolvers/tabelas-irrf.js'
import type { IrrfTabelaCompleta } from '../types.js'
import type {
  ResultadoIRRF,
  CenarioIRRF,
} from '../types.js'

export type CalcularIrrfParams = {
  /** Salario bruto + adicionais tributaveis (antes de qualquer desconto) */
  rendaBrutaIrrf: number
  /** Valor de INSS calculado (dedutivel) */
  inssDeduzido: number
  /** Numero de dependentes marcados como dependenteIR */
  numeroDependentesIr: number
  /** Valor de pensao alimenticia judicial (dedutivel integral) */
  pensaoAlimenticia: number
  /** Servidor com 65+ anos tem isencao adicional na faixa */
  servidorMaior65Anos: boolean
  /** Tabela IRRF vigente */
  tabela: IrrfTabelaCompleta
}

export function calcularIrrf(params: CalcularIrrfParams): ResultadoIRRF {
  const {
    rendaBrutaIrrf,
    inssDeduzido,
    numeroDependentesIr,
    pensaoAlimenticia,
    servidorMaior65Anos,
    tabela,
  } = params

  const deducaoDependente = parseNumeric(tabela.deducaoPorDependente)
  const descontoSimplificado = parseNumeric(tabela.descontoSimplificado)
  const isencaoMaior65 = parseNumeric(tabela.isencaoMaior65Anos)

  // Faixas progressivas convertidas
  const faixas: Faixa[] = tabela.faixas
    .sort((a, b) => a.ordem - b.ordem)
    .map((f) => ({
      ordem: f.ordem,
      inicio: parseNumeric(f.baseInicio),
      fim: f.baseFim ? parseNumeric(f.baseFim) : null,
      aliquota: parseNumeric(f.aliquota),
    }))

  // Isencao previdenciaria para 65+ vira "abatimento" da renda
  const ajusteIdoso = servidorMaior65Anos ? isencaoMaior65 : 0

  // ============================================================
  // CENARIO A -- PROGRESSIVO COM DEDUCOES LEGAIS
  // ============================================================

  const deducaoDependentes = numeroDependentesIr * deducaoDependente
  const baseA = Math.max(
    0,
    rendaBrutaIrrf - inssDeduzido - deducaoDependentes - pensaoAlimenticia - ajusteIdoso,
  )
  const resultadoA = aplicarFaixasProgressivas(baseA, faixas)
  const valorA = resultadoA.valor

  // ============================================================
  // CENARIO B -- PROGRESSIVO + REDUTOR (Reforma 15.270/2025, so 2026+)
  // ============================================================

  let valorB = valorA
  let redutorAplicadoB = 0
  let aplicavelB = false
  let motivoNaoAplicavelB: string | undefined

  if (temRedutorReforma(tabela)) {
    aplicavelB = true
    const redutorBase = parseNumeric(tabela.redutorBase)
    const redutorFator = parseNumeric(tabela.redutorFator)
    const redutorRendaMax = parseNumeric(tabela.redutorRendaMaxima)

    if (rendaBrutaIrrf > redutorRendaMax) {
      // Acima do limite (R$ 7.350 em 2026) -- redutor zera
      redutorAplicadoB = 0
    } else {
      redutorAplicadoB = Math.max(0, redutorBase - redutorFator * rendaBrutaIrrf)
    }

    valorB = arredondar2(Math.max(0, valorA - redutorAplicadoB))
  } else {
    motivoNaoAplicavelB =
      'Redutor da Lei 15.270/2025 aplicavel apenas a competencias >= jan/2026'
  }

  // ============================================================
  // CENARIO C -- DESCONTO SIMPLIFICADO (>= fev/2024)
  // ============================================================

  let valorC = Number.POSITIVE_INFINITY
  let baseC = 0
  let aplicavelC = false
  let motivoNaoAplicavelC: string | undefined
  let resultadoFaixasC: ReturnType<typeof aplicarFaixasProgressivas> | null = null

  if (temDescontoSimplificadoAplicavel(tabela)) {
    aplicavelC = true
    baseC = Math.max(
      0,
      rendaBrutaIrrf - inssDeduzido - descontoSimplificado - ajusteIdoso,
    )
    resultadoFaixasC = aplicarFaixasProgressivas(baseC, faixas)
    valorC = resultadoFaixasC.valor
  } else {
    motivoNaoAplicavelC =
      'Desconto simplificado mensal aplicavel apenas a competencias >= fev/2024'
  }

  // ============================================================
  // ESCOLHE O MENOR (beneficio do contribuinte)
  // ============================================================

  const cenarios: Array<{
    nome: CenarioIRRF
    base: number
    valor: number
    aplicavel: boolean
    motivoNaoAplicavel?: string
  }> = [
    { nome: 'PROGRESSIVO_DEDUCOES', base: baseA, valor: valorA, aplicavel: true },
    {
      nome: 'PROGRESSIVO_COM_REDUTOR',
      base: baseA,
      valor: aplicavelB ? valorB : Number.POSITIVE_INFINITY,
      aplicavel: aplicavelB,
      motivoNaoAplicavel: motivoNaoAplicavelB,
    },
    {
      nome: 'SIMPLIFICADO',
      base: baseC,
      valor: valorC,
      aplicavel: aplicavelC,
      motivoNaoAplicavel: motivoNaoAplicavelC,
    },
  ]

  const cenariosAplicaveis = cenarios.filter((c) => c.aplicavel)
  const vencedor = cenariosAplicaveis.reduce((min, c) =>
    c.valor < min.valor ? c : min,
  )

  // Monta detalhamento das deducoes do cenario escolhido
  const deducoesAplicadas: ResultadoIRRF['deducoesAplicadas'] = []
  let baseFinal = 0
  let faixaProgressiva: ResultadoIRRF['faixaProgressiva']

  if (vencedor.nome === 'PROGRESSIVO_DEDUCOES' || vencedor.nome === 'PROGRESSIVO_COM_REDUTOR') {
    deducoesAplicadas.push({
      tipo: 'INSS',
      descricao: 'INSS retido',
      valor: arredondar2(inssDeduzido),
    })
    if (numeroDependentesIr > 0) {
      deducoesAplicadas.push({
        tipo: 'DEPENDENTE',
        descricao: `${numeroDependentesIr} dependente(s) x ${arredondar2(deducaoDependente)}`,
        valor: arredondar2(deducaoDependentes),
      })
    }
    if (pensaoAlimenticia > 0) {
      deducoesAplicadas.push({
        tipo: 'PENSAO_ALIMENTICIA',
        descricao: 'Pensao alimenticia (decisao judicial)',
        valor: arredondar2(pensaoAlimenticia),
      })
    }
    if (vencedor.nome === 'PROGRESSIVO_COM_REDUTOR' && redutorAplicadoB > 0) {
      deducoesAplicadas.push({
        tipo: 'REDUTOR_LEI_15270',
        descricao: 'Redutor Reforma do IR (Lei 15.270/2025)',
        valor: arredondar2(redutorAplicadoB),
      })
    }
    baseFinal = baseA
    const faixaUsada = resultadoA.detalhamento[resultadoA.detalhamento.length - 1]
    if (faixaUsada) {
      const faixaOriginal = faixas.find((f) => f.ordem === faixaUsada.ordem)!
      faixaProgressiva = {
        ordem: faixaOriginal.ordem,
        baseInicio: faixaOriginal.inicio,
        baseFim: faixaOriginal.fim,
        aliquota: faixaOriginal.aliquota,
      }
    }
  } else if (vencedor.nome === 'SIMPLIFICADO') {
    deducoesAplicadas.push({
      tipo: 'INSS',
      descricao: 'INSS retido',
      valor: arredondar2(inssDeduzido),
    })
    deducoesAplicadas.push({
      tipo: 'DESCONTO_SIMPLIFICADO',
      descricao: `Desconto simplificado mensal (substitui dependentes)`,
      valor: arredondar2(descontoSimplificado),
    })
    baseFinal = baseC
    if (resultadoFaixasC && resultadoFaixasC.detalhamento.length > 0) {
      const faixaUsada = resultadoFaixasC.detalhamento[resultadoFaixasC.detalhamento.length - 1]!
      const faixaOriginal = faixas.find((f) => f.ordem === faixaUsada.ordem)!
      faixaProgressiva = {
        ordem: faixaOriginal.ordem,
        baseInicio: faixaOriginal.inicio,
        baseFim: faixaOriginal.fim,
        aliquota: faixaOriginal.aliquota,
      }
    }
  }

  return {
    base: arredondar2(baseFinal),
    valor: arredondar2(vencedor.valor),
    cenarioUtilizado: vencedor.nome,
    cenariosCalculados: cenarios.map((c) => ({
      nome: c.nome,
      base: arredondar2(c.base),
      valor: c.aplicavel ? arredondar2(c.valor) : 0,
      aplicavel: c.aplicavel,
      motivoNaoAplicavel: c.motivoNaoAplicavel,
    })),
    deducoesAplicadas,
    faixaProgressiva,
    tabelaOrigem: tabela.origem ?? 'FEDERAL_OFICIAL',
    fundamentacao: tabela.fundamentacaoLegal,
  }
}
