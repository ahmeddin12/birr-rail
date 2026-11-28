import { createHash } from 'node:crypto';

/**
 * JSON with object keys sorted at every level, so {"a":1,"b":2} and {"b":2,"a":1} serialize
 * identically. Array order is kept: it is meaningful.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, nested: unknown) =>
    nested !== null && typeof nested === 'object' && !Array.isArray(nested)
      ? Object.fromEntries(Object.entries(nested).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : nested,
  );
}

/** Fingerprint of a request: a reused Idempotency-Key must come with the same fingerprint. */
export function hashRequest(method: string, path: string, body: unknown): string {
  return createHash('sha256')
    .update(`${method.toUpperCase()}\n${path}\n${canonicalJson(body)}`)
    .digest('hex');
}
