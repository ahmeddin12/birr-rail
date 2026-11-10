import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Variables already set in the environment win over .env. The e2e global setup relies on this
// to point migrations at the test database.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Read directly instead of Prisma's env() helper, which throws when the variable is unset:
  // `prisma generate` must work without any database configured (CI, fresh clones).
  datasource: { url: process.env.BIRRRAIL_DATABASE_URL },
});
