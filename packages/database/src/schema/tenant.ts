/**
 * Schema TEMPLATE de um TENANT.
 *
 * Este arquivo define as tabelas que existem DENTRO de cada schema tenant_xxx.
 * Usa pgTable/pgEnum (sem pgSchema) para que o Drizzle gere SQL sem qualificador
 * de schema. Em runtime, o search_path da conexão resolve as tabelas no schema
 * correto do tenant. As migrations são aplicadas por tenancy.ts via search_path.
 *
 * Tabelas cobertas pelo edital (Pregão 90023/2026):
 * - users / roles / permissions / role_permissions / user_roles  → RBAC
 * - pessoas → cadastro único (PF/PJ)
 * - entidades → unidades gestoras (Câmara, Prefeitura, fundos, autarquias)
 * - textos_juridicos → leis, decretos, portarias, com anexos
 * - estruturas_organizacionais → secretarias, departamentos, setores
 * - audit_log → auditoria interna do tenant
 *
 * Módulos funcionais (Receitas, Despesas, Folha) entrarão como novas tabelas
 * neste mesmo schema, em arquivos separados que serão re-exportados aqui.
 */
import {
  pgTable,
  pgEnum,
  type AnyPgColumn,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  date,
  integer,
  numeric,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'

// ─────────────────────────────────────────────────────────────
// ENUMs
// ─────────────────────────────────────────────────────────────

export const pessoaTipoEnum = pgEnum('pessoa_tipo', ['PF', 'PJ'])

export const entidadeTipoEnum = pgEnum('entidade_tipo', [
  'prefeitura',
  'camara',
  'fundo',
  'autarquia',
  'fundacao',
  'empresa_publica',
  'sociedade_economia_mista',
  'consorcio',
  'outro',
])

export const textoJuridicoTipoEnum = pgEnum('texto_juridico_tipo', [
  'lei',
  'lei_complementar',
  'decreto',
  'portaria',
  'instrucao_normativa',
  'resolucao',
  'edital',
  'contrato',
  'convenio',
  'outro',
])

export const userStatusEnum = pgEnum('user_status', [
  'active',
  'inactive',
  'pending',     // aguardando primeiro login / definição de senha
  'suspended',
])

// ─────────────────────────────────────────────────────────────
// USUÁRIOS DO TENANT + RBAC
// ─────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 200 }).notNull().unique(),
    name: varchar('name', { length: 200 }).notNull(),
    cpf: varchar('cpf', { length: 11 }).unique(),
    passwordHash: text('password_hash'),  // null = login só via gov.br
    govBrSubject: varchar('gov_br_subject', { length: 100 }).unique(),  // sub do gov.br
    status: userStatusEnum('status').notNull().default('pending'),
    entidadeId: uuid('entidade_id').references((): AnyPgColumn => entidades.id, { onDelete: 'set null' }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    twoFactorSecret: text('two_factor_secret'),
    twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_idx').on(t.email),
    statusIdx: index('users_status_idx').on(t.status),
    createdAtIdx: index('users_created_at_idx').on(t.createdAt),
  }),
)

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 60 }).notNull().unique(),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    isSystem: boolean('is_system').notNull().default(false),  // não pode ser deletada
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
)

export const permissions = pgTable(
  'permissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Padrão "modulo:acao" → "receitas:read", "despesas:empenhar", "folha:processar"
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    description: text('description'),
    module: varchar('module', { length: 60 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    moduleIdx: index('permissions_module_idx').on(t.module),
  }),
)

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id').notNull().references(() => permissions.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.roleId, t.permissionId] }),
  }),
)

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
    grantedBy: uuid('granted_by').references(() => users.id, { onDelete: 'set null' }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.roleId] }),
  }),
)

// ─────────────────────────────────────────────────────────────
// CADASTROS BASE
// ─────────────────────────────────────────────────────────────

/**
 * Pessoas — cadastro único PF/PJ. Usado por todos os módulos
 * (fornecedores, servidores, contribuintes, beneficiários, etc).
 */
export const pessoas = pgTable(
  'pessoas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tipo: pessoaTipoEnum('tipo').notNull(),

    // PF: CPF + nome / PJ: CNPJ + razão social
    documento: varchar('documento', { length: 14 }).notNull().unique(),
    nome: varchar('nome', { length: 200 }).notNull(),
    nomeFantasia: varchar('nome_fantasia', { length: 200 }),  // só PJ

    // PF
    rg: varchar('rg', { length: 20 }),
    dataNascimento: date('data_nascimento'),
    sexo: varchar('sexo', { length: 1 }),  // 'M' | 'F' | 'O'
    estadoCivil: varchar('estado_civil', { length: 20 }),

    // PJ
    inscricaoEstadual: varchar('inscricao_estadual', { length: 30 }),
    inscricaoMunicipal: varchar('inscricao_municipal', { length: 30 }),

    // Contato
    email: varchar('email', { length: 200 }),
    telefone: varchar('telefone', { length: 20 }),

    // Endereço
    cep: varchar('cep', { length: 8 }),
    logradouro: varchar('logradouro', { length: 200 }),
    numero: varchar('numero', { length: 20 }),
    complemento: varchar('complemento', { length: 100 }),
    bairro: varchar('bairro', { length: 100 }),
    cidade: varchar('cidade', { length: 100 }),
    uf: varchar('uf', { length: 2 }),

    // Outros
    observacoes: text('observacoes'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),

    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdBy: uuid('created_by').references((): AnyPgColumn => users.id),
  },
  (t) => ({
    documentoIdx: uniqueIndex('pessoas_documento_idx').on(t.documento),
    nomeIdx: index('pessoas_nome_idx').on(t.nome),
    tipoIdx: index('pessoas_tipo_idx').on(t.tipo),
    createdAtIdx: index('pessoas_created_at_idx').on(t.createdAt),
  }),
)

/**
 * Entidades — unidades gestoras do município (Prefeitura, Câmara, fundos, autarquias).
 */
export const entidades = pgTable(
  'entidades',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    codigo: varchar('codigo', { length: 20 }).notNull().unique(),  // código contábil
    nome: varchar('nome', { length: 200 }).notNull(),
    tipo: entidadeTipoEnum('tipo').notNull(),
    cnpj: varchar('cnpj', { length: 14 }).unique(),

    // Responsável legal
    responsavelPessoaId: uuid('responsavel_pessoa_id').references((): AnyPgColumn => pessoas.id),
    responsavelCargo: varchar('responsavel_cargo', { length: 100 }),

    // Hierarquia (uma entidade pode pertencer a outra: ex. fundo → prefeitura)
    parentId: uuid('parent_id'),

    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
)

/**
 * Estruturas organizacionais — secretarias, departamentos, setores.
 * Árvore hierárquica dentro de cada entidade.
 */
export const estruturasOrganizacionais = pgTable(
  'estruturas_organizacionais',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entidadeId: uuid('entidade_id').notNull().references(() => entidades.id, { onDelete: 'cascade' }),
    codigo: varchar('codigo', { length: 30 }).notNull(),
    nome: varchar('nome', { length: 200 }).notNull(),
    nivel: integer('nivel').notNull().default(1),       // 1 = secretaria, 2 = depto, 3 = setor...
    parentId: uuid('parent_id'),
    responsavelPessoaId: uuid('responsavel_pessoa_id').references((): AnyPgColumn => pessoas.id),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    entidadeIdx: index('estruturas_org_entidade_idx').on(t.entidadeId),
    parentIdx: index('estruturas_org_parent_idx').on(t.parentId),
  }),
)

/**
 * Textos jurídicos — leis, decretos, portarias com anexos no S3.
 */
export const textosJuridicos = pgTable(
  'textos_juridicos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tipo: textoJuridicoTipoEnum('tipo').notNull(),
    numero: varchar('numero', { length: 50 }).notNull(),
    ano: integer('ano').notNull(),
    ementa: text('ementa').notNull(),
    conteudo: text('conteudo'),  // texto pleno (opcional)
    dataPublicacao: date('data_publicacao').notNull(),
    dataVigenciaInicio: date('data_vigencia_inicio'),
    dataVigenciaFim: date('data_vigencia_fim'),
    entidadeId: uuid('entidade_id').references(() => entidades.id),
    revogadoPor: uuid('revogado_por'),  // self-ref
    revogadoEm: date('revogado_em'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references((): AnyPgColumn => users.id),
  },
  (t) => ({
    tipoAnoIdx: index('textos_juridicos_tipo_ano_idx').on(t.tipo, t.ano),
    numeroAnoIdx: uniqueIndex('textos_juridicos_numero_ano_idx').on(t.tipo, t.numero, t.ano),
  }),
)

/**
 * Anexos genéricos — qualquer registro pode ter anexos (S3).
 * resourceType + resourceId formam a referência polimórfica.
 */
export const anexos = pgTable(
  'anexos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    resourceType: varchar('resource_type', { length: 60 }).notNull(),  // 'texto_juridico', 'pessoa', ...
    resourceId: uuid('resource_id').notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }),
    size: integer('size').notNull(),
    s3Key: varchar('s3_key', { length: 500 }).notNull(),
    checksum: varchar('checksum', { length: 64 }),  // SHA-256
    uploadedBy: uuid('uploaded_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    resourceIdx: index('anexos_resource_idx').on(t.resourceType, t.resourceId),
  }),
)

/**
 * Audit log interno do tenant.
 */
export const tenantAuditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: varchar('action', { length: 100 }).notNull(),
    resource: varchar('resource', { length: 100 }),
    resourceId: varchar('resource_id', { length: 100 }),
    before: jsonb('before').$type<Record<string, unknown>>(),
    after: jsonb('after').$type<Record<string, unknown>>(),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('tenant_audit_user_idx').on(t.userId),
    resourceIdx: index('tenant_audit_resource_idx').on(t.resource, t.resourceId),
    createdIdx: index('tenant_audit_created_idx').on(t.createdAt),
  }),
)

// ─────────────────────────────────────────────────────────────
// RELATIONS
// ─────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ one, many }) => ({
  entidade: one(entidades, { fields: [users.entidadeId], references: [entidades.id] }),
  roles: many(userRoles),
}))

export const rolesRelations = relations(roles, ({ many }) => ({
  permissions: many(rolePermissions),
  users: many(userRoles),
}))

export const permissionsRelations = relations(permissions, ({ many }) => ({
  roles: many(rolePermissions),
}))

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, { fields: [rolePermissions.permissionId], references: [permissions.id] }),
}))

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
}))

export const pessoasRelations = relations(pessoas, ({ one }) => ({
  criadoPor: one(users, { fields: [pessoas.createdBy], references: [users.id] }),
}))

export const entidadesRelations = relations(entidades, ({ one, many }) => ({
  responsavel: one(pessoas, { fields: [entidades.responsavelPessoaId], references: [pessoas.id] }),
  estruturas: many(estruturasOrganizacionais),
}))

