/**
 * Calculadora de Decimo Terceiro (Gratificacao Natalina).
 *
 * Regras (Lei 4.090/62 + CF art. 7 VIII):
 *   - 1/12 (avo) do salario para cada MES trabalhado no ano
 *   - Mes so conta como avo se trabalhou >= 15 dias nele
 *   - Pago em 2 parcelas:
 *     * 1a parcela: ate 30/nov (50% do 13o integral, SEM descontos)
 *     * 2a parcela: ate 20/dez (saldo - INSS e IRRF do 13o)
 *   - INSS e IRRF do 13o calculados SEPARADO da folha mensal (Receita Federal)
 *
 * Tipos suportados:
 *   - REGULAR: 13o normal (anual)
 *   - PROPORCIONAL: em rescisao (acerto final)
 *   - SUPLEMENTAR: ajuste por aumento salarial retroativo
 *
 * Edge cases:
 *   - Admitido em maio -> 8/12 avos (mai-dez)
 *   - Demitido em outubro -> 10/12 avos
 *   - Afastamento INSS > 15 dias em mar/abr -> nao conta esses meses
 *   - Falecimento -> herdeiros recebem proporcional
 */

import { arredondar2 } from '../utils/decimal.js'
import { diasDoIntervaloNaCompetencia, ultimoDiaCompetencia } from '../utils/data.js'
import type { FolhaEventoFuncional, TipoEventoFuncional } from '../types.js'

const DIAS_MINIMOS_PARA_AVO = 15
const MESES_ANO = 12

/** Eventos que descontam dias para fins de avos (mes < 15 dias -> perde avo) */
const EVENTOS_QUE_DESCONTAM_PARA_AVO: TipoEventoFuncional[] = [
  'FALTA_INJUSTIFICADA',
  'AFASTAMENTO_INSS',
  'AFASTAMENTO_PROPRIO',
  'SUSPENSAO_DISCIPLINAR',
  'LICENCA_MATERNIDADE',
  'LICENCA_PATERNIDADE',
  'CESSAO_OUTRO_ORGAO',
  'AFASTAMENTO_MANDATO',
  // FERIAS_GOZO, ATESTADO, LICENCA_PREMIO contam como mes trabalhado pro 13o
]

export type AvosCalculados = {
  avos: number
  mesesComputados: number[] // 1-12
  detalhamento: Array<{
    mes: number
    competencia: Date
    diasTrabalhados: number
    diasAfastados: number
    eligivel: boolean
    motivo?: string
  }>
}

export type CalcularAvosParams = {
  ano: number
  eventosDoAno: FolhaEventoFuncional[]
  /** Data de admissao do vinculo (pode ser anterior ao ano) */
  dataAdmissao: Date
  /** Data de demissao (null = ainda ativo) */
  dataDemissao: Date | null
}

/**
 * Calcula quantos avos do 13o o servidor tem direito no ano.
 */
export function calcularAvosDecimoTerceiro(params: CalcularAvosParams): AvosCalculados {
  const { ano, eventosDoAno, dataAdmissao, dataDemissao } = params

  const mesesComputados: number[] = []
  const detalhamento: AvosCalculados['detalhamento'] = []

  for (let mes = 1; mes <= MESES_ANO; mes++) {
    const competencia = new Date(Date.UTC(ano, mes - 1, 1))
    const ultimoDia = ultimoDiaCompetencia(competencia)

    // Verifica se o vinculo estava ATIVO no mes
    const vinculoAtivoNoMes =
      dataAdmissao <= ultimoDia &&
      (dataDemissao == null || dataDemissao >= competencia)

    if (!vinculoAtivoNoMes) {
      detalhamento.push({
        mes,
        competencia,
        diasTrabalhados: 0,
        diasAfastados: 0,
        eligivel: false,
        motivo: 'Vinculo nao ativo neste mes',
      })
      continue
    }

    // Calcula dias trabalhaveis considerando admissao/demissao no meio
    let diasTrabalhaveis = 30
    if (dataAdmissao >= competencia && dataAdmissao <= ultimoDia) {
      diasTrabalhaveis = 30 - dataAdmissao.getUTCDate() + 1
    }
    if (dataDemissao && dataDemissao >= competencia && dataDemissao <= ultimoDia) {
      diasTrabalhaveis = dataDemissao.getUTCDate()
    }

    // Soma dias de eventos que descontam
    const eventosDoMes = eventosDoAno.filter((e) => {
      const dataInicio = new Date(e.dataInicio)
      const dataFim = e.dataFim ? new Date(e.dataFim) : dataInicio
      return dataFim >= competencia && dataInicio <= ultimoDia
    })

    const diasAfastadosSet = new Set<number>()

    for (const evento of eventosDoMes) {
      if (!EVENTOS_QUE_DESCONTAM_PARA_AVO.includes(evento.tipo)) continue

      const inicio = new Date(evento.dataInicio)
      const fim = evento.dataFim ? new Date(evento.dataFim) : inicio
      const dias = diasDoIntervaloNaCompetencia(inicio, fim, competencia)

      // Marca cada dia (evita contagem dupla em sobreposicoes)
      const diaInicioMes = Math.max(1, inicio.getUTCDate())
      for (let d = 0; d < dias; d++) {
        diasAfastadosSet.add(diaInicioMes + d)
      }
    }
    const diasAfastados = diasAfastadosSet.size

    const diasTrabalhados = Math.max(0, diasTrabalhaveis - diasAfastados)
    const eligivel = diasTrabalhados >= DIAS_MINIMOS_PARA_AVO

    detalhamento.push({
      mes,
      competencia,
      diasTrabalhados,
      diasAfastados,
      eligivel,
      motivo: eligivel
        ? undefined
        : `Apenas ${diasTrabalhados} dias trabalhados (minimo ${DIAS_MINIMOS_PARA_AVO})`,
    })

    if (eligivel) mesesComputados.push(mes)
  }

  return {
    avos: mesesComputados.length,
    mesesComputados,
    detalhamento,
  }
}

