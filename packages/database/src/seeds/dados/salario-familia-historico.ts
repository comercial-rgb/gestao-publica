/**
 * Salario-familia 2020-2026 (federal -- schema public)
 *
 * Desde 2019 existe APENAS UMA faixa unica (antes tinha 2).
 *
 * Fontes:
 *   Portaria SEPRT (anual, mesma das tabelas INSS)
 *
 * IMPORTANTE: anos 2020-2025 VERIFICAR contra portaria oficial.
 */

export type SalarioFamiliaHistorico = {
  vigenciaInicio: string
  vigenciaFim: string | null
  rendaMaxima: string
  valorPorFilho: string
  idadeMaximaFilho: number
  fundamentacaoLegal: string
  observacoes: string | null
}

export const SALARIO_FAMILIA_HISTORICO: SalarioFamiliaHistorico[] = [
  // 2026 -- confirmar valores quando portaria sair
  {
    vigenciaInicio: '2026-01-01',
    vigenciaFim: null,
    rendaMaxima: '1906.04', // VERIFICAR -- provavelmente atualizado
    valorPorFilho: '65.00',  // VERIFICAR -- pode ser ~67
    idadeMaximaFilho: 14,
    fundamentacaoLegal: 'Portaria Interministerial MPS/MF n. 13/2026 // VERIFICAR valor exato',
    observacoes: 'Valores 2026 marcados pra revisao',
  },
  {
    vigenciaInicio: '2025-01-01',
    vigenciaFim: '2025-12-31',
    rendaMaxima: '1906.04',
    valorPorFilho: '65.00',
    idadeMaximaFilho: 14,
    fundamentacaoLegal: 'Portaria Interministerial MPS/MF n. 6/2025 // VERIFICAR',
    observacoes: null,
  },
  {
    vigenciaInicio: '2024-01-01',
    vigenciaFim: '2024-12-31',
    rendaMaxima: '1819.26',
    valorPorFilho: '62.04',
    idadeMaximaFilho: 14,
    fundamentacaoLegal: 'Portaria Interministerial MPS/MF n. 2/2024 // VERIFICAR',
    observacoes: null,
  },
  {
    vigenciaInicio: '2023-05-01',
    vigenciaFim: '2023-12-31',
    rendaMaxima: '1754.18',
    valorPorFilho: '59.82',
    idadeMaximaFilho: 14,
    fundamentacaoLegal: 'Portaria Interministerial MPS/MF n. 26/2023 // VERIFICAR',
    observacoes: null,
  },
  {
    vigenciaInicio: '2022-01-01',
    vigenciaFim: '2023-04-30',
    rendaMaxima: '1655.98',
    valorPorFilho: '56.47',
    idadeMaximaFilho: 14,
    fundamentacaoLegal: 'Portaria Interministerial MPS/MF n. 12/2022 // VERIFICAR',
    observacoes: null,
  },
  {
    vigenciaInicio: '2021-01-01',
    vigenciaFim: '2021-12-31',
    rendaMaxima: '1503.25',
    valorPorFilho: '51.27',
    idadeMaximaFilho: 14,
    fundamentacaoLegal: 'Portaria SEPRT/ME n. 477/2021 // VERIFICAR',
    observacoes: null,
  },
  {
    vigenciaInicio: '2020-01-01',
    vigenciaFim: '2020-12-31',
    rendaMaxima: '1425.56',
    valorPorFilho: '48.62',
    idadeMaximaFilho: 14,
    fundamentacaoLegal: 'Portaria SEPRT n. 3.659/2020 // VERIFICAR',
    observacoes: null,
  },
]
