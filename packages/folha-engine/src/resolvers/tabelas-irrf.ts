/**
 * Resolver de tabela IRRF (3 camadas).
 *
 * NOTA TECNICA (tech debt):
 *   Tabelas pre-2024-02 tem `desconto_simplificado` com placeholder
 *   (workaround do CHECK > 0). O engine identifica que o cenario SIMPLIFICADO
 *   nao e aplicavel usando a DATA da vigencia, nao o valor da coluna.
 *
 *   Marcador de aplicabilidade: vigenciaInicio >= '2024-02-01'
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { and, eq, gte, isNull, lte, or, desc } from 'drizzle-orm'
import {
  irrfTabelas,
  irrfTabelasFaixas,
  type IrrfTabelaCompleta,
} from '@saas-municipal/database/schema/folha-publico'
import {
  irrfTabelasCustom,
  irrfTabelasCustomFaixas,
} from '@saas-municipal/database/schema/folha-calculo'
import { TabelaVigenteNaoEncontrada } from '../errors.js'
import { competenciaParaISO } from '../utils/data.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PostgresJsDatabase<any>

export type ResolverIRRFContext = {
  publicDb: AnyDb
  tenantDb: AnyDb
  competencia: Date
}

/** Data a partir da qual o cenario SIMPLIFICADO passa a ser aplicavel */
export const DATA_INICIO_DESCONTO_SIMPLIFICADO = new Date('2024-02-01T00:00:00.000Z')

/** Data a partir da qual o REDUTOR da Reforma 15.270/2025 passa a valer */
export const DATA_INICIO_REFORMA_IR = new Date('2026-01-01T00:00:00.000Z')

export async function resolverTabelaIrrf(
  ctx: ResolverIRRFContext,
): Promise<IrrfTabelaCompleta> {
  const competenciaIso = competenciaParaISO(ctx.competencia)

  // CAMADA 2: override municipal
  const custom = await ctx.tenantDb
    .select()
    .from(irrfTabelasCustom)
    .where(
      and(
        eq(irrfTabelasCustom.ativa, true),
        isNull(irrfTabelasCustom.deletedAt),
        lte(irrfTabelasCustom.vigenciaInicio, competenciaIso),
        or(
          isNull(irrfTabelasCustom.vigenciaFim),
          gte(irrfTabelasCustom.vigenciaFim, competenciaIso),
        ),
      ),
    )
    .orderBy(desc(irrfTabelasCustom.vigenciaInicio))
    .limit(1)

  if (custom.length > 0) {
    const tabela = custom[0]!
    const faixas = await ctx.tenantDb
      .select()
      .from(irrfTabelasCustomFaixas)
      .where(eq(irrfTabelasCustomFaixas.tabelaId, tabela.id))
      .orderBy(irrfTabelasCustomFaixas.ordem)

    return {
      ...tabela,
      oficial: false,
      observacoes: tabela.motivoOverride,
      faixas,
      origem: 'TENANT_CUSTOM',
    } as unknown as IrrfTabelaCompleta
  }

  // CAMADA 3: federal oficial
  const oficial = await ctx.publicDb
    .select()
    .from(irrfTabelas)
    .where(
      and(
        eq(irrfTabelas.ativa, true),
        eq(irrfTabelas.oficial, true),
        isNull(irrfTabelas.deletedAt),
        lte(irrfTabelas.vigenciaInicio, competenciaIso),
        or(
          isNull(irrfTabelas.vigenciaFim),
          gte(irrfTabelas.vigenciaFim, competenciaIso),
        ),
      ),
    )
    .orderBy(desc(irrfTabelas.vigenciaInicio))
    .limit(1)

  if (oficial.length === 0) {
    throw new TabelaVigenteNaoEncontrada('IRRF', ctx.competencia)
  }

  const tabela = oficial[0]!
  const faixas = await ctx.publicDb
    .select()
    .from(irrfTabelasFaixas)
    .where(eq(irrfTabelasFaixas.tabelaId, tabela.id))
    .orderBy(irrfTabelasFaixas.ordem)

  return {
    ...tabela,
    faixas,
    origem: 'FEDERAL_OFICIAL',
  }
}

/**
 * Helper: verifica se a tabela IRRF tem desconto simplificado aplicavel.
 *
 * Criterio: vigencia iniciou em ou apos fev/2024 (quando MP 1.171/23 entrou
 * em vigor com desconto simplificado).
 */
export function temDescontoSimplificadoAplicavel(
  tabela: IrrfTabelaCompleta,
): boolean {
  const inicio = typeof tabela.vigenciaInicio === 'string'
    ? new Date(tabela.vigenciaInicio)
    : tabela.vigenciaInicio
  return inicio >= DATA_INICIO_DESCONTO_SIMPLIFICADO
}

/**
 * Helper: verifica se a tabela tem REDUTOR da Reforma 15.270/2025.
 *
 * Criterio dual: vigencia >= 2026-01-01 E campo redutor_base preenchido.
 */
export function temRedutorReforma(tabela: IrrfTabelaCompleta): boolean {
  if (tabela.redutorBase == null) return false
  const inicio = typeof tabela.vigenciaInicio === 'string'
    ? new Date(tabela.vigenciaInicio)
    : tabela.vigenciaInicio
  return inicio >= DATA_INICIO_REFORMA_IR
}