// ============================================================
// CALCULO DOS VALORES
// ============================================================

export type ResultadoDecimoTerceiro = {
  ano: number
  avos: number
  salarioBase: number
  valorIntegral: number
  primeiraParcela: number
  segundaParcelaAntesDescontos: number
  inss: number
  irrf: number
  segundaParcelaLiquida: number
  detalhamentoAvos: AvosCalculados['detalhamento']
  fundamentacao: string
}

export type CalcularDecimoTerceiroIntegralParams = {
  salarioBase: number
  avos: number
}

/**
 * Calcula valor INTEGRAL do 13o (salario_base x avos / 12).
 */
export function calcularDecimoTerceiroIntegral(
  params: CalcularDecimoTerceiroIntegralParams,
): number {
  const { salarioBase, avos } = params
  return arredondar2((salarioBase * avos) / MESES_ANO)
}

/**
 * Calcula 1a parcela = 50% do integral (SEM descontos).
 */
export function calcularPrimeiraParcelaDecimoTerceiro(integral: number): number {
  return arredondar2(integral / 2)
}

/**
 * Calcula 2a parcela = integral - 1a - INSS_13 - IRRF_13.
 */
export type CalcularSegundaParcelaParams = {
  integral: number
  primeiraParcela: number
  inssDecimoTerceiro: number
  irrfDecimoTerceiro: number
}

export function calcularSegundaParcelaDecimoTerceiro(
  params: CalcularSegundaParcelaParams,
): number {
  return arredondar2(
    params.integral -
      params.primeiraParcela -
      params.inssDecimoTerceiro -
      params.irrfDecimoTerceiro,
  )
}

// ============================================================
// 13o SUPLEMENTAR (Bonus B1 do B34.5 -- retroativo)
// ============================================================

export type CalcularSuplementarParams = {
  salarioBaseAntes: number
  salarioBaseDepois: number
  avos: number
  parcelasJaPagas: number // valor de 1a e/ou 2a ja pagas com salario antigo
}

/**
 * Calcula 13o SUPLEMENTAR quando ha aumento salarial retroativo.
 */
export function calcularDecimoTerceiroSuplementar(
  params: CalcularSuplementarParams,
): {
  diferencaSalarial: number
  novoIntegral: number
  diferencaIntegral: number
  valorSuplementar: number
} {
  const diferencaSalarial = arredondar2(params.salarioBaseDepois - params.salarioBaseAntes)
  const novoIntegral = arredondar2((params.salarioBaseDepois * params.avos) / MESES_ANO)
  const integralAntes = arredondar2((params.salarioBaseAntes * params.avos) / MESES_ANO)
  const diferencaIntegral = arredondar2(novoIntegral - integralAntes)
  const valorSuplementar = arredondar2(diferencaIntegral - params.parcelasJaPagas)

  return {
    diferencaSalarial,
    novoIntegral,
    diferencaIntegral,
    valorSuplementar: Math.max(0, valorSuplementar),
  }
}
