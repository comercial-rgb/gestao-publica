/**
 * Hash SHA-256 deterministico de snapshots JSON.
 *
 * USO: detectar adulteracao de holerites (auditoria TCE) e
 * permitir skip de recalculo quando nada mudou (idempotencia).
 *
 * IMPORTANTE: usa JSON canonico (chaves ordenadas) -- JSON.stringify
 * tradicional nao e deterministico entre runs.
 */

import { createHash } from 'node:crypto'

export function hashSnapshotSha256(snapshot: unknown): string {
  const canonical = canonicalizeJson(snapshot)
  return createHash('sha256').update(canonical).digest('hex')
}

/**
 * Serializa JSON com chaves ordenadas alfabeticamente (deterministico).
 * Para objetos aninhados, ordena recursivamente.
 */
export function canonicalizeJson(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'null' // NaN/Infinity viram null no JSON
    return JSON.stringify(value)
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalizeJson).join(',') + ']'
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort()
    return (
      '{' +
      keys
        .filter((k) => obj[k] !== undefined)
        .map((k) => JSON.stringify(k) + ':' + canonicalizeJson(obj[k]))
        .join(',') +
      '}'
    )
  }
  return 'null'
}

/**
 * Compara dois snapshots por hash (deterministico, mesmo objeto = mesmo hash).
 */
export function snapshotsIguais(a: unknown, b: unknown): boolean {
  return hashSnapshotSha256(a) === hashSnapshotSha256(b)
}
