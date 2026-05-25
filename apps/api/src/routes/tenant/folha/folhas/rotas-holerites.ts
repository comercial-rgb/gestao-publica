/**
 * Rotas /folhas/:id/holerites/* -- simular sync + listagens + recalcular
 * async + eSocial async.
 */

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createTenantDatabase, createMasterDatabase, sql } from '@saas-municipal/database'
import {
  enfileirarRecalcularHolerite,
  enfileirarEnvioEsocial,
} from '@saas-municipal/worker/queues/folha'
import { env } from '../../../../env.js'
import {
  folhaIdParams,
  folhaVinculoParams,
  simularHoleriteBody,
  recalcularHoleriteBody,
  enviarEsocialBody,
  listarHoleritesQuery,
} from './schemas.js'
import { simularHolerite } from './services.js'

export const rotasHolerites: FastifyPluginAsyncZod = async (app) => {
  // ============================================================
  // POST /simular (SYNC)
  // ============================================================
  app.post('/simular', {
    preHandler: async (req) => req.requirePermission('folha:read'),
    schema: { tags: ['tenant-folha'], security: [{ bearerAuth: [] }, { tenantCookie: [] }],
      body: simularHoleriteBody,
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const publicDb = createMasterDatabase(env.DATABASE_URL)

    // Busca folha pai (pra pegar competencia)
    const folhaId = (req.params as any).id
    const folhaRows = await db.execute(sql`
      SELECT id, competencia_mes, competencia_ano FROM folhas WHERE id = ${folhaId} AND deleted_at IS NULL LIMIT 1
    `) as unknown as Array<Record<string, unknown>>
    if (folhaRows.length === 0) return reply.status(404).send({ error: 'NotFound' })
    const folha = folhaRows[0]!

    try {
      const h = await simularHolerite({
        tenantDb: db,
        publicDb,
        folhaId,
        vinculoId: req.body.vinculoId,
        competenciaAno: Number(folha.competencia_ano),
        competenciaMes: Number(folha.competencia_mes),
        overrides: req.body.overrides,
      })

      return {
        vinculoId: req.body.vinculoId,
        competencia: h.competencia.toISOString().slice(0, 10),
        totais: h.totais,
        rubricas: h.rubricas,
        inss: { valor: h.inss.valor, aliquotaEfetiva: h.inss.aliquotaEfetiva, tetoAplicado: h.inss.tetoAplicado },
        irrf: { valor: h.irrf.valor, cenarioUtilizado: h.irrf.cenarioUtilizado },
        salarioFamilia: h.salarioFamilia ? { valorTotal: h.salarioFamilia.valorTotal, filhos: h.salarioFamilia.numeroFilhosElegiveis } : null,
        duracaoMs: h.duracaoMs,
        hashSimulacao: h.hashSha256,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return reply.status(422).send({ error: 'SimulacaoFalhou', message: msg })
    }
  })

  // ============================================================
  // GET / (listar holerites da folha - ultima versao por vinculo)
  // ============================================================
  app.get('/', {
    preHandler: async (req) => req.requirePermission('folha:read'),
    schema: { tags: ['tenant-folha'], security: [{ bearerAuth: [] }, { tenantCookie: [] }],
      querystring: listarHoleritesQuery,
    },
  }, async (req) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const folhaId = (req.params as any).id
    const { page, pageSize } = req.query

    const result = await db.execute(sql`
      SELECT DISTINCT ON (l.vinculo_id)
        l.id, l.vinculo_id, l.competencia, l.versao, l.hash_sha256, l.calculado_em,
        (l.snapshot -> 'totais') AS totais,
        p.nome AS servidor_nome, v.matricula
      FROM folha_processamento_log l
      INNER JOIN vinculos_funcionais v ON v.id = l.vinculo_id
      INNER JOIN pessoas p ON p.id = v.pessoa_id
      WHERE l.folha_id = ${folhaId}
      ORDER BY l.vinculo_id, l.versao DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `)

    return { items: result, page, pageSize }
  })

  // ============================================================
  // GET /:vinculoId (detalhe - ultima versao + snapshot)
  // ============================================================
  app.get('/:vinculoId', {
    preHandler: async (req) => req.requirePermission('folha:read'),
    schema: { tags: ['tenant-folha'], security: [{ bearerAuth: [] }, { tenantCookie: [] }], params: folhaVinculoParams },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const { id: folhaId, vinculoId } = req.params

    const result = await db.execute(sql`
      SELECT * FROM folha_processamento_log
      WHERE folha_id = ${folhaId} AND vinculo_id = ${vinculoId}
      ORDER BY versao DESC LIMIT 1
    `) as unknown as Array<Record<string, unknown>>
    if (result.length === 0) return reply.status(404).send({ error: 'NotFound' })
    return result[0]
  })

  // ============================================================
  // GET /:vinculoId/versoes (historico de versoes)
  // ============================================================
  app.get('/:vinculoId/versoes', {
    preHandler: async (req) => req.requirePermission('folha:read'),
    schema: { tags: ['tenant-folha'], security: [{ bearerAuth: [] }, { tenantCookie: [] }], params: folhaVinculoParams },
  }, async (req) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const { id: folhaId, vinculoId } = req.params

    const items = await db.execute(sql`
      SELECT id, versao, calculado_em, hash_sha256, duracao_ms, worker_id
      FROM folha_processamento_log
      WHERE folha_id = ${folhaId} AND vinculo_id = ${vinculoId}
      ORDER BY versao DESC
    `)
    return { items }
  })

  // ============================================================
  // POST /:vinculoId/recalcular (ASYNC)
  // ============================================================
  app.post('/:vinculoId/recalcular', {
    preHandler: async (req) => req.requirePermission('folha:cadastros'),
    schema: { tags: ['tenant-folha'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      params: folhaVinculoParams, body: recalcularHoleriteBody,
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const { id: folhaId, vinculoId } = req.params

    const folhaRows = await db.execute(sql`SELECT id, status, competencia_mes, competencia_ano FROM folhas WHERE id = ${folhaId} AND deleted_at IS NULL LIMIT 1`) as unknown as Array<Record<string, unknown>>
    if (folhaRows.length === 0) return reply.status(404).send({ error: 'NotFound' })
    const folha = folhaRows[0]!
    if (!['calculada', 'em_revisao', 'aprovada'].includes(String(folha.status))) {
      return reply.status(422).send({ error: 'TransicaoInvalida', message: `Status ${folha.status} nao permite recalculo` })
    }

    const vinculoCheck = await db.execute(sql`SELECT id FROM vinculos_funcionais WHERE id = ${vinculoId} AND deleted_at IS NULL LIMIT 1`) as unknown as Array<{ id: string }>
    if (vinculoCheck.length === 0) return reply.status(404).send({ error: 'VinculoNotFound' })

    const compIso = `${Number(folha.competencia_ano)}-${String(Number(folha.competencia_mes)).padStart(2, '0')}-01`
    const connStr = `${env.DATABASE_URL}?search_path=${tenant.schemaName},public`

    const jobId = await enfileirarRecalcularHolerite({
      tenantSlug: tenant.schemaName, tenantConnectionString: connStr,
      folhaId, vinculoId, competencia: compIso, motivo: req.body.motivo, iniciadoPor: req.tenantAuth!.sub,
    })
    return reply.status(202).send({ jobId, status: 'ENFILEIRADO', progressoWsUrl: `/folhas/${folhaId}/progresso` })
  })

  // ============================================================
  // POST /:vinculoId/esocial (ASYNC)
  // ============================================================
  app.post('/:vinculoId/esocial', {
    preHandler: async (req) => req.requirePermission('folha:cadastros'),
    schema: { tags: ['tenant-folha'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      params: folhaVinculoParams, body: enviarEsocialBody,
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const { id: folhaId, vinculoId } = req.params
    const connStr = `${env.DATABASE_URL}?search_path=${tenant.schemaName},public`

    const jobId = await enfileirarEnvioEsocial({
      tenantSlug: tenant.schemaName, tenantConnectionString: connStr,
      folhaId, vinculoId, ambiente: req.body.ambiente, iniciadoPor: req.tenantAuth!.sub,
    })
    return reply.status(202).send({ jobId, status: 'ENFILEIRADO', progressoWsUrl: `/folhas/${folhaId}/progresso` })
  })
}
