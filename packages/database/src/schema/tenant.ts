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
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

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
