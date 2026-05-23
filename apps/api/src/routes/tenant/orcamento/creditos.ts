import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createTenantDatabase, tenantSchema, eq, and, sql } from '@saas-municipal/database'
import { env } from '../../../env.js'

const creditoOut = z.object({
  id: z.string().uuid(), numero: z.string(), tipo: z.string(), origem: z.string(),
  valor: z.string(), dataDecreto: z.string(), dataPublicacao: z.string().nullable(),
  justificativa: z.string(), status: z.string(), aplicadoEm: z.string().nullable(),
})

export const creditosRoute: FastifyPluginAsyncZod = async (app) => {
  app.get('/', {
    preHandler: async (req) => req.requirePermission('orcamento:read'),
    schema: {
      tags: ['tenant-orcamento'], security: [{ bearerAuth: [] }, { tenantCookie: [] }],
      querystring: z.object({ exercicioId: z.string().uuid().optional(), status: z.string().optional() }),
      response: { 200: z.array(creditoOut) },
    },
  }, async (req) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const rows = await db.query.creditosOrcamentarios.findMany({
      where: (c, { eq, and }) => {
        const conds = []
        if (req.query.exercicioId) conds.push(eq(c.exercicioId, req.query.exercicioId))
        if (req.query.status) conds.push(eq(c.status, req.query.status as 'em_elaboracao'))
        return conds.length > 0 ? and(...conds) : undefined
      },
      orderBy: (c, { desc }) => desc(c.dataDecreto),
    })
    return rows.map((r) => ({
      id: r.id, numero: r.numero, tipo: r.tipo, origem: r.origem, valor: r.valor,
      dataDecreto: r.dataDecreto.toString(), dataPublicacao: r.dataPublicacao?.toString() ?? null,
      justificativa: r.justificativa, status: r.status, aplicadoEm: r.aplicadoEm?.toISOString() ?? null,
    }))
  })

  app.post('/', {
    preHandler: async (req) => req.requirePermission('orcamento:write'),
    schema: {
      tags: ['tenant-orcamento'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      body: z.object({
        exercicioId: z.string().uuid(), leiOrcamentariaId: z.string().uuid(),
        numero: z.string().min(3).max(50),
        tipo: z.enum(['suplementar', 'especial', 'extraordinario']),
        origem: z.enum(['superavit_financeiro', 'excesso_arrecadacao', 'anulacao_dotacao', 'operacao_credito', 'reserva_contingencia']),
        valor: z.coerce.number().positive(),
        dataDecreto: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        dataPublicacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        justificativa: z.string().min(30).max(5000),
      }),
      response: { 201: z.object({ id: z.string().uuid() }) },
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const [inserted] = await db.insert(tenantSchema.creditosOrcamentarios).values({
      exercicioId: req.body.exercicioId, leiOrcamentariaId: req.body.leiOrcamentariaId,
      numero: req.body.numero, tipo: req.body.tipo, origem: req.body.origem,
      valor: req.body.valor.toFixed(2), dataDecreto: req.body.dataDecreto,
      dataPublicacao: req.body.dataPublicacao ?? null, justificativa: req.body.justificativa,
      status: 'em_elaboracao', createdBy: req.tenantAuth!.sub,
    }).returning()
    if (!inserted) throw app.httpErrors.internalServerError('Falha ao criar credito')
    await db.insert(tenantSchema.tenantAuditLog).values({
      userId: req.tenantAuth!.sub, action: 'orcamento.credito.create', resource: 'credito_orcamentario', resourceId: inserted.id,
      after: { numero: req.body.numero, tipo: req.body.tipo, valor: req.body.valor.toFixed(2) }, ipAddress: req.ip,
    })
    return reply.status(201).send({ id: inserted.id })
  })

  app.post('/:id/dotacoes', {
    preHandler: async (req) => req.requirePermission('orcamento:write'),
    schema: {
      tags: ['tenant-orcamento'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      params: z.object({ id: z.string().uuid() }),
      body: z.object({
        dotacaoId: z.string().uuid(),
        sinal: z.number().int().refine((n) => n === 1 || n === -1),
        valor: z.coerce.number().positive(),
      }),
      response: { 201: z.object({ id: z.string().uuid() }) },
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const credito = await db.query.creditosOrcamentarios.findFirst({ where: (c, { eq }) => eq(c.id, req.params.id) })
    if (!credito) throw app.httpErrors.notFound('Credito nao encontrado')
    if (credito.status !== 'em_elaboracao') throw app.httpErrors.conflict('Credito nao esta em elaboracao')
    const [inserted] = await db.insert(tenantSchema.creditosDotacoes).values({
      creditoId: req.params.id, dotacaoId: req.body.dotacaoId, sinal: req.body.sinal, valor: req.body.valor.toFixed(2),
    }).returning()
    if (!inserted) throw app.httpErrors.internalServerError('Falha ao adicionar linha')
    return reply.status(201).send({ id: inserted.id })
  })

  app.get('/:id/dotacoes', {
    preHandler: async (req) => req.requirePermission('orcamento:read'),
    schema: {
      tags: ['tenant-orcamento'], security: [{ bearerAuth: [] }, { tenantCookie: [] }],
      params: z.object({ id: z.string().uuid() }),
      response: { 200: z.array(z.object({
        id: z.string().uuid(), dotacaoId: z.string().uuid(), classificacaoCompleta: z.string(),
        sinal: z.number(), valor: z.string(),
      })) },
    },
  }, async (req) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const rows = await db.query.creditosDotacoes.findMany({
      where: (cd, { eq }) => eq(cd.creditoId, req.params.id),
      with: { dotacao: { columns: { classificacaoCompleta: true } } },
    })
    return rows.map((r) => ({
      id: r.id, dotacaoId: r.dotacaoId,
      classificacaoCompleta: (r as Record<string, unknown>).dotacao
        ? (((r as Record<string, unknown>).dotacao as Record<string, string>).classificacaoCompleta ?? '')
        : '',
      sinal: r.sinal, valor: r.valor,
    }))
  })

  app.patch('/:id/status', {
    preHandler: async (req) => req.requirePermission('orcamento:aprovar_credito'),
    schema: {
      tags: ['tenant-orcamento'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      params: z.object({ id: z.string().uuid() }),
      body: z.object({ status: z.enum(['aprovado', 'cancelado']) }),
      response: { 204: z.null() },
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const before = await db.query.creditosOrcamentarios.findFirst({ where: (c, { eq }) => eq(c.id, req.params.id) })
    if (!before) throw app.httpErrors.notFound('Credito nao encontrado')
    if (before.status !== 'em_elaboracao') throw app.httpErrors.conflict(`Credito esta ${before.status}, nao pode mudar para ${req.body.status}`)
    await db.update(tenantSchema.creditosOrcamentarios).set({ status: req.body.status, updatedAt: new Date() }).where(eq(tenantSchema.creditosOrcamentarios.id, req.params.id))
    await db.insert(tenantSchema.tenantAuditLog).values({
      userId: req.tenantAuth!.sub, action: `orcamento.credito.${req.body.status}`, resource: 'credito_orcamentario', resourceId: req.params.id,
      before: { status: before.status }, after: { status: req.body.status }, ipAddress: req.ip,
    })
    return reply.status(204).send(null)
  })

  // ─── GET /:id (detalhe com linhas + simulacao) ──────
  app.get('/:id', {
    preHandler: async (req) => req.requirePermission('orcamento:read'),
    schema: {
      tags: ['tenant-orcamento'], security: [{ bearerAuth: [] }, { tenantCookie: [] }],
      params: z.object({ id: z.string().uuid() }),
      response: { 200: z.object({
        id: z.string().uuid(), numero: z.string(), tipo: z.string(), origem: z.string(), valor: z.string(),
        dataDecreto: z.string(), dataPublicacao: z.string().nullable(), justificativa: z.string(),
        status: z.string(), aplicadoEm: z.string().nullable(),
        leiOrcamentariaId: z.string().uuid(), leiNumero: z.string(),
        exercicioId: z.string().uuid(), exercicioAno: z.number(),
        linhas: z.array(z.object({
          id: z.string().uuid(), dotacaoId: z.string().uuid(), classificacaoCompleta: z.string(),
          programaNome: z.string(), sinal: z.number(), valor: z.string(),
          valorAtualizadoAtual: z.string(), valorAtualizadoSimulado: z.string(), saldoSimuladoNegativo: z.boolean(),
        })),
        totais: z.object({ somaReforcos: z.string(), somaAnulacoes: z.string(), saldoLiquido: z.string(), linhasComProblema: z.number() }),
      }) },
    },
  }, async (req) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

    const cResult = await db.execute(sql`
      SELECT c.id, c.numero, c.tipo, c.origem, c.valor::text AS valor, c.data_decreto, c.data_publicacao,
        c.justificativa, c.status, c.aplicado_em, c.lei_orcamentaria_id, l.numero AS lei_numero,
        c.exercicio_id, e.ano AS exercicio_ano
      FROM creditos_orcamentarios c
      INNER JOIN leis_orcamentarias l ON l.id = c.lei_orcamentaria_id
      INNER JOIN exercicios e ON e.id = c.exercicio_id
      WHERE c.id = ${req.params.id}
    `)
    if ((cResult as unknown as unknown[]).length === 0) throw app.httpErrors.notFound('Credito nao encontrado')
    const c = (cResult as unknown as Array<Record<string, unknown>>)[0]!

    const linhasResult = await db.execute(sql`
      SELECT cd.id, cd.dotacao_id, cd.sinal, cd.valor::text AS valor, d.classificacao_completa,
        p.nome AS programa_nome, d.valor_atualizado::text AS valor_atualizado_atual
      FROM creditos_dotacoes cd
      INNER JOIN dotacoes d ON d.id = cd.dotacao_id
      INNER JOIN programas p ON p.id = d.programa_id
      WHERE cd.credito_id = ${req.params.id}
      ORDER BY cd.sinal DESC, d.classificacao_completa ASC
    `)

    let somaReforcos = 0; let somaAnulacoes = 0; let linhasComProblema = 0
    const linhas = (linhasResult as unknown as Array<Record<string, unknown>>).map((l) => {
      const val = Number(l.valor); const atual = Number(l.valor_atualizado_atual)
      const delta = Number(l.sinal) * val; const simulado = atual + delta
      if (Number(l.sinal) === 1) somaReforcos += val; else somaAnulacoes += val
      const neg = simulado < 0; if (neg) linhasComProblema++
      return {
        id: String(l.id), dotacaoId: String(l.dotacao_id), classificacaoCompleta: String(l.classificacao_completa),
        programaNome: String(l.programa_nome), sinal: Number(l.sinal), valor: String(l.valor),
        valorAtualizadoAtual: String(l.valor_atualizado_atual), valorAtualizadoSimulado: simulado.toFixed(2),
        saldoSimuladoNegativo: neg,
      }
    })

    return {
      id: String(c.id), numero: String(c.numero), tipo: String(c.tipo), origem: String(c.origem), valor: String(c.valor),
      dataDecreto: String(c.data_decreto), dataPublicacao: c.data_publicacao ? String(c.data_publicacao) : null,
      justificativa: String(c.justificativa), status: String(c.status),
      aplicadoEm: c.aplicado_em ? new Date(c.aplicado_em as string).toISOString() : null,
      leiOrcamentariaId: String(c.lei_orcamentaria_id), leiNumero: String(c.lei_numero),
      exercicioId: String(c.exercicio_id), exercicioAno: Number(c.exercicio_ano),
      linhas,
      totais: { somaReforcos: somaReforcos.toFixed(2), somaAnulacoes: somaAnulacoes.toFixed(2), saldoLiquido: (somaReforcos - somaAnulacoes).toFixed(2), linhasComProblema },
    }
  })

  // ─── DELETE /:id/dotacoes/:linhaId ──────────────────
  app.delete('/:id/dotacoes/:linhaId', {
    preHandler: async (req) => req.requirePermission('orcamento:write'),
    schema: {
      tags: ['tenant-orcamento'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      params: z.object({ id: z.string().uuid(), linhaId: z.string().uuid() }),
      response: { 204: z.null() },
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
    const credito = await db.query.creditosOrcamentarios.findFirst({ where: (c, { eq }) => eq(c.id, req.params.id) })
    if (!credito) throw app.httpErrors.notFound('Credito nao encontrado')
    if (credito.status !== 'em_elaboracao') throw app.httpErrors.conflict('Apenas creditos em elaboracao permitem remocao de linhas')
    const result = await db.delete(tenantSchema.creditosDotacoes).where(
      and(eq(tenantSchema.creditosDotacoes.id, req.params.linhaId), eq(tenantSchema.creditosDotacoes.creditoId, req.params.id))
    ).returning({ id: tenantSchema.creditosDotacoes.id })
    if (result.length === 0) throw app.httpErrors.notFound('Linha nao encontrada')
    return reply.status(204).send(null)
  })

  // ─── POST /:id/aplicar ─────────────────────────────
  app.post('/:id/aplicar', {
    preHandler: async (req) => req.requirePermission('orcamento:aprovar_credito'),
    schema: {
      tags: ['tenant-orcamento'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      params: z.object({ id: z.string().uuid() }),
      body: z.object({ confirmNumero: z.string() }),
      response: {
        200: z.object({ status: z.literal('aplicado'), aplicadoEm: z.string(), linhasAfetadas: z.number(), totalDelta: z.string() }),
        422: z.object({ error: z.string(), message: z.string(), problemas: z.array(z.object({ dotacaoId: z.string().uuid(), classificacao: z.string(), motivo: z.string() })).optional() }),
      },
    },
  }, async (req, reply) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

    const credito = await db.query.creditosOrcamentarios.findFirst({ where: (c, { eq }) => eq(c.id, req.params.id) })
    if (!credito) throw app.httpErrors.notFound('Credito nao encontrado')
    if (credito.numero !== req.body.confirmNumero) {
      return reply.status(422).send({ error: 'ConfirmacaoIncorreta', message: 'Numero do credito nao confere' })
    }
    if (credito.status !== 'aprovado') {
      return reply.status(422).send({ error: 'StatusInvalido', message: `Credito em status "${credito.status}". Apenas "aprovado" pode ser aplicado.` })
    }

    const linhasResult = await db.execute(sql`
      SELECT cd.id AS linha_id, cd.dotacao_id, cd.sinal, cd.valor::text AS valor,
        d.classificacao_completa, d.valor_atualizado::text AS valor_atual,
        d.valor_empenhado::text AS valor_empenhado, d.valor_reservado::text AS valor_reservado
      FROM creditos_dotacoes cd INNER JOIN dotacoes d ON d.id = cd.dotacao_id
      WHERE cd.credito_id = ${req.params.id}
    `)
    const linhas = linhasResult as unknown as Array<Record<string, unknown>>
    if (linhas.length === 0) {
      return reply.status(422).send({ error: 'SemLinhas', message: 'Credito sem dotacoes afetadas' })
    }

    const problemas: Array<{ dotacaoId: string; classificacao: string; motivo: string }> = []
    const updates: Array<{ dotacaoId: string; valorAnterior: string; valorNovo: string; delta: number }> = []

    for (const l of linhas) {
      const atual = Number(l.valor_atual); const emp = Number(l.valor_empenhado); const res = Number(l.valor_reservado)
      const val = Number(l.valor); const delta = Number(l.sinal) * val; const novo = atual + delta
      if (novo < 0) { problemas.push({ dotacaoId: String(l.dotacao_id), classificacao: String(l.classificacao_completa), motivo: `Anulacao deixaria valor negativo (atual: R$ ${atual.toFixed(2)})` }); continue }
      if (Number(l.sinal) === -1 && novo < emp + res) { problemas.push({ dotacaoId: String(l.dotacao_id), classificacao: String(l.classificacao_completa), motivo: `Valor simulado (R$ ${novo.toFixed(2)}) abaixo de empenhado+reservado (R$ ${(emp + res).toFixed(2)})` }); continue }
      updates.push({ dotacaoId: String(l.dotacao_id), valorAnterior: String(l.valor_atual), valorNovo: novo.toFixed(2), delta })
    }

    if (problemas.length > 0) {
      return reply.status(422).send({ error: 'AplicacaoBloqueada', message: `${problemas.length} dotacao(oes) impedem a aplicacao`, problemas })
    }

    const aplicadoEm = new Date()
    const motivo = `Credito ${credito.tipo} ${credito.numero} (${credito.origem})`

    await db.transaction(async (tx) => {
      for (const u of updates) {
        await tx.update(tenantSchema.dotacoes).set({ valorAtualizado: u.valorNovo, updatedAt: aplicadoEm }).where(eq(tenantSchema.dotacoes.id, u.dotacaoId))
        await tx.insert(tenantSchema.dotacoesHistoricoValor).values({
          dotacaoId: u.dotacaoId, creditoId: req.params.id, valorAnterior: u.valorAnterior,
          valorNovo: u.valorNovo, delta: u.delta.toFixed(2), motivo,
          registradoEm: aplicadoEm, registradoPorUserId: req.tenantAuth!.sub,
        })
      }
      await tx.update(tenantSchema.creditosOrcamentarios).set({
        status: 'aplicado', aplicadoEm, aplicadoPorUserId: req.tenantAuth!.sub, updatedAt: aplicadoEm,
      }).where(eq(tenantSchema.creditosOrcamentarios.id, req.params.id))
    })

    await db.insert(tenantSchema.tenantAuditLog).values({
      userId: req.tenantAuth!.sub, action: 'orcamento.credito.aplicar', resource: 'credito_orcamentario', resourceId: req.params.id,
      after: { numero: credito.numero, linhasAfetadas: updates.length, totalDelta: updates.reduce((a, u) => a + u.delta, 0).toFixed(2) }, ipAddress: req.ip,
    })

    return { status: 'aplicado' as const, aplicadoEm: aplicadoEm.toISOString(), linhasAfetadas: updates.length, totalDelta: updates.reduce((a, u) => a + u.delta, 0).toFixed(2) }
  })
}
