/**
 * Smoke test de ambiente (B35.5).
 *
 * Verifica, contra um ambiente JA IMPLANTADO, se o modulo Folha tem tudo que
 * precisa pra rodar: conectividade, tabelas fiscais federais vigentes, fila
 * BullMQ acessivel e cadastros minimos por tenant.
 *
 * NAO escreve nada -- e seguro rodar em producao.
 *
 * Uso:
 *   pnpm smoke                      # usa DATABASE_URL / REDIS_URL do ambiente
 *   API_URL=https://api... pnpm smoke
 *   SMOKE_COMPETENCIA=2026-05-01 pnpm smoke
 *
 * Saida: relatorio por check. Exit 1 se houver FALHA (avisos nao derrubam).
 */

import postgres from 'postgres'
import { Redis } from 'ioredis'
import { Queue } from 'bullmq'

import { config } from './config.js'
import { FOLHA_QUEUE_NAME } from './queues/names.js'

// ============================================================
// Relatorio
// ============================================================

type Nivel = 'OK' | 'AVISO' | 'FALHA'

type Resultado = {
  nivel: Nivel
  check: string
  detalhe: string
}

const resultados: Resultado[] = []

function registrar(nivel: Nivel, check: string, detalhe: string): void {
  resultados.push({ nivel, check, detalhe })
  const icone = nivel === 'OK' ? '  ok  ' : nivel === 'AVISO' ? ' aviso' : ' FALHA'
  console.log(`[${icone}] ${check.padEnd(42)} ${detalhe}`)
}

/** Executa um check capturando excecao como FALHA. */
async function checar(nome: string, fn: () => Promise<string>): Promise<void> {
  try {
    registrar('OK', nome, await fn())
  } catch (err) {
    registrar('FALHA', nome, err instanceof Error ? err.message : String(err))
  }
}

// ============================================================
// Competencia de referencia
// ============================================================

/** Primeiro dia do mes corrente, ou SMOKE_COMPETENCIA se informado. */
function competenciaReferencia(): string {
  const informada = process.env.SMOKE_COMPETENCIA
  if (informada) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(informada)) {
      throw new Error(`SMOKE_COMPETENCIA invalida: "${informada}" (esperado YYYY-MM-DD)`)
    }
    return informada
  }
  const hoje = new Date()
  return `${hoje.getUTCFullYear()}-${String(hoje.getUTCMonth() + 1).padStart(2, '0')}-01`
}

// ============================================================
// Main
// ============================================================

