import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Writable } from 'node:stream';
import { pinoHttp } from 'pino-http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REQUEST_ID_HEADER, buildPinoHttpOptions } from './logger.options.js';

const API_KEY = 'brk_test_this-must-never-appear-in-logs';

describe('pino-http options', () => {
  let server: Server | undefined;

  afterEach(() => {
    server?.close();
  });

  /** Runs one real HTTP request through the logging middleware and returns the log lines. */
  async function logOneRequest(path: string, headers: Record<string, string> = {}) {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const middleware = pinoHttp(buildPinoHttpOptions({ BIRRRAIL_LOG_LEVEL: 'info' }), sink);
    server = createServer((request, response) => {
      middleware(request, response);
      response.end('ok');
    });
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
    await response.text();
    return { response, lines };
  }

  it('redacts the Authorization header and cookies', async () => {
    const { lines } = await logOneRequest('/v1/payments', {
      authorization: `Bearer ${API_KEY}`,
      cookie: 'session=secret-session-token',
    });
    await vi.waitFor(() => {
      expect(lines).toHaveLength(1);
    });
    const output = lines.join('');
    expect(output).not.toContain(API_KEY);
    expect(output).not.toContain('secret-session-token');
    expect(output).toContain('[redacted]');
  });

  it('generates a request id, returns it in the Request-Id header and logs it', async () => {
    const { response, lines } = await logOneRequest('/v1/payments');
    await vi.waitFor(() => {
      expect(lines).toHaveLength(1);
    });
    const requestId = response.headers.get(REQUEST_ID_HEADER);
    expect(requestId).toMatch(/^req_[0-9a-f-]{36}$/);
    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({ req: { id: requestId } });
  });

  it('ignores a client-supplied request id', async () => {
    const { response } = await logOneRequest('/v1/payments', { 'request-id': 'req_spoofed' });
    expect(response.headers.get(REQUEST_ID_HEADER)).not.toBe('req_spoofed');
  });

  it('does not log health probes', async () => {
    const { lines } = await logOneRequest('/health');
    // Give the middleware the same chance to write that the other tests get.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(lines).toHaveLength(0);
  });
});
