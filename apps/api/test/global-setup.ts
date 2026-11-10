import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { resolveTestDatabaseUrl } from './test-database.js';

/** Applies all migrations to the guarded test database once, before any e2e file runs. */
export default function setup(): void {
  const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: resolve(import.meta.dirname, '..'),
    env: { ...process.env, BIRRRAIL_DATABASE_URL: resolveTestDatabaseUrl(process.env) },
    stdio: 'inherit',
  });
}
