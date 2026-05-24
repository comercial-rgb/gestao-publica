/**
 * Schema PUBLICO (compartilhado entre todos os tenants)
 *
 * Contem tabelas oficiais federais:
 * - INSS (Portaria Interministerial MPS/MF anual)
 * - IRRF (Lei 15.270/2025 da Reforma do IR)
 * - Salario-familia (Portaria MPS anual)
 *
 * Arquitetura 3 camadas (B34.5 decisao 1):
 *   1. ESTE arquivo (federal oficial)
 *   2. *_custom no schema do tenant (override municipal)
 *   3. Snapshot imutavel no holerite
 *
 * Lembretes ativos:
 *   - ADR-006: soft delete em entidades duraveis
 *   - ADR-007: SEM triggers PostgreSQL
 *   - ADR-008: migrations versionadas no git
 *   - H16: SEM ::text em UPDATEs de colunas numeric
 */

import {
  pgTable,
  uuid,
  text,
  numeric,
  date,
  timestamp,
  boolean,
  integer,
  index,
  check,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

/** Origem da tabela usada no calculo (metadado runtime, nao persistido aqui) */
export type OrigemTabela = 'FEDERAL_OFICIAL' | 'TENANT_CUSTOM' | 'AD_HOC'

// ============================================================
// 1. INSS -- Cabecalho + faixas progressivas
// ============================================================

export const inssTabelas = pgTable(
  'inss_tabelas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vigenciaInicio: date('vigencia_inicio').notNull(),
    vigenciaFim: date('vigencia_fim'), // null = vigente indefinidamente

    // Teto de contribuicao (acima disso nao desconta)
    tetoContribuicao: numeric('teto_contribuicao', { precision: 15, scale: 2 }).notNull(),

    // Desconto maximo possivel (somatorio das contribuicoes por faixa)
    // Pre-calculado pra performance e auditoria
    descontoMaximo: numeric('desconto_maximo', { precision: 15, scale: 2 }).notNull(),

    oficial: boolean('oficial').notNull().default(true),
    fundamentacaoLegal: text('fundamentacao_legal').notNull(),
    observacoes: text('observacoes'),
    ativa: boolean('ativa').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    // Partial index -- so linhas vigentes e nao deletadas (lookup principal)
    idxVigencia: index('idx_inss_tabelas_vigencia')
      .on(t.vigenciaInicio, t.vigenciaFim)
      .where(sql`${t.deletedAt} IS NULL AND ${t.ativa} = true`),

    chkVigencia: check(
      'chk_inss_vigencia',
      sql`${t.vigenciaFim} IS NULL OR ${t.vigenciaFim} > ${t.vigenciaInicio}`,
    ),
    chkTetoPositivo: check('chk_inss_teto_positivo', sql`${t.tetoContribuicao} > 0`),
    chkDescontoMaxPositivo: check('chk_inss_desconto_max_positivo', sql`${t.descontoMaximo} > 0`),
  }),
)

export const inssTabelasFaixas = pgTable(
  'inss_tabelas_faixas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tabelaId: uuid('tabela_id')
      .notNull()
      .references(() => inssTabelas.id, { onDelete: 'cascade' }),

    ordem: integer('ordem').notNull(), // 1, 2, 3, 4

    faixaInicio: numeric('faixa_inicio', { precision: 15, scale: 2 }).notNull(),
    faixaFim: numeric('faixa_fim', { precision: 15, scale: 2 }).notNull(),

    // Aliquota: 0.0750 = 7,5%
    aliquota: numeric('aliquota', { precision: 6, scale: 4 }).notNull(),

    // Parcela a deduzir (atalho matematico do calculo)
    // Ex INSS 2026 faixa 2: 24,32
    parcelaDeduzir: numeric('parcela_deduzir', { precision: 15, scale: 2 }).notNull().default('0'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxTabela: index('idx_inss_faixas_tabela').on(t.tabelaId, t.ordem),

    chkFaixaPositiva: check(
      'chk_inss_faixa_positiva',
      sql`${t.faixaInicio} >= 0 AND ${t.faixaFim} > ${t.faixaInicio}`,
    ),
    chkAliquotaValida: check(
      'chk_inss_aliquota_valida',
      sql`${t.aliquota} > 0 AND ${t.aliquota} <= 1`,
    ),
    chkOrdemPositiva: check('chk_inss_ordem_positiva', sql`${t.ordem} >= 1`),
  }),
)

// ============================================================
// 2. IRRF -- Cabecalho + faixas + Reforma Lei 15.270/2025
// ============================================================

