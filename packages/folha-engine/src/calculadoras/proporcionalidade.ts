/**
 * Calculadora de fator de proporcionalidade por rubrica.
 *
 * Decisao B34.5 n. 3 -- 5 estrategias:
 *   INTEGRAL                   -> fator sempre 1.0 (insalubridade, periculosidade)
 *   DIAS_REGISTRADOS           -> (30 - faltas - afastamentos - suspensoes) / 30
 *   DIAS_EFETIVOS_TRABALHADOS  -> idem + exclui ferias, atestados, licencas
 *   DIAS_NOTURNOS_DECLARADOS   -> requer apontamento especifico (placeholder MVP)
 *   CUSTOMIZADA_SCRIPT         -> expressao JSONB (nao implementado no MVP)
 *
 * REGRA FISCAL: dias do mes fiscal = 30 (CLT/RPPS), independente do calendario.
 *
 * EDGE CASES tratados:
 *   - Admissao no meio do mes  -> dias_trabalhaveis = 31 - dia_admissao (ou 30)
 *   - Demissao no meio do mes  -> dias_trabalhaveis = dia_demissao
 *   - Afastamento INSS > 15 dias -> empresa paga so os 15 primeiros
 *   - Sobreposicao de eventos  -> dedupe por dia (uma falta + um atestado mesmo dia = 1 dia)
 */

import { diasMesFiscal } from '../utils/data.js'
import { EventoFuncionalInvalido } from '../errors.js'
import type {
  EstrategiaProporcionalidade,
  FolhaEventoFuncional,
  TipoEventoFuncional,
} from '../types.js'
import type { ResultadoFatorProporcional } from '../types.js'

/**
 * Categorias de eventos que reduzem dias trabalhados por estrategia.
 */
const EVENTOS_QUE_REDUZEM_DIAS_REGISTRADOS: TipoEventoFuncional[] = [
  'FALTA_INJUSTIFICADA',
  'AFASTAMENTO_INSS',
  'AFASTAMENTO_PROPRIO',
  'SUSPENSAO_DISCIPLINAR',
  'CESSAO_OUTRO_ORGAO',
  'AFASTAMENTO_MANDATO',
]

const EVENTOS_QUE_REDUZEM_DIAS_EFETIVOS: TipoEventoFuncional[] = [
  ...EVENTOS_QUE_REDUZEM_DIAS_REGISTRADOS,
  'FALTA_JUSTIFICADA',
  'LICENCA_MATERNIDADE',
  'LICENCA_PATERNIDADE',
  'LICENCA_ADOTANTE',
  'FERIAS_GOZO',
  'LICENCA_PREMIO',
  // LICENCA_NOJO e LICENCA_GALA NAO descontam (decisao B34.5)
]

/** Limite de dias que empresa paga em afastamento INSS antes do INSS assumir */
const LIMITE_AFASTAMENTO_INSS_EMPRESA = 15

export type CalcularFatorParams = {
  estrategia: EstrategiaProporcionalidade
  rubricaId: string
  eventos: FolhaEventoFuncional[]
  competencia: Date
}

export function calcularFatorProporcionalidade(
  params: CalcularFatorParams,
): ResultadoFatorProporcional {
  const { estrategia, rubricaId, eventos, competencia } = params
  const diasTotal = diasMesFiscal() // 30

  // Estrategia INTEGRAL -- short circuit
  if (estrategia === 'INTEGRAL') {
    return {
      rubricaId,
      estrategia,
      diasMesFiscal: diasTotal,
      diasComputados: diasTotal,
      fator: 1.0,
      explicacao: 'Rubrica nao proporcional (integral)',
      eventosConsiderados: [],
    }
  }

  // Estrategia placeholder/erro
  if (estrategia === 'DIAS_NOTURNOS_DECLARADOS') {
    // MVP: trata como INTEGRAL se nao tiver eventos especificos
    return {
      rubricaId,
      estrategia,
      diasMesFiscal: diasTotal,
      diasComputados: diasTotal,
      fator: 1.0,
      explicacao: 'DIAS_NOTURNOS_DECLARADOS: placeholder MVP (futuro: apontamento horario)',
      eventosConsiderados: [],
    }
  }

  if (estrategia === 'CUSTOMIZADA_SCRIPT') {
    throw new EventoFuncionalInvalido(
      rubricaId,
      'Estrategia CUSTOMIZADA_SCRIPT nao implementada no MVP',
    )
  }

  // Filtra eventos da competencia (defensivo -- engine ja passa so os relevantes)
  const eventosDaCompetencia = eventos.filter((e) => {
    const eventoComp = new Date(e.competencia)
    return (
      eventoComp.getUTCFullYear() === competencia.getUTCFullYear() &&
      eventoComp.getUTCMonth() === competencia.getUTCMonth()
    )
  })

  // Calcula dias trabalhaveis (considera admissao/demissao no mes)
  const { diasTrabalhaveis, motivoAjuste } = calcularDiasTrabalhaveis(
    eventosDaCompetencia,
  )

  // Categorias de eventos que reduzem
  const tiposReducao =
    estrategia === 'DIAS_EFETIVOS_TRABALHADOS'
      ? EVENTOS_QUE_REDUZEM_DIAS_EFETIVOS
      : EVENTOS_QUE_REDUZEM_DIAS_REGISTRADOS

  // Calcula dias de reducao (com tratamento especial de AFASTAMENTO_INSS > 15 dias)
  const { diasReducao, eventosConsiderados } = calcularDiasReducao(
    eventosDaCompetencia,
    tiposReducao,
  )

  const diasComputados = Math.max(0, diasTrabalhaveis - diasReducao)
  const fator = diasComputados / diasTotal

  const explicacao =
    `${diasComputados}/${diasTotal} dias` +
    (motivoAjuste ? ` (${motivoAjuste})` : '') +
    (diasReducao > 0 ? ` - ${diasReducao} dias descontados` : '')

  return {
    rubricaId,
    estrategia,
    diasMesFiscal: diasTotal,
    diasComputados,
    fator,
    explicacao,
    eventosConsiderados,
  }
}

