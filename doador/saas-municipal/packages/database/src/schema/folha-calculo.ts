/**
 * Schema TENANT -- tabelas de calculo da folha de pagamento
 *
 * Resolvido em runtime via search_path do connection string.
 * Drizzle define as tabelas sem prefixo de schema -- o setup
 * de TenantContext (ja existente do B33) injeta o schema correto.
 *
 * Conteudo:
 *   - 4 enums novos (eventos, consignacao, parentesco, progresso)
 *   - regime previdenciario: reutiliza regime_previdenciario de vinculos (B34)
 *   - Overrides custom INSS/IRRF (decisao 1, camada 2)
 *   - RPPS aliquotas
 *   - Dependentes (multiuso: IR + salario-familia + plano saude)
 *   - Eventos funcionais (decisao 3)
 *   - Vinculo <-> dotacoes (bonus B3 -- empenhos por dotacao)
 *   - Consignacoes ativas (decisao 4)
 *   - Log de processamento (auditoria TCE)
 *   - Progresso de jobs BullMQ
 */

import {
  pgEnum,
  pgTable,
  uuid,
  text,
  numeric,
  date,
  timestamp,
  boolean,
  integer,
  varchar,
  jsonb,
  index,
  check,
  unique,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// Referencias (B33/B34 + Camada 2)
import { pessoas, vinculosFuncionais, rubricas, folhas, users, dotacoes, estrategiaProporcionalidadeEnum, regimePrevidenciarioEnum } from './tenant'

// ============================================================
// ENUMS
// ============================================================

// regime previdenciario: vinculos_funcionais.regime_previdenciario (B34) — sem enum duplicado

export const tipoEventoFuncionalEnum = pgEnum('tipo_evento_funcional', [
  'ADMISSAO',
  'DEMISSAO',
  'FALTA_INJUSTIFICADA', // desconta dia + DSR
  'FALTA_JUSTIFICADA', // atestado -- desconta dia, nao DSR
  'AFASTAMENTO_INSS', // > 15 dias INSS assume (CLT)
  'AFASTAMENTO_PROPRIO', // RPPS
  'LICENCA_MATERNIDADE',
  'LICENCA_PATERNIDADE',
  'LICENCA_ADOTANTE',
  'FERIAS_GOZO',
  'LICENCA_PREMIO',
  'LICENCA_NOJO', // 8 dias, nao desconta
  'LICENCA_GALA',
  'SUSPENSAO_DISCIPLINAR',
  'CESSAO_OUTRO_ORGAO',
  'AFASTAMENTO_MANDATO',
])

// estrategiaProporcionalidadeEnum definido em tenant.ts (onde rubricas vive) — importado acima

export const tipoConsignacaoEnum = pgEnum('tipo_consignacao', [
  'EMPRESTIMO',
  'CARTAO_CREDITO',
  'PLANO_SAUDE',
  'PLANO_ODONTOLOGICO',
  'PREVIDENCIA_PRIVADA',
  'PENSAO_ALIMENTICIA',
  'SINDICATO',
  'OUTRO_BENEFICIO',
])

export const parentescoEnum = pgEnum('parentesco', [
  'FILHO',
  'ENTEADO',
  'TUTELADO',
  'GUARDA_JUDICIAL',
  'CONJUGE',
  'COMPANHEIRO',
  'PAI_MAE_AGREGADO',
  'OUTRO',
])

export const statusFolhaProgressoEnum = pgEnum('status_folha_progresso', [
  'PENDENTE',
  'PROCESSANDO',
  'CONCLUIDO',
  'ERRO',
  'CANCELADO',
])

// ============================================================
// 1. RPPS -- Aliquotas municipais de previdencia propria
// ============================================================

export const rppsAliquotas = pgTable(
  'rpps_aliquotas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vigenciaInicio: date('vigencia_inicio').notNull(),
    vigenciaFim: date('vigencia_fim'),

    // Aliquotas (0.1400 = 14%)
    aliquotaServidor: numeric('aliquota_servidor', { precision: 6, scale: 4 }).notNull(),
    aliquotaPatronalNormal: numeric('aliquota_patronal_normal', {
      precision: 6,
      scale: 4,
    }).notNull(),
    aliquotaPatronalSuplementar: numeric('aliquota_patronal_suplementar', {
      precision: 6,
      scale: 4,
    }), // deficit atuarial

    // Teto (RPPS pode nao ter -- null = sem teto)
    tetoContribuicao: numeric('teto_contribuicao', { precision: 15, scale: 2 }),

    // Salario-familia override municipal (decisao 5 -- alguns RPPS tem valor proprio)
    salarioFamiliaValor: numeric('salario_familia_valor', { precision: 15, scale: 2 }),
    salarioFamiliaRendaMaxima: numeric('salario_familia_renda_maxima', {
      precision: 15,
      scale: 2,
    }),

    fundamentacaoLegal: text('fundamentacao_legal').notNull(),
    observacoes: text('observacoes'),
    ativa: boolean('ativa').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
  },
  (t) => ({
    idxVigencia: index('idx_rpps_vigencia')
      .on(t.vigenciaInicio, t.vigenciaFim)
      .where(sql`${t.deletedAt} IS NULL`),

    chkAliquotaServidor: check(
      'chk_rpps_aliq_servidor',
      sql`${t.aliquotaServidor} >= 0 AND ${t.aliquotaServidor} <= 1`,
    ),
    chkAliquotaPatronal: check(
      'chk_rpps_aliq_patronal',
      sql`${t.aliquotaPatronalNormal} >= 0 AND ${t.aliquotaPatronalNormal} <= 1`,
    ),
    chkVigencia: check(
      'chk_rpps_vigencia',
      sql`${t.vigenciaFim} IS NULL OR ${t.vigenciaFim} > ${t.vigenciaInicio}`,
    ),
  }),
)

