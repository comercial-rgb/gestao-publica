/**
 * Monta o snapshot canonico do holerite para gravacao no log e hash SHA-256.
 *
 * O snapshot:
 *   - E gravado em folha_processamento_log.snapshot (jsonb)
 *   - E hashizado com SHA-256 -> folha_processamento_log.hash_sha256
 *   - Permite reimpressao identica anos depois (auditoria TCE)
 *   - Permite skip de recalculo se nada mudou (idempotencia)
 */

import type {
  HoleriteCalculado,
  ResultadoINSS,
  ResultadoIRRF,
  ResultadoSalarioFamilia,
  ResultadoFatorProporcional,
  RubricaCalculada,
} from '../types.js'

export type HoleriteSnapshot = {
  versao: number
  vinculoId: string
  pessoaId: string
  competencia: string // YYYY-MM-DD ISO
  regimePrevidenciario: string

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
    fundamentacao: string
    codigoEsocial: string | null
  }>

  proporcionalidade: Array<{
    rubricaId: string
    estrategia: string
    diasComputados: number
    fator: number
    explicacao: string
  }>

  inss: {
    base: number
    valor: number
    aliquotaEfetiva: number
    tetoAplicado: boolean
    tabelaOrigem: string
    fundamentacao: string
    faixas: Array<{ ordem: number; aliquota: number; valor: number }>
  }

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

  salarioFamilia: {
    base: number
    numeroFilhosElegiveis: number
    valorPorFilho: number
    valorTotal: number
    fonteValor: string
    fundamentacao: string
  } | null

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

  metadata: {
    calculadoEm: string
    duracaoMs: number
    workerId: string | null
    engineVersao: string
  }
}

export const ENGINE_VERSAO = '1.0.0' // bump quando logica fiscal mudar

export function montarSnapshot(holerite: HoleriteCalculado): HoleriteSnapshot {
  return {
    versao: holerite.versao,
    vinculoId: holerite.vinculoId,
    pessoaId: holerite.pessoaId,
    competencia: holerite.competencia.toISOString().slice(0, 10),
    regimePrevidenciario: '', // preenchido pelo orquestrador

    rubricas: holerite.rubricas.map(rubricaParaSnapshot),
    proporcionalidade: holerite.proporcionalidade.map(proporcionalidadeParaSnapshot),

    inss: inssParaSnapshot(holerite.inss),
    irrf: irrfParaSnapshot(holerite.irrf),
    salarioFamilia: holerite.salarioFamilia
      ? salarioFamiliaParaSnapshot(holerite.salarioFamilia)
      : null,

    totais: holerite.totais,

    metadata: {
      calculadoEm: holerite.calculadoEm.toISOString(),
      duracaoMs: holerite.duracaoMs,
      workerId: holerite.workerId ?? null,
      engineVersao: ENGINE_VERSAO,
    },
  }
}

function rubricaParaSnapshot(r: RubricaCalculada): HoleriteSnapshot['rubricas'][number] {
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
    fundamentacao: r.fundamentacao,
    codigoEsocial: r.codigoEsocial ?? null,
  }
}

function proporcionalidadeParaSnapshot(
  p: ResultadoFatorProporcional,
): HoleriteSnapshot['proporcionalidade'][number] {
  return {
    rubricaId: p.rubricaId,
    estrategia: p.estrategia,
    diasComputados: p.diasComputados,
    fator: p.fator,
    explicacao: p.explicacao,
  }
}

function inssParaSnapshot(i: ResultadoINSS): HoleriteSnapshot['inss'] {
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

function irrfParaSnapshot(i: ResultadoIRRF): HoleriteSnapshot['irrf'] {
  return {
    base: i.base,
    valor: i.valor,
    cenarioUtilizado: i.cenarioUtilizado,
    cenarios: i.cenariosCalculados.map((c) => ({
      nome: c.nome,
      valor: c.valor,
      aplicavel: c.aplicavel,
    })),
    deducoes: i.deducoesAplicadas.map((d) => ({
      tipo: d.tipo,
      valor: d.valor,
    })),
    tabelaOrigem: i.tabelaOrigem,
    fundamentacao: i.fundamentacao,
  }
}

function salarioFamiliaParaSnapshot(
  s: ResultadoSalarioFamilia,
): NonNullable<HoleriteSnapshot['salarioFamilia']> {
  return {
    base: s.base,
    numeroFilhosElegiveis: s.numeroFilhosElegiveis,
    valorPorFilho: s.valorPorFilho,
    valorTotal: s.valorTotal,
    fonteValor: s.fonteValor,
    fundamentacao: s.fundamentacao,
  }
}
