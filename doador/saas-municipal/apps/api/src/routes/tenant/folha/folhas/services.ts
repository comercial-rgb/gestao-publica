/**
 * Logica reutilizavel: validar pre-fechamento + simular holerite.
 * Adaptado ao padrao do codebase (createTenantDatabase + env.DATABASE_URL).
 */

import { and, eq, isNull, lte, or, gte, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

import {
  calcularHolerite,
  montarContextoCalculo,
  resolverRubricasParaVinculos,
  type HoleriteCalculado,
  type RubricaParaCalcular,
} from '@saas-municipal/folha-engine'
import { createMasterDatabase } from '@saas-municipal/database'
import { env } from '../../../../env.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PostgresJsDatabase<any>

// ============================================================
// Validacao pre-fechamento
// ============================================================

export type ErroValidacao = {
  tipo: string
  vinculoId: string | null
  mensagem: string
  bloqueante: boolean
}

export type AvisoValidacao = {
  tipo: string
  vinculoId: string | null
  mensagem: string
}

export async function validarFolha(params: {
  tenantDb: AnyDb
  folhaId: string
  competenciaAno: number
  competenciaMes: number
}): Promise<{
  podeProsseguir: boolean
  totalVinculos: number
  erros: ErroValidacao[]
  avisos: AvisoValidacao[]
}> {
  const { tenantDb, competenciaAno, competenciaMes } = params
  const erros: ErroValidacao[] = []
  const avisos: AvisoValidacao[] = []

  // Data de referencia da competencia
  const compIso = `${competenciaAno}-${String(competenciaMes).padStart(2, '0')}-01`

  // Vinculos ativos na competencia
  const vinculos = await tenantDb.execute(sql`
    SELECT v.id, v.pessoa_id, v.cargo_id, p.tipo AS pessoa_tipo, p.documento AS pessoa_cpf
    FROM vinculos_funcionais v
    JOIN pessoas p ON p.id = v.pessoa_id
    WHERE v.status = 'ativo' AND v.deleted_at IS NULL
      AND v.data_admissao <= ${compIso}
  `) as unknown as Array<Record<string, unknown>>

  if (vinculos.length === 0) {
    erros.push({
      tipo: 'VINCULO_SEM_CARGO',
      vinculoId: null,
      mensagem: 'Nenhum vinculo ativo na competencia',
      bloqueante: true,
    })
    return { podeProsseguir: false, totalVinculos: 0, erros, avisos }
  }

  for (const v of vinculos) {
    if (!v.cargo_id) {
      erros.push({
        tipo: 'VINCULO_SEM_CARGO',
        vinculoId: String(v.id),
        mensagem: `Vinculo ${String(v.id).slice(0, 8)} sem cargo definido`,
        bloqueante: true,
      })
    }
    if (v.pessoa_tipo !== 'PF') {
      erros.push({
        tipo: 'PESSOA_NAO_PF',
        vinculoId: String(v.id),
        mensagem: `Pessoa do vinculo nao eh PF`,
        bloqueante: true,
      })
    }
    if (!v.pessoa_cpf) {
      erros.push({
        tipo: 'PESSOA_SEM_CPF',
        vinculoId: String(v.id),
        mensagem: `Pessoa sem CPF`,
        bloqueante: true,
      })
    }
  }

  // Rubricas resolvidas
  const compDate = new Date(Date.UTC(competenciaAno, competenciaMes - 1, 1))
  const vinculoIds = vinculos.map((v) => String(v.id))
  const rubricasIndexadas = await resolverRubricasParaVinculos({
    tenantDb,
    vinculoIds,
    competencia: compDate,
  })
  for (const vid of vinculoIds) {
    const lista = rubricasIndexadas.get(vid) ?? []
    if (lista.length === 0) {
      erros.push({
        tipo: 'VINCULO_SEM_RUBRICAS',
        vinculoId: vid,
        mensagem: `Vinculo ${vid.slice(0, 8)} sem rubricas resolvidas`,
        bloqueante: true,
      })
    }
  }

  // Tabela INSS vigente
  const publicDb = createMasterDatabase(env.DATABASE_URL)
  const inssCheck = await publicDb.execute(sql`
    SELECT COUNT(*)::int AS c FROM public.inss_tabelas
    WHERE vigencia_inicio <= ${compIso}
      AND (vigencia_fim IS NULL OR vigencia_fim >= ${compIso})
      AND ativa = true AND deleted_at IS NULL
  `) as unknown as Array<{ c: number }>
  if (!inssCheck[0] || inssCheck[0].c === 0) {
    erros.push({
      tipo: 'TABELA_FISCAL_AUSENTE',
      vinculoId: null,
      mensagem: `Tabela INSS sem vigencia em ${competenciaAno}-${String(competenciaMes).padStart(2, '0')}`,
      bloqueante: true,
    })
  }

  const bloqueantes = erros.filter((e) => e.bloqueante).length
  return {
    podeProsseguir: bloqueantes === 0,
    totalVinculos: vinculos.length,
    erros,
    avisos,
  }
}

// ============================================================
// Simulacao sincrona (sem persistir)
// ============================================================

export async function simularHolerite(params: {
  tenantDb: AnyDb
  publicDb: AnyDb
  folhaId: string
  vinculoId: string
  competenciaAno: number
  competenciaMes: number
  overrides?: {
    rubricasOverride?: Array<{ rubricaId: string; valorBase: number }>
  }
}): Promise<HoleriteCalculado> {
  const { tenantDb, publicDb, vinculoId, competenciaAno, competenciaMes, overrides } = params
  const compDate = new Date(Date.UTC(competenciaAno, competenciaMes - 1, 1))

  // Busca regime do vinculo
  const vinculoRows = await tenantDb.execute(sql`
    SELECT pessoa_id, regime_previdenciario FROM vinculos_funcionais WHERE id = ${vinculoId} AND deleted_at IS NULL LIMIT 1
  `) as unknown as Array<{ pessoa_id: string; regime_previdenciario: string }>
  if (vinculoRows.length === 0) throw new Error(`Vinculo ${vinculoId} nao encontrado`)

  const contexto = await montarContextoCalculo({
    publicDb,
    tenantDb,
    vinculoId,
    pessoaId: vinculoRows[0]!.pessoa_id,
    competencia: compDate,
    regimePrevidenciario: vinculoRows[0]!.regime_previdenciario as any,
    workerId: 'api-sim',
  })

  const indexadas = await resolverRubricasParaVinculos({
    tenantDb,
    vinculoIds: [vinculoId],
    competencia: compDate,
  })
  let rubricas: RubricaParaCalcular[] = indexadas.get(vinculoId) ?? []

  if (overrides?.rubricasOverride?.length) {
    const m = new Map(overrides.rubricasOverride.map((r) => [r.rubricaId, r.valorBase]))
    rubricas = rubricas.map((r) => (m.has(r.rubricaId) ? { ...r, valorBase: m.get(r.rubricaId)! } : r))
  }

  return calcularHolerite({ contexto, rubricas, workerId: 'api-sim' })
}

// ============================================================
// Transicoes de estado
// ============================================================

const TRANSICOES: Record<string, string[]> = {
  em_elaboracao: ['calculando', 'cancelada'],
  calculando: ['calculada', 'em_elaboracao'],
  calculada: ['em_revisao', 'aprovada', 'calculando'],
  em_revisao: ['calculada', 'calculando'],
  aprovada: ['encerrada', 'em_revisao'],
  encerrada: ['em_revisao'],
  cancelada: [],
}

export function podeTransicionar(de: string, para: string): boolean {
  return (TRANSICOES[de] ?? []).includes(para)
}
