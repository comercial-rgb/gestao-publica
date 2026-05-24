/**
 * Tipos centrais do motor de calculo de folha.
 *
 * Convencoes:
 * - Decimal financeiro: usar `string` em I/O com DB, `number` no calculo
 *   interno (precisao dupla e suficiente ate 15 digitos).
 * - Datas: `Date` ou `string` ISO conforme contexto.
 * - Sempre incluir `fundamentacaoLegal` em resultados (auditoria TCE).
 */

import type {
  InssTabelaCompleta,
  IrrfTabelaCompleta,
  SalarioFamiliaTabela,
  OrigemTabela,
} from '@saas-municipal/database/schema/folha-publico'
import type {
  RppsAliquotas,
  PessoaDependente,
  FolhaEventoFuncional,
  ConsignacaoAtiva,
  RegimePrevidenciario,
  EstrategiaProporcionalidade,
  TipoEventoFuncional,
} from '@saas-municipal/database/schema/folha-calculo'

// ============================================================
// Cenarios da Reforma do IR (Lei 15.270/2025)
// ============================================================

export type CenarioIRRF =
  | 'PROGRESSIVO_DEDUCOES'      // Tradicional (deducoes legais: INSS + dependentes + pensao)
  | 'PROGRESSIVO_COM_REDUTOR'   // Tradicional + redutor 978,62 - 0,133145 x renda (2026+)
  | 'SIMPLIFICADO'              // Desconto simplificado mensal (607,20 em 2026)

// ============================================================
// Tipos de saida -- resultados dos calculos
// ============================================================

export type ResultadoINSS = {
  base: number
  valor: number
  aliquotaEfetiva: number          // valor / base (informativo, nao usado no calculo)
  faixasUtilizadas: Array<{
    ordem: number
    inicio: number
    fim: number
    aliquota: number
    valorNaFaixa: number
  }>
  tetoAplicado: boolean
  tabelaOrigem: OrigemTabela        // FEDERAL_OFICIAL | TENANT_CUSTOM
  fundamentacao: string             // ex: "Portaria Interm. MPS/MF n. 13/2026"
}

export type ResultadoIRRF = {
  base: number
  valor: number

  // Qual cenario foi escolhido (menor valor pro contribuinte)
  cenarioUtilizado: CenarioIRRF

  // Detalhamento dos 3 cenarios calculados (sempre, pra auditoria)
  cenariosCalculados: Array<{
    nome: CenarioIRRF
    base: number
    valor: number
    aplicavel: boolean             // SIMPLIFICADO so aplicavel >= 2024-02-01
    motivoNaoAplicavel?: string
  }>

  // Deducoes aplicadas no cenario escolhido
  deducoesAplicadas: Array<{
    tipo: 'INSS' | 'DEPENDENTE' | 'PENSAO_ALIMENTICIA' | 'DESCONTO_SIMPLIFICADO' | 'REDUTOR_LEI_15270'
    descricao: string
    valor: number
  }>

  // Faixa progressiva utilizada (no cenario escolhido)
  faixaProgressiva?: {
    ordem: number
    baseInicio: number
    baseFim: number | null
    aliquota: number
  }

  tabelaOrigem: OrigemTabela
  fundamentacao: string
}

export type ResultadoSalarioFamilia = {
  base: number                      // renda do servidor
  numeroFilhosElegiveis: number
  valorPorFilho: number
  valorTotal: number
  rendaMaximaAplicada: number       // pode vir do RPPS override
  fonteValor: 'FEDERAL_OFICIAL' | 'RPPS_OVERRIDE'
  filhosConsiderados: Array<{
    dependenteId: string
    nome: string
    idadeAnos: number
    elegivel: boolean
    motivoInelegibilidade?: string
  }>
  fundamentacao: string
}

export type ResultadoFatorProporcional = {
  rubricaId: string
  estrategia: EstrategiaProporcionalidade
  diasMesFiscal: number             // sempre 30
  diasComputados: number            // varia conforme estrategia
  fator: number                     // diasComputados / diasMesFiscal
  explicacao: string                // ex: "19/30 dias (admitido 12/05, sem faltas)"
  eventosConsiderados: string[]     // ids de eventos que afetaram o fator
}