export const estruturasRelations = relations(estruturasOrganizacionais, ({ one }) => ({
  entidade: one(entidades, { fields: [estruturasOrganizacionais.entidadeId], references: [entidades.id] }),
  responsavel: one(pessoas, { fields: [estruturasOrganizacionais.responsavelPessoaId], references: [pessoas.id] }),
}))

/**
 * Controle de migrations aplicadas neste schema.
 * Permite aplicar incrementalmente novas migrations em tenants existentes.
 */
export const tenantMigrationsApplied = pgTable(
  'tenant_migrations_applied',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    migrationName: varchar('migration_name', { length: 255 }).notNull().unique(),
    checksum: varchar('checksum', { length: 64 }).notNull(),
    appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
    appliedBy: varchar('applied_by', { length: 100 }).default('system'),
  },
  (t) => ({
    migrationNameIdx: uniqueIndex('tenant_migrations_name_idx').on(t.migrationName),
  }),
)

export type TenantMigrationApplied = typeof tenantMigrationsApplied.$inferSelect

// ─────────────────────────────────────────────────────────────
// CALENDÁRIO FISCAL
// ─────────────────────────────────────────────────────────────

export const exercicioStatusEnum = pgEnum('exercicio_status', [
  'aberto',
  'em_encerramento',
  'encerrado',
])

export const mesFiscalStatusEnum = pgEnum('mes_fiscal_status', [
  'aberto',
  'fechado',
  'bloqueado',
])

/**
 * Exercícios fiscais (geralmente 1 por ano civil).
 */
export const exercicios = pgTable(
  'exercicios',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ano: integer('ano').notNull().unique(),
    dataInicio: date('data_inicio').notNull(),
    dataFim: date('data_fim').notNull(),
    status: exercicioStatusEnum('status').notNull().default('aberto'),
    encerradoEm: timestamp('encerrado_em', { withTimezone: true }),
    encerradoPorUserId: uuid('encerrado_por_user_id').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    observacoes: text('observacoes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index('exercicios_status_idx').on(t.status),
  }),
)

/**
 * Meses fiscais — 12 por exercício, criados automaticamente ao abrir o exercício.
 */
export const mesesFiscais = pgTable(
  'meses_fiscais',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    exercicioId: uuid('exercicio_id').notNull().references(() => exercicios.id, { onDelete: 'cascade' }),
    mes: integer('mes').notNull(),
    status: mesFiscalStatusEnum('status').notNull().default('aberto'),
    dataInicio: date('data_inicio').notNull(),
    dataFim: date('data_fim').notNull(),
    fechadoEm: timestamp('fechado_em', { withTimezone: true }),
    fechadoPorUserId: uuid('fechado_por_user_id').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    reaberturas: integer('reaberturas').notNull().default(0),
    observacoes: text('observacoes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    exercicioMesUnique: uniqueIndex('meses_fiscais_exercicio_mes_idx').on(t.exercicioId, t.mes),
    statusIdx: index('meses_fiscais_status_idx').on(t.status),
  }),
)

export const exerciciosRelations = relations(exercicios, ({ many }) => ({
  meses: many(mesesFiscais),
  lancamentos: many(receitasLancamentos),
}))

export const mesesFiscaisRelations = relations(mesesFiscais, ({ one }) => ({
  exercicio: one(exercicios, { fields: [mesesFiscais.exercicioId], references: [exercicios.id] }),
}))

// ─────────────────────────────────────────────────────────────
// MÓDULO RECEITAS
// ─────────────────────────────────────────────────────────────

/**
 * Versões do PCASP (uma versão por UF/ano).
 */
export const pcaspVersoes = pgTable(
  'pcasp_versoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    uf: varchar('uf', { length: 2 }).notNull(),
    ano: integer('ano').notNull(),
    fonte: varchar('fonte', { length: 100 }).notNull(),
    observacoes: text('observacoes'),
    ativa: boolean('ativa').notNull().default(true),
    importadaEm: timestamp('importada_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ufAnoUnique: uniqueIndex('pcasp_versoes_uf_ano_idx').on(t.uf, t.ano),
  }),
)

/**
 * Plano de Contas Aplicado ao Setor Público — natureza de receita.
 * Hierarquia nivelada conforme MCASP 9ª edição.
 */
export const receitasNaturezas = pgTable(
  'receitas_naturezas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    codigoCompleto: varchar('codigo_completo', { length: 20 }).notNull().unique(),
    codigoReduzido: varchar('codigo_reduzido', { length: 20 }).notNull().unique(),
    descricao: varchar('descricao', { length: 300 }).notNull(),
    nivel: integer('nivel').notNull(),
    parentId: uuid('parent_id'),
    analitica: boolean('analitica').notNull().default(false),
    pcaspVersaoId: uuid('pcasp_versao_id').references(() => pcaspVersoes.id, { onDelete: 'restrict' }),
    identificadorMsc: varchar('identificador_msc', { length: 50 }),
    contaContabilCorrespondente: varchar('conta_contabil_correspondente', { length: 30 }),
    ativo: boolean('ativo').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    codigoIdx: uniqueIndex('receitas_nat_codigo_idx').on(t.codigoCompleto),
    codigoRedIdx: uniqueIndex('receitas_nat_codred_idx').on(t.codigoReduzido),
    nivelIdx: index('receitas_nat_nivel_idx').on(t.nivel),
    parentIdx: index('receitas_nat_parent_idx').on(t.parentId),
    analiticaIdx: index('receitas_nat_analitica_idx').on(t.analitica),
  }),
)

/**
 * Tipo de receita do tenant — vincula natureza analítica a entidade gestora.
 */
export const receitasTipos = pgTable(
  'receitas_tipos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    naturezaId: uuid('natureza_id').notNull().references(() => receitasNaturezas.id, { onDelete: 'restrict' }),
    entidadeId: uuid('entidade_id').notNull().references((): AnyPgColumn => entidades.id, { onDelete: 'restrict' }),
    codigoInterno: varchar('codigo_interno', { length: 30 }),
    descricaoLocal: varchar('descricao_local', { length: 200 }),
    fonteRecurso: varchar('fonte_recurso', { length: 10 }),
    ativo: boolean('ativo').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    naturezaEntidadeUnique: uniqueIndex('receitas_tipos_nat_ent_idx').on(t.naturezaId, t.entidadeId),
    entidadeIdx: index('receitas_tipos_entidade_idx').on(t.entidadeId),
  }),
)

/**
 * Lançamento de receita — previsão orçamentária para o exercício.
 */
export const receitasLancamentos = pgTable(
  'receitas_lancamentos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    exercicioId: uuid('exercicio_id').notNull().references(() => exercicios.id, { onDelete: 'restrict' }),
    tipoReceitaId: uuid('tipo_receita_id').notNull().references(() => receitasTipos.id, { onDelete: 'restrict' }),
    valorPrevistoInicial: numeric('valor_previsto_inicial', { precision: 18, scale: 2 }).notNull(),
    valorAtualizado: numeric('valor_atualizado', { precision: 18, scale: 2 }).notNull(),
    memoriaCalculo: text('memoria_calculo'),
    ativo: boolean('ativo').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references((): AnyPgColumn => users.id),
  },
  (t) => ({
    exercicioTipoUnique: uniqueIndex('receitas_lanc_exerc_tipo_idx').on(t.exercicioId, t.tipoReceitaId),
    exercicioIdx: index('receitas_lanc_exercicio_idx').on(t.exercicioId),
  }),
)

export const formaPagamentoEnum = pgEnum('forma_pagamento', [
  'pix',
  'boleto',
  'debito_automatico',
  'cartao_credito',
  'cartao_debito',
  'dinheiro',
  'transferencia',
  'cheque',
  'compensacao',
  'outros',
])

/**
 * Arrecadação — efetivação de recebimento.
 */
export const receitasArrecadacoes = pgTable(
  'receitas_arrecadacoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    lancamentoId: uuid('lancamento_id').notNull().references(() => receitasLancamentos.id, { onDelete: 'restrict' }),
    mesFiscalId: uuid('mes_fiscal_id').notNull().references(() => mesesFiscais.id, { onDelete: 'restrict' }),
    contribuintePessoaId: uuid('contribuinte_pessoa_id').references((): AnyPgColumn => pessoas.id, { onDelete: 'set null' }),
    dataArrecadacao: date('data_arrecadacao').notNull(),
    valor: numeric('valor', { precision: 18, scale: 2 }).notNull(),
    formaPagamento: formaPagamentoEnum('forma_pagamento').notNull(),
    numeroDocumento: varchar('numero_documento', { length: 100 }),
    referencia: varchar('referencia', { length: 100 }),
    contaBancariaId: uuid('conta_bancaria_id'),
    identificadorMsc: varchar('identificador_msc', { length: 50 }),
    informacaoComplementar: jsonb('informacao_complementar').$type<Record<string, unknown>>(),
    observacoes: text('observacoes'),
    anuladoEm: timestamp('anulado_em', { withTimezone: true }),
    anuladoPorUserId: uuid('anulado_por_user_id').references((): AnyPgColumn => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references((): AnyPgColumn => users.id),
  },
  (t) => ({
    lancamentoIdx: index('receitas_arrec_lanc_idx').on(t.lancamentoId),
    mesIdx: index('receitas_arrec_mes_idx').on(t.mesFiscalId),
    contribuinteIdx: index('receitas_arrec_contrib_idx').on(t.contribuintePessoaId),
    dataIdx: index('receitas_arrec_data_idx').on(t.dataArrecadacao),
  }),
)

/**
 * Anulação parcial ou total de arrecadação (estorno/restituição).
 */
export const receitasAnulacoes = pgTable(
  'receitas_anulacoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    arrecadacaoId: uuid('arrecadacao_id').notNull().references(() => receitasArrecadacoes.id, { onDelete: 'restrict' }),
    mesFiscalId: uuid('mes_fiscal_id').notNull().references(() => mesesFiscais.id, { onDelete: 'restrict' }),
    dataAnulacao: date('data_anulacao').notNull(),
    valor: numeric('valor', { precision: 18, scale: 2 }).notNull(),
    motivo: text('motivo').notNull(),
    documentoAutorizacao: varchar('documento_autorizacao', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references((): AnyPgColumn => users.id),
  },
  (t) => ({
    arrecadacaoIdx: index('receitas_anul_arrec_idx').on(t.arrecadacaoId),
    mesIdx: index('receitas_anul_mes_idx').on(t.mesFiscalId),
  }),
)

// Relations
export const receitasNaturezasRelations = relations(receitasNaturezas, ({ one, many }) => ({
  pcaspVersao: one(pcaspVersoes, { fields: [receitasNaturezas.pcaspVersaoId], references: [pcaspVersoes.id] }),
  tipos: many(receitasTipos),
}))

export const receitasTiposRelations = relations(receitasTipos, ({ one, many }) => ({
  natureza: one(receitasNaturezas, { fields: [receitasTipos.naturezaId], references: [receitasNaturezas.id] }),
  entidade: one(entidades, { fields: [receitasTipos.entidadeId], references: [entidades.id] }),
  lancamentos: many(receitasLancamentos),
}))

