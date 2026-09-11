import { defineConfig } from 'drizzle-kit'
import { config } from 'dotenv'
import { resolve } from 'node:path'

config({ path: resolve(__dirname, '../../.env') })

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não definida no .env')
}

/**
 * Config separada para o schema do TENANT.
 *
 * Por que separada? Porque o Drizzle precisa saber qual conjunto de tabelas
 * pertence a cada schema. As migrations geradas aqui serão aplicadas
 * dinamicamente em cada schema tenant_xxx pelo código de tenancy.
 *
 * Importante: o SQL gerado aqui NÃO inclui "CREATE SCHEMA" — apenas as tabelas.
 * O CREATE SCHEMA é feito separadamente em tenancy.ts.
 *
 * Para que o SQL seja schema-agnóstico (e possa ser aplicado dentro de
 * tenant_xxx via search_path), referenciamos o schema como "tenant_template"
 * no Drizzle, mas o migrator do tenant remove esse prefixo antes de executar.
 */
export default defineConfig({
  schema: ['./src/schema/tenant.ts', './src/schema/folha-calculo.ts'],
  out: './drizzle/tenant',
  dialect: 'postgresql',
  schemaFilter: ['public'],
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
})
