/**
 * Engine orquestrador -- calcula um holerite completo dado um contexto.
 *
 * E uma FUNCAO PURA: recebe contexto + rubricas, retorna holerite.
 * Nao consulta DB. Quem busca os dados e `montarContextoCalculo` (separado).
 *
 * Permite:
 *   - Testar sem DB (passa mock)
 *   - Reutilizar contexto em batch (resolve tabelas 1x, calcula 1000 holerites)
 *   - Performance previsivel (sem I/O dentro do calculo)
 */

import { hashSnapshotSha256 } from '@saas-municipal/database/utils/hash-snapshot'
import { arredondar2, somarArredondado } from '../utils/decimal.js'
import { idadeNaData } from '../utils/data.js'
import { calcularFatorProporcionalidade } from '../calculadoras/proporcionalidade.js'
import { calcularInss, type ContribuicaoVinculo } from '../calculadoras/inss.js'
import { calcularIrrf } from '../calculadoras/irrf.js'
import { calcularSalarioFamilia } from '../calculadoras/salario-familia.js'
import {
  montarSnapshotFiscal,
  montarSnapshotComMetadata,
} from './snapshot.js'
import type {
  ContextoCalculo,
  HoleriteCalculado,
  RubricaCalculada,
  EstrategiaProporcionalidade,
} from '../types.js'

const IDADE_ISENCAO_IRRF = 65

/**
 * Representacao enxuta da rubrica que o engine consome.
 * Quem busca do DB e converte e o orquestrador de nivel superior.
 */
export type RubricaParaCalcular = {
  rubricaId: string
  codigo: string
  descricao: string
  tipo: 'PROVENTO' | 'DESCONTO' | 'INFORMATIVA'
  ordem: number
  estrategiaProporcionalidade: EstrategiaProporcionalidade
  valorBase: number
  incideInss: boolean
  incideIrrf: boolean
  incideFgts: boolean
  fundamentacao: string
  codigoEsocial: string | null
}

export type CalcularHoleriteParams = {
  contexto: ContextoCalculo
  rubricas: RubricaParaCalcular[]
  versao?: number
  /** Pra teto agregado: contribuicoes ja calculadas de OUTROS vinculos */
  contribuicoesInssOutrosVinculos?: ContribuicaoVinculo[]
  /** Data de nascimento da pessoa (pra isencao 65+) */
  dataNascimento?: Date
  /** Pensao alimenticia judicial (dedutivel integral em IRRF) */
  pensaoAlimenticia?: number
  workerId?: string
}

