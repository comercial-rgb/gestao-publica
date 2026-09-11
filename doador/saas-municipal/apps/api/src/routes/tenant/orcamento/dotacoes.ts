import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createTenantDatabase, tenantSchema, eq, sql } from '@saas-municipal/database'
import { env } from '../../../env.js'
import { paginationQuery, decodeCursor, paginatedResponse } from '../../../lib/pagination.js'

const dotacaoOut = z.object({
  id: z.string().uuid(), leiOrcamentariaId: z.string().uuid(), classificacaoCompleta: z.string(),
  entidadeId: z.string().uuid(), entidadeNome: z.string(),
  orgaoCodigo: z.string(), unidadeCodigo: z.string(), funcaoCodigo: z.string(), subfuncaoCodigo: z.string(),
  programaCodigo: z.string(), programaNome: z.string(), acaoCodigo: z.string(), acaoNome: z.string(),
  naturezaCategoria: z.string(), naturezaGrupo: z.string(), modalidadeCodigo: z.string(),
  naturezaElemento: z.string(), naturezaSubelemento: z.string().nullable(),
  fonteCodigo: z.string(), fonteDescricao: z.string(), indicadorResultadoPrimario: z.string().nullable(),
  valorInicial: z.string(), valorAtualizado: z.string(), valorReservado: z.string(),
  valorEmpenhado: z.string(), valorLiquidado: z.string(), valorPago: z.string(), ativo: z.boolean(),
})

function montarClassificacao(c: {
  orgao: string; unidade: string; funcao: string; subfuncao: string;
  programaCodigo: string; acaoCodigo: string;
  cat: string; grupo: string; modalidade: string; elemento: string; subelemento?: string | null;
  fonteCodigo: string; indResultPrim?: string | null;
}): string {
  return [c.orgao, c.unidade, c.funcao, c.subfuncao, c.programaCodigo, c.acaoCodigo,
    c.cat, c.grupo, c.modalidade, c.elemento, c.subelemento || '00', c.fonteCodigo, c.indResultPrim || '0'].join('.')
}

