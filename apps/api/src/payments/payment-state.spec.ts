import { describe, expect, it } from 'vitest';
import { PaymentStatus } from '../generated/prisma/enums.js';
import { canTransition } from './payment-state.js';

// The specification, written out independently of payment-state.ts on purpose.
const EXPECTED_ALLOWED = new Set([
  'created->pending',
  'created->failed',
  'pending->succeeded',
  'pending->failed',
  'pending->expired',
  'succeeded->refunded',
]);

const STATUSES = Object.values(PaymentStatus);
const ALL_PAIRS = STATUSES.flatMap((from) => STATUSES.map((to) => [from, to] as const));

describe('canTransition', () => {
  it('is checked against all 36 status pairs', () => {
    expect(ALL_PAIRS).toHaveLength(36);
  });

  it.each(ALL_PAIRS)('%s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(EXPECTED_ALLOWED.has(`${from}->${to}`));
  });
});
