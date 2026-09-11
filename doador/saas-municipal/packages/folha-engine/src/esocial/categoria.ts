/**
 * Codigos de categoria do trabalhador no eSocial (codCateg).
 *
 * Usado no evento S-2200 (admissao) e referenciado no S-1200 (remuneracao).
 * O codigo determina o regime previdenciario e direitos trabalhistas.
 *
 * Roteamento basico:
 *   - 'rgps' + cargo efetivo (CLT raro em prefeitura)        -> 101
 *   - 'rgps' + cargo exclusivamente comissionado             -> 302
 *   - 'rgps' + cargo eletivo                                 -> 309
 *   - 'rpps' + cargo efetivo                                 -> 301
 *   - 'rpps' + contrato por tempo determinado                -> 305
 *   - 'isento' (estagiario)                                  -> 901
 *
 * O usuario pode SOBRESCREVER essa logica caso o municipio tenha regime atipico.
 */

import type { RegimePrevidenciario } from '../types.js'

export const CATEGORIA_ESOCIAL = {
  EMPREGADO_GERAL: '101',
  EMPREGADO_RURAL: '102',
  EMPREGADO_DOMESTICO: '104',
  EMPREGADO_CONTRATO_PRAZO: '111',
  SERVIDOR_EFETIVO_RPPS: '301',
  SERVIDOR_COMISSIONADO_RGPS: '302',
  SERVIDOR_MEMBRO_PODER: '303',
  SERVIDOR_CONTRATO_TEMP_RPPS: '305',
  SERVIDOR_CARGO_ELETIVO_RPPS: '306',
  SERVIDOR_CARGO_ELETIVO_RGPS: '309',
  ESTAGIARIO: '901',
} as const

export type CodigoCategoriaEsocial =
  (typeof CATEGORIA_ESOCIAL)[keyof typeof CATEGORIA_ESOCIAL]

export type TipoVinculo =
  | 'EFETIVO'
  | 'COMISSIONADO'
  | 'CONTRATO_TEMPORARIO'
  | 'CARGO_ELETIVO'
  | 'ESTAGIO'

/**
 * Determina o codigo de categoria do trabalhador.
 *
 * Caso o vinculo tenha categoria customizada ja cadastrada
 * (vinculos_funcionais.codigo_categoria_esocial), passar via override.
 */
export function determinarCategoriaEsocial(params: {
  regimePrevidenciario: RegimePrevidenciario
  tipoVinculo: TipoVinculo
  override?: CodigoCategoriaEsocial
}): CodigoCategoriaEsocial {
  if (params.override) return params.override

  const { regimePrevidenciario, tipoVinculo } = params

  if (tipoVinculo === 'ESTAGIO' || regimePrevidenciario === 'isento') {
    return CATEGORIA_ESOCIAL.ESTAGIARIO
  }

  if (tipoVinculo === 'CARGO_ELETIVO') {
    return regimePrevidenciario === 'rpps'
      ? CATEGORIA_ESOCIAL.SERVIDOR_CARGO_ELETIVO_RPPS
      : CATEGORIA_ESOCIAL.SERVIDOR_CARGO_ELETIVO_RGPS
  }

  if (tipoVinculo === 'COMISSIONADO') {
    return CATEGORIA_ESOCIAL.SERVIDOR_COMISSIONADO_RGPS
  }

  if (tipoVinculo === 'CONTRATO_TEMPORARIO') {
    return regimePrevidenciario === 'rpps'
      ? CATEGORIA_ESOCIAL.SERVIDOR_CONTRATO_TEMP_RPPS
      : CATEGORIA_ESOCIAL.EMPREGADO_CONTRATO_PRAZO
  }

  // EFETIVO (padrao)
  return regimePrevidenciario === 'rpps'
    ? CATEGORIA_ESOCIAL.SERVIDOR_EFETIVO_RPPS
    : CATEGORIA_ESOCIAL.EMPREGADO_GERAL
}

/**
 * Determina qual EVENTO eSocial usar para a remuneracao:
 *   - S-1200: trabalhadores RGPS (CLT, comissionados sem efetivo, etc)
 *   - S-1202: servidores RPPS (efetivos com regime proprio)
 *
 * Servidor RPPS tem evento proprio porque RPPS e informado em campos
 * diferentes (codIncCPRP em vez de codIncCP).
 */
export function determinarEventoRemuneracao(
  regimePrevidenciario: RegimePrevidenciario,
): 'S-1200' | 'S-1202' {
  return regimePrevidenciario === 'rpps' ? 'S-1202' : 'S-1200'
}