export const irrfTabelas = pgTable(
  'irrf_tabelas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vigenciaInicio: date('vigencia_inicio').notNull(),
    vigenciaFim: date('vigencia_fim'),

    // Deducao por dependente (R$ 189,59 em 2026)
    deducaoPorDependente: numeric('deducao_por_dependente', {
      precision: 15,
      scale: 2,
    }).notNull(),

    // Desconto simplificado mensal alternativo (R$ 607,20 em 2026)
    // Sempre comparado vs deducoes legais -- engine escolhe o melhor
    descontoSimplificado: numeric('desconto_simplificado', {
      precision: 15,
      scale: 2,
    }).notNull(),

    // Isencao previdenciaria para maiores de 65 anos (R$ 1.903,98 em 2026)
    isencaoMaior65Anos: numeric('isencao_maior_65_anos', { precision: 15, scale: 2 }).notNull(),

    // ============================================================
    // REFORMA DO IR (Lei 15.270/2025) -- so preenchido p/ 2026+
    // Formula do redutor: max(0, redutorBase - (redutorFator x rendaBruta))
    // 2026: 978,62 - (0,133145 x rendaBruta), zerando para renda <= 5.000
    // ============================================================
    redutorBase: numeric('redutor_base', { precision: 15, scale: 2 }),
    redutorFator: numeric('redutor_fator', { precision: 10, scale: 8 }),
    redutorRendaMaxima: numeric('redutor_renda_maxima', { precision: 15, scale: 2 }),

    oficial: boolean('oficial').notNull().default(true),
    fundamentacaoLegal: text('fundamentacao_legal').notNull(),
    observacoes: text('observacoes'),
    ativa: boolean('ativa').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    idxVigencia: index('idx_irrf_tabelas_vigencia')
      .on(t.vigenciaInicio, t.vigenciaFim)
      .where(sql`${t.deletedAt} IS NULL AND ${t.ativa} = true`),

    chkVigencia: check(
      'chk_irrf_vigencia',
      sql`${t.vigenciaFim} IS NULL OR ${t.vigenciaFim} > ${t.vigenciaInicio}`,
    ),
    chkDeducaoPositiva: check('chk_irrf_deducao_positiva', sql`${t.deducaoPorDependente} > 0`),
    chkDescontoSimplificado: check(
      'chk_irrf_desconto_simplificado',
      sql`${t.descontoSimplificado} > 0`,
    ),
    // Redutor: ou TODOS preenchidos ou TODOS null (consistencia da Reforma)
    chkRedutorConsistente: check(
      'chk_irrf_redutor_consistente',
      sql`(${t.redutorBase} IS NULL AND ${t.redutorFator} IS NULL AND ${t.redutorRendaMaxima} IS NULL)
       OR (${t.redutorBase} IS NOT NULL AND ${t.redutorFator} IS NOT NULL AND ${t.redutorRendaMaxima} IS NOT NULL)`,
    ),
  }),
)

export const irrfTabelasFaixas = pgTable(
  'irrf_tabelas_faixas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tabelaId: uuid('tabela_id')
      .notNull()
      .references(() => irrfTabelas.id, { onDelete: 'cascade' }),

    ordem: integer('ordem').notNull(), // 1=isento, 2-5

    baseInicio: numeric('base_inicio', { precision: 15, scale: 2 }).notNull(),
    // null na ultima faixa (acima de X -- sem limite superior)
    baseFim: numeric('base_fim', { precision: 15, scale: 2 }),

    // 0.0000 (isento) ate 0.2750 (27,5%)
    aliquota: numeric('aliquota', { precision: 6, scale: 4 }).notNull(),
    parcelaDeduzir: numeric('parcela_deduzir', { precision: 15, scale: 2 }).notNull().default('0'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxTabela: index('idx_irrf_faixas_tabela').on(t.tabelaId, t.ordem),

    chkBasePositiva: check('chk_irrf_base_positiva', sql`${t.baseInicio} >= 0`),
    chkAliquotaValida: check(
      'chk_irrf_aliquota_valida',
      sql`${t.aliquota} >= 0 AND ${t.aliquota} <= 1`,
    ),
    chkOrdemPositiva: check('chk_irrf_ordem_positiva', sql`${t.ordem} >= 1`),
  }),
)

// ============================================================
// 3. Salario-familia -- Tabela federal
// ============================================================

export const salarioFamiliaTabelas = pgTable(
  'salario_familia_tabelas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vigenciaInicio: date('vigencia_inicio').notNull(),
    vigenciaFim: date('vigencia_fim'),

    // Renda maxima do servidor pra ter direito
    rendaMaxima: numeric('renda_maxima', { precision: 15, scale: 2 }).notNull(),

    // Valor pago por filho elegivel
    valorPorFilho: numeric('valor_por_filho', { precision: 15, scale: 2 }).notNull(),

    // Idade maxima do filho (default 14 anos, exceto invalidos)
    idadeMaximaFilho: integer('idade_maxima_filho').notNull().default(14),

    oficial: boolean('oficial').notNull().default(true),
    fundamentacaoLegal: text('fundamentacao_legal').notNull(),
    ativa: boolean('ativa').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    idxVigencia: index('idx_salario_familia_vigencia')
      .on(t.vigenciaInicio, t.vigenciaFim)
      .where(sql`${t.deletedAt} IS NULL AND ${t.ativa} = true`),

    chkVigencia: check(
      'chk_sf_vigencia',
      sql`${t.vigenciaFim} IS NULL OR ${t.vigenciaFim} > ${t.vigenciaInicio}`,
    ),
    chkValores: check(
      'chk_sf_valores_positivos',
      sql`${t.rendaMaxima} > 0 AND ${t.valorPorFilho} > 0`,
    ),
    chkIdade: check(
      'chk_sf_idade',
      sql`${t.idadeMaximaFilho} >= 1 AND ${t.idadeMaximaFilho} <= 21`,
    ),
  }),
)

// ============================================================
// Types pro engine de calculo (consumidos por packages/folha-engine)
// ============================================================

export type InssTabela = typeof inssTabelas.$inferSelect
export type InssTabelaFaixa = typeof inssTabelasFaixas.$inferSelect
export type InssTabelaCompleta = InssTabela & {
  faixas: InssTabelaFaixa[]
  origem?: OrigemTabela
}

export type IrrfTabela = typeof irrfTabelas.$inferSelect
export type IrrfTabelaFaixa = typeof irrfTabelasFaixas.$inferSelect
export type IrrfTabelaCompleta = IrrfTabela & {
  faixas: IrrfTabelaFaixa[]
  origem?: OrigemTabela
}

export type SalarioFamiliaTabela = typeof salarioFamiliaTabelas.$inferSelect