/**
 * Calcula quantos dias do mes o servidor poderia trabalhar (considerando
 * admissao e demissao no meio do mes).
 *
 * Default: 30 dias (mes fiscal cheio).
 */
function calcularDiasTrabalhaveis(eventos: FolhaEventoFuncional[]): {
  diasTrabalhaveis: number
  motivoAjuste?: string
} {
  const admissao = eventos.find((e) => e.tipo === 'ADMISSAO')
  const demissao = eventos.find((e) => e.tipo === 'DEMISSAO')

  if (admissao && demissao) {
    // Admitido E demitido no mesmo mes (raro)
    const diaAdm = new Date(admissao.dataInicio).getUTCDate()
    const diaDem = new Date(demissao.dataInicio).getUTCDate()
    return {
      diasTrabalhaveis: Math.max(0, diaDem - diaAdm + 1),
      motivoAjuste: `admitido dia ${diaAdm}, demitido dia ${diaDem}`,
    }
  }

  if (admissao) {
    const dia = new Date(admissao.dataInicio).getUTCDate()
    // Mes fiscal 30 dias: admissao dia 1 = 30 dias trabalhaveis
    return {
      diasTrabalhaveis: 31 - dia, // dia 1 -> 30, dia 15 -> 16, dia 30 -> 1
      motivoAjuste: `admitido dia ${dia}`,
    }
  }

  if (demissao) {
    const dia = new Date(demissao.dataInicio).getUTCDate()
    return {
      diasTrabalhaveis: dia, // dia 1 -> 1, dia 30 -> 30
      motivoAjuste: `demitido dia ${dia}`,
    }
  }

  return { diasTrabalhaveis: 30 }
}

/**
 * Calcula total de dias que reduzem o fator, com regras especiais:
 *   - AFASTAMENTO_INSS: maximo 15 dias (apos isso, INSS paga)
 *   - Sobreposicao de dias: dedupe (mesmo dia em 2 eventos = 1 dia)
 */
function calcularDiasReducao(
  eventos: FolhaEventoFuncional[],
  tiposReducao: TipoEventoFuncional[],
): { diasReducao: number; eventosConsiderados: string[] } {
  const eventosRelevantes = eventos.filter((e) => tiposReducao.includes(e.tipo))

  // Set de "dia do mes" pra dedupe entre eventos sobrepostos
  const diasReducaoSet = new Set<number>()
  const eventosConsiderados: string[] = []

  for (const evento of eventosRelevantes) {
    eventosConsiderados.push(evento.id)

    // Calcula dias do evento que caem na competencia
    const inicio = new Date(evento.dataInicio).getUTCDate()
    const fim = evento.dataFim
      ? new Date(evento.dataFim).getUTCDate()
      : inicio + evento.diasComputados - 1

    let diasDoEvento = 0

    for (let dia = inicio; dia <= Math.min(fim, 30); dia++) {
      diasDoEvento++

      // AFASTAMENTO_INSS: empresa paga so primeiros 15 dias
      if (evento.tipo === 'AFASTAMENTO_INSS' && diasDoEvento > LIMITE_AFASTAMENTO_INSS_EMPRESA) {
        break
      }

      diasReducaoSet.add(dia)
    }
  }

  return {
    diasReducao: diasReducaoSet.size,
    eventosConsiderados,
  }
}
