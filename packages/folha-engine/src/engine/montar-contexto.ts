/**
 * Monta o ContextoCalculo a partir das queries do DB.
 *
 * IMPORTANTE: faz N queries paralelas (resolvers + dependentes + eventos +
 * consignacoes + outros vinculos). Para folhas grandes, o orquestrador
 * superior deve CACHEAR o contexto resolvido por vinculo no inicio do job.
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { and, eq, gte, isNull, lte } from 'drizzle-orm'
import {
  pessoaDependentes,
  folhaEventosFuncional,
  consignacoesAtivas,
} from '@saas-municipal/database/schema/folha-calculo'
import {
  resolverTabelaInss,
  resolverTabelaIrrf,
  resolverSalarioFamilia,
  resolverRppsAliquota,
} from '../resolvers/index.js'
import { competenciaParaISO } from '../utils/data.js'
import type {
  ContextoCalculo,
  RegimePrevidenciario,
} from '../types.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PostgresJsDatabase<any>

export type MontarContextoParams = {
  publicDb: AnyDb
  tenantDb: AnyDb
  vinculoId: string
  pessoaId: string
  competencia: Date
  regimePrevidenciario: RegimePrevidenciario
  workerId?: string
}

export async function montarContextoCalculo(
  params: MontarContextoParams,
): Promise<ContextoCalculo> {
  const {
    publicDb,
    tenantDb,
    vinculoId,
    pessoaId,
    competencia,
    regimePrevidenciario,
    workerId,
  } = params

  const competenciaIso = competenciaParaISO(competencia)

  // Paraleliza as 7 queries (4 resolvers + 3 buscas tenant)
  const [
    tabelaInss,
    tabelaIrrf,
    salarioFamiliaTabela,
    rppsAliquota,
    dependentes,
    eventos,
    consignacoes,
  ] = await Promise.all([
    resolverTabelaInss({ publicDb, tenantDb, competencia }),
    resolverTabelaIrrf({ publicDb, tenantDb, competencia }),
    resolverSalarioFamilia({ publicDb, competencia }),
    resolverRppsAliquota({ tenantDb, competencia }),

    // Dependentes da pessoa
    tenantDb
      .select()
      .from(pessoaDependentes)
      .where(
        and(
          eq(pessoaDependentes.pessoaId, pessoaId),
          isNull(pessoaDependentes.deletedAt),
        ),
      ),

    // Eventos da competencia
    tenantDb
      .select()
      .from(folhaEventosFuncional)
      .where(
        and(
          eq(folhaEventosFuncional.vinculoId, vinculoId),
          eq(folhaEventosFuncional.competencia, competenciaIso),
          isNull(folhaEventosFuncional.deletedAt),
        ),
      ),

    // Consignacoes ativas
    tenantDb
      .select()
      .from(consignacoesAtivas)
      .where(
        and(
          eq(consignacoesAtivas.vinculoId, vinculoId),
          eq(consignacoesAtivas.ativa, true),
          isNull(consignacoesAtivas.deletedAt),
          lte(consignacoesAtivas.dataInicio, competenciaIso),
          gte(consignacoesAtivas.dataFim, competenciaIso),
        ),
      ),
  ])

  return {
    vinculoId,
    pessoaId,
    competencia,
    regimePrevidenciario,

    tabelaInss,
    tabelaIrrf,
    salarioFamiliaTabela,
    rppsAliquota,

    eventos: eventos as ContextoCalculo['eventos'],
    dependentes: dependentes as ContextoCalculo['dependentes'],
    consignacoes: consignacoes as ContextoCalculo['consignacoes'],

    // outros vinculos da pessoa serao preenchidos pelo orquestrador
    // de nivel superior se existir mais de 1 vinculo
    outrosVinculosDaPessoa: [],

    workerId,
  }
}