export function calcularHolerite(params: CalcularHoleriteParams): HoleriteCalculado {
  const inicio = Date.now()
  const {
    contexto,
    rubricas: rubricasInput,
    versao = 1,
    dataNascimento,
    pensaoAlimenticia = 0,
    workerId,
  } = params

  // ============================================================
  // 1. Aplicar proporcionalidade em cada rubrica
  // ============================================================
  const rubricasCalculadas: RubricaCalculada[] = []
  const proporcionalidades = []

  for (const rubrica of rubricasInput) {
    const fatorRes = calcularFatorProporcionalidade({
      estrategia: rubrica.estrategiaProporcionalidade,
      rubricaId: rubrica.rubricaId,
      eventos: contexto.eventos,
      competencia: contexto.competencia,
    })

    const valorFinal = arredondar2(rubrica.valorBase * fatorRes.fator)
    const baseInss = rubrica.incideInss ? valorFinal : 0
    const baseIrrf = rubrica.incideIrrf ? valorFinal : 0

    rubricasCalculadas.push({
      rubricaId: rubrica.rubricaId,
      codigo: rubrica.codigo,
      descricao: rubrica.descricao,
      tipo: rubrica.tipo,
      ordem: rubrica.ordem,
      valorBase: arredondar2(rubrica.valorBase),
      fatorProporcionalidade: fatorRes.fator,
      valor: valorFinal,
      incideInss: rubrica.incideInss,
      incideIrrf: rubrica.incideIrrf,
      incideFgts: rubrica.incideFgts,
      baseInss,
      baseIrrf,
      fundamentacao: rubrica.fundamentacao,
      codigoEsocial: rubrica.codigoEsocial ?? undefined,
    })

    proporcionalidades.push(fatorRes)
  }

  // ============================================================
  // 2. Calcular bases consolidadas
  // ============================================================
  const proventos = rubricasCalculadas.filter((r) => r.tipo === 'PROVENTO')
  const descontos = rubricasCalculadas.filter((r) => r.tipo === 'DESCONTO')

  const totalProventos = somarArredondado(proventos.map((r) => r.valor))
  const baseInss = somarArredondado(rubricasCalculadas.filter((r) => r.incideInss).map((r) => r.valor))
  const baseIrrfBruta = somarArredondado(rubricasCalculadas.filter((r) => r.incideIrrf).map((r) => r.valor))

  // ============================================================
  // 3. Calcular INSS
  // ============================================================
  const inss = calcularInss({
    base: baseInss,
    regimePrevidenciario: contexto.regimePrevidenciario,
    tabelaInss: contexto.tabelaInss,
    rppsAliquota: contexto.rppsAliquota,
    competencia: contexto.competencia,
  })

  // ============================================================
  // 4. Calcular IRRF (3 cenarios)
  // ============================================================
  const servidorMaior65 = dataNascimento
    ? idadeNaData(dataNascimento, contexto.competencia) >= IDADE_ISENCAO_IRRF
    : false

  const numeroDependentesIr = contexto.dependentes.filter((d) => d.dependenteIR).length

  const irrf = calcularIrrf({
    rendaBrutaIrrf: baseIrrfBruta,
    inssDeduzido: inss.valor,
    numeroDependentesIr,
    pensaoAlimenticia,
    servidorMaior65Anos: servidorMaior65,
    tabela: contexto.tabelaIrrf,
  })

  // ============================================================
  // 5. Salario-familia
  // ============================================================
  const salarioFamiliaRes = calcularSalarioFamilia({
    rendaMensal: totalProventos,
    dependentes: contexto.dependentes.filter((d) => d.dependenteSalarioFamilia),
    tabelaFederal: contexto.salarioFamiliaTabela,
    rppsAliquota: contexto.rppsAliquota,
    regimePrevidenciario: contexto.regimePrevidenciario,
    competencia: contexto.competencia,
  })

  const salarioFamiliaResultado = salarioFamiliaRes.valorTotal > 0 ? salarioFamiliaRes : null

  // ============================================================
  // 6. Consolidacao de totais
  // ============================================================
  const valorSalarioFamilia = salarioFamiliaRes.valorTotal
  const totalProventosComSF = arredondar2(totalProventos + valorSalarioFamilia)

  const totalConsignacoes = somarArredondado(
    contexto.consignacoes.filter((c) => c.ativa).map((c) => Number(c.valorParcela)),
  )

  const totalDescontosOutros = somarArredondado(descontos.map((r) => r.valor))
  const totalDescontos = somarArredondado([
    inss.valor,
    irrf.valor,
    totalConsignacoes,
    totalDescontosOutros,
  ])

  const bruto = totalProventosComSF
  const liquido = arredondar2(bruto - totalDescontos)

  // Margem consignavel (35% do liquido, decisao 4)
  const margemConsignavelTotal = arredondar2(liquido * 0.35)
  const margemConsignavelDisponivel = arredondar2(margemConsignavelTotal - totalConsignacoes)

  // ============================================================
  // 7. Montar holerite + snapshot + hash
  // ============================================================
  const calculadoEm = new Date()
  const duracaoMs = Date.now() - inicio

  const holeriteBase: HoleriteCalculado = {
    vinculoId: contexto.vinculoId,
    pessoaId: contexto.pessoaId,
    competencia: contexto.competencia,
    versao,
    rubricas: rubricasCalculadas,
    totais: {
      proventos: totalProventosComSF,
      descontos: totalDescontos,
      bruto,
      liquido,
      baseInss,
      baseIrrf: irrf.base,
      margemConsignavelTotal,
      margemConsignavelDisponivel: Math.max(0, margemConsignavelDisponivel),
    },
    inss,
    irrf,
    salarioFamilia: salarioFamiliaResultado,
    proporcionalidade: proporcionalidades,
    snapshot: {}, // preenchido abaixo
    hashSha256: '', // preenchido abaixo
    duracaoMs,
    calculadoEm,
    workerId,
  }

  // Monta snapshot FISCAL (deterministico) pro hash
  const snapshotFiscal = montarSnapshotFiscal(holeriteBase, contexto.regimePrevidenciario)
  const hash = hashSnapshotSha256(snapshotFiscal)

  // Monta snapshot COMPLETO (com metadata) pro DB
  const snapshotComMetadata = montarSnapshotComMetadata(
    holeriteBase,
    contexto.regimePrevidenciario,
  )

  return {
    ...holeriteBase,
    snapshot: snapshotComMetadata as unknown as Record<string, unknown>,
    hashSha256: hash,
  }
}
