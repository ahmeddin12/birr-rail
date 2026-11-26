import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { bootApp } from './support/app.js';

describe('health endpoints against the real test database', () => {
  let app: INestApplication<Server>;

  beforeAll(async () => {
    app = await bootApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health reports the process is alive', async () => {
    await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok' });
  });

  it('GET /ready reports the database as up', async () => {
    await request(app.getHttpServer())
      .get('/ready')
      .expect(200, { status: 'ready', checks: { database: 'up' } });
  });

  it('is connected to the guarded test database, never the dev database', async () => {
    const rows = await app.get(PrismaService).$queryRaw<
      { name: string }[]
    >`SELECT current_database() AS name`;
    expect(rows[0]?.name).toMatch(/_test$/);
  });
});

describe('health endpoints when Postgres is unreachable', () => {
  let app: INestApplication<Server>;

  beforeAll(async () => {
    // Port 1 on loopback: nothing listens there, so the connection is refused.
    app = await bootApp({
      envOverrides: {
        BIRRRAIL_DATABASE_URL: 'postgresql://birrrail:birrrail@127.0.0.1:1/payments_test',
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /ready returns 503 in the standard error shape', async () => {
    const response = await request(app.getHttpServer()).get('/ready').expect(503);
    expect(response.body).toMatchObject({
      error: { type: 'api_error', code: 'not_ready', details: { checks: { database: 'down' } } },
    });
  });

  it('GET /health still returns 200, so the orchestrator does not restart a healthy process', async () => {
    await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok' });
  });
});
