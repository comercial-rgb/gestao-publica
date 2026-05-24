/**
 * Codigos eSocial S-1010 (Tabela de Rubricas).
 *
 * Cada rubrica precisa ter, alem do codigo interno, os codigos eSocial:
 *   - natRubr: natureza (1000-9999)
 *   - codIncCP: incidencia previdenciaria (RGPS)
 *   - codIncIRRF: incidencia IR
 *   - codIncFGTS: incidencia FGTS
 *   - codIncCPRP: incidencia RPPS
 *
 * Manual completo: gov.br/esocial/pt-br/documentacao-tecnica
 * Versao de referencia: S-1.3
 */

// ============================================================
// Codigos de NATUREZA (natRubr) -- 4 digitos
// ============================================================

export const NATUREZA_RUBRICA = {
  // Vencimentos / proventos
  VENCIMENTO_BASE: '1000',
  VENCIMENTO_COMISSIONADO: '1001',
  HORA_EXTRA_50: '1005',
  HORA_EXTRA_100: '1006',
  ADICIONAL_NOTURNO: '1007',
  GRATIFICACAO_NATALINA: '1010', // 13o
  TERCO_FERIAS: '1011',
  FERIAS_GOZADAS: '1020',
  GRATIFICACAO_FUNCAO: '1030',
  ADICIONAL_INSALUBRIDADE: '1040',
  ADICIONAL_PERICULOSIDADE: '1050',
  ADICIONAL_TEMPO_SERVICO: '1060', // quinquenio/anuenio
  ABONO_PERMANENCIA: '1070',
  SALARIO_FAMILIA: '9000', // informativa

  // Descontos
  DESCONTO_INSS: '9201',
  DESCONTO_RPPS: '9210',
  DESCONTO_IRRF: '9202',
  DESCONTO_PENSAO_ALIMENTICIA: '9203',
  DESCONTO_VALE_TRANSPORTE: '9204',
  DESCONTO_PLANO_SAUDE: '9205',
  DESCONTO_FALTA: '9220',
  EMPRESTIMO_CONSIGNADO: '9301',
} as const

export type CodigoNaturezaRubrica = (typeof NATUREZA_RUBRICA)[keyof typeof NATUREZA_RUBRICA]

// ============================================================
// codIncCP -- Incidencia da Contribuicao Previdenciaria (RGPS)
// ============================================================

export const COD_INC_CP = {
  /** Base de calculo da contribuicao previdenciaria mensal */
  MENSAL: '11',
  /** Base de calculo da contribuicao previdenciaria 13o salario */
  DECIMO_TERCEIRO: '12',
  /** Adicional 1/3 constitucional de ferias */
  TERCO_FERIAS: '13',
  /** Salario-maternidade */
  SALARIO_MATERNIDADE: '21',
  /** Salario-maternidade do 13o */
  SALARIO_MATERNIDADE_13: '22',
  /** Pensao alimenticia */
  PENSAO_ALIMENTICIA: '24',
  /** Salario-familia (informativa) */
  SALARIO_FAMILIA: '31',
  /** Verbas indenizatorias */
  INDENIZATORIA: '41',
  /** Sem incidencia */
  SEM_INCIDENCIA: '51',
  /** Outros */
  OUTROS: '99',
} as const

export type CodigoIncidenciaCP = (typeof COD_INC_CP)[keyof typeof COD_INC_CP]

// ============================================================
// codIncIRRF -- Incidencia IR
// ============================================================

export const COD_INC_IRRF = {
  MENSAL: '11',
  DECIMO_TERCEIRO: '12',
  INDENIZADO: '31',
  PENSAO_JUDICIAL: '32',
  SEM_INCIDENCIA: '41',
  OUTROS: '99',
} as const

export type CodigoIncidenciaIRRF = (typeof COD_INC_IRRF)[keyof typeof COD_INC_IRRF]

// ============================================================
// codIncFGTS -- Incidencia FGTS
// ============================================================

export const COD_INC_FGTS = {
  MENSAL: '11',
  DECIMO_TERCEIRO: '12',
  AVISO_PREVIO_INDENIZADO: '21',
  SEM_INCIDENCIA: '91',
  OUTROS: '99',
} as const

export type CodigoIncidenciaFGTS = (typeof COD_INC_FGTS)[keyof typeof COD_INC_FGTS]

// ============================================================
// codIncCPRP -- Incidencia RPPS (servidores estatutarios)
// ============================================================

export const COD_INC_CPRP = {
  MENSAL: '11',
  DECIMO_TERCEIRO: '12',
  SEM_INCIDENCIA: '51',
} as const

export type CodigoIncidenciaCPRP = (typeof COD_INC_CPRP)[keyof typeof COD_INC_CPRP]

