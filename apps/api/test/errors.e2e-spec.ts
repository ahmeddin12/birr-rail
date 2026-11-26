import type { Server } from 'node:http';
import { Body, Controller, Get, type INestApplication, Post } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Public } from '../src/auth/public.decorator.js';
import { ZodValidationPipe } from '../src/validation/zod-validation.pipe.js';
import { bootApp } from './support/app.js';

const SECRET_IN_INTERNAL_ERROR = 'postgres password is hunter2';

const echoSchema = z.object({ reference: z.string().min(1) });

@Public()
@Controller('__test__/errors')
class ErrorTestController {
  @Get('crash')
  crash(): never {
    throw new Error(SECRET_IN_INTERNAL_ERROR);
  }

  @Post('validate')
  validate(@Body(new ZodValidationPipe(echoSchema)) body: z.output<typeof echoSchema>) {
    return body;
  }
}

describe('error responses', () => {
  let app: INestApplication<Server>;

  beforeAll(async () => {
    app = await bootApp({ controllers: [ErrorTestController] });
  });

  afterAll(async () => {
    await app.close();
  });

  it('every error carries the request id that is also sent in the Request-Id header', async () => {
    const response = await request(app.getHttpServer()).get('/does-not-exist').expect(404);
    const requestId = response.headers['request-id'];
    expect(requestId).toMatch(/^req_/);
    expect(response.body).toEqual({
      error: {
        type: 'not_found_error',
        code: 'not_found',
        message: expect.any(String) as string,
        request_id: requestId,
        details: null,
      },
    });
  });

  it('an unexpected exception becomes a generic 500 that leaks nothing', async () => {
    const response = await request(app.getHttpServer()).get('/__test__/errors/crash').expect(500);
    expect(response.body).toMatchObject({ error: { type: 'api_error', code: 'internal_error' } });
    expect(JSON.stringify(response.body)).not.toContain('hunter2');
  });

  it('a validation failure is a 400 with field-level details', async () => {
    const response = await request(app.getHttpServer())
      .post('/__test__/errors/validate')
      .send({ reference: '' })
      .expect(400);
    expect(response.body).toMatchObject({
      error: {
        type: 'invalid_request_error',
        code: 'validation_failed',
        details: { issues: [{ path: 'reference' }] },
      },
    });
  });

  it('valid input passes through the pipe', async () => {
    await request(app.getHttpServer())
      .post('/__test__/errors/validate')
      .send({ reference: 'order-1' })
      .expect(201, { reference: 'order-1' });
  });

  it('malformed JSON is a 400 in the standard shape, not a crash', async () => {
    const response = await request(app.getHttpServer())
      .post('/__test__/errors/validate')
      .set('content-type', 'application/json')
      .send('{"reference": ')
      .expect(400);
    expect(response.body).toMatchObject({ error: { type: 'invalid_request_error' } });
  });
});
