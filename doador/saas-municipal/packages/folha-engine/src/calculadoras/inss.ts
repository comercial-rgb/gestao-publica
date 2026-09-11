/**
 * Calculadora INSS -- RGPS (progressivo federal) + RPPS (linear municipal).
 *
 * Decisao B34.5 n. 2:
 *   - RGPS: usa tabela federal progressiva (com teto)
 *   - RPPS: usa rpps_aliquotas (linear, sem teto na maioria dos municipios)
 *   - Teto agregado: pessoa com multiplos vinculos do mesmo regime nao
 *     pode pagar mais que o desconto maximo (rateado proporcionalmente)
 *
 * Edge cases:
 *   - Base acima do teto INSS -> desconto trava no maximo
 *   - Servidor afastado INSS apos 15 dias -> empresa nao paga (engine que decide)
 *   - Pensao alimenticia: NAO entra na base de INSS (ja deduzida antes)
 */

import { parseNumeric, arredondar2 } from '../utils/decimal.js'
import { RppsSemAliquotaVigente } from '../errors.js'
import { aplicarFaixasProgressivas, type Faixa } from './faixas-progressivas.js'
import type {
  InssTabelaCompleta,
  RppsAliquotas,
  RegimePrevidenciario,
} from '../types.js'
import type { ResultadoINSS } from '../types.js'

export type CalcularInssRgpsParams = {
  base: number
  tabela: InssTabelaCompleta
}

/**
 * Calcula INSS RGPS (Regime Geral) -- progressivo federal.
 */
export function calcularInssRgps(params: CalcularInssRgpsParams): ResultadoINSS {
  const { base, tabela } = params

  const teto = parseNumeric(tabela.tetoContribuicao)
  const baseEfetiva = Math.min(base, teto)
  const tetoAplicado = base > teto

  // Converte faixas string->number
  const faixas: Faixa[] = tabela.faixas
    .sort((a, b) => a.ordem - b.ordem)
    .map((f) => ({
      ordem: f.ordem,
      inicio: parseNumeric(f.faixaInicio),
      fim: parseNumeric(f.faixaFim),
      aliquota: parseNumeric(f.aliquota),
    }))

  const resultado = aplicarFaixasProgressivas(baseEfetiva, faixas)

  return {
    base: arredondar2(baseEfetiva),
    valor: resultado.valor,
    aliquotaEfetiva: resultado.aliquotaEfetiva,
    faixasUtilizadas: resultado.detalhamento.map((d) => ({
      ordem: d.ordem,
      inicio: d.limiteInferior,
      fim: d.limiteSuperior,
      aliquota: d.aliquota,
      valorNaFaixa: d.valor,
    })),
    tetoAplicado,
    tabelaOrigem: tabela.origem ?? 'FEDERAL_OFICIAL',
    fundamentacao: tabela.fundamentacaoLegal,
  }
}

export type CalcularInssRppsParams = {
  base: number
  aliquota: RppsAliquotas | null
  competencia: Date
}

/**
 * Calcula INSS RPPS (Regime Proprio) -- linear municipal.
 *
 * RPPS geralmente NAO tem teto (servidor estatutario contribui sobre
 * remuneracao integral). Mas se o municipio definiu, aplica.
 */
export function calcularInssRpps(params: CalcularInssRppsParams): ResultadoINSS {
  const { base, aliquota, competencia } = params

  if (!aliquota) {
    throw new RppsSemAliquotaVigente(competencia)
  }

  const aliquotaServidor = parseNumeric(aliquota.aliquotaServidor)
  const teto = aliquota.tetoContribuicao ? parseNumeric(aliquota.tetoContribuicao) : null

  const baseEfetiva = teto !== null ? Math.min(base, teto) : base
  const tetoAplicado = teto !== null && base > teto

  const valor = arredondar2(baseEfetiva * aliquotaServidor)

  return {
    base: arredondar2(baseEfetiva),
    valor,
    aliquotaEfetiva: aliquotaServidor,
    faixasUtilizadas: [
      {
        ordem: 1,
        inicio: 0,
        fim: teto ?? baseEfetiva,
        aliquota: aliquotaServidor,
        valorNaFaixa: valor,
      },
    ],
    tetoAplicado,
    tabelaOrigem: 'TENANT_CUSTOM', // RPPS sempre vem do tenant
    fundamentacao: aliquota.fundamentacaoLegal,
  }
}

