/**
 * Seed das tabelas publicas de folha (INSS, IRRF, Salario-familia) 2020-2026.
 *
 * IDEMPOTENCIA: verifica existencia por vigencia. Pode rodar varias vezes sem duplicar.
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { eq, and } from 'drizzle-orm'
import {
  inssTabelas,
  inssTabelasFaixas,
  irrfTabelas,
  irrfTabelasFaixas,
  salarioFamiliaTabelas,
} from '../schema/folha-publico.js'
import { INSS_HISTORICO } from './dados/inss-historico.js'
import { IRRF_HISTORICO } from './dados/irrf-historico.js'
import { SALARIO_FAMILIA_HISTORICO } from './dados/salario-familia-historico.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>

export async function seedFolhaPublico(db: Db): Promise<{
  inssCriadas: number
  irrfCriadas: number
  salarioFamiliaCriadas: number
}> {
  let inssCriadas = 0
  let irrfCriadas = 0
  let salarioFamiliaCriadas = 0

  // ===========================================================
  // INSS
  // ===========================================================
  for (const tabela of INSS_HISTORICO) {
    const existente = await db
      .select({ id: inssTabelas.id })
      .from(inssTabelas)
      .where(
        and(
          eq(inssTabelas.vigenciaInicio, tabela.vigenciaInicio),
          eq(inssTabelas.oficial, true),
        ),
      )
      .limit(1)

    if (existente.length > 0) continue

    const rows = await db
      .insert(inssTabelas)
      .values({
        vigenciaInicio: tabela.vigenciaInicio,
        vigenciaFim: tabela.vigenciaFim,
        tetoContribuicao: tabela.tetoContribuicao,
        descontoMaximo: tabela.descontoMaximo,
        oficial: true,
        fundamentacaoLegal: tabela.fundamentacaoLegal,
        observacoes: tabela.observacoes,
        ativa: true,
      })
      .returning({ id: inssTabelas.id })

    const tabelaId = rows[0]!.id

    await db.insert(inssTabelasFaixas).values(
      tabela.faixas.map((f) => ({
        tabelaId,
        ordem: f.ordem,
        faixaInicio: f.faixaInicio,
        faixaFim: f.faixaFim,
        aliquota: f.aliquota,
        parcelaDeduzir: f.parcelaDeduzir,
      })),
    )

    inssCriadas++
  }

  // ===========================================================
  // IRRF
  // ===========================================================
  for (const tabela of IRRF_HISTORICO) {
    const existente = await db
      .select({ id: irrfTabelas.id })
      .from(irrfTabelas)
      .where(
        and(eq(irrfTabelas.vigenciaInicio, tabela.vigenciaInicio), eq(irrfTabelas.oficial, true)),
      )
      .limit(1)

    if (existente.length > 0) continue

    const rows = await db
      .insert(irrfTabelas)
      .values({
        vigenciaInicio: tabela.vigenciaInicio,
        vigenciaFim: tabela.vigenciaFim,
        deducaoPorDependente: tabela.deducaoPorDependente,
        descontoSimplificado: tabela.descontoSimplificado,
        isencaoMaior65Anos: tabela.isencaoMaior65Anos,
        redutorBase: tabela.redutorBase,
        redutorFator: tabela.redutorFator,
        redutorRendaMaxima: tabela.redutorRendaMaxima,
        oficial: true,
        fundamentacaoLegal: tabela.fundamentacaoLegal,
        observacoes: tabela.observacoes,
        ativa: true,
      })
      .returning({ id: irrfTabelas.id })

    const tabelaId = rows[0]!.id

    await db.insert(irrfTabelasFaixas).values(
      tabela.faixas.map((f) => ({
        tabelaId,
        ordem: f.ordem,
        baseInicio: f.baseInicio,
        baseFim: f.baseFim,
        aliquota: f.aliquota,
        parcelaDeduzir: f.parcelaDeduzir,
      })),
    )

    irrfCriadas++
  }

  // ===========================================================
  // Salario-familia
  // ===========================================================
  for (const tabela of SALARIO_FAMILIA_HISTORICO) {
    const existente = await db
      .select({ id: salarioFamiliaTabelas.id })
      .from(salarioFamiliaTabelas)
      .where(
        and(
          eq(salarioFamiliaTabelas.vigenciaInicio, tabela.vigenciaInicio),
          eq(salarioFamiliaTabelas.oficial, true),
        ),
      )
      .limit(1)

    if (existente.length > 0) continue

    await db.insert(salarioFamiliaTabelas).values({
      vigenciaInicio: tabela.vigenciaInicio,
      vigenciaFim: tabela.vigenciaFim,
      rendaMaxima: tabela.rendaMaxima,
      valorPorFilho: tabela.valorPorFilho,
      idadeMaximaFilho: tabela.idadeMaximaFilho,
      oficial: true,
      fundamentacaoLegal: tabela.fundamentacaoLegal,
      ativa: true,
    })

    salarioFamiliaCriadas++
  }

  return { inssCriadas, irrfCriadas, salarioFamiliaCriadas }
}
