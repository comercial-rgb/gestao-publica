/**
 * Cadastro base de Pessoas (PF/PJ).
 * Exemplo canônico de CRUD usando RBAC (permissions cadastros:read/write/delete).
 *
 *   GET    /tenant/pessoas
 *   POST   /tenant/pessoas
 *   GET    /tenant/pessoas/:id
 *   PATCH  /tenant/pessoas/:id
 *   DELETE /tenant/pessoas/:id
 */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createTenantDatabase, tenantSchema, eq, and, or, lt, isNull, sql } from '@saas-municipal/database'
import { env } from '../../env.js'
import { paginationQuery, decodeCursor, paginatedResponse } from '../../lib/pagination.js'

const pessoaPF = z.object({
  tipo: z.literal('PF'),
  documento: z.string().regex(/^\d{11}$/, 'CPF deve ter 11 dígitos'),
  nome: z.string().min(3).max(200),
  rg: z.string().max(20).optional(),
  dataNascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sexo: z.enum(['M', 'F', 'O']).optional(),
  estadoCivil: z.string().max(20).optional(),
})

const pessoaPJ = z.object({
  tipo: z.literal('PJ'),
  documento: z.string().regex(/^\d{14}$/, 'CNPJ deve ter 14 dígitos'),
  nome: z.string().min(3).max(200),
  nomeFantasia: z.string().max(200).optional(),
  inscricaoEstadual: z.string().max(30).optional(),
  inscricaoMunicipal: z.string().max(30).optional(),
})

const enderecoEContato = z.object({
  email: z.string().email().optional(),
  telefone: z.string().max(20).optional(),
  cep: z.string().regex(/^\d{8}$/).optional(),
  logradouro: z.string().max(200).optional(),
  numero: z.string().max(20).optional(),
  complemento: z.string().max(100).optional(),
  bairro: z.string().max(100).optional(),
  cidade: z.string().max(100).optional(),
  uf: z.string().length(2).optional(),
  observacoes: z.string().optional(),
})

const createPessoaBody = z.discriminatedUnion('tipo', [
  pessoaPF.merge(enderecoEContato),
  pessoaPJ.merge(enderecoEContato),
])

const updatePessoaBody = z.object({
  nome: z.string().min(3).max(200).optional(),
  nomeFantasia: z.string().max(200).nullable().optional(),
  rg: z.string().max(20).nullable().optional(),
  email: z.string().email().nullable().optional(),
  telefone: z.string().max(20).nullable().optional(),
  cep: z.string().regex(/^\d{8}$/).nullable().optional(),
  logradouro: z.string().max(200).nullable().optional(),
  numero: z.string().max(20).nullable().optional(),
  complemento: z.string().max(100).nullable().optional(),
  bairro: z.string().max(100).nullable().optional(),
  cidade: z.string().max(100).nullable().optional(),
  uf: z.string().length(2).nullable().optional(),
  observacoes: z.string().nullable().optional(),
  active: z.boolean().optional(),
})

const pessoaOut = z.object({
  id: z.string().uuid(),
  tipo: z.string(),
  documento: z.string(),
  nome: z.string(),
  nomeFantasia: z.string().nullable(),
  email: z.string().nullable(),
  telefone: z.string().nullable(),
  cidade: z.string().nullable(),
  uf: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.string(),
})

