/**
 * Helpers de manipulacao de datas em contexto fiscal de folha.
 *
 * CONVENCAO BR:
 * - Mes fiscal = 30 dias (CLT/RPPS), independente do calendario real
 * - "Competencia" = primeiro dia do mes (YYYY-MM-01)
 * - Comparacao de competencias usa timestamp UTC 00:00
 */

import { CompetenciaInvalida } from '../errors.js'

const DIAS_MES_FISCAL = 30

/**
 * Normaliza uma data pra primeiro dia do mes (00:00 UTC).
 * Aceita Date ou string ISO.
 */
export function competenciaDe(date: Date | string): Date {
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) {
    throw new CompetenciaInvalida(d, 'Data invalida')
  }
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0))
}

/** Formata competencia como YYYY-MM-DD pra colunas date do PG */
export function competenciaParaISO(competencia: Date): string {
  return competencia.toISOString().slice(0, 10)
}

/** Formata competencia como YYYY-MM pra logs e mensagens */
export function competenciaCurta(competencia: Date): string {
  return competencia.toISOString().slice(0, 7)
}

/** Retorna o ultimo dia do mes da competencia (data civil real, nao fiscal) */
export function ultimoDiaCompetencia(competencia: Date): Date {
  const ano = competencia.getUTCFullYear()
  const mes = competencia.getUTCMonth()
  // Truque: dia 0 do proximo mes = ultimo dia do mes atual
  return new Date(Date.UTC(ano, mes + 1, 0, 23, 59, 59, 999))
}

/** Quantidade de dias civis no mes (28-31) */
export function diasCivisCompetencia(competencia: Date): number {
  return ultimoDiaCompetencia(competencia).getUTCDate()
}

/** Sempre 30 -- nao confundir com diasCivisCompetencia */
export function diasMesFiscal(): number {
  return DIAS_MES_FISCAL
}

/**
 * Verifica se uma data esta dentro da competencia (mes civil).
 * Util pra processar eventos que cruzam mes (admissao dia 28 + periodo ate dia 5).
 */
export function dataNaCompetencia(data: Date, competencia: Date): boolean {
  return (
    data.getUTCFullYear() === competencia.getUTCFullYear() &&
    data.getUTCMonth() === competencia.getUTCMonth()
  )
}

/**
 * Calcula a intersecao de um intervalo (dataInicio, dataFim) com a competencia.
 * Retorna o numero de dias civis do intervalo que caem dentro do mes.
 *
 * Exemplo: ferias 25/04 a 04/05, competencia 2026-04-01 -> 6 dias
 * (25, 26, 27, 28, 29, 30)
 */
export function diasDoIntervaloNaCompetencia(
  dataInicio: Date,
  dataFim: Date | null,
  competencia: Date,
): number {
  const inicioCompetencia = new Date(competencia)
  const fimCompetencia = ultimoDiaCompetencia(competencia)

  const inicio = dataInicio < inicioCompetencia ? inicioCompetencia : dataInicio
  const fim = dataFim == null || dataFim > fimCompetencia ? fimCompetencia : dataFim

  if (inicio > fim) return 0

  const msPorDia = 24 * 60 * 60 * 1000
  // +1 porque conta o dia de inicio tambem
  return Math.floor((fim.getTime() - inicio.getTime()) / msPorDia) + 1
}

/**
 * Calcula idade em anos completos numa data de referencia.
 * Util pra elegibilidade salario-familia (filho < 14) e isencao IRRF (>= 65).
 */
export function idadeNaData(dataNascimento: Date, dataReferencia: Date): number {
  const anos = dataReferencia.getUTCFullYear() - dataNascimento.getUTCFullYear()
  const mesRef = dataReferencia.getUTCMonth()
  const mesNasc = dataNascimento.getUTCMonth()
  if (mesRef < mesNasc || (mesRef === mesNasc && dataReferencia.getUTCDate() < dataNascimento.getUTCDate())) {
    return anos - 1
  }
  return anos
}

/**
 * Verifica se uma data de vigencia esta ativa numa competencia.
 * vigenciaInicio <= competencia AND (vigenciaFim IS NULL OR vigenciaFim >= competencia)
 */
export function vigenciaAtiva(
  vigenciaInicio: Date | string,
  vigenciaFim: Date | string | null,
  competencia: Date,
): boolean {
  const inicio = typeof vigenciaInicio === 'string' ? new Date(vigenciaInicio) : vigenciaInicio
  if (inicio > competencia) return false

  if (vigenciaFim == null) return true
  const fim = typeof vigenciaFim === 'string' ? new Date(vigenciaFim) : vigenciaFim
  return fim >= competencia
}