export const receitasLancamentosRelations = relations(receitasLancamentos, ({ one, many }) => ({
  exercicio: one(exercicios, { fields: [receitasLancamentos.exercicioId], references: [exercicios.id] }),
  tipo: one(receitasTipos, { fields: [receitasLancamentos.tipoReceitaId], references: [receitasTipos.id] }),
  arrecadacoes: many(receitasArrecadacoes),
}))

export const receitasArrecadacoesRelations = relations(receitasArrecadacoes, ({ one, many }) => ({
  lancamento: one(receitasLancamentos, { fields: [receitasArrecadacoes.lancamentoId], references: [receitasLancamentos.id] }),
  mesFiscal: one(mesesFiscais, { fields: [receitasArrecadacoes.mesFiscalId], references: [mesesFiscais.id] }),
  contribuinte: one(pessoas, { fields: [receitasArrecadacoes.contribuintePessoaId], references: [pessoas.id] }),
  anulacoes: many(receitasAnulacoes),
}))

export const receitasAnulacoesRelations = relations(receitasAnulacoes, ({ one }) => ({
  arrecadacao: one(receitasArrecadacoes, { fields: [receitasAnulacoes.arrecadacaoId], references: [receitasArrecadacoes.id] }),
  mesFiscal: one(mesesFiscais, { fields: [receitasAnulacoes.mesFiscalId], references: [mesesFiscais.id] }),
}))

// ─────────────────────────────────────────────────────────────
// MODULO ORCAMENTO
// ─────────────────────────────────────────────────────────────

export const leiTipoEnum = pgEnum('lei_orcamentaria_tipo', ['ppa', 'loa'])

export const leiStatusEnum = pgEnum('lei_orcamentaria_status', [
  'em_elaboracao', 'em_tramitacao', 'sancionada', 'em_execucao', 'encerrada',
])

export const modalidadeTipoEnum = pgEnum('modalidade_tipo', ['stn', 'local'])
export const fonteTipoEnum = pgEnum('fonte_tipo', ['stn', 'local'])

export const creditoTipoEnum = pgEnum('credito_tipo', [
  'suplementar', 'especial', 'extraordinario',
])

export const creditoOrigemEnum = pgEnum('credito_origem', [
  'superavit_financeiro', 'excesso_arrecadacao', 'anulacao_dotacao', 'operacao_credito', 'reserva_contingencia',
])

export const creditoStatusEnum = pgEnum('credito_status', [
  'em_elaboracao', 'aprovado', 'aplicado', 'cancelado',
])

export const leisOrcamentarias = pgTable(
  'leis_orcamentarias',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tipo: leiTipoEnum('tipo').notNull(),
    numero: varchar('numero', { length: 50 }).notNull(),
    descricao: varchar('descricao', { length: 300 }).notNull(),
    anoInicio: integer('ano_inicio').notNull(),
    anoFim: integer('ano_fim').notNull(),
    dataSancao: date('data_sancao'),
    dataPublicacao: date('data_publicacao'),
    valorTotal: numeric('valor_total', { precision: 18, scale: 2 }),
    status: leiStatusEnum('status').notNull().default('em_elaboracao'),
    observacoes: text('observacoes'),
    textoJuridicoId: uuid('texto_juridico_id').references(() => textosJuridicos.id, { onDelete: 'set null' }),
    ppaVigenteId: uuid('ppa_vigente_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references((): AnyPgColumn => users.id),
  },
  (t) => ({
    tipoAnoIdx: index('leis_orc_tipo_ano_idx').on(t.tipo, t.anoInicio),
    statusIdx: index('leis_orc_status_idx').on(t.status),
  }),
)

export const programas = pgTable(
  'programas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ppaId: uuid('ppa_id').notNull().references(() => leisOrcamentarias.id, { onDelete: 'restrict' }),
    codigo: varchar('codigo', { length: 10 }).notNull(),
    nome: varchar('nome', { length: 300 }).notNull(),
    objetivo: text('objetivo'),
    publicoAlvo: varchar('publico_alvo', { length: 300 }),
    horizonteTemporal: varchar('horizonte_temporal', { length: 50 }),
    ativo: boolean('ativo').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ppaCodigoUnique: uniqueIndex('programas_ppa_codigo_idx').on(t.ppaId, t.codigo),
  }),
)

export const acoes = pgTable(
  'acoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programaId: uuid('programa_id').notNull().references(() => programas.id, { onDelete: 'restrict' }),
    codigo: varchar('codigo', { length: 10 }).notNull(),
    nome: varchar('nome', { length: 300 }).notNull(),
    tipo: integer('tipo').notNull(),
    descricao: text('descricao'),
    unidadeMedida: varchar('unidade_medida', { length: 50 }),
    produto: varchar('produto', { length: 200 }),
    ativo: boolean('ativo').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    programaCodigoUnique: uniqueIndex('acoes_prog_codigo_idx').on(t.programaId, t.codigo),
  }),
)

export const modalidadesAplicacao = pgTable(
  'modalidades_aplicacao',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    codigo: varchar('codigo', { length: 2 }).notNull().unique(),
    descricao: varchar('descricao', { length: 200 }).notNull(),
    tipo: modalidadeTipoEnum('tipo').notNull().default('stn'),
    ativo: boolean('ativo').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
)

export const fontesRecurso = pgTable(
  'fontes_recurso',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    codigo: varchar('codigo', { length: 20 }).notNull().unique(),
    descricao: varchar('descricao', { length: 300 }).notNull(),
    grupo: varchar('grupo', { length: 5 }),
    categoria: varchar('categoria', { length: 50 }),
    tipo: fonteTipoEnum('tipo').notNull().default('stn'),
    ativo: boolean('ativo').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
)

export const dotacoes = pgTable(
  'dotacoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leiOrcamentariaId: uuid('lei_orcamentaria_id').notNull().references(() => leisOrcamentarias.id, { onDelete: 'restrict' }),
    exercicioId: uuid('exercicio_id').notNull().references(() => exercicios.id, { onDelete: 'restrict' }),
    classificacaoCompleta: varchar('classificacao_completa', { length: 50 }).notNull(),
    entidadeId: uuid('entidade_id').notNull().references((): AnyPgColumn => entidades.id, { onDelete: 'restrict' }),
    orgaoCodigo: varchar('orgao_codigo', { length: 2 }).notNull(),
    unidadeCodigo: varchar('unidade_codigo', { length: 2 }).notNull(),
    funcaoCodigo: varchar('funcao_codigo', { length: 2 }).notNull(),
    subfuncaoCodigo: varchar('subfuncao_codigo', { length: 3 }).notNull(),
    programaId: uuid('programa_id').notNull().references(() => programas.id, { onDelete: 'restrict' }),
    acaoId: uuid('acao_id').notNull().references(() => acoes.id, { onDelete: 'restrict' }),
    naturezaCategoria: varchar('natureza_categoria', { length: 1 }).notNull(),
    naturezaGrupo: varchar('natureza_grupo', { length: 1 }).notNull(),
    modalidadeAplicacaoId: uuid('modalidade_aplicacao_id').notNull().references(() => modalidadesAplicacao.id, { onDelete: 'restrict' }),
    naturezaElemento: varchar('natureza_elemento', { length: 2 }).notNull(),
    naturezaSubelemento: varchar('natureza_subelemento', { length: 2 }),
    fonteRecursoId: uuid('fonte_recurso_id').notNull().references(() => fontesRecurso.id, { onDelete: 'restrict' }),
    indicadorResultadoPrimario: varchar('indicador_resultado_primario', { length: 1 }),
    valorInicial: numeric('valor_inicial', { precision: 18, scale: 2 }).notNull(),
    valorAtualizado: numeric('valor_atualizado', { precision: 18, scale: 2 }).notNull(),
    valorReservado: numeric('valor_reservado', { precision: 18, scale: 2 }).notNull().default('0'),
    valorEmpenhado: numeric('valor_empenhado', { precision: 18, scale: 2 }).notNull().default('0'),
    valorLiquidado: numeric('valor_liquidado', { precision: 18, scale: 2 }).notNull().default('0'),
    valorPago: numeric('valor_pago', { precision: 18, scale: 2 }).notNull().default('0'),
    identificadorMsc: varchar('identificador_msc', { length: 50 }),
    informacaoComplementar: jsonb('informacao_complementar').$type<Record<string, unknown>>(),
    ativo: boolean('ativo').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references((): AnyPgColumn => users.id),
  },
  (t) => ({
    leiClassUnique: uniqueIndex('dotacoes_lei_class_idx').on(t.leiOrcamentariaId, t.classificacaoCompleta),
    exercicioIdx: index('dotacoes_exercicio_idx').on(t.exercicioId),
    entidadeIdx: index('dotacoes_entidade_idx').on(t.entidadeId),
    programaIdx: index('dotacoes_programa_idx').on(t.programaId),
    acaoIdx: index('dotacoes_acao_idx').on(t.acaoId),
    funcaoIdx: index('dotacoes_funcao_idx').on(t.funcaoCodigo, t.subfuncaoCodigo),
    fonteIdx: index('dotacoes_fonte_idx').on(t.fonteRecursoId),
  }),
)

export const creditosOrcamentarios = pgTable(
  'creditos_orcamentarios',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    exercicioId: uuid('exercicio_id').notNull().references(() => exercicios.id, { onDelete: 'restrict' }),
    leiOrcamentariaId: uuid('lei_orcamentaria_id').notNull().references(() => leisOrcamentarias.id, { onDelete: 'restrict' }),
    numero: varchar('numero', { length: 50 }).notNull(),
    tipo: creditoTipoEnum('tipo').notNull(),
    origem: creditoOrigemEnum('origem').notNull(),
    valor: numeric('valor', { precision: 18, scale: 2 }).notNull(),
    dataDecreto: date('data_decreto').notNull(),
    dataPublicacao: date('data_publicacao'),
    justificativa: text('justificativa').notNull(),
    textoJuridicoId: uuid('texto_juridico_id').references(() => textosJuridicos.id, { onDelete: 'set null' }),
    status: creditoStatusEnum('status').notNull().default('em_elaboracao'),
    aplicadoEm: timestamp('aplicado_em', { withTimezone: true }),
    aplicadoPorUserId: uuid('aplicado_por_user_id').references((): AnyPgColumn => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references((): AnyPgColumn => users.id),
  },
  (t) => ({
    exercicioStatusIdx: index('creditos_exerc_status_idx').on(t.exercicioId, t.status),
    numeroIdx: index('creditos_numero_idx').on(t.numero),
  }),
)