// ============================================================
// 2. Tabelas custom (override municipal) -- decisao 1, camada 2
// ============================================================

export const inssTabelasCustom = pgTable(
  'inss_tabelas_custom',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vigenciaInicio: date('vigencia_inicio').notNull(),
    vigenciaFim: date('vigencia_fim'),
    tetoContribuicao: numeric('teto_contribuicao', { precision: 15, scale: 2 }).notNull(),
    descontoMaximo: numeric('desconto_maximo', { precision: 15, scale: 2 }).notNull(),

    fundamentacaoLegal: text('fundamentacao_legal').notNull(),
    // OBRIGATORIO no custom -- auditoria do TCE exige justificar override
    motivoOverride: text('motivo_override').notNull(),
    observacoes: text('observacoes'),
    ativa: boolean('ativa').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
  },
  (t) => ({
    idxVigencia: index('idx_inss_custom_vigencia')
      .on(t.vigenciaInicio, t.vigenciaFim)
      .where(sql`${t.deletedAt} IS NULL AND ${t.ativa} = true`),
    chkVigencia: check(
      'chk_inss_custom_vigencia',
      sql`${t.vigenciaFim} IS NULL OR ${t.vigenciaFim} > ${t.vigenciaInicio}`,
    ),
  }),
)

export const inssTabelasCustomFaixas = pgTable(
  'inss_tabelas_custom_faixas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tabelaId: uuid('tabela_id')
      .notNull()
      .references(() => inssTabelasCustom.id, { onDelete: 'cascade' }),
    ordem: integer('ordem').notNull(),
    faixaInicio: numeric('faixa_inicio', { precision: 15, scale: 2 }).notNull(),
    faixaFim: numeric('faixa_fim', { precision: 15, scale: 2 }).notNull(),
    aliquota: numeric('aliquota', { precision: 6, scale: 4 }).notNull(),
    parcelaDeduzir: numeric('parcela_deduzir', { precision: 15, scale: 2 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxTabela: index('idx_inss_custom_faixas_tabela').on(t.tabelaId, t.ordem),
  }),
)

export const irrfTabelasCustom = pgTable(
  'irrf_tabelas_custom',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vigenciaInicio: date('vigencia_inicio').notNull(),
    vigenciaFim: date('vigencia_fim'),
    deducaoPorDependente: numeric('deducao_por_dependente', {
      precision: 15,
      scale: 2,
    }).notNull(),
    descontoSimplificado: numeric('desconto_simplificado', {
      precision: 15,
      scale: 2,
    }).notNull(),
    isencaoMaior65Anos: numeric('isencao_maior_65_anos', { precision: 15, scale: 2 }).notNull(),
    redutorBase: numeric('redutor_base', { precision: 15, scale: 2 }),
    redutorFator: numeric('redutor_fator', { precision: 10, scale: 8 }),
    redutorRendaMaxima: numeric('redutor_renda_maxima', { precision: 15, scale: 2 }),

    fundamentacaoLegal: text('fundamentacao_legal').notNull(),
    motivoOverride: text('motivo_override').notNull(),
    ativa: boolean('ativa').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
  },
  (t) => ({
    idxVigencia: index('idx_irrf_custom_vigencia')
      .on(t.vigenciaInicio, t.vigenciaFim)
      .where(sql`${t.deletedAt} IS NULL AND ${t.ativa} = true`),
  }),
)

