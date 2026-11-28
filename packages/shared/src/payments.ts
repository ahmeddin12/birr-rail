import { z } from 'zod';
import { amountMinorSchema } from './money.js';

const metadataValue = z.union([z.string().max(500), z.number(), z.boolean(), z.null()]);

/** Body of POST /v1/payments. Unknown fields are rejected, so a typo fails loudly instead of being ignored. */
export const createPaymentRequestSchema = z.strictObject({
  amount_minor: amountMinorSchema,
  currency: z.literal('ETB').default('ETB'),
  provider: z.enum(['sandbox']).default('sandbox'),
  merchant_reference: z.string().min(1).max(255).optional(),
  // http(s) only: a javascript: or data: URL here would end up in a redirect.
  return_url: z
    .url({ protocol: /^https?$/ })
    .max(2048)
    .optional(),
  metadata: z
    .record(z.string().min(1).max(40), metadataValue)
    .refine((metadata) => Object.keys(metadata).length <= 20, 'At most 20 metadata keys.')
    .default({}),
});

export type CreatePaymentRequest = z.output<typeof createPaymentRequestSchema>;
