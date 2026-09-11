import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createMasterDatabase } from '@saas-municipal/database'
import { env } from '../../env.js'

export const adminPlansRoute: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', async (req) => req.authenticateMaster())

  app.get(
    '/',
    {
      schema: {
        tags: ['admin-plans'],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        response: {
          200: z.array(z.object({
            id: z.string().uuid(),
            slug: z.string(),
            name: z.string(),
            description: z.string().nullable(),
            monthlyPrice: z.string(),
            active: z.boolean(),
          })),
        },
      },
    },
    async () => {
      const db = createMasterDatabase(env.DATABASE_URL)
      const rows = await db.query.plans.findMany({
        orderBy: (p, { asc }) => asc(p.monthlyPrice),
      })
      return rows.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        description: p.description,
        monthlyPrice: p.monthlyPrice,
        active: p.active,
      }))
    },
  )
}
