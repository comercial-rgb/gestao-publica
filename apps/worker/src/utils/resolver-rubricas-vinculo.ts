/**
 * Resolve o conjunto efetivo de rubricas para um conjunto de vinculos.
 *
 * Hierarquia:
 *   1. rubricasVinculos (B33 -- default atribuido ao vinculo)
 *   2. vinculoRubricas (B35.3B -- override individual com origem/params)
 *
 * Regra de merge:
 *   - Se vinculoRubricas tem (vinculoId, rubricaId) com ativa=true: usa o override
 *   - Se vinculoRubricas tem (vinculoId, rubricaId) com ativa=false: REMOVE
 *   - Caso contrario: usa rubricasVinculos
 *
 * Retorno indexado por vinculoId pra lookup O(1) no job.
 */

import { and, eq, inArray, isNull, lte, or, gte } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { RubricaParaCalcular } from '@saas-municipal/folha-engine'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PostgresJsDatabase<any>

export type RubricasIndexadas = Map<string, RubricaParaCalcular[]>

/**
 * Busca rubricas efetivas para um batch de vinculos.
 * Faz 2 queries: rubricasVinculos (base) + vinculoRubricas (override).
 */
export async function resolverRubricasParaVinculos(params: {
  tenantDb: AnyDb
  vinculoIds: string[]
  competencia: Date
}): Promise<RubricasIndexadas> {
  const { tenantDb, vinculoIds, competencia } = params

  if (vinculoIds.length === 0) return new Map()

  const compIso = competencia.toISOString().slice(0, 10)

  // 1) Busca rubricas base atribuidas (rubricasVinculos do B33 + JOIN rubricas)
  const baseRows = await tenantDb.execute(sql`
    SELECT
      rv.vinculo_id,
      rv.rubrica_id,
      rv.valor,
      rv.percentual,
      rv.quantidade,
      r.codigo,
      r.nome,
      r.tipo,
      r.incide_inss,
      r.incide_irrf,
      r.incide_fgts,
      r.estrategia_proporcionalidade,
      r.codigo_esocial
    FROM rubricas_vinculos rv
    JOIN rubricas r ON r.id = rv.rubrica_id AND r.ativo = true AND r.deleted_at IS NULL AND r.folha_mensal = true
    WHERE rv.vinculo_id = ANY(${vinculoIds}::uuid[])
      AND rv.ativo = true
      AND rv.vigencia_inicio <= ${compIso}
      AND (rv.vigencia_fim IS NULL OR rv.vigencia_fim >= ${compIso})
  `) as unknown as Array<Record<string, unknown>>

  // 2) Busca overrides (vinculoRubricas do B35.3B + JOIN rubricas)
  const overrideRows = await tenantDb.execute(sql`
    SELECT
      vr.vinculo_id,
      vr.rubrica_id,
      vr.valor_base,
      vr.parametros,
      vr.ordem_calculo,
      vr.ativa,
      vr.origem,
      r.codigo,
      r.nome,
      r.tipo,
      r.incide_inss,
      r.incide_irrf,
      r.incide_fgts,
      r.estrategia_proporcionalidade,
      r.codigo_esocial
    FROM vinculo_rubricas vr
    JOIN rubricas r ON r.id = vr.rubrica_id AND r.deleted_at IS NULL
    WHERE vr.vinculo_id = ANY(${vinculoIds}::uuid[])
      AND vr.deleted_at IS NULL
      AND vr.vigencia_inicio <= ${compIso}
      AND (vr.vigencia_fim IS NULL OR vr.vigencia_fim >= ${compIso})
  `) as unknown as Array<Record<string, unknown>>

  // 3) Indexa overrides por (vinculoId:rubricaId)
  const overridePorChave = new Map<string, Record<string, unknown>>()
  for (const o of overrideRows) {
    overridePorChave.set(`${o.vinculo_id}:${o.rubrica_id}`, o)
  }

  // 4) Monta resultado por vinculo
  const resultado: RubricasIndexadas = new Map()

  // Agrupa base rows por vinculoId
  const basePorVinculo = new Map<string, Array<Record<string, unknown>>>()
  for (const r of baseRows) {
    const vid = String(r.vinculo_id)
    const lista = basePorVinculo.get(vid) ?? []
    lista.push(r)
    basePorVinculo.set(vid, lista)
  }

  for (const vinculoId of vinculoIds) {
    const bases = basePorVinculo.get(vinculoId) ?? []
    const lista: RubricaParaCalcular[] = []
    const rubricaIdsJaAdicionadas = new Set<string>()

    // Aplica base com override se existir
    for (const base of bases) {
      const rubricaId = String(base.rubrica_id)
      const ovr = overridePorChave.get(`${vinculoId}:${rubricaId}`)

      if (ovr) {
        // Override explicito: se ativa=false, remove
        if (!ovr.ativa) {
          rubricaIdsJaAdicionadas.add(rubricaId)
          continue
        }
        lista.push(montarRubrica(ovr, Number(ovr.valor_base ?? base.valor ?? 0), Number(ovr.ordem_calculo ?? 100)))
      } else {
        lista.push(montarRubrica(base, Number(base.valor ?? 0), lista.length + 1))
      }
      rubricaIdsJaAdicionadas.add(rubricaId)
    }

    // Adiciona overrides exclusivos (nao existiam na base)
    for (const o of overrideRows) {
      if (String(o.vinculo_id) !== vinculoId) continue
      if (rubricaIdsJaAdicionadas.has(String(o.rubrica_id))) continue
      if (!o.ativa) continue
      lista.push(montarRubrica(o, Number(o.valor_base ?? 0), Number(o.ordem_calculo ?? 100)))
    }

    lista.sort((a, b) => a.ordem - b.ordem)
    resultado.set(vinculoId, lista)
  }

  return resultado
}

function montarRubrica(row: Record<string, unknown>, valorBase: number, ordem: number): RubricaParaCalcular {
  return {
    rubricaId: String(row.rubrica_id),
    codigo: String(row.codigo),
    descricao: String(row.nome),
    tipo: mapTipoRubrica(String(row.tipo)),
    ordem,
    estrategiaProporcionalidade: String(row.estrategia_proporcionalidade) as RubricaParaCalcular['estrategiaProporcionalidade'],
    valorBase,
    incideInss: Boolean(row.incide_inss),
    incideIrrf: Boolean(row.incide_irrf),
    incideFgts: Boolean(row.incide_fgts),
    fundamentacao: `Rubrica ${row.codigo}`,
    codigoEsocial: row.codigo_esocial ? String(row.codigo_esocial) : null,
  }
}

function mapTipoRubrica(tipo: string): 'PROVENTO' | 'DESCONTO' | 'INFORMATIVA' {
  switch (tipo) {
    case 'provento': return 'PROVENTO'
    case 'desconto': return 'DESCONTO'
    case 'informativo':
    case 'base_calculo':
      return 'INFORMATIVA'
    default: return 'PROVENTO'
  }
}