async function main(): Promise<void> {
  const competencia = competenciaReferencia()

  console.log('')
  console.log('Smoke test -- SaaS Municipal / modulo Folha')
  console.log(`  competencia de referencia : ${competencia}`)
  console.log(`  banco                     : ${mascarar(config.DATABASE_URL)}`)
  console.log(`  redis                     : ${mascarar(config.REDIS_URL)}`)
  console.log('')

  const sql = postgres(config.DATABASE_URL, { max: 2, connect_timeout: 10 })
  const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true })
  const queue = new Queue(FOLHA_QUEUE_NAME, { connection: redis })

  try {
    // ── Infra ─────────────────────────────────────────────
    await checar('postgres: conectividade', async () => {
      const inicio = Date.now()
      await sql`SELECT 1`
      return `respondeu em ${Date.now() - inicio}ms`
    })

    await checar('redis: conectividade', async () => {
      const inicio = Date.now()
      // lazyConnect: o ping abre a conexao sob demanda
      const pong = await redis.ping()
      if (pong !== 'PONG') throw new Error(`resposta inesperada: ${pong}`)
      return `PONG em ${Date.now() - inicio}ms`
    })

    await checar('fila bullmq "folha": acessivel', async () => {
      const c = await queue.getJobCounts('waiting', 'active', 'failed', 'delayed')
      if (c.failed && c.failed > 0) {
        registrar('AVISO', 'fila bullmq "folha": jobs falhados', `${c.failed} job(s) em failed`)
      }
      return `waiting=${c.waiting ?? 0} active=${c.active ?? 0} delayed=${c.delayed ?? 0} failed=${c.failed ?? 0}`
    })

    // ── Tabelas fiscais federais (schema public) ──────────
    const tabelasFederais: Array<{ tabela: string; rotulo: string }> = [
      { tabela: 'inss_tabelas', rotulo: 'INSS' },
      { tabela: 'irrf_tabelas', rotulo: 'IRRF' },
      { tabela: 'salario_familia_tabelas', rotulo: 'salario-familia' },
    ]

    for (const { tabela, rotulo } of tabelasFederais) {
      await checar(`tabela federal ${rotulo}: vigencia`, async () => {
        const rows = await sql<{ c: number }[]>`
          SELECT count(*)::int AS c
          FROM ${sql(tabela)}
          WHERE vigencia_inicio <= ${competencia}
            AND (vigencia_fim IS NULL OR vigencia_fim >= ${competencia})
            AND ativa = true
            AND deleted_at IS NULL
        `
        const total = rows[0]?.c ?? 0
        if (total === 0) {
          throw new Error(
            `sem tabela vigente em ${competencia} -- rode db:seed:folha:publico`,
          )
        }
        if (total > 1) {
          registrar(
            'AVISO',
            `tabela federal ${rotulo}: sobreposicao`,
            `${total} tabelas vigentes na mesma competencia`,
          )
        }
        return `${total} tabela(s) vigente(s)`
      })
    }

    // ── API (opcional) ────────────────────────────────────
    const apiUrl = process.env.API_URL
    if (apiUrl) {
      await checar('api: /health/ready', async () => {
        const resp = await fetch(new URL('/health/ready', apiUrl), {
          signal: AbortSignal.timeout(10_000),
        })
        const corpo = (await resp.json()) as Record<string, unknown>
        if (!resp.ok) throw new Error(`HTTP ${resp.status} -- ${JSON.stringify(corpo.checks ?? corpo)}`)
        return `HTTP ${resp.status}`
      })
    } else {
      registrar('AVISO', 'api: /health/ready', 'API_URL nao definida -- check pulado')
    }

    // ── Tenants com o modulo folha ativo ──────────────────
    const tenants = await sql<{ id: string; slug: string; schema_name: string }[]>`
      SELECT t.id, t.slug, t.schema_name
      FROM tenants t
      JOIN tenant_modules tm ON tm.tenant_id = t.id
      JOIN modules m ON m.id = tm.module_id AND m.slug = 'folha'
      WHERE t.status = 'active' AND t.deleted_at IS NULL
      ORDER BY t.slug
    `

    if (tenants.length === 0) {
      registrar('AVISO', 'tenants com modulo folha', 'nenhum tenant ativo com o modulo folha')
    } else {
      registrar('OK', 'tenants com modulo folha', `${tenants.length} tenant(s)`)
    }

    for (const tenant of tenants) {
      await verificarTenant(sql, tenant, competencia)
    }
  } finally {
    await queue.close().catch(() => undefined)
    await redis.quit().catch(() => undefined)
    await sql.end({ timeout: 5 })
  }

  // ── Resumo ──────────────────────────────────────────────
  const falhas = resultados.filter((r) => r.nivel === 'FALHA')
  const avisos = resultados.filter((r) => r.nivel === 'AVISO')

  console.log('')
  console.log(
    `Resumo: ${resultados.length - falhas.length - avisos.length} ok, ${avisos.length} aviso(s), ${falhas.length} falha(s)`,
  )

  if (falhas.length > 0) {
    console.log('')
    console.log('Falhas:')
    for (const f of falhas) console.log(`  - ${f.check}: ${f.detalhe}`)
    process.exitCode = 1
    return
  }

  console.log('Ambiente apto a processar folha.')
}

// ============================================================
// Checks por tenant
// ============================================================

