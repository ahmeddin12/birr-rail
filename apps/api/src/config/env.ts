import { z } from 'zod';

export const ENV = Symbol('ENV');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  BIRRRAIL_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  BIRRRAIL_DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
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
