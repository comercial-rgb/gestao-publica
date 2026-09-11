import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createTenantDatabase, tenantSchema, eq, and, sql } from '@saas-municipal/database'
import { env } from '../../../env.js'

const tipoEnum = z.enum(['efetivo', 'comissionado', 'temporario', 'estagiario', 'aposentado', 'pensionista', 'agente_politico', 'cedido'])
const statusEnum = z.enum(['ativo', 'inativo', 'afastado', 'aposentado', 'exonerado', 'falecido'])
const regimeJurEnum = z.enum(['estatutario', 'clt', 'temporario_lei', 'comissionado', 'eletivo'])
const regimePrevEnum = z.enum(['rpps', 'rgps', 'isento'])

export const vinculosRoute: FastifyPluginAsyncZod = async (app) => {
  app.get('/', {
    preHandler: async (req) => req.requirePermission('folha:read'),
    schema: { tags: ['tenant-folha'], security: [{ bearerAuth: [] }, { tenantCookie: [] }],
      querystring: z.object({ status: statusEnum.optional(), tipo: tipoEnum.optional(), search: z.string().max(100).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }),
      response: { 200: z.object({ items: z.array(z.object({ id: z.string().uuid(), matricula: z.string(), pessoaNome: z.string(), pessoaDocumento: z.string().nullable(), tipo: z.string(), status: z.string(), cargoNome: z.string().nullable(), cargoCodigo: z.string().nullable(), nivelReferencia: z.string().nullable(), vencimentoBase: z.string().nullable(), dataAdmissao: z.string() })), pagination: z.object({ nextCursor: z.string().nullable() }) }) },
    },
  }, async (req) => {
    const tenant = await req.resolveTenant(); const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const f: ReturnType<typeof sql>[] = [sql`v.deleted_at IS NULL`]
    if (req.query.status) f.push(sql`v.status = ${req.query.status}`)
    if (req.query.tipo) f.push(sql`v.tipo = ${req.query.tipo}`)
    if (req.query.search) { const t = `%${req.query.search}%`; f.push(sql`(v.matricula ILIKE ${t} OR p.nome ILIKE ${t} OR p.documento ILIKE ${t})`) }
    const limit = req.query.limit
    const result = await db.execute(sql`SELECT v.id, v.matricula, v.tipo, v.status, v.data_admissao, v.created_at, p.nome AS pessoa_nome, p.documento AS pessoa_documento, c.nome AS cargo_nome, c.codigo AS cargo_codigo, CASE WHEN nr.id IS NOT NULL THEN nr.nivel || '/' || nr.referencia ELSE NULL END AS nivel_referencia, nr.vencimento_base::text AS vencimento_base FROM vinculos_funcionais v INNER JOIN pessoas p ON p.id = v.pessoa_id LEFT JOIN cargos c ON c.id = v.cargo_id LEFT JOIN cargos_niveis_referencias nr ON nr.id = v.nivel_referencia_id WHERE ${sql.join(f, sql` AND `)} ORDER BY v.created_at DESC LIMIT ${limit + 1}`)
    const rows = result as unknown as Array<Record<string, unknown>>
    return { items: rows.slice(0, limit).map((r) => ({ id: String(r.id), matricula: String(r.matricula), pessoaNome: String(r.pessoa_nome), pessoaDocumento: r.pessoa_documento ? String(r.pessoa_documento) : null, tipo: String(r.tipo), status: String(r.status), cargoNome: r.cargo_nome ? String(r.cargo_nome) : null, cargoCodigo: r.cargo_codigo ? String(r.cargo_codigo) : null, nivelReferencia: r.nivel_referencia ? String(r.nivel_referencia) : null, vencimentoBase: r.vencimento_base ? String(r.vencimento_base) : null, dataAdmissao: String(r.data_admissao) })), pagination: { nextCursor: rows.length > limit ? new Date(rows[limit - 1]!.created_at as string).toISOString() : null } }
  })

  app.get('/:id', {
    preHandler: async (req) => req.requirePermission('folha:read'),
    schema: { tags: ['tenant-folha'], security: [{ bearerAuth: [] }, { tenantCookie: [] }], params: z.object({ id: z.string().uuid() }),
      response: { 200: z.object({ id: z.string().uuid(), matricula: z.string(), tipo: z.string(), status: z.string(), pessoa: z.object({ id: z.string().uuid(), nome: z.string(), documento: z.string().nullable() }), cargo: z.object({ id: z.string().uuid(), codigo: z.string(), nome: z.string() }).nullable(), nivelReferencia: z.object({ id: z.string().uuid(), nivel: z.string(), referencia: z.string(), vencimentoBase: z.string() }).nullable(), entidadeNome: z.string(), regimeJuridico: z.string(), regimePrevidenciario: z.string(), dataAdmissao: z.string(), dataExoneracao: z.string().nullable(), cargaHorariaSemanal: z.number(), localTrabalho: z.string().nullable(), qtdDependentesIrrf: z.number(), qtdDependentesSalarioFamilia: z.number(), observacoes: z.string().nullable(), rubricasAtribuidas: z.array(z.object({ id: z.string().uuid(), rubricaId: z.string().uuid(), rubricaCodigo: z.string(), rubricaNome: z.string(), valor: z.string().nullable(), percentual: z.string().nullable(), vigenciaInicio: z.string(), vigenciaFim: z.string().nullable(), ativo: z.boolean() })) }) },
    },
  }, async (req) => {
    const tenant = await req.resolveTenant(); const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const vResult = await db.execute(sql`SELECT v.*, p.nome AS pessoa_nome, p.documento AS pessoa_documento, c.codigo AS cargo_codigo, c.nome AS cargo_nome, nr.nivel AS nr_nivel, nr.referencia AS nr_referencia, nr.vencimento_base::text AS nr_vencimento, e.nome AS entidade_nome FROM vinculos_funcionais v INNER JOIN pessoas p ON p.id = v.pessoa_id LEFT JOIN cargos c ON c.id = v.cargo_id LEFT JOIN cargos_niveis_referencias nr ON nr.id = v.nivel_referencia_id INNER JOIN entidades e ON e.id = v.entidade_id WHERE v.id = ${req.params.id} AND v.deleted_at IS NULL`)
    const vRows = vResult as unknown as Array<Record<string, unknown>>
    if (vRows.length === 0) throw app.httpErrors.notFound('Vinculo nao encontrado')
    const v = vRows[0]!
    const rvResult = await db.execute(sql`SELECT rv.id, rv.rubrica_id, rv.valor::text AS valor, rv.percentual::text AS percentual, rv.vigencia_inicio, rv.vigencia_fim, rv.ativo, r.codigo AS rubrica_codigo, r.nome AS rubrica_nome FROM rubricas_vinculos rv INNER JOIN rubricas r ON r.id = rv.rubrica_id WHERE rv.vinculo_id = ${req.params.id} ORDER BY rv.vigencia_inicio DESC`)
    return {
      id: String(v.id), matricula: String(v.matricula), tipo: String(v.tipo), status: String(v.status),
      pessoa: { id: String(v.pessoa_id), nome: String(v.pessoa_nome), documento: v.pessoa_documento ? String(v.pessoa_documento) : null },
      cargo: v.cargo_id ? { id: String(v.cargo_id), codigo: String(v.cargo_codigo), nome: String(v.cargo_nome) } : null,
      nivelReferencia: v.nivel_referencia_id ? { id: String(v.nivel_referencia_id), nivel: String(v.nr_nivel), referencia: String(v.nr_referencia), vencimentoBase: String(v.nr_vencimento) } : null,
      entidadeNome: String(v.entidade_nome), regimeJuridico: String(v.regime_juridico), regimePrevidenciario: String(v.regime_previdenciario),
      dataAdmissao: String(v.data_admissao), dataExoneracao: v.data_exoneracao ? String(v.data_exoneracao) : null,
      cargaHorariaSemanal: Number(v.carga_horaria_semanal), localTrabalho: v.local_trabalho ? String(v.local_trabalho) : null,
      qtdDependentesIrrf: Number(v.qtd_dependentes_irrf), qtdDependentesSalarioFamilia: Number(v.qtd_dependentes_salario_familia),
      observacoes: v.observacoes ? String(v.observacoes) : null,
      rubricasAtribuidas: (rvResult as unknown as Array<Record<string, unknown>>).map((rv) => ({ id: String(rv.id), rubricaId: String(rv.rubrica_id), rubricaCodigo: String(rv.rubrica_codigo), rubricaNome: String(rv.rubrica_nome), valor: rv.valor ? String(rv.valor) : null, percentual: rv.percentual ? String(rv.percentual) : null, vigenciaInicio: String(rv.vigencia_inicio), vigenciaFim: rv.vigencia_fim ? String(rv.vigencia_fim) : null, ativo: Boolean(rv.ativo) })),
    }
  })

  app.post('/', {
    preHandler: async (req) => req.requirePermission('folha:cadastros'),
    schema: { tags: ['tenant-folha'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      body: z.object({ pessoaId: z.string().uuid(), matricula: z.string().min(1).max(30), tipo: tipoEnum, cargoId: z.string().uuid().optional(), nivelReferenciaId: z.string().uuid().optional(), entidadeId: z.string().uuid(), regimeJuridico: regimeJurEnum, regimePrevidenciario: regimePrevEnum, dataAdmissao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), cargaHorariaSemanal: z.number().int().min(1).max(60).default(40), localTrabalho: z.string().max(200).optional(), bancoCodigo: z.string().max(10).optional(), agencia: z.string().max(20).optional(), contaTipo: z.string().max(20).optional(), contaNumero: z.string().max(30).optional(), qtdDependentesIrrf: z.number().int().min(0).max(20).default(0), qtdDependentesSalarioFamilia: z.number().int().min(0).max(20).default(0), observacoes: z.string().max(2000).optional() }),
      response: { 201: z.object({ id: z.string().uuid() }), 422: z.object({ error: z.string(), message: z.string() }) },
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant(); const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const dup = await db.query.vinculosFuncionais.findFirst({ where: (v, { eq, and, isNull }) => and(eq(v.matricula, req.body.matricula), isNull(v.deletedAt)) })
    if (dup) return reply.status(422).send({ error: 'MatriculaDuplicada', message: `Matricula "${req.body.matricula}" ja existe` })
    const pessoa = await db.execute(sql`SELECT id FROM pessoas WHERE id = ${req.body.pessoaId} AND deleted_at IS NULL`)
    if ((pessoa as unknown as unknown[]).length === 0) return reply.status(422).send({ error: 'PessoaNaoEncontrada', message: 'Pessoa nao encontrada' })

    const vinculoId = await db.transaction(async (tx) => {
      const [created] = await tx.insert(tenantSchema.vinculosFuncionais).values({
        pessoaId: req.body.pessoaId, matricula: req.body.matricula, tipo: req.body.tipo, status: 'ativo',
        cargoId: req.body.cargoId ?? null, nivelReferenciaId: req.body.nivelReferenciaId ?? null, entidadeId: req.body.entidadeId,
        regimeJuridico: req.body.regimeJuridico, regimePrevidenciario: req.body.regimePrevidenciario, dataAdmissao: req.body.dataAdmissao,
        cargaHorariaSemanal: req.body.cargaHorariaSemanal, localTrabalho: req.body.localTrabalho ?? null,
        bancoCodigo: req.body.bancoCodigo ?? null, agencia: req.body.agencia ?? null, contaTipo: req.body.contaTipo ?? null, contaNumero: req.body.contaNumero ?? null,
        qtdDependentesIrrf: req.body.qtdDependentesIrrf, qtdDependentesSalarioFamilia: req.body.qtdDependentesSalarioFamilia,
        observacoes: req.body.observacoes ?? null, createdBy: req.tenantAuth!.sub,
      }).returning({ id: tenantSchema.vinculosFuncionais.id })
      await tx.insert(tenantSchema.vinculosEventos).values({ vinculoId: created!.id, tipoEvento: 'admissao', dataEvento: req.body.dataAdmissao, statusAnterior: null, statusNovo: 'ativo', cargoNovoId: req.body.cargoId ?? null, motivo: 'Admissao via cadastro inicial', userId: req.tenantAuth!.sub })
      return created!.id
    })
    await db.insert(tenantSchema.tenantAuditLog).values({ userId: req.tenantAuth!.sub, action: 'folha.vinculo.criar', resource: 'vinculo_funcional', resourceId: vinculoId, after: { matricula: req.body.matricula, tipo: req.body.tipo }, ipAddress: req.ip })
    return reply.status(201).send({ id: vinculoId })
  })

  app.patch('/:id', {
    preHandler: async (req) => req.requirePermission('folha:cadastros'),
    schema: { tags: ['tenant-folha'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }], params: z.object({ id: z.string().uuid() }),
      body: z.object({ cargoId: z.string().uuid().nullable().optional(), nivelReferenciaId: z.string().uuid().nullable().optional(), cargaHorariaSemanal: z.number().int().min(1).max(60).optional(), localTrabalho: z.string().max(200).nullable().optional(), bancoCodigo: z.string().max(10).nullable().optional(), agencia: z.string().max(20).nullable().optional(), contaTipo: z.string().max(20).nullable().optional(), contaNumero: z.string().max(30).nullable().optional(), qtdDependentesIrrf: z.number().int().min(0).max(20).optional(), qtdDependentesSalarioFamilia: z.number().int().min(0).max(20).optional(), observacoes: z.string().max(2000).nullable().optional() }),
      response: { 200: z.object({ id: z.string().uuid() }) },
    },
  }, async (req) => {
    const tenant = await req.resolveTenant(); const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const updates: Record<string, unknown> = { updatedAt: new Date() }
    for (const [k, v] of Object.entries(req.body)) { if (v !== undefined) updates[k] = v }
    const [updated] = await db.update(tenantSchema.vinculosFuncionais).set(updates).where(and(eq(tenantSchema.vinculosFuncionais.id, req.params.id), sql`deleted_at IS NULL`)).returning({ id: tenantSchema.vinculosFuncionais.id })
    if (!updated) throw app.httpErrors.notFound('Vinculo nao encontrado')
    return { id: updated.id }
  })

  app.post('/:id/eventos', {
    preHandler: async (req) => req.requirePermission('folha:cadastros'),
    schema: { tags: ['tenant-folha'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }], params: z.object({ id: z.string().uuid() }),
      body: z.object({ tipoEvento: z.string().min(3).max(50), dataEvento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), statusNovo: statusEnum.optional(), cargoNovoId: z.string().uuid().optional(), nivelReferenciaNovoId: z.string().uuid().optional(), documentoReferencia: z.string().max(200).optional(), motivo: z.string().min(10).max(2000) }),
      response: { 201: z.object({ eventoId: z.string().uuid(), vinculoStatusNovo: z.string() }) },
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant(); const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const vinculo = await db.query.vinculosFuncionais.findFirst({ where: (v, { eq, and, isNull }) => and(eq(v.id, req.params.id), isNull(v.deletedAt)) })
    if (!vinculo) throw app.httpErrors.notFound('Vinculo nao encontrado')

    const result = await db.transaction(async (tx) => {
      const [evento] = await tx.insert(tenantSchema.vinculosEventos).values({ vinculoId: req.params.id, tipoEvento: req.body.tipoEvento, dataEvento: req.body.dataEvento, statusAnterior: vinculo.status, statusNovo: req.body.statusNovo ?? vinculo.status, cargoAnteriorId: vinculo.cargoId, cargoNovoId: req.body.cargoNovoId ?? vinculo.cargoId, documentoReferencia: req.body.documentoReferencia ?? null, motivo: req.body.motivo, userId: req.tenantAuth!.sub }).returning({ id: tenantSchema.vinculosEventos.id })

      const vincUpdates: Record<string, unknown> = { updatedAt: new Date() }
      if (req.body.statusNovo && req.body.statusNovo !== vinculo.status) {
        vincUpdates.status = req.body.statusNovo
        if (req.body.statusNovo === 'exonerado') vincUpdates.dataExoneracao = req.body.dataEvento
        if (req.body.statusNovo === 'aposentado') vincUpdates.dataAposentadoria = req.body.dataEvento
        if (req.body.statusNovo === 'falecido') vincUpdates.dataFalecimento = req.body.dataEvento
      }
      if (req.body.cargoNovoId) vincUpdates.cargoId = req.body.cargoNovoId
      if (req.body.nivelReferenciaNovoId) vincUpdates.nivelReferenciaId = req.body.nivelReferenciaNovoId

      await tx.update(tenantSchema.vinculosFuncionais).set(vincUpdates).where(eq(tenantSchema.vinculosFuncionais.id, req.params.id))
      return { eventoId: evento!.id, statusFinal: (vincUpdates.status as string) ?? vinculo.status }
    })

    await db.insert(tenantSchema.tenantAuditLog).values({ userId: req.tenantAuth!.sub, action: `folha.vinculo.evento.${req.body.tipoEvento}`, resource: 'vinculo_funcional', resourceId: req.params.id, after: { tipoEvento: req.body.tipoEvento, statusNovo: req.body.statusNovo }, ipAddress: req.ip })
    return reply.status(201).send({ eventoId: result.eventoId, vinculoStatusNovo: result.statusFinal })
  })

  app.get('/:id/eventos', {
    preHandler: async (req) => req.requirePermission('folha:read'),
    schema: { tags: ['tenant-folha'], security: [{ bearerAuth: [] }, { tenantCookie: [] }], params: z.object({ id: z.string().uuid() }),
      response: { 200: z.array(z.object({ id: z.string().uuid(), tipoEvento: z.string(), dataEvento: z.string(), statusAnterior: z.string().nullable(), statusNovo: z.string().nullable(), motivo: z.string(), documentoReferencia: z.string().nullable(), registradoEm: z.string() })) },
    },
  }, async (req) => {
    const tenant = await req.resolveTenant(); const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const result = await db.execute(sql`SELECT id, tipo_evento, data_evento, status_anterior, status_novo, motivo, documento_referencia, registrado_em FROM vinculos_eventos WHERE vinculo_id = ${req.params.id} ORDER BY data_evento ASC, registrado_em ASC`)
    return (result as unknown as Array<Record<string, unknown>>).map((r) => ({ id: String(r.id), tipoEvento: String(r.tipo_evento), dataEvento: String(r.data_evento), statusAnterior: r.status_anterior ? String(r.status_anterior) : null, statusNovo: r.status_novo ? String(r.status_novo) : null, motivo: String(r.motivo), documentoReferencia: r.documento_referencia ? String(r.documento_referencia) : null, registradoEm: new Date(r.registrado_em as string).toISOString() }))
  })

  app.post('/:id/rubricas', {
    preHandler: async (req) => req.requirePermission('folha:cadastros'),
    schema: { tags: ['tenant-folha'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }], params: z.object({ id: z.string().uuid() }),
      body: z.object({ rubricaId: z.string().uuid(), valor: z.coerce.number().optional(), percentual: z.coerce.number().optional(), quantidade: z.coerce.number().optional(), vigenciaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), vigenciaFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), documentoReferencia: z.string().max(200).optional(), observacoes: z.string().max(500).optional() }),
      response: { 201: z.object({ id: z.string().uuid() }) },
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant(); const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const [created] = await db.insert(tenantSchema.rubricasVinculos).values({ vinculoId: req.params.id, rubricaId: req.body.rubricaId, valor: req.body.valor?.toFixed(2) ?? null, percentual: req.body.percentual?.toFixed(4) ?? null, quantidade: req.body.quantidade?.toFixed(2) ?? null, vigenciaInicio: req.body.vigenciaInicio, vigenciaFim: req.body.vigenciaFim ?? null, documentoReferencia: req.body.documentoReferencia ?? null, observacoes: req.body.observacoes ?? null, createdBy: req.tenantAuth!.sub }).returning({ id: tenantSchema.rubricasVinculos.id })
    return reply.status(201).send({ id: created!.id })
  })
}
