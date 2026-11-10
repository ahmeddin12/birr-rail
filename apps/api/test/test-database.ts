/**
 * Returns the e2e database URL, refusing any database whose name does not end in "_test".
 * Later phases truncate tables between tests; this guard keeps that away from dev data.
 */
export function resolveTestDatabaseUrl(env: Record<string, string | undefined>): string {
  const url = env.BIRRRAIL_TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'BIRRRAIL_TEST_DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env.',
    );
  }
  const databaseName = new URL(url).pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Refusing to run e2e tests against database "${databaseName}": its name must end with "_test".`,
    );
  }
  return url;
}
