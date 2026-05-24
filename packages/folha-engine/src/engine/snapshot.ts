/**
 * Monta snapshots do holerite -- separados em:
 *
 *   1. SnapshotFiscal: apenas conteudo deterministico (entra no hash SHA-256)
 *      Permite idempotencia: mesmo calculo gera mesmo hash.
 *
 *   2. SnapshotComMetadata: SnapshotFiscal + dados de execucao
 *      Vai no campo jsonb `folha_processamento_log.snapshot`.
 *
 * REGRA: tudo que afeta o RESULTADO fiscal entra no SnapshotFiscal.
 *        Tudo que e "como" o calculo foi feito (workerId, duracao, timestamps)
 *        vai so no SnapshotComMetadata.
 */

import type {
  HoleriteCalculado,
  ResultadoINSS,
  ResultadoIRRF,
  ResultadoSalarioFamilia,
  ResultadoFatorProporcional,
  RubricaCalculada,
} from '../types.js'

/**
 * Versao do engine. INCREMENTAR quando logica fiscal mudar
 * (recalculos devem usar a versao original pra reprodutibilidade).
 */
export const ENGINE_VERSAO = '1.0.0'

// ============================================================
// SNAPSHOT FISCAL -- deterministico, entra no hash
// ============================================================

export type SnapshotFiscal = {
  /** Versao do engine que gerou */
  engineVersao: string

  /** Identificacao imutavel */
  vinculoId: string
  pessoaId: string
  competencia: string // YYYY-MM-DD
  regimePrevidenciario: string
  versaoHolerite: number

  /** Rubricas calculadas (ordenadas por ordem) */
  rubricas: Array<{
    rubricaId: string
    codigo: string
    descricao: string
    tipo: string
    ordem: number
    valorBase: number
    fator: number
    valor: number
    incideInss: boolean
    incideIrrf: boolean
    incideFgts: boolean
    fundamentacao: string
    codigoEsocial: string | null
  }>

  /** Proporcionalidades aplicadas */
  proporcionalidade: Array<{
    rubricaId: string
    estrategia: string
    diasComputados: number
    fator: number
    explicacao: string
  }>

  /** INSS -- sem timestamps */
  inss: {
    base: number
    valor: number
    aliquotaEfetiva: number
    tetoAplicado: boolean
    tabelaOrigem: string
    fundamentacao: string
    faixas: Array<{ ordem: number; aliquota: number; valor: number }>
  }

  /** IRRF -- sem timestamps */
  irrf: {
    base: number
    valor: number
    cenarioUtilizado: string
    cenarios: Array<{
      nome: string
      valor: number
      aplicavel: boolean
    }>
    deducoes: Array<{ tipo: string; valor: number }>
    tabelaOrigem: string
    fundamentacao: string
  }

  /** Salario-familia -- sem timestamps */
  salarioFamilia: {
    base: number
    numeroFilhosElegiveis: number
    valorPorFilho: number
    valorTotal: number
    fonteValor: string
    fundamentacao: string
  } | null

  /** Totalizadores */
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
}

// ============================================================
// SNAPSHOT COM METADATA -- vai pro DB (jsonb)
// ============================================================

export type SnapshotComMetadata = SnapshotFiscal & {
  metadata: {
    calculadoEm: string
    duracaoMs: number
    workerId: string | null
  }
}

// Compatibilidade com imports existentes
export type HoleriteSnapshot = SnapshotComMetadata

// ============================================================
// CONSTRUTORES
// ============================================================

/**
 * Monta o snapshot fiscal (deterministico).
 *
 * Garantias:
 *   - Mesmo input -> mesmo output (sem timestamps, sem random)
 *   - Estrutura compativel com hashSnapshotSha256 (canonicalizado)
 */
