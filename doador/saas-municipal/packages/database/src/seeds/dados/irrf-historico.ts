/**
 * Tabelas IRRF oficiais 2020-2026 (federal -- schema public)
 *
 * IMPORTANTE: Reforma do IR (Lei 15.270/2025) muda TUDO em 2026:
 *   - Mantem a tabela progressiva tradicional
 *   - Adiciona REDUTOR adicional: max(0, 978.62 - 0.133145 x renda_bruta)
 *   - Faixa de isencao EFETIVA sobe pra R$ 5.000 (mas tabela formal mantem R$ 2.428,80)
 *   - Engine deve calcular 3 cenarios e escolher o melhor pro contribuinte
 *
 * Outras mudancas importantes:
 *   - mai/2023: isencao subiu pra R$ 2.112,00 (decreto 11.482/23)
 *   - fev/2024: isencao subiu pra R$ 2.259,20
 *   - mai/2025: isencao subiu pra R$ 2.428,80
 *
 * Fontes:
 *   Lei 11.482/2007 (tabela original)
 *   Lei 13.149/2015 (atualizacao)
 *   Lei 14.663/2023 (jan-abr/2023 - segue antiga)
 *   Decreto 11.482/2023 (a partir de mai/2023)
 *   Decreto 11.851/2023 (vigencia 2024)
 *   MP 1.171/2023 + Lei 14.848/2024 (consolidacao)
 *   Lei 15.270/2025 (REFORMA DO IR -- vigencia 2026) CONFIRMADO
 */

export type FaixaIrrf = {
  ordem: number
  baseInicio: string
  baseFim: string | null // null na ultima faixa (acima de X)
  aliquota: string
  parcelaDeduzir: string
}

export type TabelaIrrfHistorica = {
  vigenciaInicio: string
  vigenciaFim: string | null
  deducaoPorDependente: string
  descontoSimplificado: string
  isencaoMaior65Anos: string

  // Reforma 15.270/2025 (so preenchido 2026+)
  redutorBase: string | null
  redutorFator: string | null
  redutorRendaMaxima: string | null

  fundamentacaoLegal: string
  observacoes: string | null
  faixas: FaixaIrrf[]
}

