import { describe, expect, it } from 'vitest';
import { canonicalJson, hashRequest } from './request-hash.js';

describe('canonicalJson', () => {
  it('sorts object keys at every level', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it('keeps array order, because order in an array is meaningful', () => {
    expect(canonicalJson([3, 1, 2])).not.toBe(canonicalJson([1, 2, 3]));
  });

  it('sorts keys inside objects nested in arrays', () => {
    expect(canonicalJson([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]');
  });

  it('drops undefined properties, like JSON does', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});

describe('hashRequest', () => {
  const body = { amount_minor: 45_050, metadata: { order: '1042', items: 3 } };

  it('is the same for the same request with keys in another order', () => {
    expect(hashRequest('POST', '/v1/payments', body)).toBe(
      hashRequest('POST', '/v1/payments', {
        metadata: { items: 3, order: '1042' },
        amount_minor: 45_050,
      }),
    );
  });

  it('treats the method case-insensitively', () => {
    expect(hashRequest('post', '/v1/payments', body)).toBe(
      hashRequest('POST', '/v1/payments', body),
    );
  });

  it.each([
    ['a different amount', 'POST', '/v1/payments', { ...body, amount_minor: 45_051 }],
    ['a different path', 'POST', '/v1/payments/x/refunds', body],
    ['a different method', 'PUT', '/v1/payments', body],
  ])('differs for %s', (_label, method, path, otherBody) => {
    expect(hashRequest(method, path, otherBody)).not.toBe(
      hashRequest('POST', '/v1/payments', body),
    );
  });

  it('is a 64-character hex SHA-256 digest', () => {
    expect(hashRequest('POST', '/v1/payments', body)).toMatch(/^[0-9a-f]{64}$/);
  });
});