export function montarSnapshotFiscal(
  holerite: HoleriteCalculado,
  regimePrevidenciario: string,
): SnapshotFiscal {
  return {
    engineVersao: ENGINE_VERSAO,
    vinculoId: holerite.vinculoId,
    pessoaId: holerite.pessoaId,
    competencia: holerite.competencia.toISOString().slice(0, 10),
    regimePrevidenciario,
    versaoHolerite: holerite.versao,
    rubricas: holerite.rubricas.map(rubricaParaSnapshot),
    proporcionalidade: holerite.proporcionalidade.map(proporcionalidadeParaSnapshot),
    inss: inssParaSnapshot(holerite.inss),
    irrf: irrfParaSnapshot(holerite.irrf),
    salarioFamilia: holerite.salarioFamilia ? salarioFamiliaParaSnapshot(holerite.salarioFamilia) : null,
    totais: holerite.totais,
  }
}

/**
 * Monta snapshot completo (fiscal + metadata de execucao).
 *
 * E o que vai gravado em `folha_processamento_log.snapshot`.
 */
export function montarSnapshotComMetadata(
  holerite: HoleriteCalculado,
  regimePrevidenciario: string,
): SnapshotComMetadata {
  const fiscal = montarSnapshotFiscal(holerite, regimePrevidenciario)

  return {
    ...fiscal,
    metadata: {
      calculadoEm: holerite.calculadoEm.toISOString(),
      duracaoMs: holerite.duracaoMs,
      workerId: holerite.workerId ?? null,
    },
  }
}

/** @deprecated Use montarSnapshotComMetadata */
export function montarSnapshot(holerite: HoleriteCalculado): HoleriteSnapshot {
  return montarSnapshotComMetadata(holerite, '')
}

// ============================================================
// Helpers privados
// ============================================================

function rubricaParaSnapshot(r: RubricaCalculada): SnapshotFiscal['rubricas'][number] {
  return {
    rubricaId: r.rubricaId,
    codigo: r.codigo,
    descricao: r.descricao,
    tipo: r.tipo,
    ordem: r.ordem,
    valorBase: r.valorBase,
    fator: r.fatorProporcionalidade,
    valor: r.valor,
    incideInss: r.incideInss,
    incideIrrf: r.incideIrrf,
    incideFgts: r.incideFgts,
    fundamentacao: r.fundamentacao,
    codigoEsocial: r.codigoEsocial ?? null,
  }
}

function proporcionalidadeParaSnapshot(
  p: ResultadoFatorProporcional,
): SnapshotFiscal['proporcionalidade'][number] {
  return {
    rubricaId: p.rubricaId,
    estrategia: p.estrategia,
    diasComputados: p.diasComputados,
    fator: p.fator,
    explicacao: p.explicacao,
  }
}

function inssParaSnapshot(i: ResultadoINSS): SnapshotFiscal['inss'] {
  return {
    base: i.base,
    valor: i.valor,
    aliquotaEfetiva: i.aliquotaEfetiva,
    tetoAplicado: i.tetoAplicado,
    tabelaOrigem: i.tabelaOrigem,
    fundamentacao: i.fundamentacao,
    faixas: i.faixasUtilizadas.map((f) => ({
      ordem: f.ordem,
      aliquota: f.aliquota,
      valor: f.valorNaFaixa,
    })),
  }
}

function irrfParaSnapshot(i: ResultadoIRRF): SnapshotFiscal['irrf'] {
  return {
    base: i.base,
    valor: i.valor,
    cenarioUtilizado: i.cenarioUtilizado,
    cenarios: i.cenariosCalculados.map((c) => ({
      nome: c.nome,
      valor: c.valor,
      aplicavel: c.aplicavel,
    })),
    deducoes: i.deducoesAplicadas.map((d) => ({ tipo: d.tipo, valor: d.valor })),
    tabelaOrigem: i.tabelaOrigem,
    fundamentacao: i.fundamentacao,
  }
}

function salarioFamiliaParaSnapshot(
  s: ResultadoSalarioFamilia,
): NonNullable<SnapshotFiscal['salarioFamilia']> {
  return {
    base: s.base,
    numeroFilhosElegiveis: s.numeroFilhosElegiveis,
    valorPorFilho: s.valorPorFilho,
    valorTotal: s.valorTotal,
    fonteValor: s.fonteValor,
    fundamentacao: s.fundamentacao,
  }
}
