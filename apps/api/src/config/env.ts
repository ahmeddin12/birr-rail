import { z } from 'zod';

export const ENV = Symbol('ENV');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  BIRRRAIL_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  BIRRRAIL_DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  BIRRRAIL_LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  /** How long a customer has to pay before the payment may expire. */
  BIRRRAIL_PAYMENT_TTL_MINUTES: z.coerce.number().int().min(1).max(1_440).default(30),
  /** How long a request may hold an Idempotency-Key. Must exceed the slowest provider call. */
  BIRRRAIL_IDEMPOTENCY_LEASE_SECONDS: z.coerce.number().int().min(5).max(3_600).default(60),
  BIRRRAIL_SANDBOX_CHECKOUT_URL: z
    .url({ protocol: /^https?$/ })
    .default('http://localhost:3000/sandbox/checkout'),
  BIRRRAIL_SANDBOX_SLOW_MS: z.coerce.number().int().min(0).max(30_000).default(3_000),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates configuration at startup so a misconfigured process fails fast.
 * Errors name the variable but never echo its value: database URLs carry passwords.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