export const creditosDotacoes = pgTable(
  'creditos_dotacoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creditoId: uuid('credito_id').notNull().references(() => creditosOrcamentarios.id, { onDelete: 'cascade' }),
    dotacaoId: uuid('dotacao_id').notNull().references(() => dotacoes.id, { onDelete: 'restrict' }),
    sinal: integer('sinal').notNull(),
    valor: numeric('valor', { precision: 18, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    creditoIdx: index('creditos_dot_credito_idx').on(t.creditoId),
    dotacaoIdx: index('creditos_dot_dotacao_idx').on(t.dotacaoId),
  }),
)

export const dotacoesHistoricoValor = pgTable(
  'dotacoes_historico_valor',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dotacaoId: uuid('dotacao_id').notNull().references(() => dotacoes.id, { onDelete: 'cascade' }),
    creditoId: uuid('credito_id').references(() => creditosOrcamentarios.id, { onDelete: 'set null' }),
    valorAnterior: numeric('valor_anterior', { precision: 18, scale: 2 }).notNull(),
    valorNovo: numeric('valor_novo', { precision: 18, scale: 2 }).notNull(),
    delta: numeric('delta', { precision: 18, scale: 2 }).notNull(),
    motivo: varchar('motivo', { length: 300 }).notNull(),
    registradoEm: timestamp('registrado_em', { withTimezone: true }).notNull().defaultNow(),
    registradoPorUserId: uuid('registrado_por_user_id').references((): AnyPgColumn => users.id),
  },
  (t) => ({
    dotacaoIdx: index('dot_hist_dotacao_idx').on(t.dotacaoId, t.registradoEm),
    creditoIdx: index('dot_hist_credito_idx').on(t.creditoId),
  }),
)

// Orcamento relations
export const leisOrcamentariasRelations = relations(leisOrcamentarias, ({ one, many }) => ({
  programas: many(programas),
  dotacoes: many(dotacoes),
  creditos: many(creditosOrcamentarios),
  ppaVigente: one(leisOrcamentarias, { fields: [leisOrcamentarias.ppaVigenteId], references: [leisOrcamentarias.id], relationName: 'loa_ppa' }),
}))

export const programasRelations = relations(programas, ({ one, many }) => ({
  ppa: one(leisOrcamentarias, { fields: [programas.ppaId], references: [leisOrcamentarias.id] }),
  acoes: many(acoes),
}))

export const acoesRelations = relations(acoes, ({ one }) => ({
  programa: one(programas, { fields: [acoes.programaId], references: [programas.id] }),
}))

export const dotacoesRelations = relations(dotacoes, ({ one, many }) => ({
  lei: one(leisOrcamentarias, { fields: [dotacoes.leiOrcamentariaId], references: [leisOrcamentarias.id] }),
  exercicio: one(exercicios, { fields: [dotacoes.exercicioId], references: [exercicios.id] }),
  entidade: one(entidades, { fields: [dotacoes.entidadeId], references: [entidades.id] }),
  programa: one(programas, { fields: [dotacoes.programaId], references: [programas.id] }),
  acao: one(acoes, { fields: [dotacoes.acaoId], references: [acoes.id] }),
  modalidade: one(modalidadesAplicacao, { fields: [dotacoes.modalidadeAplicacaoId], references: [modalidadesAplicacao.id] }),
  fonte: one(fontesRecurso, { fields: [dotacoes.fonteRecursoId], references: [fontesRecurso.id] }),
  creditos: many(creditosDotacoes),
  historico: many(dotacoesHistoricoValor),
}))

export const creditosOrcamentariosRelations = relations(creditosOrcamentarios, ({ one, many }) => ({
  exercicio: one(exercicios, { fields: [creditosOrcamentarios.exercicioId], references: [exercicios.id] }),
  lei: one(leisOrcamentarias, { fields: [creditosOrcamentarios.leiOrcamentariaId], references: [leisOrcamentarias.id] }),
  dotacoes: many(creditosDotacoes),
}))

export const creditosDotacoesRelations = relations(creditosDotacoes, ({ one }) => ({
  credito: one(creditosOrcamentarios, { fields: [creditosDotacoes.creditoId], references: [creditosOrcamentarios.id] }),
  dotacao: one(dotacoes, { fields: [creditosDotacoes.dotacaoId], references: [dotacoes.id] }),
}))

export const dotacoesHistoricoValorRelations = relations(dotacoesHistoricoValor, ({ one }) => ({
  dotacao: one(dotacoes, { fields: [dotacoesHistoricoValor.dotacaoId], references: [dotacoes.id] }),
  credito: one(creditosOrcamentarios, { fields: [dotacoesHistoricoValor.creditoId], references: [creditosOrcamentarios.id] }),
}))

// ─────────────────────────────────────────────────────────────
// MODULO DESPESAS
// ─────────────────────────────────────────────────────────────

export const empenhoStatusEnum = pgEnum('empenho_status', ['vigente', 'restos_processados', 'restos_nao_processados', 'cancelado', 'cancelado_lrf', 'pago_total'])
export const empenhoTipoEnum = pgEnum('empenho_tipo', ['ordinario', 'global', 'estimativo'])
export const liquidacaoStatusEnum = pgEnum('liquidacao_status', ['vigente', 'cancelada'])
export const ordemPagamentoStatusEnum = pgEnum('ordem_pagamento_status', ['aguardando_aprovacao', 'aprovada', 'rejeitada', 'paga_parcial', 'paga_total', 'cancelada'])
export const pagamentoStatusEnum = pgEnum('pagamento_status', ['vigente', 'estornado'])
export const pagamentoMeioEnum = pgEnum('pagamento_meio', ['pix', 'transferencia', 'cheque', 'boleto', 'debito_automatico', 'ordem_bancaria', 'compensacao', 'outros'])

export const empenhosAgrupadores = pgTable(
  'empenhos_agrupadores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    descricao: varchar('descricao', { length: 300 }).notNull(),
    numeroExterno: varchar('numero_externo', { length: 50 }),
    observacoes: text('observacoes'),
    ativo: boolean('ativo').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references((): AnyPgColumn => users.id),
  },
  (t) => ({
    descricaoIdx: index('emp_agr_descricao_idx').on(t.descricao),
    ativoIdx: index('emp_agr_ativo_idx').on(t.ativo),
  }),
)

export const empenhos = pgTable(
  'empenhos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    numero: varchar('numero', { length: 50 }).notNull(),
    tipo: empenhoTipoEnum('tipo').notNull().default('ordinario'),
    status: empenhoStatusEnum('status').notNull().default('vigente'),
    exercicioId: uuid('exercicio_id').notNull().references(() => exercicios.id, { onDelete: 'restrict' }),
    mesFiscalId: uuid('mes_fiscal_id').notNull().references(() => mesesFiscais.id, { onDelete: 'restrict' }),
    dotacaoId: uuid('dotacao_id').notNull().references(() => dotacoes.id, { onDelete: 'restrict' }),
    exercicioOriginalId: uuid('exercicio_original_id').references(() => exercicios.id, { onDelete: 'restrict' }),
    agrupadorId: uuid('agrupador_id').references(() => empenhosAgrupadores.id, { onDelete: 'set null' }),
    fornecedorPessoaId: uuid('fornecedor_pessoa_id').notNull().references((): AnyPgColumn => pessoas.id, { onDelete: 'restrict' }),
    dataEmpenho: date('data_empenho').notNull(),
    valor: numeric('valor', { precision: 18, scale: 2 }).notNull(),
    valorLiquidado: numeric('valor_liquidado', { precision: 18, scale: 2 }).notNull().default('0'),
    valorPago: numeric('valor_pago', { precision: 18, scale: 2 }).notNull().default('0'),
    valorAnulado: numeric('valor_anulado', { precision: 18, scale: 2 }).notNull().default('0'),
    objeto: text('objeto').notNull(),
    contratoReferencia: jsonb('contrato_referencia').$type<Record<string, unknown>>(),
    identificadorMsc: varchar('identificador_msc', { length: 50 }),
    informacaoComplementar: jsonb('informacao_complementar').$type<Record<string, unknown>>(),
    observacoes: text('observacoes'),
    canceladoEm: timestamp('cancelado_em', { withTimezone: true }),
    canceladoPorUserId: uuid('cancelado_por_user_id').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    motivoCancelamento: text('motivo_cancelamento'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references((): AnyPgColumn => users.id),
  },
  (t) => ({
    numeroUnique: uniqueIndex('empenhos_numero_idx').on(t.numero),
    exercicioIdx: index('empenhos_exercicio_idx').on(t.exercicioId),
    dotacaoIdx: index('empenhos_dotacao_idx').on(t.dotacaoId),
    fornecedorIdx: index('empenhos_fornecedor_idx').on(t.fornecedorPessoaId),
    agrupadorIdx: index('empenhos_agrupador_idx').on(t.agrupadorId),
    statusIdx: index('empenhos_status_idx').on(t.status, t.exercicioId),
    mesIdx: index('empenhos_mes_idx').on(t.mesFiscalId),
    dataIdx: index('empenhos_data_idx').on(t.dataEmpenho),
  }),
)

export const empenhosEventos = pgTable(
  'empenhos_eventos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empenhoId: uuid('empenho_id').notNull().references(() => empenhos.id, { onDelete: 'cascade' }),
    statusAnterior: empenhoStatusEnum('status_anterior'),
    statusNovo: empenhoStatusEnum('status_novo').notNull(),
    motivo: varchar('motivo', { length: 500 }).notNull(),
    userId: uuid('user_id').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    registradoEm: timestamp('registrado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    empenhoIdx: index('emp_eventos_empenho_idx').on(t.empenhoId, t.registradoEm),
  }),
)

export const empenhosAnulacoes = pgTable(
  'empenhos_anulacoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empenhoId: uuid('empenho_id').notNull().references(() => empenhos.id, { onDelete: 'restrict' }),
    mesFiscalId: uuid('mes_fiscal_id').notNull().references(() => mesesFiscais.id, { onDelete: 'restrict' }),
    dataAnulacao: date('data_anulacao').notNull(),
    valor: numeric('valor', { precision: 18, scale: 2 }).notNull(),
    motivo: text('motivo').notNull(),
    documentoAutorizacao: varchar('documento_autorizacao', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references((): AnyPgColumn => users.id),
  },
  (t) => ({
    empenhoIdx: index('emp_anul_empenho_idx').on(t.empenhoId),
    mesIdx: index('emp_anul_mes_idx').on(t.mesFiscalId),
    dataIdx: index('emp_anul_data_idx').on(t.dataAnulacao),
  }),
)