// ============================================================
// Rubrica calculada (resultado por linha do holerite)
// ============================================================

export type TipoRubrica = 'PROVENTO' | 'DESCONTO' | 'INFORMATIVA'

export type RubricaCalculada = {
  rubricaId: string
  codigo: string
  descricao: string
  tipo: TipoRubrica
  ordem: number                     // ordem de exibicao no holerite

  // Calculo
  valorBase: number                 // valor antes da proporcionalidade
  fatorProporcionalidade: number    // 1.0 = integral
  valor: number                     // valor final (valorBase x fator)

  // Incidencias
  incideInss: boolean
  incideIrrf: boolean
  incideFgts: boolean
  baseInss: number                  // 0 se !incideInss
  baseIrrf: number                  // 0 se !incideIrrf

  // Auditoria
  fundamentacao: string
  formula?: string                  // ex: "salario x 0.40 x fator_prop"

  // eSocial (Fase 1 - dado preparado)
  codigoEsocial?: string            // ex: "1000" vencimento, "1001" gratificacao
}

// ============================================================
// Holerite calculado (saida final do engine)
// ============================================================

export type HoleriteCalculado = {
  // Identificacao
  vinculoId: string
  pessoaId: string
  competencia: Date                 // sempre primeiro dia do mes
  versao: number                    // 1 para primeiro calculo, +1 a cada recalculo

  // Linhas do holerite
  rubricas: RubricaCalculada[]

  // Totalizadores
  totais: {
    proventos: number
    descontos: number
    bruto: number
    liquido: number
    baseInss: number
    baseIrrf: number
    margemConsignavelTotal: number
    margemConsignavelDisponivel: number
  }

  // Detalhes pra auditoria
  inss: ResultadoINSS
  irrf: ResultadoIRRF
  salarioFamilia: ResultadoSalarioFamilia | null
  proporcionalidade: ResultadoFatorProporcional[]

  // Snapshot canonicalizado (entra no campo jsonb do folha_processamento_log)
  snapshot: Record<string, unknown>
  hashSha256: string

  // eSocial (Fase 2 - vai no B35.2D)
  eventoS1200Xml?: string

  // Telemetria
  duracaoMs: number
  calculadoEm: Date
  workerId?: string
}

// ============================================================
// Contexto de calculo (montado UMA vez por job, reutilizado por holerite)
// ============================================================

export type ContextoCalculo = {
  // Identificacao
  vinculoId: string
  pessoaId: string
  competencia: Date
  regimePrevidenciario: RegimePrevidenciario

  // Tabelas resolvidas (cacheadas pelo resolver no inicio do job)
  tabelaInss: InssTabelaCompleta
  tabelaIrrf: IrrfTabelaCompleta
  salarioFamiliaTabela: SalarioFamiliaTabela
  rppsAliquota: RppsAliquotas | null   // null pra RGPS puro

  // Dados especificos do vinculo no mes
  eventos: FolhaEventoFuncional[]
  dependentes: PessoaDependente[]
  consignacoes: ConsignacaoAtiva[]

  // Outros vinculos da MESMA pessoa (pra teto agregado)
  outrosVinculosDaPessoa: Array<{
    vinculoId: string
    regimePrevidenciario: RegimePrevidenciario
    baseInssCalculada?: number       // so preenchido se ja calculado antes nesse job
  }>

  // Telemetria
  workerId?: string
}

// ============================================================
// Re-exports uteis (consumidores do engine nao precisam importar de @database)
// ============================================================

export type {
  InssTabelaCompleta,
  IrrfTabelaCompleta,
  SalarioFamiliaTabela,
  OrigemTabela,
  RppsAliquotas,
  PessoaDependente,
  FolhaEventoFuncional,
  ConsignacaoAtiva,
  RegimePrevidenciario,
  EstrategiaProporcionalidade,
  TipoEventoFuncional,
}