export const irrfTabelasCustomFaixas = pgTable(
  'irrf_tabelas_custom_faixas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tabelaId: uuid('tabela_id')
      .notNull()
      .references(() => irrfTabelasCustom.id, { onDelete: 'cascade' }),
    ordem: integer('ordem').notNull(),
    baseInicio: numeric('base_inicio', { precision: 15, scale: 2 }).notNull(),
    baseFim: numeric('base_fim', { precision: 15, scale: 2 }),
    aliquota: numeric('aliquota', { precision: 6, scale: 4 }).notNull(),
    parcelaDeduzir: numeric('parcela_deduzir', { precision: 15, scale: 2 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxTabela: index('idx_irrf_custom_faixas_tabela').on(t.tabelaId, t.ordem),
  }),
)

// ============================================================
// 3. Dependentes -- Multiuso (IR + salario-familia + plano saude)
// ============================================================

export const pessoaDependentes = pgTable(
  'pessoa_dependentes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pessoaId: uuid('pessoa_id')
      .notNull()
      .references(() => pessoas.id),

    nome: text('nome').notNull(),
    cpf: varchar('cpf', { length: 14 }), // null permitido (menores sem CPF)
    dataNascimento: date('data_nascimento').notNull(),
    parentesco: parentescoEnum('parentesco').notNull(),
    invalido: boolean('invalido').notNull().default(false),

    // 3 flags INDEPENDENTES -- 1 dependente pode marcar todas
    dependenteIR: boolean('dependente_ir').notNull().default(false),
    dependenteSalarioFamilia: boolean('dependente_salario_familia').notNull().default(false),
    dependentePlanoSaude: boolean('dependente_plano_saude').notNull().default(false),

    dataInicioDependencia: date('data_inicio_dependencia').notNull(),
    dataFimDependencia: date('data_fim_dependencia'),

    documentoComprobatorioUrl: text('documento_url'),
    observacoes: text('observacoes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
  },
  (t) => ({
    idxPessoa: index('idx_dependentes_pessoa')
      .on(t.pessoaId)
      .where(sql`${t.deletedAt} IS NULL`),
    idxCpf: index('idx_dependentes_cpf')
      .on(t.cpf)
      .where(sql`${t.deletedAt} IS NULL AND ${t.cpf} IS NOT NULL`),
    chkVigencia: check(
      'chk_dep_vigencia',
      sql`${t.dataFimDependencia} IS NULL OR ${t.dataFimDependencia} > ${t.dataInicioDependencia}`,
    ),
  }),
)

// ============================================================
// 4. Eventos funcionais -- Faltas, admissoes, afastamentos
// ============================================================

export const folhaEventosFuncional = pgTable(
  'folha_eventos_funcional',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vinculoId: uuid('vinculo_id')
      .notNull()
      .references(() => vinculosFuncionais.id),

    competencia: date('competencia').notNull(), // sempre YYYY-MM-01

    tipo: tipoEventoFuncionalEnum('tipo').notNull(),
    dataInicio: date('data_inicio').notNull(),
    dataFim: date('data_fim'),

    diasComputados: integer('dias_computados').notNull(),

    documentoComprobatorioUrl: text('documento_url'),
    numeroProtocolo: text('numero_protocolo'),
    observacao: text('observacao'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
  },
  (t) => ({
    // CRITICO pra performance -- lookup principal do engine
    idxVinculoCompetencia: index('idx_eventos_vinculo_competencia')
      .on(t.vinculoId, t.competencia)
      .where(sql`${t.deletedAt} IS NULL`),
    // Calibracao 15k servidores -- competencia sozinha pra agregacoes
    idxCompetencia: index('idx_eventos_competencia')
      .on(t.competencia)
      .where(sql`${t.deletedAt} IS NULL`),

    chkDias: check('chk_eventos_dias', sql`${t.diasComputados} >= 1 AND ${t.diasComputados} <= 31`),
    chkVigencia: check(
      'chk_eventos_vigencia',
      sql`${t.dataFim} IS NULL OR ${t.dataFim} >= ${t.dataInicio}`,
    ),
  }),
)

// ============================================================
// 5. Vinculo <-> Dotacoes orcamentarias (BONUS B3)
// ============================================================