export const liquidacoes = pgTable(
  'liquidacoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    numero: varchar('numero', { length: 50 }).notNull(),
    status: liquidacaoStatusEnum('status').notNull().default('vigente'),
    empenhoId: uuid('empenho_id').notNull().references(() => empenhos.id, { onDelete: 'restrict' }),
    mesFiscalId: uuid('mes_fiscal_id').notNull().references(() => mesesFiscais.id, { onDelete: 'restrict' }),
    dataLiquidacao: date('data_liquidacao').notNull(),
    valor: numeric('valor', { precision: 18, scale: 2 }).notNull(),
    valorPago: numeric('valor_pago', { precision: 18, scale: 2 }).notNull().default('0'),
    documentoComprovante: varchar('documento_comprovante', { length: 100 }),
    dataDocumento: date('data_documento'),
    observacoes: text('observacoes'),
    identificadorMsc: varchar('identificador_msc', { length: 50 }),
    canceladaEm: timestamp('cancelada_em', { withTimezone: true }),
    canceladaPorUserId: uuid('cancelada_por_user_id').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    motivoCancelamento: text('motivo_cancelamento'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references((): AnyPgColumn => users.id),
  },
  (t) => ({
    numeroUnique: uniqueIndex('liquidacoes_numero_idx').on(t.numero),
    empenhoIdx: index('liquidacoes_empenho_idx').on(t.empenhoId),
    mesIdx: index('liquidacoes_mes_idx').on(t.mesFiscalId),
    dataIdx: index('liquidacoes_data_idx').on(t.dataLiquidacao),
    statusIdx: index('liquidacoes_status_idx').on(t.status),
  }),
)

export const liquidacoesAnulacoes = pgTable(
  'liquidacoes_anulacoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    liquidacaoId: uuid('liquidacao_id').notNull().references(() => liquidacoes.id, { onDelete: 'restrict' }),
    mesFiscalId: uuid('mes_fiscal_id').notNull().references(() => mesesFiscais.id, { onDelete: 'restrict' }),
    dataAnulacao: date('data_anulacao').notNull(),
    valor: numeric('valor', { precision: 18, scale: 2 }).notNull(),
    motivo: text('motivo').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references((): AnyPgColumn => users.id),
  },
  (t) => ({
    liquidacaoIdx: index('liq_anul_liquidacao_idx').on(t.liquidacaoId),
    mesIdx: index('liq_anul_mes_idx').on(t.mesFiscalId),
  }),
)

export const ordensPagamento = pgTable(
  'ordens_pagamento',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    numero: varchar('numero', { length: 50 }).notNull(),
    status: ordemPagamentoStatusEnum('status').notNull().default('aguardando_aprovacao'),
    liquidacaoId: uuid('liquidacao_id').notNull().references(() => liquidacoes.id, { onDelete: 'restrict' }),
    mesFiscalId: uuid('mes_fiscal_id').notNull().references(() => mesesFiscais.id, { onDelete: 'restrict' }),
    valor: numeric('valor', { precision: 18, scale: 2 }).notNull(),
    valorPago: numeric('valor_pago', { precision: 18, scale: 2 }).notNull().default('0'),
    dataEmissao: date('data_emissao').notNull(),
    dataAprovacao: date('data_aprovacao'),
    observacoes: text('observacoes'),
    aprovadaPorUserId: uuid('aprovada_por_user_id').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    aprovadaEm: timestamp('aprovada_em', { withTimezone: true }),
    rejeitadaPorUserId: uuid('rejeitada_por_user_id').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    rejeitadaEm: timestamp('rejeitada_em', { withTimezone: true }),
    motivoRejeicao: text('motivo_rejeicao'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references((): AnyPgColumn => users.id),
  },
  (t) => ({
    numeroUnique: uniqueIndex('op_numero_idx').on(t.numero),
    liquidacaoIdx: index('op_liquidacao_idx').on(t.liquidacaoId),
    statusIdx: index('op_status_idx').on(t.status),
    mesIdx: index('op_mes_idx').on(t.mesFiscalId),
  }),
)

export const pagamentos = pgTable(
  'pagamentos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    numero: varchar('numero', { length: 50 }).notNull(),
    status: pagamentoStatusEnum('status').notNull().default('vigente'),
    ordemPagamentoId: uuid('ordem_pagamento_id').notNull().references(() => ordensPagamento.id, { onDelete: 'restrict' }),
    mesFiscalId: uuid('mes_fiscal_id').notNull().references(() => mesesFiscais.id, { onDelete: 'restrict' }),
    dataPagamento: date('data_pagamento').notNull(),
    valor: numeric('valor', { precision: 18, scale: 2 }).notNull(),
    meio: pagamentoMeioEnum('meio').notNull(),
    numeroDocumento: varchar('numero_documento', { length: 100 }),
    contaBancariaId: uuid('conta_bancaria_id'),
    observacoes: text('observacoes'),
    identificadorMsc: varchar('identificador_msc', { length: 50 }),
    estornadoEm: timestamp('estornado_em', { withTimezone: true }),
    estornadoPorUserId: uuid('estornado_por_user_id').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    motivoEstorno: text('motivo_estorno'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references((): AnyPgColumn => users.id),
  },
  (t) => ({
    numeroUnique: uniqueIndex('pag_numero_idx').on(t.numero),
    opIdx: index('pag_op_idx').on(t.ordemPagamentoId),
    mesIdx: index('pag_mes_idx').on(t.mesFiscalId),
    dataIdx: index('pag_data_idx').on(t.dataPagamento),
    statusIdx: index('pag_status_idx').on(t.status),
  }),
)

export const pagamentosAnulacoes = pgTable(
  'pagamentos_anulacoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pagamentoId: uuid('pagamento_id').notNull().references(() => pagamentos.id, { onDelete: 'restrict' }),
    mesFiscalId: uuid('mes_fiscal_id').notNull().references(() => mesesFiscais.id, { onDelete: 'restrict' }),
    dataEstorno: date('data_estorno').notNull(),
    valor: numeric('valor', { precision: 18, scale: 2 }).notNull(),
    motivo: text('motivo').notNull(),
    documentoBancario: varchar('documento_bancario', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references((): AnyPgColumn => users.id),
  },
  (t) => ({
    pagamentoIdx: index('pag_anul_pagamento_idx').on(t.pagamentoId),
    mesIdx: index('pag_anul_mes_idx').on(t.mesFiscalId),
  }),
)

// Despesas relations
export const empenhosAgrupadoresRelations = relations(empenhosAgrupadores, ({ many }) => ({ empenhos: many(empenhos) }))

export const empenhosRelations = relations(empenhos, ({ one, many }) => ({
  exercicio: one(exercicios, { fields: [empenhos.exercicioId], references: [exercicios.id] }),
  exercicioOriginal: one(exercicios, { fields: [empenhos.exercicioOriginalId], references: [exercicios.id], relationName: 'empenho_exercicio_original' }),
  mesFiscal: one(mesesFiscais, { fields: [empenhos.mesFiscalId], references: [mesesFiscais.id] }),
  dotacao: one(dotacoes, { fields: [empenhos.dotacaoId], references: [dotacoes.id] }),
  agrupador: one(empenhosAgrupadores, { fields: [empenhos.agrupadorId], references: [empenhosAgrupadores.id] }),
  fornecedor: one(pessoas, { fields: [empenhos.fornecedorPessoaId], references: [pessoas.id] }),
  eventos: many(empenhosEventos), anulacoes: many(empenhosAnulacoes), liquidacoes: many(liquidacoes),
}))

export const empenhosEventosRelations = relations(empenhosEventos, ({ one }) => ({
  empenho: one(empenhos, { fields: [empenhosEventos.empenhoId], references: [empenhos.id] }),
  user: one(users, { fields: [empenhosEventos.userId], references: [users.id] }),
}))

export const empenhosAnulacoesRelations = relations(empenhosAnulacoes, ({ one }) => ({
  empenho: one(empenhos, { fields: [empenhosAnulacoes.empenhoId], references: [empenhos.id] }),
  mesFiscal: one(mesesFiscais, { fields: [empenhosAnulacoes.mesFiscalId], references: [mesesFiscais.id] }),
}))

export const liquidacoesRelations = relations(liquidacoes, ({ one, many }) => ({
  empenho: one(empenhos, { fields: [liquidacoes.empenhoId], references: [empenhos.id] }),
  mesFiscal: one(mesesFiscais, { fields: [liquidacoes.mesFiscalId], references: [mesesFiscais.id] }),
  anulacoes: many(liquidacoesAnulacoes), ordensPagamento: many(ordensPagamento),
}))

export const liquidacoesAnulacoesRelations = relations(liquidacoesAnulacoes, ({ one }) => ({
  liquidacao: one(liquidacoes, { fields: [liquidacoesAnulacoes.liquidacaoId], references: [liquidacoes.id] }),
  mesFiscal: one(mesesFiscais, { fields: [liquidacoesAnulacoes.mesFiscalId], references: [mesesFiscais.id] }),
}))

export const ordensPagamentoRelations = relations(ordensPagamento, ({ one, many }) => ({
  liquidacao: one(liquidacoes, { fields: [ordensPagamento.liquidacaoId], references: [liquidacoes.id] }),
  mesFiscal: one(mesesFiscais, { fields: [ordensPagamento.mesFiscalId], references: [mesesFiscais.id] }),
  aprovadaPor: one(users, { fields: [ordensPagamento.aprovadaPorUserId], references: [users.id], relationName: 'op_aprovador' }),
  rejeitadaPor: one(users, { fields: [ordensPagamento.rejeitadaPorUserId], references: [users.id], relationName: 'op_rejeitador' }),
  pagamentos: many(pagamentos),
}))

export const pagamentosRelations = relations(pagamentos, ({ one, many }) => ({
  ordemPagamento: one(ordensPagamento, { fields: [pagamentos.ordemPagamentoId], references: [ordensPagamento.id] }),
  mesFiscal: one(mesesFiscais, { fields: [pagamentos.mesFiscalId], references: [mesesFiscais.id] }),
  anulacoes: many(pagamentosAnulacoes),
}))

export const pagamentosAnulacoesRelations = relations(pagamentosAnulacoes, ({ one }) => ({
  pagamento: one(pagamentos, { fields: [pagamentosAnulacoes.pagamentoId], references: [pagamentos.id] }),
  mesFiscal: one(mesesFiscais, { fields: [pagamentosAnulacoes.mesFiscalId], references: [mesesFiscais.id] }),
}))

// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────

