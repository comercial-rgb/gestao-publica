import { defineConfig } from 'drizzle-kit'
import { config } from 'dotenv'
import { resolve } from 'node:path'

// Carrega .env da raiz do monorepo
config({ path: resolve(__dirname, '../../.env') })

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não definida no .env')
}

export default defineConfig({
  schema: ['./src/schema/public.ts', './src/schema/folha-publico.ts'],
  out: './drizzle/public',
  dialect: 'postgresql',
  schemaFilter: ['public'],
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
})
