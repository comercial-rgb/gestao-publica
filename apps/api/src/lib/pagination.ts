/**
 * Paginação cursor-based (keyset pagination).
 * Mais performática que offset/limit em listas grandes — O(log n) com índice.
 */
import { z } from 'zod'

export const paginationQuery = z.object({
  cursor: z.string().optional(),
  limit:  z.coerce.number().int().min(1).max(100).default(25),
})

export type PaginationInput = z.infer<typeof paginationQuery>

export interface CursorData {
  createdAt: string  // ISO
  id: string
}

export function decodeCursor(cursor?: string): CursorData | null {
  if (!cursor) return null
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf-8')
    const parsed = JSON.parse(json) as Record<string, unknown>
    if (typeof parsed.t !== 'string' || typeof parsed.i !== 'string') return null
    return { createdAt: parsed.t, id: parsed.i }
  } catch {
    return null
  }
}

export function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ t: row.createdAt.toISOString(), i: row.id })).toString('base64url')
}

export function paginatedResponse<T extends { createdAt: Date; id: string }>(
  rows: T[],
  limit: number,
): { items: T[]; pagination: { nextCursor: string | null; limit: number } } {
  // Sempre buscamos limit + 1 no DB para saber se há próxima página
  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const last = items[items.length - 1]
  return {
    items,
    pagination: {
      nextCursor: hasMore && last ? encodeCursor(last) : null,
      limit,
    },
  }
}
