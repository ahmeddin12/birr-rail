import { createHash, randomBytes } from 'node:crypto';

/** Every Birr Rail key is a sandbox key; "test" in the prefix makes that visible wherever it is pasted. */
const KEY_PREFIX = 'brk_test_';
const SECRET_BYTES = 32;
/** base64url of 32 bytes is always 43 characters. */
const KEY_PATTERN = /^brk_test_[A-Za-z0-9_-]{43}$/;
const DISPLAY_PREFIX_LENGTH = KEY_PREFIX.length + 6;

export interface GeneratedApiKey {
  /** The full key. Shown to the merchant once, never stored. */
  key: string;
  /** Safe to store and display, e.g. "brk_test_Ab3x9Q". */
  prefix: string;
  hash: string;
}

export function generateApiKey(): GeneratedApiKey {
  const key = KEY_PREFIX + randomBytes(SECRET_BYTES).toString('base64url');
  return { key, prefix: key.slice(0, DISPLAY_PREFIX_LENGTH), hash: hashApiKey(key) };
}

/**
 * Unsalted SHA-256 is enough here: a key carries 256 random bits, so there is nothing to
 * brute-force or look up in a rainbow table. Slow password hashes are for low-entropy secrets.
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function isWellFormedApiKey(value: string): boolean {
  return KEY_PATTERN.test(value);
}

/** Extracts the token from an `Authorization: Bearer <token>` header. The scheme is case-insensitive. */
export function parseBearerToken(header: string): string | null {
  return /^Bearer +(\S+) *$/i.exec(header)?.[1] ?? null;
}
