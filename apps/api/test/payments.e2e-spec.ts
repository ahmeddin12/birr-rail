import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ApiErrorBody } from '../src/errors/api-error.js';
import type { Payment } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { bootApp } from './support/app.js';
import { type TestMerchant, createMerchantWithKey, insertPayment } from './support/fixtures.js';

describe('GET /v1/payments/:id', () => {
  let app: INestApplication<Server>;
  let merchantA: TestMerchant;
  let merchantB: TestMerchant;
  let paymentOfA: Payment;

  const getPayment = (id: string, key: string) =>
    request(app.getHttpServer()).get(`/v1/payments/${id}`).set('Authorization', `Bearer ${key}`);

  /** The error body without its request id, which differs on every request. */
  const errorWithoutRequestId = (body: unknown) => ({
    ...(body as ApiErrorBody).error,
    request_id: undefined,
  });

  beforeAll(async () => {
    app = await bootApp();
    merchantA = await createMerchantWithKey(app, 'Abebe Books');
    merchantB = await createMerchantWithKey(app, 'Tigist Coffee');
    paymentOfA = await insertPayment(app, merchantA.id, 'pending');
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the payment to the merchant that owns it, with the amount in integer santim', async () => {
    const response = await getPayment(paymentOfA.id, merchantA.key).expect(200);
    expect(response.body).toEqual({
      id: paymentOfA.id,
      object: 'payment',
      status: 'pending',
      amount_minor: 45_050,
      currency: 'ETB',
      provider: 'mock',
      merchant_reference: null,
      checkout_url: null,
      return_url: null,
      metadata: {},
      expires_at: null,
      created_at: paymentOfA.createdAt.toISOString(),
      updated_at: paymentOfA.updatedAt.toISOString(),
    });
  });

  it("returns 404 for another merchant's payment, identical to a payment that does not exist", async () => {
    const foreign = await getPayment(paymentOfA.id, merchantB.key).expect(404);
    const missing = await getPayment(randomUUID(), merchantB.key).expect(404);

    expect(errorWithoutRequestId(foreign.body)).toEqual({
      type: 'not_found_error',
      code: 'payment_not_found',
      message: 'No such payment.',
      details: null,
    });
    expect(errorWithoutRequestId(foreign.body)).toEqual(errorWithoutRequestId(missing.body));
  });

  it('returns the same 404, not a 500, for a malformed id', async () => {
    const response = await getPayment('not-a-uuid', merchantA.key).expect(404);
    expect(errorWithoutRequestId(response.body)).toMatchObject({ code: 'payment_not_found' });
  });

  it('requires an API key', async () => {
    await request(app.getHttpServer()).get(`/v1/payments/${paymentOfA.id}`).expect(401);
  });
});

describe('database constraints on payments', () => {
  let app: INestApplication<Server>;
  let merchantId: string;

  beforeAll(async () => {
    app = await bootApp();
    merchantId = (await createMerchantWithKey(app, 'Constraint Test Merchant')).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([0n, -100n])(
    'refuses amount_minor = %s even if the application tried',
    async (amount) => {
      await expect(
        app.get(PrismaService).payment.create({
          data: { merchantId, amountMinor: amount, provider: 'mock' },
        }),
      ).rejects.toThrow(/payments_amount_minor_positive/);
    },
  );

  it('refuses a payment event that does not change the status', async () => {
    const payment = await insertPayment(app, merchantId, 'pending');
    await expect(
      app.get(PrismaService).paymentEvent.create({
        data: {
          paymentId: payment.id,
          fromStatus: 'pending',
          toStatus: 'pending',
          reason: 'test',
          version: 1,
        },
      }),
    ).rejects.toThrow(/payment_events_status_changes/);
  });

  it('refuses two events with the same version for one payment', async () => {
    const payment = await insertPayment(app, merchantId, 'pending');
    const event = {
      paymentId: payment.id,
      fromStatus: 'pending',
      toStatus: 'succeeded',
      reason: 'test',
      version: 1,
    } as const;
    await app.get(PrismaService).paymentEvent.create({ data: event });
    // P2002 is Prisma's unique-constraint violation, so this fails for no other reason.
    await expect(
      app.get(PrismaService).paymentEvent.create({ data: { ...event, toStatus: 'expired' } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
