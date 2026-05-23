/**
 * Validação de variáveis de ambiente.
 * Fail fast: se faltar env crítico, a app não sobe.
 */
import { config } from 'dotenv'
import { z } from 'zod'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// env.ts está em apps/api/src/, então ../../../ chega na raiz do monorepo.
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env'
config({ path: resolve(__dirname, '../../../', envFile) })

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(3333),

  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),

  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET precisa ter no mínimo 32 caracteres'),
  AUTH_JWT_EXPIRES_IN: z.coerce.number().int().positive().default(28_800),       // 8h
  AUTH_REFRESH_EXPIRES_IN: z.coerce.number().int().positive().default(2_592_000), // 30d

  REDIS_URL: z.string().optional(),

  RATE_LIMIT_ALLOWLIST: z.string().optional()
    .transform((v) => v ? v.split(',').map((s) => s.trim()) : []),

  ENABLE_SWAGGER_IN_PROD: z.coerce.boolean().default(false),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('[ERRO] Variaveis de ambiente invalidas:')
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
export type Env = z.infer<typeof envSchema>