export const vinculoDotacoes = pgTable(
  'vinculo_dotacoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vinculoId: uuid('vinculo_id')
      .notNull()
      .references(() => vinculosFuncionais.id),
    dotacaoId: uuid('dotacao_id')
      .notNull()
      .references(() => dotacoes.id),

    // Natureza pra agregacao de empenhos
    // VENCIMENTOS / GRATIFICACOES / ENCARGOS_PATRONAL_INSS / ENCARGOS_PATRONAL_RPPS /
    // GRATIFICACAO_NATALINA / FERIAS / SALARIO_FAMILIA / RESCISAO / ...
    natureza: text('natureza').notNull(),

    // Permite ratear: 70% educacao + 30% saude
    percentual: numeric('percentual', { precision: 5, scale: 4 }).notNull().default('1.0000'),

    vigenciaInicio: date('vigencia_inicio').notNull(),
    vigenciaFim: date('vigencia_fim'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
  },
  (t) => ({
    idxVinculoNatureza: index('idx_vinc_dot_vinculo_natureza')
      .on(t.vinculoId, t.natureza)
      .where(sql`${t.deletedAt} IS NULL`),
    idxDotacao: index('idx_vinc_dot_dotacao')
      .on(t.dotacaoId)
      .where(sql`${t.deletedAt} IS NULL`),

    chkPercentual: check('chk_vd_percentual', sql`${t.percentual} > 0 AND ${t.percentual} <= 1`),
    chkVigencia: check(
      'chk_vd_vigencia',
      sql`${t.vigenciaFim} IS NULL OR ${t.vigenciaFim} > ${t.vigenciaInicio}`,
    ),
  }),
)

// ============================================================
// 6. Consignacoes ativas (decisao 4 -- margem consignavel)
// ============================================================

export const consignacoesAtivas = pgTable(
  'consignacoes_ativas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pessoaId: uuid('pessoa_id')
      .notNull()
      .references(() => pessoas.id),
    vinculoId: uuid('vinculo_id')
      .notNull()
      .references(() => vinculosFuncionais.id),

    consignatarioNome: text('consignatario_nome').notNull(),
    consignatarioCnpj: varchar('consignatario_cnpj', { length: 18 }),
    numeroContrato: text('numero_contrato').notNull(),

    tipo: tipoConsignacaoEnum('tipo').notNull(),

    valorParcela: numeric('valor_parcela', { precision: 15, scale: 2 }).notNull(),
    parcelasTotal: integer('parcelas_total').notNull(),
    parcelasPagas: integer('parcelas_pagas').notNull().default(0),

    dataInicio: date('data_inicio').notNull(),
    dataFim: date('data_fim').notNull(),

    // Autorizacao do servidor (assinada ou eletronica)
    autorizacaoUrl: text('autorizacao_url'),
    dataAutorizacao: date('data_autorizacao').notNull(),

    ativa: boolean('ativa').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
  },
  (t) => ({
    idxPessoaAtiva: index('idx_consig_pessoa_ativa')
      .on(t.pessoaId, t.ativa)
      .where(sql`${t.deletedAt} IS NULL`),
    idxVinculo: index('idx_consig_vinculo')
      .on(t.vinculoId)
      .where(sql`${t.deletedAt} IS NULL AND ${t.ativa} = true`),

    // Nao permite mesmo contrato 2x do mesmo consignatario
    uniqueContrato: unique('uq_consig_contrato').on(t.consignatarioCnpj, t.numeroContrato),

    chkParcelas: check(
      'chk_consig_parcelas',
      sql`${t.parcelasPagas} >= 0 AND ${t.parcelasPagas} <= ${t.parcelasTotal} AND ${t.parcelasTotal} > 0`,
    ),
    chkValor: check('chk_consig_valor', sql`${t.valorParcela} > 0`),
    chkVigencia: check('chk_consig_vigencia', sql`${t.dataFim} > ${t.dataInicio}`),
  }),
)

// ============================================================
// 7. Log de processamento (auditoria TCE)
// ============================================================

