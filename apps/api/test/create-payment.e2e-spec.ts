import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { PaymentProvider } from '@birr-rail/provider-kit';
import { createPaymentRequestSchema } from '@birr-rail/shared';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ApiErrorBody } from '../src/errors/api-error.js';
import { hashRequest } from '../src/idempotency/request-hash.js';
import type { PaymentResponse } from '../src/payments/payment.response.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { PaymentProviders } from '../src/providers/payment-providers.js';
import { bootApp } from './support/app.js';
import { type TestMerchant, createMerchantWithKey } from './support/fixtures.js';

const errorOf = (response: { body: unknown }) => (response.body as ApiErrorBody).error;
const paymentOf = (response: { body: unknown }) => response.body as PaymentResponse;

describe('POST /v1/payments', () => {
  let app: INestApplication<Server>;
  let baseUrl: string;
  let merchant: TestMerchant;
  let sandbox: PaymentProvider;
  let prisma: PrismaService;

  const createPayment = (
    body: object,
    key: string | null = randomUUID(),
    apiKey = merchant.key,
  ) => {
    const call = request(baseUrl).post('/v1/payments').set('Authorization', `Bearer ${apiKey}`);
    return (key === null ? call : call.set('Idempotency-Key', key)).send(body);
  };

  const paymentsWithReference = (merchantReference: string) =>
    prisma.payment.count({ where: { merchantReference } });

  beforeAll(async () => {
    app = await bootApp({ envOverrides: { BIRRRAIL_SANDBOX_SLOW_MS: '400' } });
    // One real listening server, so concurrent requests all hit the same app instance.
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    merchant = await createMerchantWithKey(app, 'Create Payment Merchant');
    sandbox = app.get(PaymentProviders).get('sandbox');
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('happy path', () => {
    it('creates a pending payment with a sandbox checkout and records how it got there', async () => {
      const response = await createPayment({
        amount_minor: 45_050,
        merchant_reference: 'order-1042',
        return_url: 'https://shop.example/orders/1042',
        metadata: { order: '1042' },
      }).expect(201);

      const payment = paymentOf(response);
      expect(payment).toMatchObject({
        object: 'payment',
        status: 'pending',
        amount_minor: 45_050,
        currency: 'ETB',
        provider: 'sandbox',
        merchant_reference: 'order-1042',
        return_url: 'https://shop.example/orders/1042',
        metadata: { order: '1042' },
        checkout_url: `http://localhost:3000/sandbox/checkout/${payment.id}`,
      });
      expect(response.headers['idempotent-replayed']).toBeUndefined();
      const ttl = Date.parse(payment.expires_at ?? '') - Date.parse(payment.created_at);
      expect(Math.abs(ttl - 30 * 60_000)).toBeLessThan(5_000);

      const stored = await prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
        include: { events: true },
      });
      expect(stored.providerRef).toMatch(/^sbx_/);
      expect(stored.events).toMatchObject([
        { fromStatus: 'created', toStatus: 'pending', reason: 'provider_checkout_created' },
      ]);

      await request(baseUrl)
        .get(`/v1/payments/${payment.id}`)
        .set('Authorization', `Bearer ${merchant.key}`)
        .expect(200, payment);
    });
  });

  describe('idempotency', () => {
    it('replays the stored response for a retry, without calling the provider again', async () => {
      const provider = vi.spyOn(sandbox, 'createPayment');
      const key = randomUUID();
      const body = { amount_minor: 1_000, merchant_reference: 'replay-1' };

      const first = await createPayment(body, key).expect(201);
      const retry = await createPayment(body, key).expect(201);
      // Same request with the keys in another order: still the same request.
      const reordered = await createPayment(
        { merchant_reference: 'replay-1', amount_minor: 1_000 },
        key,
      ).expect(201);

      expect(retry.body).toEqual(first.body);
      expect(reordered.body).toEqual(first.body);
      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(provider).toHaveBeenCalledTimes(1);
      expect(await paymentsWithReference('replay-1')).toBe(1);
    });

    it('rejects the same key with a different body (422) and creates nothing more', async () => {
      const key = randomUUID();
      await createPayment({ amount_minor: 1_000, merchant_reference: 'reuse-1' }, key).expect(201);

      const response = await createPayment(
        { amount_minor: 9_999, merchant_reference: 'reuse-1' },
        key,
      ).expect(422);

      expect(errorOf(response)).toMatchObject({
        type: 'idempotency_error',
        code: 'idempotency_key_reused',
      });
      expect(await paymentsWithReference('reuse-1')).toBe(1);
    });

    it('scopes keys per merchant: the same key from two merchants creates two payments', async () => {
      const other = await createMerchantWithKey(app, 'Another Merchant');
      const key = randomUUID();
      const body = { amount_minor: 1_000, merchant_reference: 'shared-key-1' };

      const mine = await createPayment(body, key).expect(201);
      const theirs = await createPayment(body, key, other.key).expect(201);

      expect(paymentOf(mine).id).not.toBe(paymentOf(theirs).id);
      expect(theirs.headers['idempotent-replayed']).toBeUndefined();
    });

    it('answers 409 with Retry-After while the original is still running, then replays it', async () => {
      const key = randomUUID();
      const body = {
        amount_minor: 1_000,
        merchant_reference: 'in-flight-1',
        metadata: { sandbox_behavior: 'slow' },
      };

      const original = createPayment(body, key).then((response) => response);
      await vi.waitFor(async () => {
        expect(await prisma.idempotencyKey.count({ where: { merchantId: merchant.id, key } })).toBe(
          1,
        );
      });

      const concurrent = await createPayment(body, key).expect(409);
      expect(concurrent.headers['retry-after']).toBe('1');
      expect(errorOf(concurrent)).toMatchObject({ code: 'idempotency_key_in_use' });

      expect((await original).status).toBe(201);
      const later = await createPayment(body, key).expect(201);
      expect(later.headers['idempotent-replayed']).toBe('true');
      expect(await paymentsWithReference('in-flight-1')).toBe(1);
    });

    it('does not use up the key when the body is invalid, so the merchant can fix it and retry', async () => {
      const key = randomUUID();
      await createPayment({ amount_minor: 0 }, key).expect(400);
      expect(await prisma.idempotencyKey.count({ where: { merchantId: merchant.id, key } })).toBe(
        0,
      );

      await createPayment({ amount_minor: 1_000 }, key).expect(201);
    });

    it('requires an Idempotency-Key header', async () => {
      const response = await createPayment({ amount_minor: 1_000 }, null).expect(400);
      expect(errorOf(response).code).toBe('idempotency_key_missing');
    });

    it.each([
      ['containing a space', 'order 1042'],
      ['longer than 255 characters', 'k'.repeat(256)],
    ])('rejects an Idempotency-Key %s', async (_label, key) => {
      const response = await createPayment({ amount_minor: 1_000 }, key).expect(400);
      expect(errorOf(response).code).toBe('idempotency_key_invalid');
    });
  });

  describe('provider outcomes', () => {
    it('marks the payment failed when the provider definitely refuses it', async () => {
      const response = await createPayment({
        amount_minor: 1_000,
        metadata: { sandbox_behavior: 'decline' },
      }).expect(201);

      const payment = paymentOf(response);
      expect(payment).toMatchObject({ status: 'failed', checkout_url: null });
      expect(
        await prisma.paymentEvent.findMany({
          where: { paymentId: payment.id },
          select: { fromStatus: true, toStatus: true, reason: true },
        }),
      ).toEqual([
        { fromStatus: 'created', toStatus: 'failed', reason: 'provider_rejected:sandbox_declined' },
      ]);
    });

    it('leaves the payment created when the provider outcome is unknown, and replays the 502', async () => {
      const key = randomUUID();
      const body = { amount_minor: 1_000, metadata: { sandbox_behavior: 'unavailable' } };

      const first = await createPayment(body, key).expect(502);
      const error = errorOf(first);
      expect(error).toMatchObject({ type: 'api_error', code: 'provider_unavailable' });

      // Not failed: the provider may have the payment, and money may still arrive.
      const paymentId = String(error.details?.payment_id);
      expect(
        await prisma.payment.findUniqueOrThrow({
          where: { id: paymentId },
          select: { status: true, events: true },
        }),
      ).toEqual({ status: 'created', events: [] });

      const retry = await createPayment(body, key).expect(502);
      expect(retry.body).toEqual(first.body);
      expect(retry.headers['idempotent-replayed']).toBe('true');
    });

    it('never re-runs a request that failed unexpectedly: the retry gets "interrupted", not a second payment', async () => {
      const provider = vi
        .spyOn(sandbox, 'createPayment')
        .mockRejectedValueOnce(new Error('bug in an adapter'));
      const key = randomUUID();
      const body = { amount_minor: 1_000, merchant_reference: 'unexpected-1' };

      const first = await createPayment(body, key).expect(500);
      expect(errorOf(first).code).toBe('internal_error');

      const retry = await createPayment(body, key).expect(500);
      expect(errorOf(retry).code).toBe('idempotent_request_interrupted');
      expect(provider).toHaveBeenCalledTimes(1);
      expect(await paymentsWithReference('unexpected-1')).toBe(1);
    });
  });

  describe('crash recovery', () => {
    it('gives a key abandoned by a crashed request one final "interrupted" answer once its lease expires', async () => {
      const provider = vi.spyOn(sandbox, 'createPayment');
      const key = randomUUID();
      const body = { amount_minor: 1_000, merchant_reference: 'crashed-1' };
      // What a crash leaves behind: the key claimed, its lease over, no response stored.
      await prisma.idempotencyKey.create({
        data: {
          merchantId: merchant.id,
          key,
          requestMethod: 'POST',
          requestPath: '/v1/payments',
          requestHash: hashRequest('POST', '/v1/payments', createPaymentRequestSchema.parse(body)),
          lockedUntil: new Date(Date.now() - 60 * 60_000),
        },
      });

      const first = await createPayment(body, key).expect(500);
      const retry = await createPayment(body, key).expect(500);

      expect(errorOf(first).code).toBe('idempotent_request_interrupted');
      expect(retry.body).toEqual(first.body);
      expect(provider).not.toHaveBeenCalled();
      expect(await paymentsWithReference('crashed-1')).toBe(0);
    });
  });

  // The Phase 2 headline: a merchant's server (or a double click) fires the same request 50
  // times at once. Repeated 20 times, because a race that is only sometimes lost still fails.
  describe('50 identical concurrent requests', () => {
    it.each(Array.from({ length: 20 }, (_, index) => index + 1))(
      'round %i: create exactly one payment and call the provider once',
      async (round) => {
        const provider = vi.spyOn(sandbox, 'createPayment');
        const key = randomUUID();
        const reference = `concurrent-${round}-${randomUUID()}`;
        const body = { amount_minor: 45_050, merchant_reference: reference };

        const responses = await Promise.all(
          Array.from({ length: 50 }, () => createPayment(body, key)),
        );

        const statuses = responses.map((response) => response.status);
        expect(statuses.filter((status) => status !== 201 && status !== 409)).toEqual([]);
        const created = responses.filter((response) => response.status === 201);
        const originals = created.filter(
          (response) => response.headers['idempotent-replayed'] === undefined,
        );
        expect(originals).toHaveLength(1);
        expect(new Set(created.map((response) => paymentOf(response).id)).size).toBe(1);
        expect(await paymentsWithReference(reference)).toBe(1);
        expect(provider).toHaveBeenCalledTimes(1);
      },
    );
  });
});