export const tenantPessoasRoute: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', async (req) => {
    await req.authenticateTenant()
    await req.requireActiveModule('cadastros')
  })

  // ─── GET /tenant/pessoas ────────────────────────────────
  app.get(
    '/',
    {
      preHandler: async (req) => req.requirePermission('cadastros:read'),
      schema: {
        tags: ['tenant-pessoas'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        querystring: z.object({
          tipo: z.enum(['PF', 'PJ']).optional(),
          search: z.string().optional(),
          active: z.coerce.boolean().optional(),
        }).merge(paginationQuery),
        response: {
          200: z.object({
            items: z.array(pessoaOut),
            pagination: z.object({
              nextCursor: z.string().nullable(),
              limit: z.number(),
            }),
          }),
        },
      },
    },
    async (req) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
      const { tipo, search, active, cursor: rawCursor, limit } = req.query
      const cursor = decodeCursor(rawCursor)

      const rows = await db.query.pessoas.findMany({
        where: (p, { eq, and, isNull, or, ilike }) => {
          const conds = [isNull(p.deletedAt)]
          if (tipo) conds.push(eq(p.tipo, tipo))
          if (typeof active === 'boolean') conds.push(eq(p.active, active))
          if (search) {
            conds.push(
              or(ilike(p.nome, `%${search}%`), ilike(p.documento, `%${search}%`))!,
            )
          }
          if (cursor) {
            conds.push(
              or(
                lt(p.createdAt, new Date(cursor.createdAt)),
                and(eq(p.createdAt, new Date(cursor.createdAt)), lt(p.id, cursor.id)),
              )!,
            )
          }
          return and(...conds)
        },
        orderBy: (p, { desc }) => [desc(p.createdAt), desc(p.id)],
        limit: limit + 1,
      })

      const result = paginatedResponse(rows, limit)
      return {
        items: result.items.map(serializePessoa),
        pagination: result.pagination,
      }
    },
  )

  // ─── POST /tenant/pessoas ───────────────────────────────
  app.post(
    '/',
    {
      preHandler: async (req) => req.requirePermission('cadastros:write'),
      schema: {
        tags: ['tenant-pessoas'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        body: createPessoaBody,
        response: {
          201: pessoaOut,
          409: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

      const exists = await db.query.pessoas.findFirst({
        where: (p, { eq }) => eq(p.documento, req.body.documento),
      })
      if (exists) {
        return reply.status(409).send({
          error: 'Conflict',
          message: `Já existe pessoa com documento ${req.body.documento}`,
        })
      }

      const [inserted] = await db
        .insert(tenantSchema.pessoas)
        .values({
          ...req.body,
          createdBy: req.tenantAuth!.sub,
        } as any)
        .returning()

      if (!inserted) throw app.httpErrors.internalServerError('Falha ao criar pessoa')

      await db.insert(tenantSchema.tenantAuditLog).values({
        userId: req.tenantAuth!.sub,
        action: 'pessoa.create',
        resource: 'pessoa',
        resourceId: inserted.id,
        after: { tipo: inserted.tipo, documento: inserted.documento, nome: inserted.nome },
        ipAddress: req.ip,
      })

      return reply.status(201).send(serializePessoa(inserted))
    },
  )

  // ─── GET /tenant/pessoas/:id ────────────────────────────
  app.get(
    '/:id',
    {
      preHandler: async (req) => req.requirePermission('cadastros:read'),
      schema: {
        tags: ['tenant-pessoas'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: { 200: pessoaOut.extend({
          rg: z.string().nullable(),
          dataNascimento: z.string().nullable(),
          cep: z.string().nullable(),
          logradouro: z.string().nullable(),
          numero: z.string().nullable(),
          bairro: z.string().nullable(),
          observacoes: z.string().nullable(),
        }) },
      },
    },
    async (req) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
      const row = await db.query.pessoas.findFirst({
        where: (p, { eq, and, isNull }) => and(eq(p.id, req.params.id), isNull(p.deletedAt)),
      })
      if (!row) throw app.httpErrors.notFound('Pessoa não encontrada')
      return {
        ...serializePessoa(row),
        rg: row.rg,
        dataNascimento: row.dataNascimento?.toString() ?? null,
        cep: row.cep,
        logradouro: row.logradouro,
        numero: row.numero,
        bairro: row.bairro,
        observacoes: row.observacoes,
      }
    },
  )

  // ─── PATCH /tenant/pessoas/:id ──────────────────────────
  app.patch(
    '/:id',
    {
      preHandler: async (req) => req.requirePermission('cadastros:write'),
      schema: {
        tags: ['tenant-pessoas'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        params: z.object({ id: z.string().uuid() }),
        body: updatePessoaBody,
        response: { 200: pessoaOut },
      },
    },
    async (req) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

      const [updated] = await db
        .update(tenantSchema.pessoas)
        .set({ ...req.body, updatedAt: new Date() })
        .where(and(eq(tenantSchema.pessoas.id, req.params.id), isNull(tenantSchema.pessoas.deletedAt)))
        .returning()

      if (!updated) throw app.httpErrors.notFound('Pessoa não encontrada')
      return serializePessoa(updated)
    },
  )

  // ─── DELETE /tenant/pessoas/:id (soft) ──────────────────
  app.delete(
    '/:id',
    {
      preHandler: async (req) => req.requirePermission('cadastros:delete'),
      schema: {
        tags: ['tenant-pessoas'],
        security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

      const result = await db
        .update(tenantSchema.pessoas)
        .set({ deletedAt: new Date(), active: false })
        .where(and(eq(tenantSchema.pessoas.id, req.params.id), isNull(tenantSchema.pessoas.deletedAt)))
        .returning({ id: tenantSchema.pessoas.id })

      if (result.length === 0) throw app.httpErrors.notFound('Pessoa não encontrada')

      await db.insert(tenantSchema.tenantAuditLog).values({
        userId: req.tenantAuth!.sub,
        action: 'pessoa.delete',
        resource: 'pessoa',
        resourceId: req.params.id,
        ipAddress: req.ip,
      })

      return reply.status(204).send(null)
    },
  )

  // ─── GET /:id/extrato-fiscal ──────────────────────────────
  app.get(
    '/:id/extrato-fiscal',
    {
      preHandler: async (req) => {
        await req.requirePermission('cadastros:read')
        await req.requirePermission('receitas:read')
      },
      schema: {
        tags: ['tenant-pessoas'],
        security: [{ bearerAuth: [] }, { tenantCookie: [] }],
        params: z.object({ id: z.string().uuid() }),
        querystring: z.object({
          exercicio: z.coerce.number().int().min(2000).max(2100).optional(),
        }),
        response: {
          200: z.object({
            pessoa: z.object({ id: z.string().uuid(), nome: z.string(), documento: z.string(), tipo: z.string() }),
            exercicio: z.number(),
            resumo: z.object({
              totalArrecadado: z.string(),
              totalAnulado: z.string(),
              totalLiquido: z.string(),
              qtdArrecadacoes: z.number(),
              qtdAnulacoes: z.number(),
              primeiroPagamento: z.string().nullable(),
              ultimoPagamento: z.string().nullable(),
            }),
            statusFiscal: z.object({
              situacao: z.enum(['em_dia', 'parcialmente_em_dia', 'sem_movimento', 'inadimplente']),
              descricao: z.string(),
              percentualPago: z.number(),
            }),
            porNatureza: z.array(z.object({
              naturezaCodigo: z.string(),
              naturezaDescricao: z.string(),
              valorArrecadado: z.string(),
              valorAnulado: z.string(),
              valorLiquido: z.string(),
              qtdArrecadacoes: z.number(),
              ultimaArrecadacao: z.string().nullable(),
            })),
            arrecadacoes: z.array(z.object({
              id: z.string().uuid(),
              dataArrecadacao: z.string(),
              valor: z.string(),
              formaPagamento: z.string(),
              numeroDocumento: z.string().nullable(),
              referencia: z.string().nullable(),
              naturezaCodigo: z.string(),
              naturezaDescricao: z.string(),
              anuladoEm: z.string().nullable(),
              valorAnulacoes: z.string(),
            })),
          }),
        },
      },
    },
    async (req) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
      const ano = req.query.exercicio ?? new Date().getFullYear()

      const pessoa = await db.query.pessoas.findFirst({
        where: (p, { eq, and, isNull }) => and(eq(p.id, req.params.id), isNull(p.deletedAt)),
      })
      if (!pessoa) throw app.httpErrors.notFound('Pessoa não encontrada')

      // Arrecadações da pessoa no exercício
      const arrecResult = await db.execute(sql`
        SELECT
          a.id, a.data_arrecadacao, a.valor, a.forma_pagamento,
          a.numero_documento, a.referencia, a.anulado_em,
          n.codigo_completo AS natureza_codigo, n.descricao AS natureza_descricao,
          COALESCE((SELECT SUM(an.valor) FROM receitas_anulacoes an WHERE an.arrecadacao_id = a.id), 0)::text AS valor_anulacoes
        FROM receitas_arrecadacoes a
        INNER JOIN receitas_lancamentos l ON l.id = a.lancamento_id
        INNER JOIN receitas_tipos t ON t.id = l.tipo_receita_id
        INNER JOIN receitas_naturezas n ON n.id = t.natureza_id
        INNER JOIN exercicios e ON e.id = l.exercicio_id
        WHERE a.contribuinte_pessoa_id = ${req.params.id} AND e.ano = ${ano}
        ORDER BY a.data_arrecadacao DESC, a.created_at DESC
      `)

      const arrecadacoes = (arrecResult as unknown as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        dataArrecadacao: String(r.data_arrecadacao),
        valor: String(r.valor),
        formaPagamento: String(r.forma_pagamento),
        numeroDocumento: r.numero_documento ? String(r.numero_documento) : null,
        referencia: r.referencia ? String(r.referencia) : null,
        naturezaCodigo: String(r.natureza_codigo),
        naturezaDescricao: String(r.natureza_descricao),
        anuladoEm: r.anulado_em ? new Date(r.anulado_em as string).toISOString() : null,
        valorAnulacoes: String(r.valor_anulacoes),
      }))

      const totalArrecadado = arrecadacoes.reduce((acc, a) => acc + Number(a.valor), 0)
      const totalAnulado = arrecadacoes.reduce((acc, a) => acc + Number(a.valorAnulacoes), 0)
      const totalLiquido = totalArrecadado - totalAnulado

      const qtdAnulResult = await db.execute(sql`
        SELECT COUNT(*)::int AS qtd FROM receitas_anulacoes an
        INNER JOIN receitas_arrecadacoes a ON a.id = an.arrecadacao_id
        INNER JOIN receitas_lancamentos l ON l.id = a.lancamento_id
        INNER JOIN exercicios e ON e.id = l.exercicio_id
        WHERE a.contribuinte_pessoa_id = ${req.params.id} AND e.ano = ${ano}
      `)
      const qtdAnulacoes = Number((qtdAnulResult as unknown as Array<Record<string, number>>)[0]?.qtd ?? 0)

      const datas = arrecadacoes.map((a) => a.dataArrecadacao).sort()

      // Por natureza
      const porNatResult = await db.execute(sql`
        SELECT
          n.codigo_completo AS codigo, n.descricao,
          SUM(a.valor)::text AS arrecadado,
          COALESCE((
            SELECT SUM(an.valor) FROM receitas_anulacoes an
            INNER JOIN receitas_arrecadacoes a2 ON a2.id = an.arrecadacao_id
            INNER JOIN receitas_lancamentos l2 ON l2.id = a2.lancamento_id
            INNER JOIN receitas_tipos t2 ON t2.id = l2.tipo_receita_id
            INNER JOIN exercicios e2 ON e2.id = l2.exercicio_id
            WHERE t2.natureza_id = n.id AND a2.contribuinte_pessoa_id = ${req.params.id} AND e2.ano = ${ano}
          ), 0)::text AS anulado,
          COUNT(*)::int AS qtd, MAX(a.data_arrecadacao) AS ultima
        FROM receitas_arrecadacoes a
        INNER JOIN receitas_lancamentos l ON l.id = a.lancamento_id
        INNER JOIN receitas_tipos t ON t.id = l.tipo_receita_id
        INNER JOIN receitas_naturezas n ON n.id = t.natureza_id
        INNER JOIN exercicios e ON e.id = l.exercicio_id
        WHERE a.contribuinte_pessoa_id = ${req.params.id} AND e.ano = ${ano}
        GROUP BY n.id, n.codigo_completo, n.descricao ORDER BY SUM(a.valor) DESC
      `)

      const porNatureza = (porNatResult as unknown as Array<Record<string, unknown>>).map((r) => {
        const arr = Number(r.arrecadado); const anu = Number(r.anulado)
        return {
          naturezaCodigo: String(r.codigo), naturezaDescricao: String(r.descricao),
          valorArrecadado: String(r.arrecadado), valorAnulado: String(r.anulado),
          valorLiquido: (arr - anu).toFixed(2), qtdArrecadacoes: Number(r.qtd),
          ultimaArrecadacao: r.ultima ? String(r.ultima) : null,
        }
      })

      // Status fiscal
      let situacao: 'em_dia' | 'parcialmente_em_dia' | 'sem_movimento' | 'inadimplente'
      let descricao: string
      let percentualPago: number

      if (arrecadacoes.length === 0) {
        situacao = 'sem_movimento'; descricao = `Sem arrecadações em ${ano}.`; percentualPago = 0
      } else {
        percentualPago = totalArrecadado > 0 ? Math.round((totalLiquido / totalArrecadado) * 10000) / 100 : 0
        if (percentualPago >= 80) {
          situacao = 'em_dia'; descricao = `Líquido ${percentualPago.toFixed(1)}% do arrecadado.`
        } else if (percentualPago >= 20) {
          situacao = 'parcialmente_em_dia'; descricao = `Líquido ${percentualPago.toFixed(1)}% — anulações representativas.`
        } else {
          situacao = 'inadimplente'; descricao = `Mais de 80% anulado/estornado em ${ano}.`
        }
      }

      return {
        pessoa: { id: pessoa.id, nome: pessoa.nome, documento: pessoa.documento, tipo: pessoa.tipo },
        exercicio: ano,
        resumo: {
          totalArrecadado: totalArrecadado.toFixed(2), totalAnulado: totalAnulado.toFixed(2),
          totalLiquido: totalLiquido.toFixed(2), qtdArrecadacoes: arrecadacoes.length, qtdAnulacoes,
          primeiroPagamento: datas[0] ?? null, ultimoPagamento: datas[datas.length - 1] ?? null,
        },
        statusFiscal: { situacao, descricao, percentualPago },
        porNatureza,
        arrecadacoes,
      }
    },
  )
}

function serializePessoa(row: any) {
  return {
    id: row.id,
    tipo: row.tipo,
    documento: row.documento,
    nome: row.nome,
    nomeFantasia: row.nomeFantasia,
    email: row.email,
    telefone: row.telefone,
    cidade: row.cidade,
    uf: row.uf,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  }
}
