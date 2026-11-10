import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { resolveTestDatabaseUrl } from './test/test-database.js';

const envFile = resolve(import.meta.dirname, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  test: {
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['test/global-setup.ts'],
    // All e2e files share one real database; running them one at a time keeps them independent.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      // The app under test reads BIRRRAIL_DATABASE_URL; point it at the guarded test database.
      BIRRRAIL_DATABASE_URL: resolveTestDatabaseUrl(process.env),
    },
  },
});