// ============================================================
// PERFIL eSocial COMPLETO de uma rubrica
// ============================================================

export type PerfilEsocialRubrica = {
  codigoEsocial: string
  descricao: string
  natureza: CodigoNaturezaRubrica
  /** Tipo: 1=Vencimento, 2=Desconto, 3=Informativa, 4=Informativa dedutora */
  tipo: '1' | '2' | '3' | '4'
  codIncCP: CodigoIncidenciaCP
  codIncIRRF: CodigoIncidenciaIRRF
  codIncFGTS: CodigoIncidenciaFGTS
  codIncCPRP: CodigoIncidenciaCPRP
}

/**
 * Perfis eSocial padrao para rubricas comuns.
 *
 * Cliente pode SOBRESCREVER no cadastro (rubricas.codigoEsocial),
 * mas estes defaults cobrem 90% dos casos.
 */
export const PERFIS_ESOCIAL_PADRAO: Record<string, PerfilEsocialRubrica> = {
  VENCIMENTO: {
    codigoEsocial: '1000',
    descricao: 'Vencimento Base',
    natureza: NATUREZA_RUBRICA.VENCIMENTO_BASE,
    tipo: '1',
    codIncCP: COD_INC_CP.MENSAL,
    codIncIRRF: COD_INC_IRRF.MENSAL,
    codIncFGTS: COD_INC_FGTS.MENSAL,
    codIncCPRP: COD_INC_CPRP.MENSAL,
  },
  GRATIFICACAO_NATALINA: {
    codigoEsocial: '1010',
    descricao: '13o Salario',
    natureza: NATUREZA_RUBRICA.GRATIFICACAO_NATALINA,
    tipo: '1',
    codIncCP: COD_INC_CP.DECIMO_TERCEIRO,
    codIncIRRF: COD_INC_IRRF.DECIMO_TERCEIRO,
    codIncFGTS: COD_INC_FGTS.DECIMO_TERCEIRO,
    codIncCPRP: COD_INC_CPRP.DECIMO_TERCEIRO,
  },
  TERCO_FERIAS: {
    codigoEsocial: '1011',
    descricao: '1/3 Constitucional de Ferias',
    natureza: NATUREZA_RUBRICA.TERCO_FERIAS,
    tipo: '1',
    codIncCP: COD_INC_CP.TERCO_FERIAS,
    codIncIRRF: COD_INC_IRRF.MENSAL,
    codIncFGTS: COD_INC_FGTS.MENSAL,
    codIncCPRP: COD_INC_CPRP.MENSAL,
  },
  SALARIO_FAMILIA: {
    codigoEsocial: '9000',
    descricao: 'Salario-Familia',
    natureza: NATUREZA_RUBRICA.SALARIO_FAMILIA,
    tipo: '3',
    codIncCP: COD_INC_CP.SALARIO_FAMILIA,
    codIncIRRF: COD_INC_IRRF.SEM_INCIDENCIA,
    codIncFGTS: COD_INC_FGTS.SEM_INCIDENCIA,
    codIncCPRP: COD_INC_CPRP.SEM_INCIDENCIA,
  },
  INSS: {
    codigoEsocial: '9201',
    descricao: 'INSS Empregado',
    natureza: NATUREZA_RUBRICA.DESCONTO_INSS,
    tipo: '2',
    codIncCP: COD_INC_CP.SEM_INCIDENCIA,
    codIncIRRF: COD_INC_IRRF.SEM_INCIDENCIA,
    codIncFGTS: COD_INC_FGTS.SEM_INCIDENCIA,
    codIncCPRP: COD_INC_CPRP.SEM_INCIDENCIA,
  },
  RPPS: {
    codigoEsocial: '9210',
    descricao: 'Contribuicao RPPS',
    natureza: NATUREZA_RUBRICA.DESCONTO_RPPS,
    tipo: '2',
    codIncCP: COD_INC_CP.SEM_INCIDENCIA,
    codIncIRRF: COD_INC_IRRF.SEM_INCIDENCIA,
    codIncFGTS: COD_INC_FGTS.SEM_INCIDENCIA,
    codIncCPRP: COD_INC_CPRP.MENSAL,
  },
  IRRF: {
    codigoEsocial: '9202',
    descricao: 'IRRF',
    natureza: NATUREZA_RUBRICA.DESCONTO_IRRF,
    tipo: '2',
    codIncCP: COD_INC_CP.SEM_INCIDENCIA,
    codIncIRRF: COD_INC_IRRF.SEM_INCIDENCIA,
    codIncFGTS: COD_INC_FGTS.SEM_INCIDENCIA,
    codIncCPRP: COD_INC_CPRP.SEM_INCIDENCIA,
  },
}
