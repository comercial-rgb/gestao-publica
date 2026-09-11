/**
 * Tabelas INSS oficiais 2020-2026 (federal -- schema public)
 *
 * Fontes:
 *   2020: Portaria SEPRT 3.659/2020 (a partir de mar/2020)
 *   2021: Portaria SEPRT/ME 477/2021
 *   2022: Portaria Interm. MPS/MF 12/2022
 *   2023: Portaria Interm. MPS/MF 26/2023
 *   2024: Portaria Interm. MPS/MF 2/2024
 *   2025: Portaria Interm. MPS/MF 6/2025
 *   2026: Portaria Interm. MPS/MF 13/2026 CONFIRMADO
 *
 * IMPORTANTE: anos 2020-2023 estao marcados como VERIFICAR.
 * Recomendo conferir contra portaria oficial antes de subir producao.
 */

export type FaixaInss = {
  ordem: number
  faixaInicio: string // string pra preservar precisao numeric
  faixaFim: string
  aliquota: string // 0.0750 = 7.5%
  parcelaDeduzir: string
}

export type TabelaInssHistorica = {
  vigenciaInicio: string // YYYY-MM-DD
  vigenciaFim: string | null
  tetoContribuicao: string
  descontoMaximo: string
  fundamentacaoLegal: string
  observacoes: string | null
  faixas: FaixaInss[]
}

