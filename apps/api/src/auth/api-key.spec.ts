import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateApiKey, hashApiKey, isWellFormedApiKey, parseBearerToken } from './api-key.js';

describe('generateApiKey', () => {
  it('produces a well-formed sandbox key with 32 random bytes', () => {
    const { key } = generateApiKey();
    expect(key).toMatch(/^brk_test_[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(key.slice('brk_test_'.length), 'base64url')).toHaveLength(32);
    expect(isWellFormedApiKey(key)).toBe(true);
  });

  it('returns a display prefix that is a strict prefix of the key and reveals only 6 secret characters', () => {
    const { key, prefix } = generateApiKey();
    expect(key.startsWith(prefix)).toBe(true);
    expect(prefix).toHaveLength('brk_test_'.length + 6);
  });

  it('returns the SHA-256 hex digest of the full key', () => {
    const { key, hash } = generateApiKey();
    expect(hash).toBe(createHash('sha256').update(key).digest('hex'));
    expect(hash).toBe(hashApiKey(key));
  });

  it('never repeats a key', () => {
    const keys = new Set(Array.from({ length: 1_000 }, () => generateApiKey().key));
    expect(keys.size).toBe(1_000);
  });
});

describe('isWellFormedApiKey', () => {
  it.each([
    ['a live-looking key', `brk_live_${'a'.repeat(43)}`],
    ['a truncated key', `brk_test_${'a'.repeat(42)}`],
    ['an over-long key', `brk_test_${'a'.repeat(44)}`],
    ['characters outside base64url', `brk_test_${'+'.repeat(43)}`],
    ['an empty string', ''],
  ])('rejects %s', (_label, value) => {
    expect(isWellFormedApiKey(value)).toBe(false);
  });
});

describe('parseBearerToken', () => {
  it.each([
    ['Bearer abc', 'abc'],
    ['bearer abc', 'abc'],
    ['BEARER abc', 'abc'],
    ['Bearer   abc  ', 'abc'],
  ])('parses %j', (header, token) => {
    expect(parseBearerToken(header)).toBe(token);
  });

  it.each(['', 'Bearer', 'Bearer ', 'Basic abc', 'abc', 'Bearer a b', 'Bearerabc'])(
    'rejects %j',
    (header) => {
      expect(parseBearerToken(header)).toBeNull();
    },
  );
});