/**
 * Roteador entre RGPS e RPPS conforme regime do vinculo.
 *
 * VINCULO_ISENTO -> retorna 0 (estagiarios, conselheiros tutelares).
 * VINCULO_FACULTATIVO -> tratado como RGPS (servidor optou por contribuir).
 */
export type CalcularInssParams = {
  base: number
  regimePrevidenciario: RegimePrevidenciario
  tabelaInss: InssTabelaCompleta
  rppsAliquota: RppsAliquotas | null
  competencia: Date
}

export function calcularInss(params: CalcularInssParams): ResultadoINSS {
  const { base, regimePrevidenciario, tabelaInss, rppsAliquota, competencia } = params

  if (regimePrevidenciario === 'isento') {
    return {
      base: 0,
      valor: 0,
      aliquotaEfetiva: 0,
      faixasUtilizadas: [],
      tetoAplicado: false,
      tabelaOrigem: 'FEDERAL_OFICIAL',
      fundamentacao: 'Regime ISENTO: nao ha contribuicao previdenciaria',
    }
  }

  if (regimePrevidenciario === 'rpps') {
    return calcularInssRpps({ base, aliquota: rppsAliquota, competencia })
  }

  // rgps usa tabela federal
  return calcularInssRgps({ base, tabela: tabelaInss })
}

// ============================================================
// TETO AGREGADO entre vinculos da mesma pessoa
// ============================================================

export type ContribuicaoVinculo = {
  vinculoId: string
  regimePrevidenciario: RegimePrevidenciario
  base: number
  valor: number
}

/**
 * Aplica o teto agregado de INSS entre vinculos da mesma pessoa.
 *
 * Cenario: medica com 2 vinculos efetivos (CF art. 37 XVI c).
 * Soma das contribuicoes pode passar do teto -- abater proporcionalmente.
 *
 * Regra: somente vinculos do MESMO regime (RGPS-RGPS, RPPS-RPPS) agregam.
 *        Vinculo RGPS + RPPS NAO agrega (regimes independentes).
 */
export type ResultadoTetoAgregado = {
  contribuicoes: ContribuicaoVinculo[]
  ajusteAplicado: boolean
  totalAntes: number
  totalDepois: number
  excedente: number
}

export function aplicarTetoAgregadoInss(
  contribuicoes: ContribuicaoVinculo[],
  descontoMaximoRgps: number,
): ResultadoTetoAgregado {
  const rgps = contribuicoes.filter(
    (c) => c.regimePrevidenciario === 'rgps',
  )
  const naoRgps = contribuicoes.filter(
    (c) => c.regimePrevidenciario !== 'rgps',
  )

  if (rgps.length === 0) {
    return {
      contribuicoes,
      ajusteAplicado: false,
      totalAntes: 0,
      totalDepois: 0,
      excedente: 0,
    }
  }

  const totalRgps = rgps.reduce((s, c) => s + c.valor, 0)

  if (totalRgps <= descontoMaximoRgps) {
    return {
      contribuicoes,
      ajusteAplicado: false,
      totalAntes: arredondar2(totalRgps),
      totalDepois: arredondar2(totalRgps),
      excedente: 0,
    }
  }

  const excedente = totalRgps - descontoMaximoRgps
  const fatorReducao = descontoMaximoRgps / totalRgps

  const rgpsAjustados = rgps.map((c) => ({
    ...c,
    valor: arredondar2(c.valor * fatorReducao),
  }))

  // Recalcula total apos arredondamento (pode ter pequena diferenca de centavos)
  const totalAjustado = rgpsAjustados.reduce((s, c) => s + c.valor, 0)
  const diferenca = arredondar2(descontoMaximoRgps - totalAjustado)

  // Joga a diferenca de centavos no primeiro vinculo (mais simples e auditavel)
  if (rgpsAjustados[0] && Math.abs(diferenca) >= 0.01) {
    rgpsAjustados[0].valor = arredondar2(rgpsAjustados[0].valor + diferenca)
  }

  return {
    contribuicoes: [...rgpsAjustados, ...naoRgps],
    ajusteAplicado: true,
    totalAntes: arredondar2(totalRgps),
    totalDepois: arredondar2(descontoMaximoRgps),
    excedente: arredondar2(excedente),
  }
}
