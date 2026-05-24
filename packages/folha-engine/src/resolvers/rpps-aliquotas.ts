/**
 * Resolver de RPPS aliquotas (apenas tenant -- nao tem federal).
 *
 * Retorna `null` se o municipio nao tem RPPS configurado (todos servidores RGPS).
 * NAO lanca erro neste caso -- o erro so e lancado se um vinculo RPPS especifico
 * tentar usar e nao tiver aliquota (responsabilidade da calculadora INSS).
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { and, eq, gte, isNull, lte, or, desc } from 'drizzle-orm'
import {
  rppsAliquotas,
  type RppsAliquotas,
} from '@saas-municipal/database/schema/folha-calculo'
import { competenciaParaISO } from '../utils/data.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PostgresJsDatabase<any>

export type ResolverRPPSContext = {
  tenantDb: AnyDb
  competencia: Date
}

export async function resolverRppsAliquota(
  ctx: ResolverRPPSContext,
): Promise<RppsAliquotas | null> {
  const competenciaIso = competenciaParaISO(ctx.competencia)

  const resultado = await ctx.tenantDb
    .select()
    .from(rppsAliquotas)
    .where(
      and(
        eq(rppsAliquotas.ativa, true),
        isNull(rppsAliquotas.deletedAt),
        lte(rppsAliquotas.vigenciaInicio, competenciaIso),
        or(
          isNull(rppsAliquotas.vigenciaFim),
          gte(rppsAliquotas.vigenciaFim, competenciaIso),
        ),
      ),
    )
    .orderBy(desc(rppsAliquotas.vigenciaInicio))
    .limit(1)

  return resultado[0] ?? null
}
