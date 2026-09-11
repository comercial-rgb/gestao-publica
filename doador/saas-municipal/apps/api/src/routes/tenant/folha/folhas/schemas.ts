/**
 * Schemas Zod do recurso /folhas -- request/response de todas as rotas.
 */

import { z } from 'zod'

export const folhaIdParams = z.object({ id: z.string().uuid() })
export const folhaVinculoParams = z.object({ id: z.string().uuid(), vinculoId: z.string().uuid() })

export const criarFolhaBody = z.object({
  competenciaMes: z.coerce.number().int().min(1).max(12),
  competenciaAno: z.coerce.number().int().min(2020).max(2099),
  tipo: z.enum(['mensal', 'decimo_terceiro_primeira', 'decimo_terceiro_segunda', 'decimo_terceiro_integral', 'ferias', 'rescisao', 'complementar']).default('mensal'),
  descricao: z.string().min(3).max(300),
  dataPagamento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export const simularHoleriteBody = z.object({
  vinculoId: z.string().uuid(),
  overrides: z.object({
    rubricasOverride: z.array(z.object({ rubricaId: z.string().uuid(), valorBase: z.number().nonnegative() })).optional(),
  }).optional(),
})

export const fecharFolhaBody = z.object({
  ignorarAvisos: z.boolean().default(false),
})

export const reabrirFolhaBody = z.object({
  motivo: z.string().min(10).max(500),
  recalcularAposReabertura: z.boolean().default(false),
})

export const recalcularHoleriteBody = z.object({
  motivo: z.string().min(10).max(500),
})

export const enviarEsocialBody = z.object({
  ambiente: z.enum(['TESTE', 'PRODUCAO_RESTRITA', 'PRODUCAO']).default('TESTE'),
})

export const cancelarFolhaBody = z.object({
  motivo: z.string().min(10).max(500),
})

export const listarFolhasQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  competenciaAno: z.coerce.number().int().optional(),
  competenciaMes: z.coerce.number().int().optional(),
  tipo: z.string().optional(),
  status: z.string().optional(),
})

export const listarHoleritesQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
})
