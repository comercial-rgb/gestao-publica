/**
 * Rotas /folhas -- CRUD + transicoes de estado (fechar/reabrir/cancelar) +
 * integrar-despesas.
 *
 * Segue padrao do codebase: req.resolveTenant() + createTenantDatabase().
 */

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createTenantDatabase, createMasterDatabase, tenantSchema, eq, and, sql } from '@saas-municipal/database'
import { folhaCalculoSchema } from '@saas-municipal/database'
import {
  enfileirarProcessarFolha,
  enfileirarGerarEmpenhos,
} from '@saas-municipal/worker/queues/folha'
import { env } from '../../../../env.js'
import { resolverPeriodoFiscal, assertPeriodoAberto } from '../../../../lib/fiscal.js'
import {
  folhaIdParams,
  criarFolhaBody,
  fecharFolhaBody,
  reabrirFolhaBody,
  cancelarFolhaBody,
  listarFolhasQuery,
} from './schemas.js'
import { validarFolha, podeTransicionar } from './services.js'

export const rotasFolhas: FastifyPluginAsyncZod = async (app) => {
  // ============================================================
  // POST / (criar folha)
  // ============================================================
  app.post('/', {
    preHandler: async (req) => req.requirePermission('folha:cadastros'),
    schema: { tags: ['tenant-folha'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      body: criarFolhaBody,
      response: { 201: z.object({ id: z.string().uuid() }), 422: z.object({ error: z.string(), message: z.string() }) },
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

    const { competenciaMes, competenciaAno, tipo, descricao, dataPagamento } = req.body
    const compDate = new Date(competenciaAno, competenciaMes - 1, 1)

    // Valida periodo fiscal
    const periodo = await resolverPeriodoFiscal(env.DATABASE_URL, tenant.schemaName, compDate)
    assertPeriodoAberto(periodo)

    // Verifica duplicidade
    const existente = await db.execute(sql`
      SELECT id FROM folhas WHERE competencia_mes = ${competenciaMes} AND competencia_ano = ${competenciaAno}
        AND tipo = ${tipo} AND deleted_at IS NULL LIMIT 1
    `) as unknown as Array<{ id: string }>
    if (existente.length > 0) {
      return reply.status(422).send({ error: 'FolhaJaExiste', message: `Ja existe folha ${tipo} em ${competenciaAno}-${String(competenciaMes).padStart(2, '0')}` })
    }

    const numero = `${competenciaAno}/${String(competenciaMes).padStart(2, '0')}-${tipo.toUpperCase()}`
    const [created] = await db.insert(tenantSchema.folhas).values({
      numero,
      tipo,
      status: 'em_elaboracao',
      descricao,
      exercicioId: periodo.exercicio.id,
      mesFiscalId: periodo.mes.id,
      competenciaMes,
      competenciaAno,
      dataPagamento: dataPagamento ?? null,
      createdBy: req.tenantAuth!.sub,
    }).returning({ id: tenantSchema.folhas.id })

    await db.insert(tenantSchema.tenantAuditLog).values({
      userId: req.tenantAuth!.sub, action: 'folha.folha.criar', resource: 'folha',
      resourceId: created!.id, after: { numero, tipo, competenciaMes, competenciaAno }, ipAddress: req.ip,
    })

    return reply.status(201).send({ id: created!.id })
  })

  // ============================================================
  // GET / (listar folhas)
  // ============================================================
  app.get('/', {
    preHandler: async (req) => req.requirePermission('folha:read'),
    schema: { tags: ['tenant-folha'], security: [{ bearerAuth: [] }, { tenantCookie: [] }],
      querystring: listarFolhasQuery,
    },
  }, async (req) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const { page, pageSize, competenciaAno, competenciaMes, tipo, status } = req.query

    const f: ReturnType<typeof sql>[] = [sql`deleted_at IS NULL`]
    if (competenciaAno) f.push(sql`competencia_ano = ${competenciaAno}`)
    if (competenciaMes) f.push(sql`competencia_mes = ${competenciaMes}`)
    if (tipo) f.push(sql`tipo = ${tipo}`)
    if (status) f.push(sql`status = ${status}`)

    const result = await db.execute(sql`
      SELECT id, numero, tipo, status, descricao, competencia_mes, competencia_ano,
             data_pagamento, qtd_servidores, total_proventos::text, total_descontos::text, total_liquido::text,
             calculo_iniciado_em, calculo_concluido_em, aprovada_em, encerrada_em, reaberta_em, cancelada_em,
             created_at
      FROM folhas WHERE ${sql.join(f, sql` AND `)}
      ORDER BY competencia_ano DESC, competencia_mes DESC, created_at DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `)
    const countResult = await db.execute(sql`SELECT COUNT(*)::int AS c FROM folhas WHERE ${sql.join(f, sql` AND `)}`) as unknown as Array<{ c: number }>

    return { items: result, page, pageSize, total: countResult[0]?.c ?? 0 }
  })

  // ============================================================
  // GET /:id (detalhe + ultimo progresso)
  // ============================================================
  app.get('/:id', {
    preHandler: async (req) => req.requirePermission('folha:read'),
    schema: { tags: ['tenant-folha'], security: [{ bearerAuth: [] }, { tenantCookie: [] }], params: folhaIdParams },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const folhaRows = await db.execute(sql`SELECT * FROM folhas WHERE id = ${req.params.id} AND deleted_at IS NULL LIMIT 1`) as unknown as Array<Record<string, unknown>>
    if (folhaRows.length === 0) return reply.status(404).send({ error: 'NotFound', message: 'Folha nao encontrada' })

    const progressoRows = await db.execute(sql`
      SELECT * FROM folha_progresso WHERE folha_id = ${req.params.id} ORDER BY iniciado_em DESC LIMIT 1
    `) as unknown as Array<Record<string, unknown>>

    return { folha: folhaRows[0], progresso: progressoRows[0] ?? null }
  })

  // ============================================================
  // POST /:id/validar (SYNC)
  // ============================================================
  app.post('/:id/validar', {
    preHandler: async (req) => req.requirePermission('folha:read'),
    schema: { tags: ['tenant-folha'], security: [{ bearerAuth: [] }, { tenantCookie: [] }], params: folhaIdParams },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const folhaRows = await db.execute(sql`SELECT id, competencia_mes, competencia_ano, status FROM folhas WHERE id = ${req.params.id} AND deleted_at IS NULL LIMIT 1`) as unknown as Array<Record<string, unknown>>
    if (folhaRows.length === 0) return reply.status(404).send({ error: 'NotFound' })
    const folha = folhaRows[0]!
    if (folha.status === 'cancelada') return reply.status(422).send({ error: 'Cancelada', message: 'Folha cancelada' })

    return validarFolha({ tenantDb: db, folhaId: String(folha.id), competenciaAno: Number(folha.competencia_ano), competenciaMes: Number(folha.competencia_mes) })
  })

  // ============================================================
  // POST /:id/fechar (ASYNC)
  // ============================================================
  app.post('/:id/fechar', {
    preHandler: async (req) => req.requirePermission('folha:cadastros'),
    schema: { tags: ['tenant-folha'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      params: folhaIdParams, body: fecharFolhaBody,
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const folhaRows = await db.execute(sql`SELECT id, competencia_mes, competencia_ano, status FROM folhas WHERE id = ${req.params.id} AND deleted_at IS NULL LIMIT 1`) as unknown as Array<Record<string, unknown>>
    if (folhaRows.length === 0) return reply.status(404).send({ error: 'NotFound' })
    const folha = folhaRows[0]!

    if (!podeTransicionar(String(folha.status), 'calculando')) {
      return reply.status(422).send({ error: 'TransicaoInvalida', message: `Status ${folha.status} nao permite processamento` })
    }

    const v = await validarFolha({ tenantDb: db, folhaId: String(folha.id), competenciaAno: Number(folha.competencia_ano), competenciaMes: Number(folha.competencia_mes) })
    if (!v.podeProsseguir) return reply.status(422).send({ error: 'ValidacaoBloqueante', erros: v.erros })
    if (v.avisos.length > 0 && !req.body.ignorarAvisos) {
      return reply.status(422).send({ error: 'AvisosRequeremConfirmacao', message: `${v.avisos.length} aviso(s)`, avisos: v.avisos })
    }

    await db.execute(sql`UPDATE folhas SET status = 'calculando', updated_at = NOW() WHERE id = ${req.params.id}`)

    const compIso = `${Number(folha.competencia_ano)}-${String(Number(folha.competencia_mes)).padStart(2, '0')}-01`
    const connStr = `${env.DATABASE_URL}?search_path=${tenant.schemaName},public`

    const jobId = await enfileirarProcessarFolha({
      tenantSlug: tenant.schemaName,
      tenantConnectionString: connStr,
      folhaId: String(folha.id),
      competencia: compIso,
      iniciadoPor: req.tenantAuth!.sub,
    })

    return reply.status(202).send({ jobId, status: 'ENFILEIRADO', progressoWsUrl: `/folhas/${folha.id}/progresso` })
  })

  // ============================================================
  // POST /:id/reabrir
  // ============================================================
  app.post('/:id/reabrir', {
    preHandler: async (req) => req.requirePermission('folha:cadastros'),
    schema: { tags: ['tenant-folha'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      params: folhaIdParams, body: reabrirFolhaBody,
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const folhaRows = await db.execute(sql`SELECT id, status, competencia_mes, competencia_ano FROM folhas WHERE id = ${req.params.id} AND deleted_at IS NULL LIMIT 1`) as unknown as Array<Record<string, unknown>>
    if (folhaRows.length === 0) return reply.status(404).send({ error: 'NotFound' })
    const folha = folhaRows[0]!

    if (!podeTransicionar(String(folha.status), 'em_revisao')) {
      return reply.status(422).send({ error: 'TransicaoInvalida', message: `Status ${folha.status} nao permite reabertura` })
    }

    await db.execute(sql`
      UPDATE folhas SET status = 'em_revisao', reaberta_em = NOW(), reaberta_por = ${req.tenantAuth!.sub}::uuid,
        motivo_reabertura = ${req.body.motivo}, updated_at = NOW()
      WHERE id = ${req.params.id}
    `)

    if (req.body.recalcularAposReabertura) {
      const compIso = `${Number(folha.competencia_ano)}-${String(Number(folha.competencia_mes)).padStart(2, '0')}-01`
      const connStr = `${env.DATABASE_URL}?search_path=${tenant.schemaName},public`
      const jobId = await enfileirarProcessarFolha({
        tenantSlug: tenant.schemaName, tenantConnectionString: connStr,
        folhaId: String(folha.id), competencia: compIso, iniciadoPor: req.tenantAuth!.sub,
      })
      return reply.status(202).send({ jobId, status: 'ENFILEIRADO', progressoWsUrl: `/folhas/${folha.id}/progresso` })
    }

    return { status: 'em_revisao', motivo: req.body.motivo }
  })

  // ============================================================
  // POST /:id/integrar-despesas (ASYNC)
  // ============================================================
  app.post('/:id/integrar-despesas', {
    preHandler: async (req) => req.requirePermission('folha:cadastros'),
    schema: { tags: ['tenant-folha'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }], params: folhaIdParams },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const folhaRows = await db.execute(sql`SELECT id, status, competencia_mes, competencia_ano FROM folhas WHERE id = ${req.params.id} AND deleted_at IS NULL LIMIT 1`) as unknown as Array<Record<string, unknown>>
    if (folhaRows.length === 0) return reply.status(404).send({ error: 'NotFound' })
    const folha = folhaRows[0]!
    if (!['calculada', 'em_revisao', 'aprovada', 'encerrada'].includes(String(folha.status))) {
      return reply.status(422).send({ error: 'TransicaoInvalida', message: `Status ${folha.status} sem holerites pra integrar` })
    }

    const compIso = `${Number(folha.competencia_ano)}-${String(Number(folha.competencia_mes)).padStart(2, '0')}-01`
    const connStr = `${env.DATABASE_URL}?search_path=${tenant.schemaName},public`
    const jobId = await enfileirarGerarEmpenhos({
      tenantSlug: tenant.schemaName, tenantConnectionString: connStr,
      folhaId: String(folha.id), competencia: compIso, iniciadoPor: req.tenantAuth!.sub,
    })
    return reply.status(202).send({ jobId, status: 'ENFILEIRADO', progressoWsUrl: `/folhas/${folha.id}/progresso` })
  })

  // ============================================================
  // DELETE /:id (cancelar - so rascunho)
  // ============================================================
  app.delete('/:id', {
    preHandler: async (req) => req.requirePermission('folha:cadastros'),
    schema: { tags: ['tenant-folha'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      params: folhaIdParams, body: cancelarFolhaBody,
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const folhaRows = await db.execute(sql`SELECT id, status FROM folhas WHERE id = ${req.params.id} AND deleted_at IS NULL LIMIT 1`) as unknown as Array<Record<string, unknown>>
    if (folhaRows.length === 0) return reply.status(404).send({ error: 'NotFound' })
    if (folhaRows[0]!.status !== 'em_elaboracao') {
      return reply.status(422).send({ error: 'CancelamentoNaoPermitido', message: `So e possivel cancelar folhas em elaboracao` })
    }

    await db.execute(sql`
      UPDATE folhas SET status = 'cancelada', deleted_at = NOW(), cancelada_em = NOW(),
        cancelada_por = ${req.tenantAuth!.sub}::uuid, motivo_cancelamento = ${req.body.motivo}, updated_at = NOW()
      WHERE id = ${req.params.id}
    `)
    return reply.status(204).send(null)
  })
}
