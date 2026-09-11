/**
 * Tenancy — gestão do ciclo de vida dos schemas dos tenants.
 *
 * 🟢 CORREÇÃO DA PENDÊNCIA:
 *    A versão anterior criava o schema mas não aplicava as migrations.
 *    Agora `provisionTenant()` faz tudo em uma transação:
 *      1. CREATE SCHEMA tenant_xxx
 *      2. Lê os arquivos SQL gerados pelo Drizzle em drizzle/tenant/
 *      3. Substitui o placeholder "tenant_template" pelo schema real
 *      4. Executa todo o SQL dentro do schema novo
 *      5. Insere seed mínimo (roles padrão + permissões básicas)
 *
 * Fluxo:
 *   - provisionTenant(schemaName): faz tudo de uma vez (uso normal)
 *   - createTenantSchema(): só cria schema vazio (uso interno / testes)
 *   - applyTenantMigrations(): aplica migrations num schema existente
 *   - dropTenantSchema(): remove schema (CASCADE - cuidado!)
 *   - listTenantSchemas(): lista schemas de tenants existentes
 */
import postgres from 'postgres'
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Diretório onde o Drizzle cospe as migrations do schema do tenant
// (configurado em drizzle.tenant.config.ts)
const TENANT_MIGRATIONS_DIR = resolve(__dirname, '../drizzle/tenant')

// Placeholder usado em src/schema/tenant.ts. Será substituído pelo schema real.
const TEMPLATE_SCHEMA_PLACEHOLDER = 'tenant_template'

// Nome de schema PostgreSQL: max 63 chars, [a-z0-9_], começa com letra
const SCHEMA_NAME_REGEX = /^[a-z][a-z0-9_]{0,62}$/

// ─────────────────────────────────────────────────────────────
// VALIDAÇÃO E NOMENCLATURA
// ─────────────────────────────────────────────────────────────

export function validateSchemaName(name: string): boolean {
  return SCHEMA_NAME_REGEX.test(name)
}

/**
 * Gera nome de schema PostgreSQL a partir do slug do tenant.
 * Exemplos:
 *   'santa-izabel-oeste' → 'tenant_santa_izabel_oeste'
 *   'são-paulo'          → 'tenant_sao_paulo' (acento deve ser tratado antes)
 */
export function buildSchemaName(slug: string): string {
  const normalized = slug
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 55) // deixa espaço para o prefixo "tenant_"

  const name = `tenant_${normalized}`

  if (!validateSchemaName(name)) {
    throw new Error(`Slug "${slug}" gerou nome de schema inválido: "${name}"`)
  }

  return name
}

// ─────────────────────────────────────────────────────────────
// PROVISIONAMENTO COMPLETO (uso normal)
// ─────────────────────────────────────────────────────────────

/**
 * Provisiona uma nova tenant: cria schema + aplica todas as migrations + seed.
 * Tudo em uma transação — falha atômica.
 *
 * @returns o número de migrations aplicadas
 */