export type TenantUser = typeof users.$inferSelect
export type NewTenantUser = typeof users.$inferInsert
export type Role = typeof roles.$inferSelect
export type Permission = typeof permissions.$inferSelect
export type Pessoa = typeof pessoas.$inferSelect
export type NewPessoa = typeof pessoas.$inferInsert
export type Entidade = typeof entidades.$inferSelect
export type EstruturaOrganizacional = typeof estruturasOrganizacionais.$inferSelect
export type TextoJuridico = typeof textosJuridicos.$inferSelect
export type Anexo = typeof anexos.$inferSelect
export type Exercicio = typeof exercicios.$inferSelect
export type NewExercicio = typeof exercicios.$inferInsert
export type MesFiscal = typeof mesesFiscais.$inferSelect
export type NewMesFiscal = typeof mesesFiscais.$inferInsert
export type PcaspVersao = typeof pcaspVersoes.$inferSelect
export type ReceitaNatureza = typeof receitasNaturezas.$inferSelect
export type NewReceitaNatureza = typeof receitasNaturezas.$inferInsert
export type ReceitaTipo = typeof receitasTipos.$inferSelect
export type ReceitaLancamento = typeof receitasLancamentos.$inferSelect
export type ReceitaArrecadacao = typeof receitasArrecadacoes.$inferSelect
export type ReceitaAnulacao = typeof receitasAnulacoes.$inferSelect
export type LeiOrcamentaria = typeof leisOrcamentarias.$inferSelect
export type NewLeiOrcamentaria = typeof leisOrcamentarias.$inferInsert
export type Programa = typeof programas.$inferSelect
export type Acao = typeof acoes.$inferSelect
export type ModalidadeAplicacao = typeof modalidadesAplicacao.$inferSelect
export type FonteRecurso = typeof fontesRecurso.$inferSelect
export type Dotacao = typeof dotacoes.$inferSelect
export type NewDotacao = typeof dotacoes.$inferInsert
export type CreditoOrcamentario = typeof creditosOrcamentarios.$inferSelect
export type CreditoDotacao = typeof creditosDotacoes.$inferSelect
export type DotacaoHistoricoValor = typeof dotacoesHistoricoValor.$inferSelect
export type EmpenhoAgrupador = typeof empenhosAgrupadores.$inferSelect
export type Empenho = typeof empenhos.$inferSelect
export type NewEmpenho = typeof empenhos.$inferInsert
export type EmpenhoEvento = typeof empenhosEventos.$inferSelect
export type EmpenhoAnulacao = typeof empenhosAnulacoes.$inferSelect
export type Liquidacao = typeof liquidacoes.$inferSelect
export type NewLiquidacao = typeof liquidacoes.$inferInsert
export type LiquidacaoAnulacao = typeof liquidacoesAnulacoes.$inferSelect
export type OrdemPagamento = typeof ordensPagamento.$inferSelect
export type NewOrdemPagamento = typeof ordensPagamento.$inferInsert
export type Pagamento = typeof pagamentos.$inferSelect
export type NewPagamento = typeof pagamentos.$inferInsert
export type PagamentoAnulacao = typeof pagamentosAnulacoes.$inferSelect

// ─────────────────────────────────────────────────────────────
// MODULO FOLHA DE PAGAMENTO
// ─────────────────────────────────────────────────────────────

export const vinculoTipoEnum = pgEnum('vinculo_tipo', ['efetivo', 'comissionado', 'temporario', 'estagiario', 'aposentado', 'pensionista', 'agente_politico', 'cedido'])
export const vinculoStatusEnum = pgEnum('vinculo_status', ['ativo', 'inativo', 'afastado', 'aposentado', 'exonerado', 'falecido'])
export const regimeJuridicoEnum = pgEnum('regime_juridico', ['estatutario', 'clt', 'temporario_lei', 'comissionado', 'eletivo'])
export const regimePrevidenciarioEnum = pgEnum('regime_previdenciario', ['rpps', 'rgps', 'isento'])
export const rubricaTipoEnum = pgEnum('rubrica_tipo', ['provento', 'desconto', 'informativo', 'base_calculo'])
export const rubricaCalculoEnum = pgEnum('rubrica_calculo', ['fixo', 'percentual_base', 'tabela_progressiva', 'horas', 'dias', 'manual', 'formula_sistema'])
export const folhaTipoEnum = pgEnum('folha_tipo', ['mensal', 'decimo_terceiro_primeira', 'decimo_terceiro_segunda', 'decimo_terceiro_integral', 'ferias', 'rescisao', 'complementar'])
export const folhaStatusEnum = pgEnum('folha_status', ['em_elaboracao', 'calculando', 'calculada', 'em_revisao', 'aprovada', 'encerrada', 'cancelada'])
export const feriasTipoEnum = pgEnum('ferias_tipo', ['gozo', 'gozo_com_abono', 'pecunia', 'indenizatorias'])
export const rescisaoMotivoEnum = pgEnum('rescisao_motivo', ['exoneracao_pedido', 'exoneracao_oficio', 'demissao_justa_causa', 'aposentadoria_voluntaria', 'aposentadoria_compulsoria', 'aposentadoria_invalidez', 'falecimento', 'fim_mandato', 'fim_contrato_temporario', 'transferencia'])
export const lancamentoOrigemEnum = pgEnum('lancamento_origem', ['automatico', 'manual', 'importado', 'judicial'])
export const jobStatusEnum = pgEnum('job_status', ['pendente', 'processando', 'concluido', 'falhou', 'cancelado'])
export const estrategiaProporcionalidadeEnum = pgEnum('estrategia_proporcionalidade', ['INTEGRAL', 'DIAS_REGISTRADOS', 'DIAS_EFETIVOS_TRABALHADOS', 'DIAS_NOTURNOS_DECLARADOS', 'CUSTOMIZADA_SCRIPT'])

export const cargos = pgTable('cargos', {
  id: uuid('id').primaryKey().defaultRandom(), codigo: varchar('codigo', { length: 20 }).notNull(), nome: varchar('nome', { length: 200 }).notNull(), descricao: text('descricao'),
  regimeJuridico: regimeJuridicoEnum('regime_juridico').notNull(), classe: varchar('classe', { length: 50 }), escolaridadeMinima: varchar('escolaridade_minima', { length: 100 }),
  cargaHorariaSemanal: integer('carga_horaria_semanal').notNull().default(40), ativo: boolean('ativo').notNull().default(true), deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(), createdBy: uuid('created_by').references((): AnyPgColumn => users.id),
}, (t) => ({ codigoUnique: uniqueIndex('cargos_codigo_idx').on(t.codigo), ativoIdx: index('cargos_ativo_idx').on(t.ativo), regimeIdx: index('cargos_regime_idx').on(t.regimeJuridico) }))

export const cargosNiveisReferencias = pgTable('cargos_niveis_referencias', {
  id: uuid('id').primaryKey().defaultRandom(), cargoId: uuid('cargo_id').notNull().references(() => cargos.id, { onDelete: 'cascade' }),
  nivel: varchar('nivel', { length: 20 }).notNull(), referencia: varchar('referencia', { length: 20 }).notNull(),
  vencimentoBase: numeric('vencimento_base', { precision: 14, scale: 2 }).notNull(), observacoes: text('observacoes'),
  ativo: boolean('ativo').notNull().default(true), vigenciaInicio: date('vigencia_inicio').notNull(), vigenciaFim: date('vigencia_fim'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ cargoNivelRefUnique: uniqueIndex('cargo_niv_ref_idx').on(t.cargoId, t.nivel, t.referencia, t.vigenciaInicio), cargoIdx: index('cargo_niv_ref_cargo_idx').on(t.cargoId) }))

export const vinculosFuncionais = pgTable('vinculos_funcionais', {
  id: uuid('id').primaryKey().defaultRandom(), pessoaId: uuid('pessoa_id').notNull().references((): AnyPgColumn => pessoas.id, { onDelete: 'restrict' }),
  matricula: varchar('matricula', { length: 30 }).notNull(), tipo: vinculoTipoEnum('tipo').notNull(), status: vinculoStatusEnum('status').notNull().default('ativo'),
  cargoId: uuid('cargo_id').references(() => cargos.id, { onDelete: 'restrict' }), nivelReferenciaId: uuid('nivel_referencia_id').references(() => cargosNiveisReferencias.id),
  entidadeId: uuid('entidade_id').notNull().references((): AnyPgColumn => entidades.id), regimeJuridico: regimeJuridicoEnum('regime_juridico').notNull(), regimePrevidenciario: regimePrevidenciarioEnum('regime_previdenciario').notNull(),
  dataAdmissao: date('data_admissao').notNull(), dataExoneracao: date('data_exoneracao'), dataAposentadoria: date('data_aposentadoria'), dataFalecimento: date('data_falecimento'),
  cargaHorariaSemanal: integer('carga_horaria_semanal').notNull().default(40), localTrabalho: varchar('local_trabalho', { length: 200 }), centroCustoCodigo: varchar('centro_custo_codigo', { length: 30 }),
  bancoCodigo: varchar('banco_codigo', { length: 10 }), agencia: varchar('agencia', { length: 20 }), contaTipo: varchar('conta_tipo', { length: 20 }), contaNumero: varchar('conta_numero', { length: 30 }),
  qtdDependentesIrrf: integer('qtd_dependentes_irrf').notNull().default(0), qtdDependentesSalarioFamilia: integer('qtd_dependentes_salario_familia').notNull().default(0),
  observacoes: text('observacoes'), deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(), createdBy: uuid('created_by').references((): AnyPgColumn => users.id),
}, (t) => ({ matriculaUnique: uniqueIndex('vinc_matricula_idx').on(t.matricula), pessoaIdx: index('vinc_pessoa_idx').on(t.pessoaId), statusIdx: index('vinc_status_idx').on(t.status, t.tipo), cargoIdx: index('vinc_cargo_idx').on(t.cargoId), entidadeIdx: index('vinc_entidade_idx').on(t.entidadeId) }))

export const vinculosEventos = pgTable('vinculos_eventos', {
  id: uuid('id').primaryKey().defaultRandom(), vinculoId: uuid('vinculo_id').notNull().references(() => vinculosFuncionais.id, { onDelete: 'cascade' }),
  tipoEvento: varchar('tipo_evento', { length: 50 }).notNull(), dataEvento: date('data_evento').notNull(),
  statusAnterior: vinculoStatusEnum('status_anterior'), statusNovo: vinculoStatusEnum('status_novo'),
  cargoAnteriorId: uuid('cargo_anterior_id').references(() => cargos.id), cargoNovoId: uuid('cargo_novo_id').references(() => cargos.id),
  documentoReferencia: varchar('documento_referencia', { length: 200 }), motivo: text('motivo').notNull(), userId: uuid('user_id').references((): AnyPgColumn => users.id),
  registradoEm: timestamp('registrado_em', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ vinculoIdx: index('vinc_eventos_vinculo_idx').on(t.vinculoId, t.dataEvento), dataIdx: index('vinc_eventos_data_idx').on(t.dataEvento) }))

