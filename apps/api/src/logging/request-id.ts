import type { IncomingMessage } from 'node:http';

/** The id pino-http assigned to this request. Always a string: buildPinoHttpOptions generates it. */
export function requestIdOf(request: IncomingMessage): string {
  return typeof request.id === 'string' ? request.id : 'unknown';
}
