import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createTenantDatabase, tenantSchema, eq, and, sql } from '@saas-municipal/database'
import { env } from '../../../env.js'

export const relatoriosRoute: FastifyPluginAsyncZod = async (app) => {
  // ─── GET /resumo-exercicio ─────────────────────────────
  app.get(
    '/resumo-exercicio',
    {
      preHandler: async (req) => req.requirePermission('receitas:relatorios'),
      schema: {
        tags: ['tenant-receitas'],
        security: [{ bearerAuth: [] }, { tenantCookie: [] }],
        querystring: z.object({
          exercicioAno: z.coerce.number().int(),
          entidadeId: z.string().uuid().optional(),
        }),
        response: {
          200: z.object({
            exercicio: z.object({ ano: z.number(), status: z.string() }),
            totais: z.object({
              previstoInicial: z.string(),
              atualizado: z.string(),
              arrecadado: z.string(),
              anulado: z.string(),
              liquido: z.string(),
              percentualExecucao: z.number(),
              qtdArrecadacoes: z.number(),
              qtdContribuintes: z.number(),
            }),
            porCategoria: z.array(z.object({
              categoria: z.string(),
              categoriaCodigo: z.string(),
              previsto: z.string(),
              arrecadado: z.string(),
              liquido: z.string(),
              percentual: z.number(),
            })),
            porMes: z.array(z.object({
              mes: z.number(),
              status: z.string(),
              arrecadado: z.string(),
              anulado: z.string(),
              liquido: z.string(),
            })),
          }),
        },
      },
    },
    async (req) => {
      const tenant = await req.resolveTenant()
      const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

      const exercicio = await db.query.exercicios.findFirst({
        where: (e, { eq }) => eq(e.ano, req.query.exercicioAno),
      })
      if (!exercicio) throw app.httpErrors.notFound(`Exercício ${req.query.exercicioAno} não encontrado`)

      // Totais gerais
      const totaisResult = await db.execute(sql`
        SELECT
          COALESCE(SUM(l.valor_previsto_inicial::numeric), 0)::text as previsto_inicial,
          COALESCE(SUM(l.valor_atualizado::numeric), 0)::text as atualizado,
          COALESCE(SUM(arrec.total::numeric), 0)::text as arrecadado,
          COALESCE(SUM(anul.total::numeric), 0)::text as anulado,
          (SELECT COUNT(*)::int
           FROM receitas_arrecadacoes a
           INNER JOIN receitas_lancamentos l2 ON l2.id = a.lancamento_id
           WHERE l2.exercicio_id = ${exercicio.id}
             AND a.anulado_em IS NULL) as qtd_arrecadacoes,
          (SELECT COUNT(DISTINCT a.contribuinte_pessoa_id)::int
           FROM receitas_arrecadacoes a
           INNER JOIN receitas_lancamentos l2 ON l2.id = a.lancamento_id
           WHERE l2.exercicio_id = ${exercicio.id}
             AND a.anulado_em IS NULL
             AND a.contribuinte_pessoa_id IS NOT NULL) as qtd_contribuintes
        FROM receitas_lancamentos l
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(valor::numeric), 0) as total
          FROM receitas_arrecadacoes WHERE lancamento_id = l.id AND anulado_em IS NULL
        ) arrec ON true
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(an.valor::numeric), 0) as total
          FROM receitas_anulacoes an
          INNER JOIN receitas_arrecadacoes ar ON ar.id = an.arrecadacao_id
          WHERE ar.lancamento_id = l.id
        ) anul ON true
        WHERE l.exercicio_id = ${exercicio.id} AND l.ativo = true
      `)

      const t = (totaisResult as unknown as Array<Record<string, string | number>>)[0]
      const previstoInicial = Number(t?.previsto_inicial ?? '0')
      const atualizado = Number(t?.atualizado ?? '0')
      const arrecadado = Number(t?.arrecadado ?? '0')
      const anulado = Number(t?.anulado ?? '0')
      const liquido = arrecadado - anulado
      const pctExec = atualizado > 0 ? (liquido / atualizado) * 100 : 0

      // Por categoria econômica (nível 1)
      const porCategoriaResult = await db.execute(sql`
        SELECT
          SUBSTRING(n.codigo_completo, 1, 1) as categoria_codigo,
          (SELECT descricao FROM receitas_naturezas WHERE codigo_completo = SUBSTRING(n.codigo_completo, 1, 1) || '.0.0.0.00.0.0' LIMIT 1) as categoria,
          COALESCE(SUM(l.valor_atualizado::numeric), 0)::text as previsto,
          COALESCE(SUM(arrec.total::numeric), 0)::text as arrecadado,
          COALESCE(SUM(anul.total::numeric), 0)::text as anulado,
          (COALESCE(SUM(arrec.total::numeric), 0) - COALESCE(SUM(anul.total::numeric), 0))::text as liquido
        FROM receitas_lancamentos l
        INNER JOIN receitas_tipos t ON t.id = l.tipo_receita_id
        INNER JOIN receitas_naturezas n ON n.id = t.natureza_id
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(valor::numeric), 0) as total
          FROM receitas_arrecadacoes WHERE lancamento_id = l.id AND anulado_em IS NULL
        ) arrec ON true
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(an.valor::numeric), 0) as total
          FROM receitas_anulacoes an
          INNER JOIN receitas_arrecadacoes ar ON ar.id = an.arrecadacao_id
          WHERE ar.lancamento_id = l.id
        ) anul ON true
        WHERE l.exercicio_id = ${exercicio.id} AND l.ativo = true
        GROUP BY categoria_codigo
        ORDER BY categoria_codigo
      `)

      const porCategoria = (porCategoriaResult as unknown as Array<Record<string, string>>).map((r) => {
        const prev = Number(r.previsto ?? '0')
        const arr = Number(r.arrecadado ?? '0')
        const liq = Number(r.liquido ?? '0')
        return {
          categoriaCodigo: r.categoria_codigo ?? '',
          categoria: r.categoria ?? 'Desconhecida',
          previsto: prev.toFixed(2),
          arrecadado: arr.toFixed(2),
          liquido: liq.toFixed(2),
          percentual: prev > 0 ? Math.round((arr / prev) * 10000) / 100 : 0,
        }
      })

      // Por mês fiscal
      const porMesResult = await db.execute(sql`
        SELECT
          mf.mes,
          mf.status,
          COALESCE(SUM(a.valor::numeric) FILTER (WHERE a.anulado_em IS NULL), 0)::text as arrecadado,
          COALESCE(SUM(an.valor::numeric), 0)::text as anulado
        FROM meses_fiscais mf
        LEFT JOIN receitas_arrecadacoes a ON a.mes_fiscal_id = mf.id
        LEFT JOIN receitas_anulacoes an ON an.mes_fiscal_id = mf.id
        WHERE mf.exercicio_id = ${exercicio.id}
        GROUP BY mf.mes, mf.status
        ORDER BY mf.mes
      `)

      const porMes = (porMesResult as unknown as Array<Record<string, string>>).map((r) => {
        const arr = Number(r.arrecadado ?? '0')
        const anu = Number(r.anulado ?? '0')
        return {
          mes: Number(r.mes),
          status: r.status ?? 'aberto',
          arrecadado: arr.toFixed(2),
          anulado: anu.toFixed(2),
          liquido: (arr - anu).toFixed(2),
        }
      })

      return {
        exercicio: { ano: exercicio.ano, status: exercicio.status },
        totais: {
          previstoInicial: previstoInicial.toFixed(2),
          atualizado: atualizado.toFixed(2),
          arrecadado: arrecadado.toFixed(2),
          anulado: anulado.toFixed(2),
          liquido: liquido.toFixed(2),
          percentualExecucao: Math.round(pctExec * 100) / 100,
          qtdArrecadacoes: Number(t?.qtd_arrecadacoes ?? 0),
          qtdContribuintes: Number(t?.qtd_contribuintes ?? 0),
        },
        porCategoria,
        porMes,
      }
    },
  )
}
