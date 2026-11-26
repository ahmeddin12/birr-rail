import { randomUUID } from 'node:crypto';
import type { Options } from 'pino-http';
import type { Env } from '../config/env.js';

export const REQUEST_ID_HEADER = 'Request-Id';

const PROBE_PATHS = new Set(['/health', '/ready']);

export function buildPinoHttpOptions(env: Pick<Env, 'BIRRRAIL_LOG_LEVEL'>): Options {
  return {
    level: env.BIRRRAIL_LOG_LEVEL,
    // Always generated here, never taken from the client, so log lines cannot be spoofed or collided.
    genReqId: (_request, response) => {
      const id = `req_${randomUUID()}`;
      response.setHeader(REQUEST_ID_HEADER, id);
      return id;
    },
    // API keys travel in Authorization; dashboard sessions in cookies. Neither may reach the logs.
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      censor: '[redacted]',
    },
    // Orchestrator probes hit these every few seconds and would drown out real traffic.
    autoLogging: { ignore: (request) => PROBE_PATHS.has(request.url ?? '') },
  };
}
