import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { type INestApplication, Logger } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PaymentStatus } from '../src/generated/prisma/enums.js';
import { PaymentsService, type TransitionResult } from '../src/payments/payments.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { bootApp } from './support/app.js';
import { createMerchantWithKey, insertPayment } from './support/fixtures.js';

// The specification, written out independently of payment-state.ts on purpose.
const ALLOWED = new Set([
  'created->pending',
  'created->failed',
  'pending->succeeded',
  'pending->failed',
  'pending->expired',
  'succeeded->refunded',
]);
const STATUSES = Object.values(PaymentStatus);
const ALL_PAIRS = STATUSES.flatMap((from) => STATUSES.map((to) => [from, to] as const));
const ALLOWED_PAIRS = ALL_PAIRS.filter(([from, to]) => ALLOWED.has(`${from}->${to}`));
const REFUSED_PAIRS = ALL_PAIRS.filter(([from, to]) => !ALLOWED.has(`${from}->${to}`));

type Applied = Extract<TransitionResult, { outcome: 'applied' }>;

describe('PaymentsService.transition against the real database', () => {
  let app: INestApplication<Server>;
  let payments: PaymentsService;
  let merchantId: string;

  /** What the database says, independent of what transition() returned. */
  const stored = (paymentId: string) =>
    app.get(PrismaService).payment.findUniqueOrThrow({
      where: { id: paymentId },
      select: {
        status: true,
        version: true,
        events: { select: { fromStatus: true, toStatus: true, version: true } },
      },
    });

  beforeAll(async () => {
    app = await bootApp();
    payments = app.get(PaymentsService);
    merchantId = (await createMerchantWithKey(app, 'Transition Test Merchant')).id;
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('covers all 36 status pairs: 6 allowed, 30 refused', () => {
    expect([ALLOWED_PAIRS.length, REFUSED_PAIRS.length]).toEqual([6, 30]);
  });

  it.each(ALLOWED_PAIRS)('applies %s -> %s and records one event', async (from, to) => {
    const payment = await insertPayment(app, merchantId, from);

    const result = await payments.transition(payment.id, to, 'test');

    expect(result).toEqual({ outcome: 'applied', from, to, version: 1 });
    expect(await stored(payment.id)).toEqual({
      status: to,
      version: 1,
      events: [{ fromStatus: from, toStatus: to, version: 1 }],
    });
  });

  it.each(REFUSED_PAIRS)('ignores %s -> %s and changes nothing', async (from, to) => {
    const payment = await insertPayment(app, merchantId, from);

    const result = await payments.transition(payment.id, to, 'test');

    expect(result).toEqual({ outcome: 'ignored', current: from });
    expect(await stored(payment.id)).toEqual({ status: from, version: 0, events: [] });
  });

  it('logs every ignored change with the payment and both statuses', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn');
    const payment = await insertPayment(app, merchantId, 'expired');

    await payments.transition(payment.id, 'succeeded', 'webhook:test');

    expect(warn).toHaveBeenCalledWith(
      { paymentId: payment.id, from: 'expired', to: 'succeeded', reason: 'webhook:test' },
      'Ignored illegal payment status change',
    );
  });

  it('reports not_found for a payment that does not exist', async () => {
    expect(await payments.transition(randomUUID(), 'pending', 'test')).toEqual({
      outcome: 'not_found',
    });
  });

  // A webhook says "succeeded" while the expiry job says "expired", several times over.
  // Repeated 20 times because a race that is only sometimes lost still fails eventually.
  it.each(Array.from({ length: 20 }, (_, index) => index + 1))(
    'round %i: of 10 concurrent transitions on one payment, exactly one wins',
    async () => {
      const payment = await insertPayment(app, merchantId, 'pending');
      const targets = Array.from({ length: 10 }, (_, index) =>
        index % 2 === 0 ? PaymentStatus.succeeded : PaymentStatus.expired,
      );

      const results = await Promise.all(
        targets.map((to) => payments.transition(payment.id, to, 'race')),
      );

      const applied = results.filter((result): result is Applied => result.outcome === 'applied');
      expect(applied).toHaveLength(1);
      expect(results.filter((result) => result.outcome === 'ignored')).toHaveLength(9);
      const after = await stored(payment.id);
      expect(after.status).toBe(applied[0]?.to);
      expect(after.version).toBe(1);
      expect(after.events).toHaveLength(1);
    },
  );
});