export const dotacoesRoute: FastifyPluginAsyncZod = async (app) => {
  app.get('/', {
    preHandler: async (req) => req.requirePermission('orcamento:read'),
    schema: {
      tags: ['tenant-orcamento'], security: [{ bearerAuth: [] }, { tenantCookie: [] }],
      querystring: paginationQuery.extend({
        leiOrcamentariaId: z.string().uuid().optional(), exercicioId: z.string().uuid().optional(),
        entidadeId: z.string().uuid().optional(), programaId: z.string().uuid().optional(),
        funcaoCodigo: z.string().optional(), search: z.string().optional(),
      }),
      response: { 200: z.object({ items: z.array(dotacaoOut), pagination: z.object({ nextCursor: z.string().nullable(), limit: z.number() }) }) },
    },
  }, async (req) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const { limit } = req.query

    const rows = await db.query.dotacoes.findMany({
      where: (d, { eq, and, ilike }) => {
        const c = []
        if (req.query.leiOrcamentariaId) c.push(eq(d.leiOrcamentariaId, req.query.leiOrcamentariaId))
        if (req.query.exercicioId) c.push(eq(d.exercicioId, req.query.exercicioId))
        if (req.query.entidadeId) c.push(eq(d.entidadeId, req.query.entidadeId))
        if (req.query.programaId) c.push(eq(d.programaId, req.query.programaId))
        if (req.query.funcaoCodigo) c.push(eq(d.funcaoCodigo, req.query.funcaoCodigo))
        if (req.query.search) c.push(ilike(d.classificacaoCompleta, `%${req.query.search}%`))
        const cursorData = decodeCursor(req.query.cursor)
        if (cursorData) {
          c.push(
            // Use lt on createdAt for cursor-based pagination
          )
        }
        return c.length > 0 ? and(...c) : undefined
      },
      orderBy: (d, { asc }) => [asc(d.classificacaoCompleta)],
      limit: limit + 1,
      with: { entidade: { columns: { nome: true } }, programa: { columns: { codigo: true, nome: true } }, acao: { columns: { codigo: true, nome: true } }, modalidade: { columns: { codigo: true } }, fonte: { columns: { codigo: true, descricao: true } } },
    })

    const serialize = (d: (typeof rows)[number]) => ({
      id: d.id, leiOrcamentariaId: d.leiOrcamentariaId, classificacaoCompleta: d.classificacaoCompleta,
      entidadeId: d.entidadeId, entidadeNome: (d as Record<string, unknown>).entidade ? (((d as Record<string, unknown>).entidade as Record<string, string>).nome ?? '') : '',
      orgaoCodigo: d.orgaoCodigo, unidadeCodigo: d.unidadeCodigo, funcaoCodigo: d.funcaoCodigo, subfuncaoCodigo: d.subfuncaoCodigo,
      programaCodigo: (d as Record<string, unknown>).programa ? (((d as Record<string, unknown>).programa as Record<string, string>).codigo ?? '') : '',
      programaNome: (d as Record<string, unknown>).programa ? (((d as Record<string, unknown>).programa as Record<string, string>).nome ?? '') : '',
      acaoCodigo: (d as Record<string, unknown>).acao ? (((d as Record<string, unknown>).acao as Record<string, string>).codigo ?? '') : '',
      acaoNome: (d as Record<string, unknown>).acao ? (((d as Record<string, unknown>).acao as Record<string, string>).nome ?? '') : '',
      naturezaCategoria: d.naturezaCategoria, naturezaGrupo: d.naturezaGrupo,
      modalidadeCodigo: (d as Record<string, unknown>).modalidade ? (((d as Record<string, unknown>).modalidade as Record<string, string>).codigo ?? '') : '',
      naturezaElemento: d.naturezaElemento, naturezaSubelemento: d.naturezaSubelemento,
      fonteCodigo: (d as Record<string, unknown>).fonte ? (((d as Record<string, unknown>).fonte as Record<string, string>).codigo ?? '') : '',
      fonteDescricao: (d as Record<string, unknown>).fonte ? (((d as Record<string, unknown>).fonte as Record<string, string>).descricao ?? '') : '',
      indicadorResultadoPrimario: d.indicadorResultadoPrimario,
      valorInicial: d.valorInicial, valorAtualizado: d.valorAtualizado, valorReservado: d.valorReservado,
      valorEmpenhado: d.valorEmpenhado, valorLiquidado: d.valorLiquidado, valorPago: d.valorPago,
      ativo: d.ativo,
    })

    const paginated = paginatedResponse(rows, limit)
    return { items: paginated.items.map(serialize), pagination: paginated.pagination }
  })

  app.post('/', {
    preHandler: async (req) => req.requirePermission('orcamento:write'),
    schema: {
      tags: ['tenant-orcamento'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      body: z.object({
        leiOrcamentariaId: z.string().uuid(), exercicioId: z.string().uuid(), entidadeId: z.string().uuid(),
        orgaoCodigo: z.string().regex(/^\d{2}$/), unidadeCodigo: z.string().regex(/^\d{2}$/),
        funcaoCodigo: z.string().regex(/^\d{2}$/), subfuncaoCodigo: z.string().regex(/^\d{3}$/),
        programaId: z.string().uuid(), acaoId: z.string().uuid(),
        naturezaCategoria: z.string().regex(/^[34]$/), naturezaGrupo: z.string().regex(/^\d$/),
        modalidadeAplicacaoId: z.string().uuid(), naturezaElemento: z.string().regex(/^\d{2}$/),
        naturezaSubelemento: z.string().regex(/^\d{2}$/).optional(),
        fonteRecursoId: z.string().uuid(), indicadorResultadoPrimario: z.string().max(1).optional(),
        valorInicial: z.coerce.number().positive().multipleOf(0.01),
      }),
      response: { 201: z.object({ id: z.string().uuid(), classificacaoCompleta: z.string() }), 422: z.object({ error: z.string(), message: z.string() }) },
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

    const acao = await db.query.acoes.findFirst({ where: (a, { eq }) => eq(a.id, req.body.acaoId) })
    if (!acao || acao.programaId !== req.body.programaId) return reply.status(422).send({ error: 'AcaoInvalida', message: 'Acao nao pertence ao programa' })

    const [programa, modalidade, fonte] = await Promise.all([
      db.query.programas.findFirst({ where: (p, { eq }) => eq(p.id, req.body.programaId) }),
      db.query.modalidadesAplicacao.findFirst({ where: (m, { eq }) => eq(m.id, req.body.modalidadeAplicacaoId) }),
      db.query.fontesRecurso.findFirst({ where: (f, { eq }) => eq(f.id, req.body.fonteRecursoId) }),
    ])
    if (!programa || !modalidade || !fonte) throw app.httpErrors.notFound('Programa, modalidade ou fonte nao encontrados')

    const classificacao = montarClassificacao({
      orgao: req.body.orgaoCodigo, unidade: req.body.unidadeCodigo, funcao: req.body.funcaoCodigo, subfuncao: req.body.subfuncaoCodigo,
      programaCodigo: programa.codigo, acaoCodigo: acao.codigo,
      cat: req.body.naturezaCategoria, grupo: req.body.naturezaGrupo, modalidade: modalidade.codigo,
      elemento: req.body.naturezaElemento, subelemento: req.body.naturezaSubelemento,
      fonteCodigo: fonte.codigo, indResultPrim: req.body.indicadorResultadoPrimario,
    })

    const valorStr = req.body.valorInicial.toFixed(2)
    const [inserted] = await db.insert(tenantSchema.dotacoes).values({
      leiOrcamentariaId: req.body.leiOrcamentariaId, exercicioId: req.body.exercicioId, classificacaoCompleta: classificacao,
      entidadeId: req.body.entidadeId, orgaoCodigo: req.body.orgaoCodigo, unidadeCodigo: req.body.unidadeCodigo,
      funcaoCodigo: req.body.funcaoCodigo, subfuncaoCodigo: req.body.subfuncaoCodigo,
      programaId: req.body.programaId, acaoId: req.body.acaoId,
      naturezaCategoria: req.body.naturezaCategoria, naturezaGrupo: req.body.naturezaGrupo,
      modalidadeAplicacaoId: req.body.modalidadeAplicacaoId, naturezaElemento: req.body.naturezaElemento,
      naturezaSubelemento: req.body.naturezaSubelemento ?? null,
      fonteRecursoId: req.body.fonteRecursoId, indicadorResultadoPrimario: req.body.indicadorResultadoPrimario ?? null,
      valorInicial: valorStr, valorAtualizado: valorStr, ativo: true, createdBy: req.tenantAuth!.sub,
    }).returning()
    if (!inserted) throw app.httpErrors.internalServerError('Falha ao criar dotacao')

    await db.insert(tenantSchema.tenantAuditLog).values({
      userId: req.tenantAuth!.sub, action: 'orcamento.dotacao.create', resource: 'dotacao', resourceId: inserted.id,
      after: { classificacao, valor: valorStr }, ipAddress: req.ip,
    })
    return reply.status(201).send({ id: inserted.id, classificacaoCompleta: classificacao })
  })

  app.get('/:id/saldo', {
    preHandler: async (req) => req.requirePermission('orcamento:read'),
    schema: {
      tags: ['tenant-orcamento'], security: [{ bearerAuth: [] }, { tenantCookie: [] }],
      params: z.object({ id: z.string().uuid() }),
      response: { 200: z.object({
        valorInicial: z.string(), valorAtualizado: z.string(), valorReservado: z.string(),
        valorEmpenhado: z.string(), valorLiquidado: z.string(), valorPago: z.string(),
        saldoDisponivel: z.string(), saldoAEmpenhar: z.string(),
        percentualEmpenhado: z.number(), percentualLiquidado: z.number(), percentualPago: z.number(),
      }) },
    },
  }, async (req) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const d = await db.query.dotacoes.findFirst({ where: (x, { eq }) => eq(x.id, req.params.id) })
    if (!d) throw app.httpErrors.notFound('Dotacao nao encontrada')
    const at = Number(d.valorAtualizado); const res = Number(d.valorReservado)
    const emp = Number(d.valorEmpenhado); const liq = Number(d.valorLiquidado); const pg = Number(d.valorPago)
    return {
      valorInicial: d.valorInicial, valorAtualizado: d.valorAtualizado, valorReservado: d.valorReservado,
      valorEmpenhado: d.valorEmpenhado, valorLiquidado: d.valorLiquidado, valorPago: d.valorPago,
      saldoDisponivel: (at - res - emp).toFixed(2), saldoAEmpenhar: (at - emp).toFixed(2),
      percentualEmpenhado: at > 0 ? Number(((emp / at) * 100).toFixed(2)) : 0,
      percentualLiquidado: at > 0 ? Number(((liq / at) * 100).toFixed(2)) : 0,
      percentualPago: at > 0 ? Number(((pg / at) * 100).toFixed(2)) : 0,
    }
  })

  app.get('/:id/historico', {
    preHandler: async (req) => req.requirePermission('orcamento:read'),
    schema: {
      tags: ['tenant-orcamento'], security: [{ bearerAuth: [] }, { tenantCookie: [] }],
      params: z.object({ id: z.string().uuid() }),
      response: { 200: z.array(z.object({
        id: z.string().uuid(), creditoId: z.string().uuid().nullable(), creditoNumero: z.string().nullable(),
        valorAnterior: z.string(), valorNovo: z.string(), delta: z.string(), motivo: z.string(), registradoEm: z.string(),
      })) },
    },
  }, async (req) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const result = await db.execute(sql`
      SELECT h.id, h.credito_id, c.numero AS credito_numero, h.valor_anterior, h.valor_novo, h.delta, h.motivo, h.registrado_em
      FROM dotacoes_historico_valor h LEFT JOIN creditos_orcamentarios c ON c.id = h.credito_id
      WHERE h.dotacao_id = ${req.params.id} ORDER BY h.registrado_em DESC
    `)
    return (result as unknown as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id), creditoId: r.credito_id ? String(r.credito_id) : null, creditoNumero: r.credito_numero ? String(r.credito_numero) : null,
      valorAnterior: String(r.valor_anterior), valorNovo: String(r.valor_novo), delta: String(r.delta),
      motivo: String(r.motivo), registradoEm: new Date(r.registrado_em as string).toISOString(),
    }))
  })
}
