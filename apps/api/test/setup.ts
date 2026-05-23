import { config } from 'dotenv'
import { resolve } from 'node:path'
import { beforeAll } from 'vitest'

config({ path: resolve(__dirname, '../../../.env.test') })

beforeAll(() => {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(`NODE_ENV deve ser 'test', está '${process.env.NODE_ENV}'`)
  }
  if (!process.env.DATABASE_URL?.includes(':5435')) {
    throw new Error(`DATABASE_URL deve apontar para postgres-test (5435): ${process.env.DATABASE_URL}`)
  }
})