async function verificarTenant(
  sql: postgres.Sql,
  tenant: { slug: string; schema_name: string },
  competencia: string,
): Promise<void> {
  const prefixo = `tenant ${tenant.slug}`

  // O schema existe?
  const schemaRows = await sql<{ existe: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.schemata WHERE schema_name = ${tenant.schema_name}
    ) AS existe
  `
  if (!schemaRows[0]?.existe) {
    registrar('FALHA', `${prefixo}: schema`, `schema "${tenant.schema_name}" nao existe`)
    return
  }

  // Tabelas do modulo folha provisionadas?
  const obrigatorias = ['vinculos_funcionais', 'rubricas', 'rubricas_vinculos', 'folhas', 'holerites', 'rpps_aliquotas']
  const presentes = await sql<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = ${tenant.schema_name} AND table_name = ANY(${obrigatorias})
  `
  const faltando = obrigatorias.filter((t) => !presentes.some((p) => p.table_name === t))
  if (faltando.length > 0) {
    registrar(
      'FALHA',
      `${prefixo}: tabelas folha`,
      `faltando: ${faltando.join(', ')} -- rode db:migrate:tenants`,
    )
    return
  }
  registrar('OK', `${prefixo}: tabelas folha`, `${obrigatorias.length} tabelas presentes`)

  // Cadastros minimos
  const [contagens] = await sql<
    { vinculos_ativos: number; vinculos_rpps: number; rubricas_ativas: number; sem_rubrica: number }[]
  >`
    SELECT
      count(*) FILTER (WHERE v.status = 'ativo' AND v.deleted_at IS NULL)::int AS vinculos_ativos,
      count(*) FILTER (
        WHERE v.status = 'ativo' AND v.deleted_at IS NULL AND v.regime_previdenciario = 'rpps'
      )::int AS vinculos_rpps,
      (
        SELECT count(*)::int FROM ${sql(tenant.schema_name)}.rubricas
        WHERE ativo = true AND deleted_at IS NULL
      ) AS rubricas_ativas,
      count(*) FILTER (
        WHERE v.status = 'ativo' AND v.deleted_at IS NULL AND NOT EXISTS (
          SELECT 1 FROM ${sql(tenant.schema_name)}.rubricas_vinculos rv
          WHERE rv.vinculo_id = v.id
            AND rv.ativo = true
            AND rv.vigencia_inicio <= ${competencia}
            AND (rv.vigencia_fim IS NULL OR rv.vigencia_fim >= ${competencia})
        )
      )::int AS sem_rubrica
    FROM ${sql(tenant.schema_name)}.vinculos_funcionais v
  `

  const ativos = contagens?.vinculos_ativos ?? 0
  if (ativos === 0) {
    registrar('AVISO', `${prefixo}: vinculos ativos`, 'nenhum vinculo ativo cadastrado')
    return
  }
  registrar('OK', `${prefixo}: vinculos ativos`, `${ativos} vinculo(s)`)

  if ((contagens?.rubricas_ativas ?? 0) === 0) {
    registrar('FALHA', `${prefixo}: rubricas`, 'nenhuma rubrica ativa cadastrada')
  }

  // Vinculo sem rubrica vigente e bloqueante no fechamento da folha
  const semRubrica = contagens?.sem_rubrica ?? 0
  if (semRubrica > 0) {
    registrar(
      'FALHA',
      `${prefixo}: rubricas por vinculo`,
      `${semRubrica} vinculo(s) ativo(s) sem rubrica vigente em ${competencia}`,
    )
  } else {
    registrar('OK', `${prefixo}: rubricas por vinculo`, 'todos os vinculos com rubrica vigente')
  }

  // RPPS: aliquota vigente e obrigatoria se houver servidor no regime proprio
  if ((contagens?.vinculos_rpps ?? 0) > 0) {
    const [rpps] = await sql<{ c: number }[]>`
      SELECT count(*)::int AS c FROM ${sql(tenant.schema_name)}.rpps_aliquotas
      WHERE ativa = true
        AND vigencia_inicio <= ${competencia}
        AND (vigencia_fim IS NULL OR vigencia_fim >= ${competencia})
    `
    if ((rpps?.c ?? 0) === 0) {
      registrar(
        'FALHA',
        `${prefixo}: aliquota RPPS`,
        `${contagens!.vinculos_rpps} servidor(es) RPPS sem aliquota vigente em ${competencia}`,
      )
    } else {
      registrar('OK', `${prefixo}: aliquota RPPS`, `${rpps!.c} aliquota(s) vigente(s)`)
    }
  }
}

// ============================================================
// Helpers
// ============================================================

/** Esconde a senha da connection string antes de logar. */
function mascarar(url: string): string {
  return url.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')
}

main().catch((err) => {
  console.error('')
  console.error('[FALHA] smoke abortado:', err instanceof Error ? err.message : err)
  process.exitCode = 1
})