export const INSS_HISTORICO: TabelaInssHistorica[] = [
  // ============================================================
  // 2026 CONFIRMADO (Portaria Interm. MPS/MF 13/2026)
  // ============================================================
  {
    vigenciaInicio: '2026-01-01',
    vigenciaFim: null, // vigente
    tetoContribuicao: '8475.55',
    descontoMaximo: '988.08',
    fundamentacaoLegal: 'Portaria Interministerial MPS/MF n. 13/2026',
    observacoes: 'Reajuste de 3,90% sobre 2025 (INPC). Salario minimo: R$ 1.621,00',
    faixas: [
      { ordem: 1, faixaInicio: '0.00', faixaFim: '1621.00', aliquota: '0.0750', parcelaDeduzir: '0.00' },
      { ordem: 2, faixaInicio: '1621.01', faixaFim: '2902.84', aliquota: '0.0900', parcelaDeduzir: '24.32' },
      { ordem: 3, faixaInicio: '2902.85', faixaFim: '4354.27', aliquota: '0.1200', parcelaDeduzir: '111.41' },
      { ordem: 4, faixaInicio: '4354.28', faixaFim: '8475.55', aliquota: '0.1400', parcelaDeduzir: '198.50' },
    ],
  },

  // ============================================================
  // 2025 (VERIFICAR contra Portaria oficial)
  // ============================================================
  {
    vigenciaInicio: '2025-01-01',
    vigenciaFim: '2025-12-31',
    tetoContribuicao: '8157.41',
    descontoMaximo: '951.63',
    fundamentacaoLegal: 'Portaria Interministerial MPS/MF n. 6/2025 // VERIFICAR',
    observacoes: 'Salario minimo 2025: R$ 1.518,00',
    faixas: [
      { ordem: 1, faixaInicio: '0.00', faixaFim: '1518.00', aliquota: '0.0750', parcelaDeduzir: '0.00' },
      { ordem: 2, faixaInicio: '1518.01', faixaFim: '2793.88', aliquota: '0.0900', parcelaDeduzir: '22.77' },
      { ordem: 3, faixaInicio: '2793.89', faixaFim: '4190.83', aliquota: '0.1200', parcelaDeduzir: '106.59' },
      { ordem: 4, faixaInicio: '4190.84', faixaFim: '8157.41', aliquota: '0.1400', parcelaDeduzir: '190.40' },
    ],
  },

  // ============================================================
  // 2024 (VERIFICAR)
  // ============================================================
  {
    vigenciaInicio: '2024-01-01',
    vigenciaFim: '2024-12-31',
    tetoContribuicao: '7786.02',
    descontoMaximo: '908.86',
    fundamentacaoLegal: 'Portaria Interministerial MPS/MF n. 2/2024 // VERIFICAR',
    observacoes: 'Salario minimo 2024: R$ 1.412,00',
    faixas: [
      { ordem: 1, faixaInicio: '0.00', faixaFim: '1412.00', aliquota: '0.0750', parcelaDeduzir: '0.00' },
      { ordem: 2, faixaInicio: '1412.01', faixaFim: '2666.68', aliquota: '0.0900', parcelaDeduzir: '21.18' },
      { ordem: 3, faixaInicio: '2666.69', faixaFim: '4000.03', aliquota: '0.1200', parcelaDeduzir: '101.18' },
      { ordem: 4, faixaInicio: '4000.04', faixaFim: '7786.02', aliquota: '0.1400', parcelaDeduzir: '181.18' },
    ],
  },

  // ============================================================
  // 2023 (VERIFICAR)
  // ============================================================
  {
    vigenciaInicio: '2023-05-01', // mudou no meio do ano por aumento salario minimo
    vigenciaFim: '2023-12-31',
    tetoContribuicao: '7507.49',
    descontoMaximo: '877.24',
    fundamentacaoLegal: 'Portaria Interministerial MPS/MF n. 26/2023 // VERIFICAR',
    observacoes: 'A partir de mai/2023 (salario minimo subiu pra R$ 1.320,00)',
    faixas: [
      { ordem: 1, faixaInicio: '0.00', faixaFim: '1320.00', aliquota: '0.0750', parcelaDeduzir: '0.00' },
      { ordem: 2, faixaInicio: '1320.01', faixaFim: '2571.29', aliquota: '0.0900', parcelaDeduzir: '19.80' },
      { ordem: 3, faixaInicio: '2571.30', faixaFim: '3856.94', aliquota: '0.1200', parcelaDeduzir: '96.94' },
      { ordem: 4, faixaInicio: '3856.95', faixaFim: '7507.49', aliquota: '0.1400', parcelaDeduzir: '174.08' },
    ],
  },
  {
    vigenciaInicio: '2023-01-01',
    vigenciaFim: '2023-04-30',
    tetoContribuicao: '7507.49',
    descontoMaximo: '876.94',
    fundamentacaoLegal: 'Portaria Interministerial MPS/MF n. 1/2023 // VERIFICAR',
    observacoes: 'Janeiro a abril 2023 (salario minimo R$ 1.302,00)',
    faixas: [
      { ordem: 1, faixaInicio: '0.00', faixaFim: '1302.00', aliquota: '0.0750', parcelaDeduzir: '0.00' },
      { ordem: 2, faixaInicio: '1302.01', faixaFim: '2571.29', aliquota: '0.0900', parcelaDeduzir: '19.53' },
      { ordem: 3, faixaInicio: '2571.30', faixaFim: '3856.94', aliquota: '0.1200', parcelaDeduzir: '96.67' },
      { ordem: 4, faixaInicio: '3856.95', faixaFim: '7507.49', aliquota: '0.1400', parcelaDeduzir: '173.81' },
    ],
  },

  // ============================================================
  // 2022 (VERIFICAR)
  // ============================================================
  {
    vigenciaInicio: '2022-01-01',
    vigenciaFim: '2022-12-31',
    tetoContribuicao: '7087.22',
    descontoMaximo: '828.39',
    fundamentacaoLegal: 'Portaria Interministerial MPS/MF n. 12/2022 // VERIFICAR',
    observacoes: 'Salario minimo 2022: R$ 1.212,00',
    faixas: [
      { ordem: 1, faixaInicio: '0.00', faixaFim: '1212.00', aliquota: '0.0750', parcelaDeduzir: '0.00' },
      { ordem: 2, faixaInicio: '1212.01', faixaFim: '2427.35', aliquota: '0.0900', parcelaDeduzir: '18.18' },
      { ordem: 3, faixaInicio: '2427.36', faixaFim: '3641.03', aliquota: '0.1200', parcelaDeduzir: '91.00' },
      { ordem: 4, faixaInicio: '3641.04', faixaFim: '7087.22', aliquota: '0.1400', parcelaDeduzir: '163.82' },
    ],
  },

  // ============================================================
  // 2021 (VERIFICAR)
  // ============================================================
  {
    vigenciaInicio: '2021-01-01',
    vigenciaFim: '2021-12-31',
    tetoContribuicao: '6433.57',
    descontoMaximo: '751.99',
    fundamentacaoLegal: 'Portaria SEPRT/ME n. 477/2021 // VERIFICAR',
    observacoes: 'Salario minimo 2021: R$ 1.100,00',
    faixas: [
      { ordem: 1, faixaInicio: '0.00', faixaFim: '1100.00', aliquota: '0.0750', parcelaDeduzir: '0.00' },
      { ordem: 2, faixaInicio: '1100.01', faixaFim: '2203.48', aliquota: '0.0900', parcelaDeduzir: '16.50' },
      { ordem: 3, faixaInicio: '2203.49', faixaFim: '3305.22', aliquota: '0.1200', parcelaDeduzir: '82.60' },
      { ordem: 4, faixaInicio: '3305.23', faixaFim: '6433.57', aliquota: '0.1400', parcelaDeduzir: '148.71' },
    ],
  },

  // ============================================================
  // 2020 (VERIFICAR -- primeira tabela progressiva pos-Reforma Previdencia)
  // ============================================================
  {
    vigenciaInicio: '2020-03-01', // entrou em vigor em mar/2020
    vigenciaFim: '2020-12-31',
    tetoContribuicao: '6101.06',
    descontoMaximo: '713.10',
    fundamentacaoLegal: 'Portaria SEPRT n. 3.659/2020 // VERIFICAR',
    observacoes: 'Inicio da tabela progressiva pos-EC 103/2019 (Reforma Previdencia)',
    faixas: [
      { ordem: 1, faixaInicio: '0.00', faixaFim: '1045.00', aliquota: '0.0750', parcelaDeduzir: '0.00' },
      { ordem: 2, faixaInicio: '1045.01', faixaFim: '2089.60', aliquota: '0.0900', parcelaDeduzir: '15.68' },
      { ordem: 3, faixaInicio: '2089.61', faixaFim: '3134.40', aliquota: '0.1200', parcelaDeduzir: '78.37' },
      { ordem: 4, faixaInicio: '3134.41', faixaFim: '6101.06', aliquota: '0.1400', parcelaDeduzir: '141.06' },
    ],
  },
]