export const rubricas = pgTable('rubricas', {
  id: uuid('id').primaryKey().defaultRandom(), codigo: varchar('codigo', { length: 20 }).notNull(), nome: varchar('nome', { length: 200 }).notNull(), descricao: text('descricao'),
  tipo: rubricaTipoEnum('tipo').notNull(), calculo: rubricaCalculoEnum('calculo').notNull(), parametros: jsonb('parametros').$type<Record<string, unknown>>(),
  incideInss: boolean('incide_inss').notNull().default(false), incideIrrf: boolean('incide_irrf').notNull().default(false), incideFgts: boolean('incide_fgts').notNull().default(false),
  incideDecimoTerceiro: boolean('incide_decimo_terceiro').notNull().default(false), incideFerias: boolean('incide_ferias').notNull().default(false), incideRpps: boolean('incide_rpps').notNull().default(false),
  folhaMensal: boolean('folha_mensal').notNull().default(true), folhaDecimoTerceiro: boolean('folha_decimo_terceiro').notNull().default(false), folhaFerias: boolean('folha_ferias').notNull().default(false), folhaRescisao: boolean('folha_rescisao').notNull().default(false),
  classificacaoContabil: varchar('classificacao_contabil', { length: 30 }),
  // B35.1: proporcionalidade, eSocial, retroativo
  estrategiaProporcionalidade: estrategiaProporcionalidadeEnum('estrategia_proporcionalidade').notNull().default('DIAS_REGISTRADOS'),
  codigoEsocial: text('codigo_esocial'), rubricaEsocialDescricao: text('rubrica_esocial_descricao'),
  permiteRetroativo: boolean('permite_retroativo').notNull().default(false),
  ativo: boolean('ativo').notNull().default(true), deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(), createdBy: uuid('created_by').references((): AnyPgColumn => users.id),
}, (t) => ({ codigoUnique: uniqueIndex('rubricas_codigo_idx').on(t.codigo), tipoIdx: index('rubricas_tipo_idx').on(t.tipo), ativoIdx: index('rubricas_ativo_idx').on(t.ativo, t.calculo) }))

export const rubricasVinculos = pgTable('rubricas_vinculos', {
  id: uuid('id').primaryKey().defaultRandom(), vinculoId: uuid('vinculo_id').notNull().references(() => vinculosFuncionais.id, { onDelete: 'cascade' }),
  rubricaId: uuid('rubrica_id').notNull().references(() => rubricas.id, { onDelete: 'restrict' }),
  valor: numeric('valor', { precision: 14, scale: 2 }), percentual: numeric('percentual', { precision: 8, scale: 4 }), quantidade: numeric('quantidade', { precision: 8, scale: 2 }),
  vigenciaInicio: date('vigencia_inicio').notNull(), vigenciaFim: date('vigencia_fim'), documentoReferencia: varchar('documento_referencia', { length: 200 }), observacoes: text('observacoes'),
  ativo: boolean('ativo').notNull().default(true), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), createdBy: uuid('created_by').references((): AnyPgColumn => users.id),
}, (t) => ({ vinculoRubricaIdx: index('rub_vinc_idx').on(t.vinculoId, t.rubricaId), vigenciaIdx: index('rub_vinc_vigencia_idx').on(t.vigenciaInicio, t.vigenciaFim) }))

export const folhas = pgTable('folhas', {
  id: uuid('id').primaryKey().defaultRandom(), numero: varchar('numero', { length: 50 }).notNull(), tipo: folhaTipoEnum('tipo').notNull(), status: folhaStatusEnum('status').notNull().default('em_elaboracao'),
  descricao: varchar('descricao', { length: 300 }).notNull(), exercicioId: uuid('exercicio_id').notNull().references(() => exercicios.id, { onDelete: 'restrict' }), mesFiscalId: uuid('mes_fiscal_id').notNull().references(() => mesesFiscais.id, { onDelete: 'restrict' }),
  competenciaMes: integer('competencia_mes').notNull(), competenciaAno: integer('competencia_ano').notNull(), dataPagamento: date('data_pagamento'),
  totalProventos: numeric('total_proventos', { precision: 18, scale: 2 }).notNull().default('0'), totalDescontos: numeric('total_descontos', { precision: 18, scale: 2 }).notNull().default('0'), totalLiquido: numeric('total_liquido', { precision: 18, scale: 2 }).notNull().default('0'),
  totalBaseInss: numeric('total_base_inss', { precision: 18, scale: 2 }).notNull().default('0'), totalBaseIrrf: numeric('total_base_irrf', { precision: 18, scale: 2 }).notNull().default('0'), totalBaseFgts: numeric('total_base_fgts', { precision: 18, scale: 2 }).notNull().default('0'),
  qtdServidores: integer('qtd_servidores').notNull().default(0),
  calculoIniciadoEm: timestamp('calculo_iniciado_em', { withTimezone: true }), calculoConcluidoEm: timestamp('calculo_concluido_em', { withTimezone: true }),
  aprovadaEm: timestamp('aprovada_em', { withTimezone: true }), aprovadaPorUserId: uuid('aprovada_por_user_id').references((): AnyPgColumn => users.id),
  encerradaEm: timestamp('encerrada_em', { withTimezone: true }), encerradaPorUserId: uuid('encerrada_por_user_id').references((): AnyPgColumn => users.id),
  observacoes: text('observacoes'), deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(), createdBy: uuid('created_by').references((): AnyPgColumn => users.id),
}, (t) => ({ numeroUnique: uniqueIndex('folhas_numero_idx').on(t.numero), statusIdx: index('folhas_status_idx').on(t.status, t.tipo), competenciaIdx: index('folhas_competencia_idx').on(t.competenciaAno, t.competenciaMes), exercicioIdx: index('folhas_exercicio_idx').on(t.exercicioId) }))

