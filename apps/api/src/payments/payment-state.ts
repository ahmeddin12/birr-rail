import type { PaymentStatus } from '../generated/prisma/enums.js';

/**
 * Every status change the system will ever apply. Anything else is ignored and logged.
 * failed, expired and refunded are terminal. Typed against the database enum, so a new
 * status cannot be added to the schema without deciding its transitions here.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  created: ['pending', 'failed'],
  pending: ['succeeded', 'failed', 'expired'],
  succeeded: ['refunded'],
  failed: [],
  expired: [],
  refunded: [],
};

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
