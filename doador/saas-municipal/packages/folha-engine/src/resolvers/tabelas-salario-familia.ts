/**
 * Resolver de tabela Salario-familia.
 *
 * Logica especial: NAO existe tabela custom no tenant. Em vez disso, o
 * override municipal vem da `rpps_aliquotas` (campos
 * salario_familia_valor + salario_familia_renda_maxima).
 *
 * Quando override municipal existir, e uma "tabela virtual" -- nao persiste
 * em tabela propria.
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { and, eq, gte, isNull, lte, or, desc } from 'drizzle-orm'
import {
  salarioFamiliaTabelas,
  type SalarioFamiliaTabela,
} from '@saas-municipal/database/schema/folha-publico'
import { TabelaVigenteNaoEncontrada } from '../errors.js'
import { competenciaParaISO } from '../utils/data.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PostgresJsDatabase<any>

export type ResolverSFContext = {
  publicDb: AnyDb
  competencia: Date
}

export async function resolverSalarioFamilia(
  ctx: ResolverSFContext,
): Promise<SalarioFamiliaTabela> {
  const competenciaIso = competenciaParaISO(ctx.competencia)

  const oficial = await ctx.publicDb
    .select()
    .from(salarioFamiliaTabelas)
    .where(
      and(
        eq(salarioFamiliaTabelas.ativa, true),
        eq(salarioFamiliaTabelas.oficial, true),
        isNull(salarioFamiliaTabelas.deletedAt),
        lte(salarioFamiliaTabelas.vigenciaInicio, competenciaIso),
        or(
          isNull(salarioFamiliaTabelas.vigenciaFim),
          gte(salarioFamiliaTabelas.vigenciaFim, competenciaIso),
        ),
      ),
    )
    .orderBy(desc(salarioFamiliaTabelas.vigenciaInicio))
    .limit(1)

  if (oficial.length === 0) {
    throw new TabelaVigenteNaoEncontrada('SALARIO_FAMILIA', ctx.competencia)
  }

  return oficial[0]!
}