export const folhasLancamentos = pgTable('folhas_lancamentos', {
  id: uuid('id').primaryKey().defaultRandom(), folhaId: uuid('folha_id').notNull().references(() => folhas.id, { onDelete: 'cascade' }),
  vinculoId: uuid('vinculo_id').notNull().references(() => vinculosFuncionais.id, { onDelete: 'restrict' }), rubricaId: uuid('rubrica_id').notNull().references(() => rubricas.id, { onDelete: 'restrict' }),
  origem: lancamentoOrigemEnum('origem').notNull().default('automatico'), ordem: integer('ordem').notNull().default(0),
  valor: numeric('valor', { precision: 14, scale: 2 }).notNull(), baseCalculo: numeric('base_calculo', { precision: 14, scale: 2 }), percentual: numeric('percentual', { precision: 8, scale: 4 }), quantidade: numeric('quantidade', { precision: 8, scale: 2 }),
  observacoes: text('observacoes'), documentoReferencia: varchar('documento_referencia', { length: 200 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), createdBy: uuid('created_by').references((): AnyPgColumn => users.id),
}, (t) => ({ folhaVinculoIdx: index('lanc_folha_vinc_idx').on(t.folhaId, t.vinculoId), vinculoIdx: index('lanc_vinculo_idx').on(t.vinculoId), rubricaIdx: index('lanc_rubrica_idx').on(t.rubricaId), folhaIdx: index('lanc_folha_idx').on(t.folhaId) }))

export const holerites = pgTable('holerites', {
  id: uuid('id').primaryKey().defaultRandom(), folhaId: uuid('folha_id').notNull().references(() => folhas.id, { onDelete: 'cascade' }),
  vinculoId: uuid('vinculo_id').notNull().references(() => vinculosFuncionais.id, { onDelete: 'restrict' }), numero: varchar('numero', { length: 50 }).notNull(),
  totalProventos: numeric('total_proventos', { precision: 14, scale: 2 }).notNull().default('0'), totalDescontos: numeric('total_descontos', { precision: 14, scale: 2 }).notNull().default('0'), totalLiquido: numeric('total_liquido', { precision: 14, scale: 2 }).notNull().default('0'),
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(), geradoEm: timestamp('gerado_em', { withTimezone: true }).notNull().defaultNow(), visualizadoEm: timestamp('visualizado_em', { withTimezone: true }),
}, (t) => ({ folhaVinculoUnique: uniqueIndex('hol_folha_vinc_idx').on(t.folhaId, t.vinculoId), vinculoIdx: index('hol_vinculo_idx').on(t.vinculoId), numeroIdx: index('hol_numero_idx').on(t.numero) }))

export const folhasFerias = pgTable('folhas_ferias', {
  id: uuid('id').primaryKey().defaultRandom(), folhaId: uuid('folha_id').notNull().references(() => folhas.id, { onDelete: 'cascade' }),
  vinculoId: uuid('vinculo_id').notNull().references(() => vinculosFuncionais.id, { onDelete: 'restrict' }), tipo: feriasTipoEnum('tipo').notNull(),
  periodoAquisitivoInicio: date('periodo_aquisitivo_inicio').notNull(), periodoAquisitivoFim: date('periodo_aquisitivo_fim').notNull(),
  diasDireito: integer('dias_direito').notNull().default(30), diasGozados: integer('dias_gozados').notNull(), gozoInicio: date('gozo_inicio'), gozoFim: date('gozo_fim'),
  diasAbono: integer('dias_abono').notNull().default(0), adiantaDecimoTerceiro: boolean('adianta_decimo_terceiro').notNull().default(false), observacoes: text('observacoes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ folhaVinculoUnique: uniqueIndex('fer_folha_vinc_idx').on(t.folhaId, t.vinculoId), vinculoIdx: index('fer_vinculo_idx').on(t.vinculoId) }))

export const folhasRescisoes = pgTable('folhas_rescisoes', {
  id: uuid('id').primaryKey().defaultRandom(), folhaId: uuid('folha_id').notNull().references(() => folhas.id, { onDelete: 'cascade' }),
  vinculoId: uuid('vinculo_id').notNull().references(() => vinculosFuncionais.id, { onDelete: 'restrict' }), motivo: rescisaoMotivoEnum('motivo').notNull(),
  dataDesligamento: date('data_desligamento').notNull(), dataPagamento: date('data_pagamento').notNull(), documentoReferencia: varchar('documento_referencia', { length: 200 }),
  saldoSalario: numeric('saldo_salario', { precision: 14, scale: 2 }).notNull().default('0'), decimoTerceiroProporcional: numeric('decimo_terceiro_proporcional', { precision: 14, scale: 2 }).notNull().default('0'),
  feriasProporcionais: numeric('ferias_proporcionais', { precision: 14, scale: 2 }).notNull().default('0'), avisoPrevioIndenizado: numeric('aviso_previo_indenizado', { precision: 14, scale: 2 }).notNull().default('0'), multaFgts: numeric('multa_fgts', { precision: 14, scale: 2 }).notNull().default('0'),
  observacoes: text('observacoes'), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ folhaVinculoUnique: uniqueIndex('resc_folha_vinc_idx').on(t.folhaId, t.vinculoId), vinculoIdx: index('resc_vinculo_idx').on(t.vinculoId), dataIdx: index('resc_data_idx').on(t.dataDesligamento) }))

export const folhasEmpenhos = pgTable('folhas_empenhos', {
  id: uuid('id').primaryKey().defaultRandom(), folhaId: uuid('folha_id').notNull().references(() => folhas.id, { onDelete: 'restrict' }),
  empenhoId: uuid('empenho_id').notNull().references(() => empenhos.id, { onDelete: 'restrict' }),
  valor: numeric('valor', { precision: 14, scale: 2 }).notNull(), observacoes: text('observacoes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), createdBy: uuid('created_by').references((): AnyPgColumn => users.id),
}, (t) => ({ folhaEmpenhoUnique: uniqueIndex('folha_emp_idx').on(t.folhaId, t.empenhoId), folhaIdx: index('folha_emp_folha_idx').on(t.folhaId), empenhoIdx: index('folha_emp_empenho_idx').on(t.empenhoId) }))

export const folhaJobs = pgTable('folha_jobs', {
  id: uuid('id').primaryKey().defaultRandom(), folhaId: uuid('folha_id').notNull().references(() => folhas.id, { onDelete: 'cascade' }),
  bullJobId: varchar('bull_job_id', { length: 100 }), tipo: varchar('tipo', { length: 50 }).notNull(), status: jobStatusEnum('status').notNull().default('pendente'),
  qtdTotal: integer('qtd_total').notNull().default(0), qtdProcessado: integer('qtd_processado').notNull().default(0), qtdErro: integer('qtd_erro').notNull().default(0),
  iniciadoEm: timestamp('iniciado_em', { withTimezone: true }), concluidoEm: timestamp('concluido_em', { withTimezone: true }), tentativas: integer('tentativas').notNull().default(0), erroDetalhe: text('erro_detalhe'),
  payload: jsonb('payload').$type<Record<string, unknown>>(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), createdBy: uuid('created_by').references((): AnyPgColumn => users.id),
}, (t) => ({ folhaIdx: index('jobs_folha_idx').on(t.folhaId), statusIdx: index('jobs_status_idx').on(t.status), bullIdx: index('jobs_bull_idx').on(t.bullJobId) }))

// ============================================================
// Vinculo Rubricas (override por servidor -- B35.3B)
// ============================================================

export const vinculoRubricas = pgTable(
  'vinculo_rubricas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vinculoId: uuid('vinculo_id').notNull().references(() => vinculosFuncionais.id),
    rubricaId: uuid('rubrica_id').notNull().references(() => rubricas.id),
    valorBase: numeric('valor_base', { precision: 15, scale: 2 }),
    parametros: jsonb('parametros'),
    ordemCalculo: integer('ordem_calculo').notNull().default(100),
    ativa: boolean('ativa').notNull().default(true),
    vigenciaInicio: date('vigencia_inicio').notNull(),
    vigenciaFim: date('vigencia_fim'),
    origem: text('origem').notNull().default('VINCULO_OVERRIDE'),
    observacao: text('observacao'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
  },
  (t) => ({
    idxVinculoAtiva: index('idx_vr_vinculo_ativa').on(t.vinculoId, t.ativa).where(sql`${t.deletedAt} IS NULL`),
    idxRubrica: index('idx_vr_rubrica').on(t.rubricaId).where(sql`${t.deletedAt} IS NULL`),
    uqVinculoRubricaVigencia: uniqueIndex('uq_vr_vinculo_rubrica_vigencia').on(t.vinculoId, t.rubricaId, t.vigenciaInicio).where(sql`${t.deletedAt} IS NULL`),
    chkValorBase: check('chk_vr_valor_base', sql`${t.valorBase} IS NULL OR ${t.valorBase} >= 0`),
    chkVigencia: check('chk_vr_vigencia', sql`${t.vigenciaFim} IS NULL OR ${t.vigenciaFim} > ${t.vigenciaInicio}`),
    chkOrigem: check('chk_vr_origem', sql`${t.origem} IN ('CARGO_DEFAULT', 'VINCULO_OVERRIDE', 'ACORDO_JUDICIAL')`),
  }),
)

// ============================================================
// eSocial -- Eventos pendentes de envio (B35.3B)
// ============================================================

export const esocialEventosPendentes = pgTable(
  'esocial_eventos_pendentes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tipoEvento: text('tipo_evento').notNull(),
    idEvento: text('id_evento').notNull(),
    folhaId: uuid('folha_id').references(() => folhas.id),
    vinculoId: uuid('vinculo_id').references(() => vinculosFuncionais.id),
    competencia: date('competencia'),
    xml: text('xml').notNull(),
    hashSha256: varchar('hash_sha256', { length: 64 }).notNull(),
    status: text('status').notNull().default('TO_SEND'),
    ambiente: text('ambiente').notNull().default('TESTE'),
    numeroRecibo: text('numero_recibo'),
    mensagemErro: text('mensagem_erro'),
    tentativas: integer('tentativas').notNull().default(0),
    geradoEm: timestamp('gerado_em', { withTimezone: true }).notNull().defaultNow(),
    enviadoEm: timestamp('enviado_em', { withTimezone: true }),
    workerId: text('worker_id'),
  },
  (t) => ({
    uqIdEvento: uniqueIndex('uq_eep_id_evento').on(t.idEvento),
    idxStatus: index('idx_eep_status').on(t.status, t.geradoEm),
    idxFolhaVinculo: index('idx_eep_folha_vinculo').on(t.folhaId, t.vinculoId),
    idxCompetencia: index('idx_eep_competencia').on(t.competencia),
    chkStatus: check('chk_eep_status', sql`${t.status} IN ('TO_SEND', 'SENDING', 'SENT_OK', 'SENT_ERROR', 'RETIFICAR', 'CANCELADO')`),
    chkTipoEvento: check('chk_eep_tipo_evento', sql`${t.tipoEvento} IN ('S-1200', 'S-1202', 'S-1210', 'S-1295', 'S-1299')`),
    chkTentativas: check('chk_eep_tentativas', sql`${t.tentativas} >= 0`),
  }),
)

// Folha relations
export const cargosRelations = relations(cargos, ({ many }) => ({ niveisReferencias: many(cargosNiveisReferencias), vinculos: many(vinculosFuncionais) }))
export const cargosNiveisReferenciasRelations = relations(cargosNiveisReferencias, ({ one }) => ({ cargo: one(cargos, { fields: [cargosNiveisReferencias.cargoId], references: [cargos.id] }) }))
export const vinculosFuncionaisRelations = relations(vinculosFuncionais, ({ one, many }) => ({
  pessoa: one(pessoas, { fields: [vinculosFuncionais.pessoaId], references: [pessoas.id] }),
  cargo: one(cargos, { fields: [vinculosFuncionais.cargoId], references: [cargos.id] }),
  nivelReferencia: one(cargosNiveisReferencias, { fields: [vinculosFuncionais.nivelReferenciaId], references: [cargosNiveisReferencias.id] }),
  entidade: one(entidades, { fields: [vinculosFuncionais.entidadeId], references: [entidades.id] }),
  eventos: many(vinculosEventos), rubricasVinculos: many(rubricasVinculos), lancamentos: many(folhasLancamentos), holerites: many(holerites),
}))
export const vinculosEventosRelations = relations(vinculosEventos, ({ one }) => ({
  vinculo: one(vinculosFuncionais, { fields: [vinculosEventos.vinculoId], references: [vinculosFuncionais.id] }),
  cargoAnterior: one(cargos, { fields: [vinculosEventos.cargoAnteriorId], references: [cargos.id], relationName: 'vinculo_cargo_anterior' }),
  cargoNovo: one(cargos, { fields: [vinculosEventos.cargoNovoId], references: [cargos.id], relationName: 'vinculo_cargo_novo' }),
}))
export const rubricasRelations = relations(rubricas, ({ many }) => ({ vinculos: many(rubricasVinculos), lancamentos: many(folhasLancamentos) }))
export const rubricasVinculosRelations = relations(rubricasVinculos, ({ one }) => ({ vinculo: one(vinculosFuncionais, { fields: [rubricasVinculos.vinculoId], references: [vinculosFuncionais.id] }), rubrica: one(rubricas, { fields: [rubricasVinculos.rubricaId], references: [rubricas.id] }) }))
export const folhasRelations = relations(folhas, ({ one, many }) => ({
  exercicio: one(exercicios, { fields: [folhas.exercicioId], references: [exercicios.id] }), mesFiscal: one(mesesFiscais, { fields: [folhas.mesFiscalId], references: [mesesFiscais.id] }),
  lancamentos: many(folhasLancamentos), holerites: many(holerites), ferias: many(folhasFerias), rescisoes: many(folhasRescisoes), empenhosVinculados: many(folhasEmpenhos), jobs: many(folhaJobs),
}))
export const folhasLancamentosRelations = relations(folhasLancamentos, ({ one }) => ({ folha: one(folhas, { fields: [folhasLancamentos.folhaId], references: [folhas.id] }), vinculo: one(vinculosFuncionais, { fields: [folhasLancamentos.vinculoId], references: [vinculosFuncionais.id] }), rubrica: one(rubricas, { fields: [folhasLancamentos.rubricaId], references: [rubricas.id] }) }))
export const holeritesRelations = relations(holerites, ({ one }) => ({ folha: one(folhas, { fields: [holerites.folhaId], references: [folhas.id] }), vinculo: one(vinculosFuncionais, { fields: [holerites.vinculoId], references: [vinculosFuncionais.id] }) }))
export const folhasFeriasRelations = relations(folhasFerias, ({ one }) => ({ folha: one(folhas, { fields: [folhasFerias.folhaId], references: [folhas.id] }), vinculo: one(vinculosFuncionais, { fields: [folhasFerias.vinculoId], references: [vinculosFuncionais.id] }) }))
export const folhasRescisoesRelations = relations(folhasRescisoes, ({ one }) => ({ folha: one(folhas, { fields: [folhasRescisoes.folhaId], references: [folhas.id] }), vinculo: one(vinculosFuncionais, { fields: [folhasRescisoes.vinculoId], references: [vinculosFuncionais.id] }) }))
export const folhasEmpenhosRelations = relations(folhasEmpenhos, ({ one }) => ({ folha: one(folhas, { fields: [folhasEmpenhos.folhaId], references: [folhas.id] }), empenho: one(empenhos, { fields: [folhasEmpenhos.empenhoId], references: [empenhos.id] }) }))
export const folhaJobsRelations = relations(folhaJobs, ({ one }) => ({ folha: one(folhas, { fields: [folhaJobs.folhaId], references: [folhas.id] }) }))

export type Cargo = typeof cargos.$inferSelect
export type NewCargo = typeof cargos.$inferInsert
export type CargoNivelReferencia = typeof cargosNiveisReferencias.$inferSelect
export type VinculoFuncional = typeof vinculosFuncionais.$inferSelect
export type NewVinculoFuncional = typeof vinculosFuncionais.$inferInsert
export type VinculoEvento = typeof vinculosEventos.$inferSelect
export type Rubrica = typeof rubricas.$inferSelect
export type NewRubrica = typeof rubricas.$inferInsert
export type RubricaVinculo = typeof rubricasVinculos.$inferSelect
export type Folha = typeof folhas.$inferSelect
export type NewFolha = typeof folhas.$inferInsert
export type FolhaLancamento = typeof folhasLancamentos.$inferSelect
export type NewFolhaLancamento = typeof folhasLancamentos.$inferInsert
export type Holerite = typeof holerites.$inferSelect
export type FolhaFerias = typeof folhasFerias.$inferSelect
export type FolhaRescisao = typeof folhasRescisoes.$inferSelect
export type FolhaEmpenho = typeof folhasEmpenhos.$inferSelect
export type FolhaJob = typeof folhaJobs.$inferSelect
export type VinculoRubrica = typeof vinculoRubricas.$inferSelect
export type EsocialEventoPendente = typeof esocialEventosPendentes.$inferSelect
