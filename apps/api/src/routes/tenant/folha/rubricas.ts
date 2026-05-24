import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createTenantDatabase, tenantSchema, eq, and, sql } from '@saas-municipal/database'
import { env } from '../../../env.js'

const tipoEnum = z.enum(['provento', 'desconto', 'informativo', 'base_calculo'])
const calculoEnum = z.enum(['fixo', 'percentual_base', 'tabela_progressiva', 'horas', 'dias', 'manual', 'formula_sistema'])

export const rubricasRoute: FastifyPluginAsyncZod = async (app) => {
  app.get('/', {
    preHandler: async (req) => req.requirePermission('folha:read'),
    schema: { tags: ['tenant-folha'], security: [{ bearerAuth: [] }, { tenantCookie: [] }],
      querystring: z.object({ tipo: tipoEnum.optional(), calculo: calculoEnum.optional(), ativo: z.coerce.boolean().optional(), search: z.string().max(100).optional() }),
      response: { 200: z.array(z.object({ id: z.string().uuid(), codigo: z.string(), nome: z.string(), tipo: z.string(), calculo: z.string(), incideInss: z.boolean(), incideIrrf: z.boolean(), incideFgts: z.boolean(), folhaMensal: z.boolean(), ativo: z.boolean() })) },
    },
  }, async (req) => {
    const tenant = await req.resolveTenant(); const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const f: ReturnType<typeof sql>[] = [sql`deleted_at IS NULL`]
    if (req.query.tipo) f.push(sql`tipo = ${req.query.tipo}`)
    if (req.query.calculo) f.push(sql`calculo = ${req.query.calculo}`)
    if (req.query.ativo !== undefined) f.push(sql`ativo = ${req.query.ativo}`)
    if (req.query.search) { const t = `%${req.query.search}%`; f.push(sql`(codigo ILIKE ${t} OR nome ILIKE ${t})`) }
    const result = await db.execute(sql`SELECT id, codigo, nome, tipo, calculo, incide_inss, incide_irrf, incide_fgts, folha_mensal, ativo FROM rubricas WHERE ${sql.join(f, sql` AND `)} ORDER BY codigo LIMIT 500`)
    return (result as unknown as Array<Record<string, unknown>>).map((r) => ({ id: String(r.id), codigo: String(r.codigo), nome: String(r.nome), tipo: String(r.tipo), calculo: String(r.calculo), incideInss: Boolean(r.incide_inss), incideIrrf: Boolean(r.incide_irrf), incideFgts: Boolean(r.incide_fgts), folhaMensal: Boolean(r.folha_mensal), ativo: Boolean(r.ativo) }))
  })

  app.get('/:id', {
    preHandler: async (req) => req.requirePermission('folha:read'),
    schema: { tags: ['tenant-folha'], security: [{ bearerAuth: [] }, { tenantCookie: [] }], params: z.object({ id: z.string().uuid() }),
      response: { 200: z.object({ id: z.string().uuid(), codigo: z.string(), nome: z.string(), descricao: z.string().nullable(), tipo: z.string(), calculo: z.string(), parametros: z.record(z.unknown()).nullable(), incideInss: z.boolean(), incideIrrf: z.boolean(), incideFgts: z.boolean(), incideDecimoTerceiro: z.boolean(), incideFerias: z.boolean(), incideRpps: z.boolean(), folhaMensal: z.boolean(), folhaDecimoTerceiro: z.boolean(), folhaFerias: z.boolean(), folhaRescisao: z.boolean(), classificacaoContabil: z.string().nullable(), ativo: z.boolean(), qtdVinculosAtribuidos: z.number() }) },
    },
  }, async (req) => {
    const tenant = await req.resolveTenant(); const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const result = await db.execute(sql`SELECT r.*, (SELECT COUNT(*)::int FROM rubricas_vinculos rv WHERE rv.rubrica_id = r.id AND rv.ativo = true) AS qtd_atribuidos FROM rubricas r WHERE r.id = ${req.params.id} AND r.deleted_at IS NULL`)
    const rows = result as unknown as Array<Record<string, unknown>>
    if (rows.length === 0) throw app.httpErrors.notFound('Rubrica nao encontrada')
    const r = rows[0]!
    return { id: String(r.id), codigo: String(r.codigo), nome: String(r.nome), descricao: r.descricao ? String(r.descricao) : null, tipo: String(r.tipo), calculo: String(r.calculo), parametros: r.parametros as Record<string, unknown> | null, incideInss: Boolean(r.incide_inss), incideIrrf: Boolean(r.incide_irrf), incideFgts: Boolean(r.incide_fgts), incideDecimoTerceiro: Boolean(r.incide_decimo_terceiro), incideFerias: Boolean(r.incide_ferias), incideRpps: Boolean(r.incide_rpps), folhaMensal: Boolean(r.folha_mensal), folhaDecimoTerceiro: Boolean(r.folha_decimo_terceiro), folhaFerias: Boolean(r.folha_ferias), folhaRescisao: Boolean(r.folha_rescisao), classificacaoContabil: r.classificacao_contabil ? String(r.classificacao_contabil) : null, ativo: Boolean(r.ativo), qtdVinculosAtribuidos: Number(r.qtd_atribuidos) }
  })

  app.post('/', {
    preHandler: async (req) => req.requirePermission('folha:cadastros'),
    schema: { tags: ['tenant-folha'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      body: z.object({ codigo: z.string().min(1).max(20), nome: z.string().min(3).max(200), descricao: z.string().max(2000).optional(), tipo: tipoEnum, calculo: calculoEnum, parametros: z.record(z.unknown()).optional(), incideInss: z.boolean().default(false), incideIrrf: z.boolean().default(false), incideFgts: z.boolean().default(false), incideDecimoTerceiro: z.boolean().default(false), incideFerias: z.boolean().default(false), incideRpps: z.boolean().default(false), folhaMensal: z.boolean().default(true), folhaDecimoTerceiro: z.boolean().default(false), folhaFerias: z.boolean().default(false), folhaRescisao: z.boolean().default(false), classificacaoContabil: z.string().max(30).optional() }),
      response: { 201: z.object({ id: z.string().uuid() }), 422: z.object({ error: z.string(), message: z.string() }) },
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant(); const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const existente = await db.query.rubricas.findFirst({ where: (r, { eq }) => eq(r.codigo, req.body.codigo) })
    if (existente) return reply.status(422).send({ error: 'CodigoDuplicado', message: `Codigo "${req.body.codigo}" ja existe` })
    const [created] = await db.insert(tenantSchema.rubricas).values({ ...req.body, parametros: req.body.parametros ?? null, descricao: req.body.descricao ?? null, classificacaoContabil: req.body.classificacaoContabil ?? null, createdBy: req.tenantAuth!.sub }).returning({ id: tenantSchema.rubricas.id })
    await db.insert(tenantSchema.tenantAuditLog).values({ userId: req.tenantAuth!.sub, action: 'folha.rubrica.criar', resource: 'rubrica', resourceId: created!.id, after: { codigo: req.body.codigo, nome: req.body.nome }, ipAddress: req.ip })
    return reply.status(201).send({ id: created!.id })
  })

  app.patch('/:id', {
    preHandler: async (req) => req.requirePermission('folha:cadastros'),
    schema: { tags: ['tenant-folha'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }], params: z.object({ id: z.string().uuid() }),
      body: z.object({ nome: z.string().min(3).max(200).optional(), descricao: z.string().max(2000).optional().nullable(), parametros: z.record(z.unknown()).optional().nullable(), ativo: z.boolean().optional() }),
      response: { 200: z.object({ id: z.string().uuid() }) },
    },
  }, async (req) => {
    const tenant = await req.resolveTenant(); const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const [updated] = await db.update(tenantSchema.rubricas).set({ ...req.body, updatedAt: new Date() }).where(and(eq(tenantSchema.rubricas.id, req.params.id), sql`deleted_at IS NULL`)).returning({ id: tenantSchema.rubricas.id })
    if (!updated) throw app.httpErrors.notFound('Rubrica nao encontrada')
    return { id: updated.id }
  })

  app.delete('/:id', {
    preHandler: async (req) => req.requirePermission('folha:cadastros'),
    schema: { tags: ['tenant-folha'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }], params: z.object({ id: z.string().uuid() }), response: { 204: z.null(), 422: z.object({ error: z.string(), message: z.string() }) } },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant(); const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const lanc = await db.execute(sql`SELECT COUNT(*)::int AS qtd FROM folhas_lancamentos WHERE rubrica_id = ${req.params.id}`)
    if (Number((lanc as unknown as Array<Record<string, unknown>>)[0]?.qtd) > 0) return reply.status(422).send({ error: 'RubricaEmUso', message: 'Rubrica ja tem lancamentos. Pode apenas desativar.' })
    await db.update(tenantSchema.rubricas).set({ deletedAt: new Date(), ativo: false, updatedAt: new Date() }).where(eq(tenantSchema.rubricas.id, req.params.id))
    return reply.status(204).send(null)
  })
}
