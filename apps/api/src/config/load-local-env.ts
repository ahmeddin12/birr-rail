import { existsSync } from 'node:fs';

/** Local convenience only. Variables already set in the environment win over the file. */
export function loadLocalEnv(path = '.env'): void {
  if (existsSync(path)) process.loadEnvFile(path);
}
