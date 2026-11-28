import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

const DATABASE_URL = 'postgresql://birrrail:s3cret-pw@127.0.0.1:5440/payments';

describe('parseEnv', () => {
  it('accepts a minimal valid environment and applies defaults', () => {
    expect(parseEnv({ BIRRRAIL_DATABASE_URL: DATABASE_URL })).toEqual({
      NODE_ENV: 'development',
      BIRRRAIL_PORT: 3000,
      BIRRRAIL_DATABASE_URL: DATABASE_URL,
      BIRRRAIL_LOG_LEVEL: 'info',
      BIRRRAIL_PAYMENT_TTL_MINUTES: 30,
      BIRRRAIL_IDEMPOTENCY_LEASE_SECONDS: 60,
      BIRRRAIL_SANDBOX_CHECKOUT_URL: 'http://localhost:3000/sandbox/checkout',
      BIRRRAIL_SANDBOX_SLOW_MS: 3_000,
    });
  });

  it('refuses an idempotency lease too short to cover a provider call', () => {
    expect(() =>
      parseEnv({ BIRRRAIL_DATABASE_URL: DATABASE_URL, BIRRRAIL_IDEMPOTENCY_LEASE_SECONDS: '1' }),
    ).toThrow(/BIRRRAIL_IDEMPOTENCY_LEASE_SECONDS/);
  });

  it('coerces the port from its string form', () => {
    const env = parseEnv({ BIRRRAIL_DATABASE_URL: DATABASE_URL, BIRRRAIL_PORT: '8080' });
    expect(env.BIRRRAIL_PORT).toBe(8080);
  });

  it('rejects a missing database URL', () => {
    expect(() => parseEnv({})).toThrow(/BIRRRAIL_DATABASE_URL/);
  });

  it('rejects a database URL that is not Postgres', () => {
    expect(() => parseEnv({ BIRRRAIL_DATABASE_URL: 'mysql://u:p@127.0.0.1/payments' })).toThrow(
      /BIRRRAIL_DATABASE_URL/,
    );
  });

  it.each(['0', '65536', '3000.5', 'abc'])('rejects port %s', (port) => {
    expect(() => parseEnv({ BIRRRAIL_DATABASE_URL: DATABASE_URL, BIRRRAIL_PORT: port })).toThrow(
      /BIRRRAIL_PORT/,
    );
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => parseEnv({ BIRRRAIL_DATABASE_URL: DATABASE_URL, NODE_ENV: 'staging' })).toThrow(
      /NODE_ENV/,
    );
  });

  it('rejects an unknown log level', () => {
    expect(() =>
      parseEnv({ BIRRRAIL_DATABASE_URL: DATABASE_URL, BIRRRAIL_LOG_LEVEL: 'verbose' }),
    ).toThrow(/BIRRRAIL_LOG_LEVEL/);
  });

  it('never echoes the rejected value, which may contain a password', () => {
    const message = errorMessageOf(() =>
      parseEnv({ BIRRRAIL_DATABASE_URL: 'mysql://birrrail:s3cret-pw@127.0.0.1/payments' }),
    );
    expect(message).toContain('BIRRRAIL_DATABASE_URL');
    expect(message).not.toContain('s3cret-pw');
  });
});

function errorMessageOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('expected function to throw');
}
