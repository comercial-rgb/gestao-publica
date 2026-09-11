import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createTenantDatabase, tenantSchema, eq, and, gte, lte, desc, isNull } from '@saas-municipal/database'
import { env } from '../../../env.js'
import { validarDataArrecadacao } from '../../../lib/fiscal.js'

const formaPagamentoEnum = z.enum([
  'pix', 'boleto', 'debito_automatico', 'cartao_credito', 'cartao_debito',
  'dinheiro', 'transferencia', 'cheque', 'compensacao', 'outros',
])

const arrecadacaoOut = z.object({
  id: z.string().uuid(),
  lancamentoId: z.string().uuid(),
  naturezaCodigo: z.string(),
  naturezaDescricao: z.string(),
  contribuintePessoaId: z.string().uuid().nullable(),
  contribuinteNome: z.string().nullable(),
  contribuinteDocumento: z.string().nullable(),
  dataArrecadacao: z.string(),
  valor: z.string(),
  formaPagamento: z.string(),
  numeroDocumento: z.string().nullable(),
  referencia: z.string().nullable(),
  observacoes: z.string().nullable(),
  anuladoEm: z.string().nullable(),
  createdAt: z.string(),
})

export const arrecadacoesRoute: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/',
    {
      preHandler: async (req) => req.requirePermission('receitas:read'),
      schema: {
        tags: ['tenant-receitas'],
        security: [{ bearerAuth: [] }, { tenantCookie: [] }],
        querystring: z.object({
          lancamentoId: z.string().uuid().optional(),
          contribuintePessoaId: z.string().uuid().optional(),
          dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          formaPagamento: formaPagamentoEnum.optional(),
          incluirAnuladas: z.coerce.boolean().default(false),
          limit: z.coerce.number().int().min(1).max(100).default(25),
        }),
        response: { 200: z.array(arrecadacaoOut) },
      },
    },
    async (req) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

      const conds = []
      if (req.query.lancamentoId) conds.push(eq(tenantSchema.receitasArrecadacoes.lancamentoId, req.query.lancamentoId))
      if (req.query.contribuintePessoaId) conds.push(eq(tenantSchema.receitasArrecadacoes.contribuintePessoaId, req.query.contribuintePessoaId))
      if (req.query.formaPagamento) conds.push(eq(tenantSchema.receitasArrecadacoes.formaPagamento, req.query.formaPagamento))
      if (req.query.dataInicio) conds.push(gte(tenantSchema.receitasArrecadacoes.dataArrecadacao, req.query.dataInicio))
      if (req.query.dataFim) conds.push(lte(tenantSchema.receitasArrecadacoes.dataArrecadacao, req.query.dataFim))
      if (!req.query.incluirAnuladas) conds.push(isNull(tenantSchema.receitasArrecadacoes.anuladoEm))

      const rows = await db
        .select({
          id: tenantSchema.receitasArrecadacoes.id,
          lancamentoId: tenantSchema.receitasArrecadacoes.lancamentoId,
          naturezaCodigo: tenantSchema.receitasNaturezas.codigoCompleto,
          naturezaDescricao: tenantSchema.receitasNaturezas.descricao,
          contribuintePessoaId: tenantSchema.receitasArrecadacoes.contribuintePessoaId,
          contribuinteNome: tenantSchema.pessoas.nome,
          contribuinteDocumento: tenantSchema.pessoas.documento,
          dataArrecadacao: tenantSchema.receitasArrecadacoes.dataArrecadacao,
          valor: tenantSchema.receitasArrecadacoes.valor,
          formaPagamento: tenantSchema.receitasArrecadacoes.formaPagamento,
          numeroDocumento: tenantSchema.receitasArrecadacoes.numeroDocumento,
          referencia: tenantSchema.receitasArrecadacoes.referencia,
          observacoes: tenantSchema.receitasArrecadacoes.observacoes,
          anuladoEm: tenantSchema.receitasArrecadacoes.anuladoEm,
          createdAt: tenantSchema.receitasArrecadacoes.createdAt,
        })
        .from(tenantSchema.receitasArrecadacoes)
        .innerJoin(tenantSchema.receitasLancamentos, eq(tenantSchema.receitasArrecadacoes.lancamentoId, tenantSchema.receitasLancamentos.id))
        .innerJoin(tenantSchema.receitasTipos, eq(tenantSchema.receitasLancamentos.tipoReceitaId, tenantSchema.receitasTipos.id))
        .innerJoin(tenantSchema.receitasNaturezas, eq(tenantSchema.receitasTipos.naturezaId, tenantSchema.receitasNaturezas.id))
        .leftJoin(tenantSchema.pessoas, eq(tenantSchema.receitasArrecadacoes.contribuintePessoaId, tenantSchema.pessoas.id))
        .where(conds.length > 0 ? and(...conds) : undefined)
        .orderBy(desc(tenantSchema.receitasArrecadacoes.dataArrecadacao))
        .limit(req.query.limit)

      return rows.map((r) => ({
        id: r.id, lancamentoId: r.lancamentoId,
        naturezaCodigo: r.naturezaCodigo, naturezaDescricao: r.naturezaDescricao,
        contribuintePessoaId: r.contribuintePessoaId,
        contribuinteNome: r.contribuinteNome, contribuinteDocumento: r.contribuinteDocumento,
        dataArrecadacao: r.dataArrecadacao.toString(),
        valor: r.valor, formaPagamento: r.formaPagamento,
        numeroDocumento: r.numeroDocumento, referencia: r.referencia,
        observacoes: r.observacoes,
        anuladoEm: r.anuladoEm?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      }))
    },
  )

  app.post(
    '/',
    {
      preHandler: async (req) => req.requirePermission('receitas:arrecadar'),
      schema: {
        tags: ['tenant-receitas'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        body: z.object({
          lancamentoId: z.string().uuid(),
          contribuintePessoaId: z.string().uuid().optional(),
          contribuinteDocumento: z.string().regex(/^\d{11}$|^\d{14}$/).optional(),
          dataArrecadacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          valor: z.coerce.number().positive().multipleOf(0.01),
          formaPagamento: formaPagamentoEnum,
          numeroDocumento: z.string().max(100).optional(),
          referencia: z.string().max(100).optional(),
          observacoes: z.string().max(2000).optional(),
        }),
        response: {
          201: z.object({ id: z.string().uuid() }),
          422: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

      let mesFiscalId: string
      try {
        const periodo = await validarDataArrecadacao(env.DATABASE_URL, tenant.schemaName, req.body.dataArrecadacao)
        mesFiscalId = periodo.mesFiscalId
      } catch (err) {
        return reply.status(422).send({ error: 'PeriodoFiscalFechado', message: (err as Error).message })
      }

      const lancamento = await db.query.receitasLancamentos.findFirst({
        where: (l, { eq }) => eq(l.id, req.body.lancamentoId),
      })
      if (!lancamento || !lancamento.ativo) throw app.httpErrors.notFound('Lançamento não encontrado ou inativo')

      let contribuintePessoaId: string | null = null
      if (req.body.contribuintePessoaId) {
        contribuintePessoaId = req.body.contribuintePessoaId
      } else if (req.body.contribuinteDocumento) {
        const pessoa = await db.query.pessoas.findFirst({
          where: (p, { eq, isNull, and: a }) => a(eq(p.documento, req.body.contribuinteDocumento!), isNull(p.deletedAt)),
        })
        if (pessoa) contribuintePessoaId = pessoa.id
      }

      const valorStr = req.body.valor.toFixed(2)
      const [inserted] = await db.insert(tenantSchema.receitasArrecadacoes).values({
        lancamentoId: req.body.lancamentoId,
        mesFiscalId,
        contribuintePessoaId,
        dataArrecadacao: req.body.dataArrecadacao,
        valor: valorStr,
        formaPagamento: req.body.formaPagamento,
        numeroDocumento: req.body.numeroDocumento ?? null,
        referencia: req.body.referencia ?? null,
        observacoes: req.body.observacoes ?? null,
        createdBy: req.tenantAuth!.sub,
      }).returning()

      if (!inserted) throw app.httpErrors.internalServerError('Falha ao registrar arrecadação')

      await db.insert(tenantSchema.tenantAuditLog).values({
        userId: req.tenantAuth!.sub,
        action: 'receitas.arrecadacao.create',
        resource: 'receita_arrecadacao',
        resourceId: inserted.id,
        after: { valor: valorStr, data: req.body.dataArrecadacao, formaPagamento: req.body.formaPagamento },
        ipAddress: req.ip,
      })

      return reply.status(201).send({ id: inserted.id })
    },
  )

  app.get(
    '/:id',
    {
      preHandler: async (req) => req.requirePermission('receitas:read'),
      schema: {
        tags: ['tenant-receitas'],
        security: [{ bearerAuth: [] }, { tenantCookie: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: { 200: arrecadacaoOut },
      },
    },
    async (req) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

      const rows = await db
        .select({
          id: tenantSchema.receitasArrecadacoes.id,
          lancamentoId: tenantSchema.receitasArrecadacoes.lancamentoId,
          naturezaCodigo: tenantSchema.receitasNaturezas.codigoCompleto,
          naturezaDescricao: tenantSchema.receitasNaturezas.descricao,
          contribuintePessoaId: tenantSchema.receitasArrecadacoes.contribuintePessoaId,
          contribuinteNome: tenantSchema.pessoas.nome,
          contribuinteDocumento: tenantSchema.pessoas.documento,
          dataArrecadacao: tenantSchema.receitasArrecadacoes.dataArrecadacao,
          valor: tenantSchema.receitasArrecadacoes.valor,
          formaPagamento: tenantSchema.receitasArrecadacoes.formaPagamento,
          numeroDocumento: tenantSchema.receitasArrecadacoes.numeroDocumento,
          referencia: tenantSchema.receitasArrecadacoes.referencia,
          observacoes: tenantSchema.receitasArrecadacoes.observacoes,
          anuladoEm: tenantSchema.receitasArrecadacoes.anuladoEm,
          createdAt: tenantSchema.receitasArrecadacoes.createdAt,
        })
        .from(tenantSchema.receitasArrecadacoes)
        .innerJoin(tenantSchema.receitasLancamentos, eq(tenantSchema.receitasArrecadacoes.lancamentoId, tenantSchema.receitasLancamentos.id))
        .innerJoin(tenantSchema.receitasTipos, eq(tenantSchema.receitasLancamentos.tipoReceitaId, tenantSchema.receitasTipos.id))
        .innerJoin(tenantSchema.receitasNaturezas, eq(tenantSchema.receitasTipos.naturezaId, tenantSchema.receitasNaturezas.id))
        .leftJoin(tenantSchema.pessoas, eq(tenantSchema.receitasArrecadacoes.contribuintePessoaId, tenantSchema.pessoas.id))
        .where(eq(tenantSchema.receitasArrecadacoes.id, req.params.id))
        .limit(1)

      if (rows.length === 0) throw app.httpErrors.notFound('Arrecadação não encontrada')
      const r = rows[0]!
      return {
        id: r.id, lancamentoId: r.lancamentoId,
        naturezaCodigo: r.naturezaCodigo, naturezaDescricao: r.naturezaDescricao,
        contribuintePessoaId: r.contribuintePessoaId,
        contribuinteNome: r.contribuinteNome, contribuinteDocumento: r.contribuinteDocumento,
        dataArrecadacao: r.dataArrecadacao.toString(),
        valor: r.valor, formaPagamento: r.formaPagamento,
        numeroDocumento: r.numeroDocumento, referencia: r.referencia,
        observacoes: r.observacoes,
        anuladoEm: r.anuladoEm?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      }
    },
  )
}