export async function provisionTenant(
  connectionString: string,
  schemaName: string,
): Promise<{ migrationsApplied: number; seedApplied: boolean }> {
  if (!validateSchemaName(schemaName)) {
    throw new Error(`Nome de schema inválido: ${schemaName}`)
  }

  const sqlFiles = await loadTenantMigrationFiles()

  const client = postgres(connectionString, { max: 1, idle_timeout: 5 })

  try {
    let migrationsApplied = 0

    await client.begin(async (tx) => {
      // 1. Cria o schema (idempotente)
      await tx.unsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`)

      // 2. Define search_path dentro da transação para essa sessão
      await tx.unsafe(`SET LOCAL search_path TO "${schemaName}", public`)

      // 3. Aplica cada migration na ordem
      for (const { name, sql } of sqlFiles) {
        const rewritten = rewriteSchemaReferences(sql, schemaName)

        // Drizzle separa statements com "--> statement-breakpoint"
        const statements = rewritten
          .split('--> statement-breakpoint')
          .map((s) => s.trim())
          .filter(Boolean)

        for (const stmt of statements) {
          try {
            await tx.unsafe(stmt)
          } catch (err) {
            throw new Error(
              `Falha ao aplicar migration "${name}" no schema "${schemaName}": ${(err as Error).message}\n--- SQL ---\n${stmt}`,
            )
          }
        }

        migrationsApplied++
      }
    })

    // 4. Seed inicial (fora da transação principal — pode ser re-rodado idempotentemente)
    const seedResult = await reseedTenantBaseline(connectionString, schemaName)
    const seedApplied = seedResult.rolesAdded > 0 || seedResult.permissionsAdded > 0

    return { migrationsApplied, seedApplied }
  } finally {
    await client.end()
  }
}

// ─────────────────────────────────────────────────────────────
// OPERAÇÕES GRANULARES
// ─────────────────────────────────────────────────────────────

/**
 * Apenas cria o schema vazio (sem tabelas).
 * Útil em testes ou quando provisionTenant não couber.
 */
export async function createTenantSchema(
  connectionString: string,
  schemaName: string,
): Promise<void> {
  if (!validateSchemaName(schemaName)) {
    throw new Error(`Nome de schema inválido: ${schemaName}`)
  }

  const client = postgres(connectionString, { max: 1 })
  try {
    await client.unsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`)
  } finally {
    await client.end()
  }
}

/**
 * Aplica as migrations do schema do tenant em um schema EXISTENTE.
 * Não cria o schema. Idempotente: re-executar não duplica tabelas
 * (todas as migrations geradas pelo Drizzle usam CREATE TABLE IF NOT EXISTS quando configurado;
 * se sua versão do drizzle-kit não emitir IF NOT EXISTS, este método assume schema vazio).
 */
export async function applyTenantMigrations(
  connectionString: string,
  schemaName: string,
): Promise<number> {
  if (!validateSchemaName(schemaName)) {
    throw new Error(`Nome de schema inválido: ${schemaName}`)
  }

  const sqlFiles = await loadTenantMigrationFiles()
  const client = postgres(connectionString, { max: 1 })
  let applied = 0

  try {
    await client.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO "${schemaName}", public`)

      for (const { name, sql } of sqlFiles) {
        const rewritten = rewriteSchemaReferences(sql, schemaName)
        const statements = rewritten
          .split('--> statement-breakpoint')
          .map((s) => s.trim())
          .filter(Boolean)

        for (const stmt of statements) {
          try {
            await tx.unsafe(stmt)
          } catch (err) {
            throw new Error(
              `Falha em migration "${name}" / schema "${schemaName}": ${(err as Error).message}`,
            )
          }
        }
        applied++
      }
    })
  } finally {
    await client.end()
  }

  return applied
}

/**
 * DROP SCHEMA tenant_xxx CASCADE — destrutivo.
 */
export async function dropTenantSchema(
  connectionString: string,
  schemaName: string,
): Promise<void> {
  if (!validateSchemaName(schemaName)) {
    throw new Error(`Nome de schema inválido: ${schemaName}`)
  }

  const client = postgres(connectionString, { max: 1 })
  try {
    await client.unsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
  } finally {
    await client.end()
  }
}

/**
 * Lista todos os schemas de tenants existentes no banco
 * (qualquer schema que comece com "tenant_").
 */
export async function listTenantSchemas(connectionString: string): Promise<string[]> {
  const client = postgres(connectionString, { max: 1 })
  try {
    const rows = await client<{ schema_name: string }[]>`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name LIKE 'tenant_%'
      ORDER BY schema_name
    `
    return rows.map((r) => r.schema_name)
  } finally {
    await client.end()
  }
}

// ─────────────────────────────────────────────────────────────
// MIGRATIONS INCREMENTAIS
// ─────────────────────────────────────────────────────────────

/**
 * Aplica migrations pendentes em um schema tenant existente.
 * Idempotente: pula migrations já aplicadas (verifica por checksum).
 */
export async function applyTenantMigrationsIncremental(
  connectionString: string,
  schemaName: string,
  opts: { dryRun?: boolean; appliedBy?: string } = {},
): Promise<{
  applied: string[]
  skipped: string[]
  failed: Array<{ name: string; error: string }>
  totalPending: number
}> {
  if (!validateSchemaName(schemaName)) {
    throw new Error(`Nome de schema inválido: ${schemaName}`)
  }

  const sqlFiles = await loadTenantMigrationFiles()
  const result = {
    applied: [] as string[],
    skipped: [] as string[],
    failed: [] as Array<{ name: string; error: string }>,
    totalPending: 0,
  }

  const client = postgres(connectionString, { max: 1, idle_timeout: 5 })

  try {
    // Garantir que a tabela de controle existe (bootstrap)
    await client.unsafe(`CREATE TABLE IF NOT EXISTS "${schemaName}".tenant_migrations_applied (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      migration_name varchar(255) NOT NULL UNIQUE,
      checksum varchar(64) NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now(),
      applied_by varchar(100) DEFAULT 'system'
    )`)

    // Pega migrations já aplicadas
    const appliedRows = await client<{ migration_name: string; checksum: string }[]>`
      SELECT migration_name, checksum
      FROM ${client(`${schemaName}.tenant_migrations_applied`)}
    `

    // ─── BOOTSTRAP RETROATIVO ─────────────────────────
    // Se tracker vazio E schema já tem tabelas funcionais → tenant pré-B12.
    // Registrar todas as migrations existentes como já aplicadas sem reexecutá-las.
    if (appliedRows.length === 0) {
      const tablesResult = await client<{ count: string }[]>`
        SELECT COUNT(*)::text AS count
        FROM information_schema.tables
        WHERE table_schema = ${schemaName}
          AND table_name NOT IN ('tenant_migrations_applied')
      `
      const tableCount = Number(tablesResult[0]?.count ?? '0')

      if (tableCount > 0) {
        console.log(`[${schemaName}] bootstrap retroativo: ${tableCount} tabelas detectadas, registrando ${sqlFiles.length} migrations como já aplicadas`)
        for (const { name, sql } of sqlFiles) {
          const checksum = createHash('sha256').update(sql).digest('hex')
          await client.unsafe(`
            INSERT INTO "${schemaName}".tenant_migrations_applied
              (migration_name, checksum, applied_by)
            VALUES ($1, $2, 'bootstrap-retroativo')
            ON CONFLICT (migration_name) DO NOTHING
          `, [name, checksum])
          result.skipped.push(name)
        }
        return result
      }
    }

    const appliedMap = new Map(appliedRows.map((r) => [r.migration_name, r.checksum]))

    for (const { name, sql } of sqlFiles) {
      const checksum = createHash('sha256').update(sql).digest('hex')

      if (appliedMap.has(name)) {
        const storedChecksum = appliedMap.get(name)!
        if (storedChecksum !== checksum) {
          result.failed.push({
            name,
            error: 'Checksum drift detectado. Migration foi modificada após aplicação.',
          })
        } else {
          result.skipped.push(name)
        }
        continue
      }

      result.totalPending++

      if (opts.dryRun) {
        result.applied.push(`[DRY-RUN] ${name}`)
        continue
      }

      try {
        await client.begin(async (tx) => {
          await tx.unsafe(`SET LOCAL search_path TO "${schemaName}", public`)

          const rewritten = rewriteSchemaReferences(sql, schemaName)
          const statements = rewritten
            .split('--> statement-breakpoint')
            .map((s) => s.trim())
            .filter(Boolean)

          for (const stmt of statements) {
            await tx.unsafe(stmt)
          }

          await tx`
            INSERT INTO ${tx(`${schemaName}.tenant_migrations_applied`)}
              (migration_name, checksum, applied_by)
            VALUES (${name}, ${checksum}, ${opts.appliedBy ?? 'system'})
          `
        })
        result.applied.push(name)
      } catch (err) {
        result.failed.push({ name, error: (err as Error).message })
        break
      }
    }
  } finally {
    await client.end()
  }

  return result
}

/**
 * Lista migrations pendentes para um schema tenant (sem aplicar).
 */
export async function listPendingMigrations(
  connectionString: string,
  schemaName: string,
): Promise<string[]> {
  const dry = await applyTenantMigrationsIncremental(connectionString, schemaName, { dryRun: true })
  return dry.applied.map((n) => n.replace('[DRY-RUN] ', ''))
}

// ─────────────────────────────────────────────────────────────
// INTERNOS
// ─────────────────────────────────────────────────────────────

/**
 * Carrega todos os arquivos .sql do diretório de migrations do tenant,
 * ordenados por nome de arquivo (Drizzle gera 0000_, 0001_, ...).
 */
async function loadTenantMigrationFiles(): Promise<{ name: string; sql: string }[]> {
  let entries: string[]
  try {
    entries = await readdir(TENANT_MIGRATIONS_DIR)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `Diretório de migrations do tenant não encontrado: ${TENANT_MIGRATIONS_DIR}\n` +
          `Rode "pnpm db:generate:tenant" antes de provisionar tenants.`,
      )
    }
    throw err
  }

  const sqlFiles = entries
    .filter((f) => f.endsWith('.sql'))
    .sort() // 0000_, 0001_, ...

  if (sqlFiles.length === 0) {
    throw new Error(
      `Nenhuma migration .sql encontrada em ${TENANT_MIGRATIONS_DIR}\n` +
        `Rode "pnpm db:generate:tenant" antes de provisionar tenants.`,
    )
  }

  const files = await Promise.all(
    sqlFiles.map(async (name) => ({
      name,
      sql: await readFile(resolve(TENANT_MIGRATIONS_DIR, name), 'utf-8'),
    })),
  )

  return files
}

/**
 * Reescreve referências de schema nas migrations do tenant.
 *
 * Após remoção do pgSchema, o drizzle-kit gera tabelas sem qualificador
 * (resolvidas via search_path), mas pgEnum emite CREATE TYPE "public"."..."
 * que precisa ser redirecionado ao schema do tenant.
 *
 * Também mantém retrocompatibilidade com migrations antigas que usavam
 * o placeholder "tenant_template".
 */
function rewriteSchemaReferences(sql: string, targetSchema: string): string {
  let result = sql

  // Remove CREATE SCHEMA "tenant_template" (legado)
  result = result.replace(
    /CREATE SCHEMA (IF NOT EXISTS )?["']?tenant_template["']?\s*;?/gi,
    '',
  )

  // Substitui referências legadas ao placeholder (defensivo, idempotente)
  result = result.replace(/"tenant_template"\./g, `"${targetSchema}".`)
  result = result.replace(/\btenant_template\b\./g, `${targetSchema}.`)

  // pgEnum gera tipos qualificados como "public"."tipo_name" — redireciona
  // para o schema do tenant para que cada tenant tenha seus próprios enums.
  result = result.replace(/"public"\./g, `"${targetSchema}".`)

  return result
}

/**
 * Re-aplica seed baseline em um schema tenant existente.
 * Idempotente: ON CONFLICT DO NOTHING em tudo.
 * Chamado por provisionTenant (tenant novo), CLI (reseed), e API (endpoint admin).
 */
export async function reseedTenantBaseline(
  connectionString: string,
  schemaName: string,
): Promise<{ rolesAdded: number; permissionsAdded: number; rolePermissionsAdded: number }> {
  if (!validateSchemaName(schemaName)) {
    throw new Error(`Nome de schema inválido: ${schemaName}`)
  }

  const client = postgres(connectionString, { max: 1 })
  const counters = { rolesAdded: 0, permissionsAdded: 0, rolePermissionsAdded: 0 }

  try {
    await client.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO "${schemaName}", public`)

      // ─── Roles ──────────────────────────────────────
      const rolesResult = await tx.unsafe(`
        INSERT INTO roles (slug, name, description, is_system) VALUES
          ('admin_municipal',     'Administrador Municipal',  'Acesso total ao tenant', true),
          ('gestor_financeiro',   'Gestor Financeiro',        'Receitas, despesas, folha, relatórios', true),
          ('contabilista',        'Contabilista',             'Operações contábeis e relatórios fiscais', true),
          ('rh',                  'Recursos Humanos',         'Folha de pagamento e cadastro de servidores', true),
          ('auditoria',           'Auditoria/Controladoria',  'Apenas leitura, com acesso a logs', true),
          ('operador',            'Operador',                 'Lançamentos básicos sem aprovação', true)
        ON CONFLICT (slug) DO NOTHING RETURNING slug
      `)
      counters.rolesAdded = rolesResult.length

      // ─── Permissions (todas, consolidadas) ──────────
      const permResult = await tx.unsafe(`
        INSERT INTO permissions (slug, description, module) VALUES
          ('cadastros:read',          'Visualizar cadastros base',           'cadastros'),
          ('cadastros:write',         'Criar e editar cadastros base',       'cadastros'),
          ('cadastros:delete',        'Excluir cadastros base',              'cadastros'),
          ('textos_juridicos:read',   'Visualizar textos jurídicos',         'textos_juridicos'),
          ('textos_juridicos:write',  'Criar e editar textos jurídicos',     'textos_juridicos'),
          ('users:read',              'Visualizar usuários',                 'users'),
          ('users:write',             'Criar e editar usuários',             'users'),
          ('users:assign_role',       'Atribuir papéis a usuários',          'users'),
          ('audit:read',              'Visualizar logs de auditoria',        'audit'),
          ('dashboard:read',          'Visualizar dashboard',                'dashboard'),
          ('fiscal:read',             'Visualizar calendário fiscal',        'fiscal'),
          ('fiscal:abrir_exercicio',  'Abrir novo exercício',                'fiscal'),
          ('fiscal:encerrar_exercicio','Encerrar exercício',                 'fiscal'),
          ('fiscal:fechar_mes',       'Fechar mês fiscal',                   'fiscal'),
          ('fiscal:reabrir_mes',      'Reabrir mês fiscal',                  'fiscal'),
          ('fiscal:bloquear_mes',     'Bloquear mês',                        'fiscal'),
          ('receitas:read',           'Visualizar receitas',                 'receitas'),
          ('receitas:write',          'Criar/editar lançamentos de receita', 'receitas'),
          ('receitas:arrecadar',      'Registrar arrecadação',               'receitas'),
          ('receitas:anular',         'Anular arrecadação (estorno)',        'receitas'),
          ('receitas:gerir_naturezas','Gerir tipos e naturezas de receita',  'receitas'),
          ('receitas:relatorios',     'Gerar relatórios de receita',         'receitas'),
          ('orcamento:read',           'Visualizar orçamento',                       'orcamento'),
          ('orcamento:write',          'Criar/editar leis e dotações',               'orcamento'),
          ('orcamento:gerir_programas','Gerir programas e ações do PPA',             'orcamento'),
          ('orcamento:importar_xml',   'Importar LOA via XML',                       'orcamento'),
          ('orcamento:aprovar_credito','Aprovar e aplicar créditos orçamentários',   'orcamento'),
          ('orcamento:relatorios',     'Gerar relatórios de execução orçamentária',  'orcamento'),
          ('despesas:read',                'Visualizar despesas',                          'despesas'),
          ('despesas:empenhar',            'Criar empenhos e gerenciar agrupadores',       'despesas'),
          ('despesas:liquidar',            'Registrar liquidações',                        'despesas'),
          ('despesas:autorizar_pagamento', 'Criar e aprovar ordens de pagamento',          'despesas'),
          ('despesas:pagar',               'Executar pagamentos de OPs aprovadas',         'despesas'),
          ('despesas:anular',              'Anular empenhos, liquidações e pagamentos',    'despesas'),
          ('despesas:relatorios',          'Gerar relatórios de execução de despesa',      'despesas'),
          ('folha:read',              'Visualizar folha de pagamento',                  'folha'),
          ('folha:cadastros',         'Gerir cargos, rubricas e vinculos funcionais',  'folha'),
          ('folha:calcular',          'Iniciar calculo de folhas',                      'folha'),
          ('folha:revisar',           'Revisar folha calculada',                        'folha'),
          ('folha:aprovar',           'Aprovar folha para pagamento',                   'folha'),
          ('folha:encerrar',          'Encerrar folha (imutavel apos)',                'folha'),
          ('folha:relatorios',        'Gerar relatorios e holerites',                   'folha')
        ON CONFLICT (slug) DO NOTHING RETURNING slug
      `)
      counters.permissionsAdded = permResult.length

      // ─── Role ↔ Permission mappings ─────────────────
      const rp1 = await tx.unsafe(`
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
        WHERE r.slug = 'admin_municipal'
        ON CONFLICT DO NOTHING RETURNING role_id
      `)
      counters.rolePermissionsAdded += rp1.length

      const rp2 = await tx.unsafe(`
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
        WHERE r.slug = 'gestor_financeiro'
          AND p.slug IN (
            'cadastros:read','dashboard:read','fiscal:read','fiscal:fechar_mes',
            'receitas:read','receitas:write','receitas:arrecadar','receitas:relatorios',
            'orcamento:read','orcamento:write','orcamento:relatorios',
            'despesas:read','despesas:empenhar','despesas:liquidar','despesas:autorizar_pagamento','despesas:relatorios',
            'folha:read','folha:cadastros','folha:relatorios'
          )
        ON CONFLICT DO NOTHING RETURNING role_id
      `)
      counters.rolePermissionsAdded += rp2.length

      const rp3 = await tx.unsafe(`
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
        WHERE r.slug = 'contabilista'
          AND p.slug IN (
            'cadastros:read','dashboard:read','audit:read','fiscal:read',
            'receitas:read','receitas:arrecadar','receitas:relatorios',
            'orcamento:read','orcamento:relatorios',
            'despesas:read','despesas:liquidar','despesas:relatorios',
            'folha:read','folha:calcular','folha:revisar','folha:relatorios'
          )
        ON CONFLICT DO NOTHING RETURNING role_id
      `)
      counters.rolePermissionsAdded += rp3.length

      const rp4 = await tx.unsafe(`
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
        WHERE r.slug = 'auditoria' AND p.slug LIKE '%:read'
        ON CONFLICT DO NOTHING RETURNING role_id
      `)
      counters.rolePermissionsAdded += rp4.length

      const rp5 = await tx.unsafe(`
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
        WHERE r.slug = 'operador'
          AND p.slug IN ('cadastros:read','cadastros:write','dashboard:read','fiscal:read','receitas:read','receitas:arrecadar','despesas:read','folha:read')
        ON CONFLICT DO NOTHING RETURNING role_id
      `)
      counters.rolePermissionsAdded += rp5.length

      const rp6 = await tx.unsafe(`
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
        WHERE r.slug = 'rh'
          AND p.slug IN ('cadastros:read','cadastros:write','dashboard:read','fiscal:read','folha:read','folha:cadastros','folha:calcular','folha:relatorios')
        ON CONFLICT DO NOTHING RETURNING role_id
      `)
      counters.rolePermissionsAdded += rp6.length

      // ─── Calendário fiscal corrente ─────────────────
      const anoAtual = new Date().getFullYear()
      await tx.unsafe(`
        INSERT INTO exercicios (ano, data_inicio, data_fim, status)
        VALUES ($1, $2, $3, 'aberto')
        ON CONFLICT (ano) DO NOTHING
      `, [anoAtual, `${anoAtual}-01-01`, `${anoAtual}-12-31`])

      await tx.unsafe(`
        INSERT INTO meses_fiscais (exercicio_id, mes, data_inicio, data_fim, status)
        SELECT e.id, m.mes,
               make_date(e.ano, m.mes, 1)::date,
               (make_date(e.ano, m.mes, 1) + interval '1 month' - interval '1 day')::date,
               'aberto'
        FROM exercicios e
        CROSS JOIN (SELECT generate_series(1, 12) AS mes) m
        WHERE e.ano = $1
        ON CONFLICT DO NOTHING
      `, [anoAtual])
    })
  } finally {
    await client.end()
  }

  return counters
}
