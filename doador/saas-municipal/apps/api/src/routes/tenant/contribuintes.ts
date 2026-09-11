import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createTenantDatabase, sql } from '@saas-municipal/database'
import { env } from '../../env.js'

export const tenantContribuintesRoute: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', async (req) => {
    await req.authenticateTenant()
    await req.requireActiveModule('receitas')
  })

  // ─── GET /tenant/contribuintes ─────────────────────────
  app.get(
    '/',
    {
      preHandler: async (req) => req.requirePermission('receitas:read'),
      schema: {
        tags: ['tenant-contribuintes'],
        security: [{ bearerAuth: [] }, { tenantCookie: [] }],
        querystring: z.object({
          exercicio: z.coerce.number().int().min(2000).max(2100).optional(),
          cursor: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(100).default(25),
          search: z.string().optional(),
          situacao: z.enum(['em_dia', 'parcialmente_em_dia', 'inadimplente']).optional(),
        }),
        response: {
          200: z.object({
            exercicio: z.number(),
            items: z.array(z.object({
              pessoaId: z.string().uuid(),
              nome: z.string(),
              documento: z.string(),
              tipo: z.string(),
              totalArrecadado: z.string(),
              totalAnulado: z.string(),
              totalLiquido: z.string(),
              qtdArrecadacoes: z.number(),
              situacao: z.string(),
              percentualPago: z.number(),
              ultimaArrecadacao: z.string().nullable(),
            })),
            pagination: z.object({
              nextCursor: z.string().nullable(),
              limit: z.number(),
            }),
            totais: z.object({
              contribuintesNoRanking: z.number(),
              totalArrecadadoTodos: z.string(),
              totalLiquidoTodos: z.string(),
            }),
          }),
        },
      },
    },
    async (req) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)
      const ano = req.query.exercicio ?? new Date().getFullYear()
      const limit = req.query.limit

      // Decode cursor
      let cursorValor: number | null = null
      let cursorId: string | null = null
      if (req.query.cursor) {
        try {
          const decoded = JSON.parse(Buffer.from(req.query.cursor, 'base64url').toString('utf-8')) as { v: string; i: string }
          cursorValor = Number(decoded.v)
          cursorId = String(decoded.i)
        } catch { /* invalid cursor, ignore */ }
      }

      const searchFilter = req.query.search
        ? sql`AND (p.nome ILIKE ${'%' + req.query.search + '%'} OR p.documento ILIKE ${'%' + req.query.search + '%'})`
        : sql``

      const situacaoFilter = req.query.situacao
        ? sql`AND situacao = ${req.query.situacao}`
        : sql``

      const cursorFilter = cursorValor !== null && cursorId !== null
        ? sql`AND (total_liquido < ${cursorValor.toFixed(2)}::numeric OR (total_liquido = ${cursorValor.toFixed(2)}::numeric AND pessoa_id > ${cursorId}::uuid))`
        : sql``

      const result = await db.execute(sql`
        WITH ranking AS (
          SELECT
            p.id AS pessoa_id, p.nome, p.documento, p.tipo,
            SUM(a.valor::numeric)::numeric(18,2) AS total_arrecadado,
            COALESCE(SUM(
              (SELECT COALESCE(SUM(an.valor::numeric), 0) FROM receitas_anulacoes an WHERE an.arrecadacao_id = a.id)
            ), 0)::numeric(18,2) AS total_anulado,
            COUNT(*)::int AS qtd_arrecadacoes,
            MAX(a.data_arrecadacao) AS ultima_arrecadacao
          FROM receitas_arrecadacoes a
          INNER JOIN pessoas p ON p.id = a.contribuinte_pessoa_id
          INNER JOIN receitas_lancamentos l ON l.id = a.lancamento_id
          INNER JOIN exercicios e ON e.id = l.exercicio_id
          WHERE e.ano = ${ano} AND p.deleted_at IS NULL AND a.contribuinte_pessoa_id IS NOT NULL
            ${searchFilter}
          GROUP BY p.id, p.nome, p.documento, p.tipo
        ),
        ranking_calc AS (
          SELECT *,
            (total_arrecadado - total_anulado)::numeric(18,2) AS total_liquido,
            CASE WHEN total_arrecadado = 0 THEN 0
              ELSE ROUND(((total_arrecadado - total_anulado) / total_arrecadado * 100)::numeric, 2)
            END AS percentual_pago
          FROM ranking
        ),
        ranking_situacao AS (
          SELECT *,
            CASE
              WHEN percentual_pago >= 80 THEN 'em_dia'
              WHEN percentual_pago >= 20 THEN 'parcialmente_em_dia'
              ELSE 'inadimplente'
            END AS situacao
          FROM ranking_calc
        )
        SELECT * FROM ranking_situacao
        WHERE 1=1 ${situacaoFilter} ${cursorFilter}
        ORDER BY total_liquido DESC, pessoa_id ASC
        LIMIT ${limit + 1}
      `)

      const rows = result as unknown as Array<Record<string, unknown>>
      const hasMore = rows.length > limit
      const items = (hasMore ? rows.slice(0, limit) : rows).map((r) => ({
        pessoaId: String(r.pessoa_id),
        nome: String(r.nome),
        documento: String(r.documento),
        tipo: String(r.tipo),
        totalArrecadado: String(r.total_arrecadado),
        totalAnulado: String(r.total_anulado),
        totalLiquido: String(r.total_liquido),
        qtdArrecadacoes: Number(r.qtd_arrecadacoes),
        situacao: String(r.situacao),
        percentualPago: Number(r.percentual_pago),
        ultimaArrecadacao: r.ultima_arrecadacao ? String(r.ultima_arrecadacao) : null,
      }))

      const last = items[items.length - 1]
      const nextCursor = hasMore && last
        ? Buffer.from(JSON.stringify({ v: last.totalLiquido, i: last.pessoaId })).toString('base64url')
        : null

      // Totais globais
      const totaisResult = await db.execute(sql`
        SELECT
          COUNT(DISTINCT a.contribuinte_pessoa_id)::int AS qtd,
          COALESCE(SUM(a.valor::numeric), 0)::text AS total_arrecadado,
          (COALESCE(SUM(a.valor::numeric), 0) - COALESCE((
            SELECT SUM(an.valor::numeric) FROM receitas_anulacoes an
            INNER JOIN receitas_arrecadacoes a2 ON a2.id = an.arrecadacao_id
            INNER JOIN receitas_lancamentos l2 ON l2.id = a2.lancamento_id
            INNER JOIN exercicios e2 ON e2.id = l2.exercicio_id
            WHERE e2.ano = ${ano} AND a2.contribuinte_pessoa_id IS NOT NULL
          ), 0))::text AS total_liquido
        FROM receitas_arrecadacoes a
        INNER JOIN receitas_lancamentos l ON l.id = a.lancamento_id
        INNER JOIN exercicios e ON e.id = l.exercicio_id
        WHERE e.ano = ${ano} AND a.contribuinte_pessoa_id IS NOT NULL
      `)
      const totaisRow = (totaisResult as unknown as Array<Record<string, unknown>>)[0] ?? {}

      return {
        exercicio: ano,
        items,
        pagination: { nextCursor, limit },
        totais: {
          contribuintesNoRanking: Number(totaisRow.qtd ?? 0),
          totalArrecadadoTodos: String(totaisRow.total_arrecadado ?? '0'),
          totalLiquidoTodos: String(totaisRow.total_liquido ?? '0'),
        },
      }
    },
  )
}
