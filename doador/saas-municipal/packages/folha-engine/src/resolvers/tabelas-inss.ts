/**
 * Resolver de tabela INSS (3 camadas -- decisao B34.5):
 *   1. Snapshot no holerite (camada 1) -- nao e responsabilidade deste resolver
 *   2. Override municipal em inss_tabelas_custom (camada 2)
 *   3. Federal oficial em public.inss_tabelas (camada 3)
 *
 * Pra performance em folhas grandes (15k servidores), o engine deve
 * cachear o resultado UMA vez por job (mesma competencia), nao chamar
 * o resolver pra cada holerite.
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { and, eq, gte, isNull, lte, or, desc } from 'drizzle-orm'
import {
  inssTabelas,
  inssTabelasFaixas,
  type InssTabelaCompleta,
} from '@saas-municipal/database/schema/folha-publico'
import {
  inssTabelasCustom,
  inssTabelasCustomFaixas,
} from '@saas-municipal/database/schema/folha-calculo'
import { TabelaVigenteNaoEncontrada } from '../errors.js'
import { competenciaParaISO } from '../utils/data.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PostgresJsDatabase<any>

export type ResolverINSSContext = {
  publicDb: AnyDb
  tenantDb: AnyDb
  competencia: Date
}

/**
 * Resolve a tabela INSS vigente seguindo as 3 camadas.
 *
 * @throws TabelaVigenteNaoEncontrada se nenhuma tabela vigente for encontrada
 */
export async function resolverTabelaInss(
  ctx: ResolverINSSContext,
): Promise<InssTabelaCompleta> {
  const competenciaIso = competenciaParaISO(ctx.competencia)

  // ============================================================
  // CAMADA 2: tenta override municipal (mais especifico vence)
  // ============================================================

  const custom = await ctx.tenantDb
    .select()
    .from(inssTabelasCustom)
    .where(
      and(
        eq(inssTabelasCustom.ativa, true),
        isNull(inssTabelasCustom.deletedAt),
        lte(inssTabelasCustom.vigenciaInicio, competenciaIso),
        or(
          isNull(inssTabelasCustom.vigenciaFim),
          gte(inssTabelasCustom.vigenciaFim, competenciaIso),
        ),
      ),
    )
    .orderBy(desc(inssTabelasCustom.vigenciaInicio))
    .limit(1)

  if (custom.length > 0) {
    const tabela = custom[0]!
    const faixas = await ctx.tenantDb
      .select()
      .from(inssTabelasCustomFaixas)
      .where(eq(inssTabelasCustomFaixas.tabelaId, tabela.id))
      .orderBy(inssTabelasCustomFaixas.ordem)

    // Map pro formato compativel com InssTabelaCompleta
    return {
      ...tabela,
      oficial: false,
      faixas,
      origem: 'TENANT_CUSTOM',
    } as unknown as InssTabelaCompleta
  }

  // ============================================================
  // CAMADA 3: fallback federal oficial
  // ============================================================

  const oficial = await ctx.publicDb
    .select()
    .from(inssTabelas)
    .where(
      and(
        eq(inssTabelas.ativa, true),
        eq(inssTabelas.oficial, true),
        isNull(inssTabelas.deletedAt),
        lte(inssTabelas.vigenciaInicio, competenciaIso),
        or(
          isNull(inssTabelas.vigenciaFim),
          gte(inssTabelas.vigenciaFim, competenciaIso),
        ),
      ),
    )
    .orderBy(desc(inssTabelas.vigenciaInicio))
    .limit(1)

  if (oficial.length === 0) {
    throw new TabelaVigenteNaoEncontrada('INSS', ctx.competencia)
  }

  const tabela = oficial[0]!
  const faixas = await ctx.publicDb
    .select()
    .from(inssTabelasFaixas)
    .where(eq(inssTabelasFaixas.tabelaId, tabela.id))
    .orderBy(inssTabelasFaixas.ordem)

  return {
    ...tabela,
    faixas,
    origem: 'FEDERAL_OFICIAL',
  }
}