export const folhaProcessamentoLog = pgTable(
  'folha_processamento_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    folhaId: uuid('folha_id')
      .notNull()
      .references(() => folhas.id),
    vinculoId: uuid('vinculo_id')
      .notNull()
      .references(() => vinculosFuncionais.id),

    competencia: date('competencia').notNull(),

    // Versao do calculo (pode ter recalculos no mesmo holerite)
    versao: integer('versao').notNull().default(1),
    calculadoEm: timestamp('calculado_em', { withTimezone: true }).notNull().defaultNow(),

    // Snapshot COMPLETO do calculo (rubricas + tabelas com origem +
    // eventos + fundamentacao legal + cenarios IRRF + ...)
    snapshot: jsonb('snapshot').notNull(),

    duracaoMs: integer('duracao_ms').notNull(),
    workerId: text('worker_id'),

    // Hash SHA-256 do snapshot -- detecta adulteracao + permite skip de recalculo
    hashSha256: varchar('hash_sha256', { length: 64 }).notNull(),
  },
  (t) => ({
    idxFolhaVinculo: index('idx_proc_log_folha_vinculo').on(t.folhaId, t.vinculoId, t.versao),
    idxCompetencia: index('idx_proc_log_competencia').on(t.competencia),
    idxHash: index('idx_proc_log_hash').on(t.hashSha256),

    chkDuracao: check('chk_proc_log_duracao', sql`${t.duracaoMs} >= 0`),
    chkVersao: check('chk_proc_log_versao', sql`${t.versao} >= 1`),
  }),
)

// ============================================================
// 8. Progresso de jobs (BullMQ + WebSocket)
// ============================================================

export const folhaProgresso = pgTable(
  'folha_progresso',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    folhaId: uuid('folha_id')
      .notNull()
      .references(() => folhas.id),

    jobId: text('job_id').notNull(), // BullMQ job ID
    tipoJob: text('tipo_job').notNull(), // processarFolhaMensal, recalcularHolerite, etc

    status: statusFolhaProgressoEnum('status').notNull(),

    progressoPercentual: integer('progresso_percentual').notNull().default(0),

    totalItens: integer('total_itens').notNull().default(0),
    itensProcessados: integer('itens_processados').notNull().default(0),
    itensComErro: integer('itens_com_erro').notNull().default(0),

    mensagemAtual: text('mensagem_atual'),
    erros: jsonb('erros'), // array de { vinculoId, erro, stack }

    iniciadoEm: timestamp('iniciado_em', { withTimezone: true }).notNull().defaultNow(),
    concluidoEm: timestamp('concluido_em', { withTimezone: true }),

    workerId: text('worker_id'),
  },
  (t) => ({
    idxFolha: index('idx_progresso_folha').on(t.folhaId, t.iniciadoEm),
    idxJob: index('idx_progresso_job').on(t.jobId),
    idxStatus: index('idx_progresso_status').on(t.status, t.iniciadoEm),

    chkProgresso: check(
      'chk_progresso_pct',
      sql`${t.progressoPercentual} >= 0 AND ${t.progressoPercentual} <= 100`,
    ),
    chkContadores: check(
      'chk_progresso_contadores',
      sql`${t.itensProcessados} >= 0 AND ${t.itensComErro} >= 0 AND ${t.itensProcessados} <= ${t.totalItens}`,
    ),
  }),
)

// ============================================================
// Types exportados
// ============================================================

export type RegimePrevidenciario = (typeof regimePrevidenciarioEnum.enumValues)[number]
export type TipoEventoFuncional = (typeof tipoEventoFuncionalEnum.enumValues)[number]
export type EstrategiaProporcionalidade = (typeof estrategiaProporcionalidadeEnum.enumValues)[number]
export type TipoConsignacao = (typeof tipoConsignacaoEnum.enumValues)[number]
export type Parentesco = (typeof parentescoEnum.enumValues)[number]
export type StatusFolhaProgresso = (typeof statusFolhaProgressoEnum.enumValues)[number]

export type RppsAliquotas = typeof rppsAliquotas.$inferSelect
export type PessoaDependente = typeof pessoaDependentes.$inferSelect
export type FolhaEventoFuncional = typeof folhaEventosFuncional.$inferSelect
export type VinculoDotacao = typeof vinculoDotacoes.$inferSelect
export type ConsignacaoAtiva = typeof consignacoesAtivas.$inferSelect
export type FolhaProcessamentoLog = typeof folhaProcessamentoLog.$inferSelect
export type FolhaProgresso = typeof folhaProgresso.$inferSelect

export type InssTabelaCustom = typeof inssTabelasCustom.$inferSelect
export type InssTabelaCustomFaixa = typeof inssTabelasCustomFaixas.$inferSelect
export type InssTabelaCustomCompleta = InssTabelaCustom & { faixas: InssTabelaCustomFaixa[] }

export type IrrfTabelaCustom = typeof irrfTabelasCustom.$inferSelect
export type IrrfTabelaCustomFaixa = typeof irrfTabelasCustomFaixas.$inferSelect
export type IrrfTabelaCustomCompleta = IrrfTabelaCustom & { faixas: IrrfTabelaCustomFaixa[] }
