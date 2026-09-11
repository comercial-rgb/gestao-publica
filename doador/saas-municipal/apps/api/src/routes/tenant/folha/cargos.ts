import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createTenantDatabase, tenantSchema, eq, and, sql } from '@saas-municipal/database'
import { env } from '../../../env.js'

export const cargosRoute: FastifyPluginAsyncZod = async (app) => {
  app.get('/', {
    preHandler: async (req) => req.requirePermission('folha:read'),
    schema: { tags: ['tenant-folha'], security: [{ bearerAuth: [] }, { tenantCookie: [] }],
      querystring: z.object({ ativo: z.coerce.boolean().optional(), search: z.string().max(100).optional() }),
      response: { 200: z.array(z.object({ id: z.string().uuid(), codigo: z.string(), nome: z.string(), regimeJuridico: z.string(), classe: z.string().nullable(), cargaHorariaSemanal: z.number(), ativo: z.boolean(), qtdVinculosAtivos: z.number(), qtdNiveis: z.number() })) },
    },
  }, async (req) => {
    const tenant = await req.resolveTenant(); const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const f: ReturnType<typeof sql>[] = [sql`c.deleted_at IS NULL`]
    if (req.query.ativo !== undefined) f.push(sql`c.ativo = ${req.query.ativo}`)
    if (req.query.search) { const t = `%${req.query.search}%`; f.push(sql`(c.codigo ILIKE ${t} OR c.nome ILIKE ${t})`) }
    const result = await db.execute(sql`SELECT c.id, c.codigo, c.nome, c.regime_juridico, c.classe, c.carga_horaria_semanal, c.ativo, (SELECT COUNT(*)::int FROM vinculos_funcionais vf WHERE vf.cargo_id = c.id AND vf.status = 'ativo') AS qtd_vinculos_ativos, (SELECT COUNT(*)::int FROM cargos_niveis_referencias nr WHERE nr.cargo_id = c.id AND nr.ativo = true) AS qtd_niveis FROM cargos c WHERE ${sql.join(f, sql` AND `)} ORDER BY c.codigo LIMIT 500`)
    return (result as unknown as Array<Record<string, unknown>>).map((r) => ({ id: String(r.id), codigo: String(r.codigo), nome: String(r.nome), regimeJuridico: String(r.regime_juridico), classe: r.classe ? String(r.classe) : null, cargaHorariaSemanal: Number(r.carga_horaria_semanal), ativo: Boolean(r.ativo), qtdVinculosAtivos: Number(r.qtd_vinculos_ativos), qtdNiveis: Number(r.qtd_niveis) }))
  })

  app.get('/:id', {
    preHandler: async (req) => req.requirePermission('folha:read'),
    schema: { tags: ['tenant-folha'], security: [{ bearerAuth: [] }, { tenantCookie: [] }], params: z.object({ id: z.string().uuid() }),
      response: { 200: z.object({ id: z.string().uuid(), codigo: z.string(), nome: z.string(), descricao: z.string().nullable(), regimeJuridico: z.string(), classe: z.string().nullable(), escolaridadeMinima: z.string().nullable(), cargaHorariaSemanal: z.number(), ativo: z.boolean(), niveisReferencias: z.array(z.object({ id: z.string().uuid(), nivel: z.string(), referencia: z.string(), vencimentoBase: z.string(), vigenciaInicio: z.string(), vigenciaFim: z.string().nullable(), ativo: z.boolean() })) }) },
    },
  }, async (req) => {
    const tenant = await req.resolveTenant(); const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const cargo = await db.query.cargos.findFirst({ where: (c, { eq, and, isNull }) => and(eq(c.id, req.params.id), isNull(c.deletedAt)) })
    if (!cargo) throw app.httpErrors.notFound('Cargo nao encontrado')
    const niveis = await db.execute(sql`SELECT id, nivel, referencia, vencimento_base::text AS vencimento_base, vigencia_inicio, vigencia_fim, ativo FROM cargos_niveis_referencias WHERE cargo_id = ${req.params.id} ORDER BY nivel, referencia`)
    return { id: cargo.id, codigo: cargo.codigo, nome: cargo.nome, descricao: cargo.descricao, regimeJuridico: cargo.regimeJuridico, classe: cargo.classe, escolaridadeMinima: cargo.escolaridadeMinima, cargaHorariaSemanal: cargo.cargaHorariaSemanal, ativo: cargo.ativo,
      niveisReferencias: (niveis as unknown as Array<Record<string, unknown>>).map((n) => ({ id: String(n.id), nivel: String(n.nivel), referencia: String(n.referencia), vencimentoBase: String(n.vencimento_base), vigenciaInicio: String(n.vigencia_inicio), vigenciaFim: n.vigencia_fim ? String(n.vigencia_fim) : null, ativo: Boolean(n.ativo) })) }
  })

  app.post('/', {
    preHandler: async (req) => req.requirePermission('folha:cadastros'),
    schema: { tags: ['tenant-folha'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      body: z.object({ codigo: z.string().min(1).max(20), nome: z.string().min(3).max(200), descricao: z.string().max(2000).optional(), regimeJuridico: z.enum(['estatutario', 'clt', 'temporario_lei', 'comissionado', 'eletivo']), classe: z.string().max(50).optional(), escolaridadeMinima: z.string().max(100).optional(), cargaHorariaSemanal: z.number().int().min(1).max(60).default(40) }),
      response: { 201: z.object({ id: z.string().uuid() }), 422: z.object({ error: z.string(), message: z.string() }) },
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant(); const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const existente = await db.query.cargos.findFirst({ where: (c, { eq }) => eq(c.codigo, req.body.codigo) })
    if (existente) return reply.status(422).send({ error: 'CodigoDuplicado', message: `Codigo "${req.body.codigo}" ja existe` })
    const [created] = await db.insert(tenantSchema.cargos).values({ codigo: req.body.codigo, nome: req.body.nome, descricao: req.body.descricao ?? null, regimeJuridico: req.body.regimeJuridico, classe: req.body.classe ?? null, escolaridadeMinima: req.body.escolaridadeMinima ?? null, cargaHorariaSemanal: req.body.cargaHorariaSemanal, createdBy: req.tenantAuth!.sub }).returning({ id: tenantSchema.cargos.id })
    await db.insert(tenantSchema.tenantAuditLog).values({ userId: req.tenantAuth!.sub, action: 'folha.cargo.criar', resource: 'cargo', resourceId: created!.id, after: { codigo: req.body.codigo, nome: req.body.nome }, ipAddress: req.ip })
    return reply.status(201).send({ id: created!.id })
  })

  app.patch('/:id', {
    preHandler: async (req) => req.requirePermission('folha:cadastros'),
    schema: { tags: ['tenant-folha'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }], params: z.object({ id: z.string().uuid() }),
      body: z.object({ nome: z.string().min(3).max(200).optional(), descricao: z.string().max(2000).optional().nullable(), classe: z.string().max(50).optional().nullable(), cargaHorariaSemanal: z.number().int().min(1).max(60).optional(), ativo: z.boolean().optional() }),
      response: { 200: z.object({ id: z.string().uuid() }) },
    },
  }, async (req) => {
    const tenant = await req.resolveTenant(); const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const [updated] = await db.update(tenantSchema.cargos).set({ ...req.body, updatedAt: new Date() }).where(and(eq(tenantSchema.cargos.id, req.params.id), sql`deleted_at IS NULL`)).returning({ id: tenantSchema.cargos.id })
    if (!updated) throw app.httpErrors.notFound('Cargo nao encontrado')
    return { id: updated.id }
  })

  app.post('/:id/niveis-referencias', {
    preHandler: async (req) => req.requirePermission('folha:cadastros'),
    schema: { tags: ['tenant-folha'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }], params: z.object({ id: z.string().uuid() }),
      body: z.object({ nivel: z.string().min(1).max(20), referencia: z.string().min(1).max(20), vencimentoBase: z.coerce.number().positive(), vigenciaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), vigenciaFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
      response: { 201: z.object({ id: z.string().uuid() }) },
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant(); const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const cargo = await db.query.cargos.findFirst({ where: (c, { eq, and, isNull }) => and(eq(c.id, req.params.id), isNull(c.deletedAt)) })
    if (!cargo) throw app.httpErrors.notFound('Cargo nao encontrado')
    const [created] = await db.insert(tenantSchema.cargosNiveisReferencias).values({ cargoId: req.params.id, nivel: req.body.nivel, referencia: req.body.referencia, vencimentoBase: req.body.vencimentoBase.toFixed(2), vigenciaInicio: req.body.vigenciaInicio, vigenciaFim: req.body.vigenciaFim ?? null }).returning({ id: tenantSchema.cargosNiveisReferencias.id })
    return reply.status(201).send({ id: created!.id })
  })

  app.delete('/:id', {
    preHandler: async (req) => req.requirePermission('folha:cadastros'),
    schema: { tags: ['tenant-folha'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }], params: z.object({ id: z.string().uuid() }), response: { 204: z.null(), 422: z.object({ error: z.string(), message: z.string() }) } },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant(); const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const vinc = await db.execute(sql`SELECT COUNT(*)::int AS qtd FROM vinculos_funcionais WHERE cargo_id = ${req.params.id} AND status = 'ativo' AND deleted_at IS NULL`)
    if (Number((vinc as unknown as Array<Record<string, unknown>>)[0]?.qtd) > 0) return reply.status(422).send({ error: 'CargoEmUso', message: 'Cargo tem vinculos ativos' })
    await db.update(tenantSchema.cargos).set({ deletedAt: new Date(), ativo: false, updatedAt: new Date() }).where(eq(tenantSchema.cargos.id, req.params.id))
    return reply.status(204).send(null)
  })
}
