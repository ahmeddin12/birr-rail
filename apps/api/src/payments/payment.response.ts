import { amountMinorFromDb } from '@birr-rail/shared';
import type { Payment } from '../generated/prisma/client.js';
import type { PaymentStatus } from '../generated/prisma/enums.js';

/** The public API representation of a payment: snake_case, amounts in integer santim. */
export interface PaymentResponse {
  id: string;
  object: 'payment';
  status: PaymentStatus;
  amount_minor: number;
  currency: 'ETB';
  provider: string;
  merchant_reference: string | null;
  checkout_url: string | null;
  return_url: string | null;
  metadata: Payment['metadata'];
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export function toPaymentResponse(payment: Payment): PaymentResponse {
  return {
    id: payment.id,
    object: 'payment',
    status: payment.status,
    amount_minor: amountMinorFromDb(payment.amountMinor),
    currency: 'ETB',
    provider: payment.provider,
    merchant_reference: payment.merchantReference,
    checkout_url: payment.checkoutUrl,
    return_url: payment.returnUrl,
    metadata: payment.metadata,
    expires_at: payment.expiresAt?.toISOString() ?? null,
    created_at: payment.createdAt.toISOString(),
    updated_at: payment.updatedAt.toISOString(),
  };
}