export const IRRF_HISTORICO: TabelaIrrfHistorica[] = [
  // ============================================================
  // 2026 CONFIRMADO -- Reforma do IR (Lei 15.270/2025)
  // ============================================================
  {
    vigenciaInicio: '2026-01-01',
    vigenciaFim: null,
    deducaoPorDependente: '189.59',
    descontoSimplificado: '607.20',
    isencaoMaior65Anos: '1903.98',

    // Redutor da Lei 15.270/2025: max(0, 978.62 - 0.133145 x renda_bruta)
    // Zera o imposto pra renda ate R$ 5.000; reduz parcialmente ate R$ 7.350
    redutorBase: '978.62',
    redutorFator: '0.13314500',
    redutorRendaMaxima: '7350.00',

    fundamentacaoLegal: 'Lei 15.270/2025 + Tabela progressiva (mantida da Lei 11.482/2007)',
    observacoes:
      'Reforma do IR: isencao efetiva ate R$ 5.000/mes via redutor. Engine deve comparar 3 cenarios: (a) progressivo com deducoes, (b) progressivo + redutor, (c) desconto simplificado. Escolhe o menor.',
    faixas: [
      { ordem: 1, baseInicio: '0.00', baseFim: '2428.80', aliquota: '0.0000', parcelaDeduzir: '0.00' },
      { ordem: 2, baseInicio: '2428.81', baseFim: '2826.65', aliquota: '0.0750', parcelaDeduzir: '182.16' },
      { ordem: 3, baseInicio: '2826.66', baseFim: '3751.05', aliquota: '0.1500', parcelaDeduzir: '394.16' },
      { ordem: 4, baseInicio: '3751.06', baseFim: '4664.68', aliquota: '0.2250', parcelaDeduzir: '675.49' },
      { ordem: 5, baseInicio: '4664.69', baseFim: null, aliquota: '0.2750', parcelaDeduzir: '908.73' },
    ],
  },

  // ============================================================
  // 2025 (mai-dez) (VERIFICAR)
  // ============================================================
  {
    vigenciaInicio: '2025-05-01',
    vigenciaFim: '2025-12-31',
    deducaoPorDependente: '189.59',
    descontoSimplificado: '564.80',
    isencaoMaior65Anos: '1903.98',
    redutorBase: null,
    redutorFator: null,
    redutorRendaMaxima: null,
    fundamentacaoLegal: 'Lei 14.973/2024 (consolidacao 2025) // VERIFICAR',
    observacoes: 'Isencao subiu pra R$ 2.428,80 (vinculada ao salario minimo)',
    faixas: [
      { ordem: 1, baseInicio: '0.00', baseFim: '2428.80', aliquota: '0.0000', parcelaDeduzir: '0.00' },
      { ordem: 2, baseInicio: '2428.81', baseFim: '2826.65', aliquota: '0.0750', parcelaDeduzir: '182.16' },
      { ordem: 3, baseInicio: '2826.66', baseFim: '3751.05', aliquota: '0.1500', parcelaDeduzir: '394.16' },
      { ordem: 4, baseInicio: '3751.06', baseFim: '4664.68', aliquota: '0.2250', parcelaDeduzir: '675.49' },
      { ordem: 5, baseInicio: '4664.69', baseFim: null, aliquota: '0.2750', parcelaDeduzir: '908.73' },
    ],
  },

  // ============================================================
  // 2024 (fev-dez) (VERIFICAR)
  // ============================================================
  {
    vigenciaInicio: '2024-02-01',
    vigenciaFim: '2025-04-30',
    deducaoPorDependente: '189.59',
    descontoSimplificado: '528.00',
    isencaoMaior65Anos: '1903.98',
    redutorBase: null,
    redutorFator: null,
    redutorRendaMaxima: null,
    fundamentacaoLegal: 'Lei 14.848/2024 // VERIFICAR',
    observacoes: 'Isencao subiu pra R$ 2.259,20 + desconto simplificado introduzido (R$ 528)',
    faixas: [
      { ordem: 1, baseInicio: '0.00', baseFim: '2259.20', aliquota: '0.0000', parcelaDeduzir: '0.00' },
      { ordem: 2, baseInicio: '2259.21', baseFim: '2826.65', aliquota: '0.0750', parcelaDeduzir: '169.44' },
      { ordem: 3, baseInicio: '2826.66', baseFim: '3751.05', aliquota: '0.1500', parcelaDeduzir: '381.44' },
      { ordem: 4, baseInicio: '3751.06', baseFim: '4664.68', aliquota: '0.2250', parcelaDeduzir: '662.77' },
      { ordem: 5, baseInicio: '4664.69', baseFim: null, aliquota: '0.2750', parcelaDeduzir: '896.00' },
    ],
  },

  // ============================================================
  // 2023 (mai-dez) -- primeira atualizacao desde 2015 (VERIFICAR)
  // ============================================================
  {
    vigenciaInicio: '2023-05-01',
    vigenciaFim: '2024-01-31',
    deducaoPorDependente: '189.59',
    descontoSimplificado: '189.59', // placeholder pre-fev/2024 (nao existia; engine ignora opcao simplificada)
    isencaoMaior65Anos: '1903.98',
    redutorBase: null,
    redutorFator: null,
    redutorRendaMaxima: null,
    fundamentacaoLegal: 'Decreto 11.482/2023 // VERIFICAR',
    observacoes: 'Primeira atualizacao desde 2015 -- isencao subiu pra R$ 2.112',
    faixas: [
      { ordem: 1, baseInicio: '0.00', baseFim: '2112.00', aliquota: '0.0000', parcelaDeduzir: '0.00' },
      { ordem: 2, baseInicio: '2112.01', baseFim: '2826.65', aliquota: '0.0750', parcelaDeduzir: '158.40' },
      { ordem: 3, baseInicio: '2826.66', baseFim: '3751.05', aliquota: '0.1500', parcelaDeduzir: '370.40' },
      { ordem: 4, baseInicio: '3751.06', baseFim: '4664.68', aliquota: '0.2250', parcelaDeduzir: '651.73' },
      { ordem: 5, baseInicio: '4664.69', baseFim: null, aliquota: '0.2750', parcelaDeduzir: '884.96' },
    ],
  },

  // ============================================================
  // 2015 a abr/2023 -- tabela "antiga" (valida por 8 anos!) (VERIFICAR)
  // ============================================================
  {
    vigenciaInicio: '2015-04-01',
    vigenciaFim: '2023-04-30',
    deducaoPorDependente: '189.59',
    descontoSimplificado: '189.59', // placeholder pre-fev/2024 (nao existia; engine ignora opcao simplificada)
    isencaoMaior65Anos: '1903.98',
    redutorBase: null,
    redutorFator: null,
    redutorRendaMaxima: null,
    fundamentacaoLegal: 'Lei 13.149/2015 // VERIFICAR',
    observacoes: 'Tabela inalterada por 8 anos -- cobre 2020, 2021, 2022 e jan-abr 2023',
    faixas: [
      { ordem: 1, baseInicio: '0.00', baseFim: '1903.98', aliquota: '0.0000', parcelaDeduzir: '0.00' },
      { ordem: 2, baseInicio: '1903.99', baseFim: '2826.65', aliquota: '0.0750', parcelaDeduzir: '142.80' },
      { ordem: 3, baseInicio: '2826.66', baseFim: '3751.05', aliquota: '0.1500', parcelaDeduzir: '354.80' },
      { ordem: 4, baseInicio: '3751.06', baseFim: '4664.68', aliquota: '0.2250', parcelaDeduzir: '636.13' },
      { ordem: 5, baseInicio: '4664.69', baseFim: null, aliquota: '0.2750', parcelaDeduzir: '869.36' },
    ],
  },
]
