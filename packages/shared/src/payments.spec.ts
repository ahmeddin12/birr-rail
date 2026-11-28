import { describe, expect, it } from 'vitest';
import { createPaymentRequestSchema } from './payments.js';

describe('createPaymentRequestSchema', () => {
  it('accepts a minimal request and fills in the defaults', () => {
    expect(createPaymentRequestSchema.parse({ amount_minor: 45_050 })).toEqual({
      amount_minor: 45_050,
      currency: 'ETB',
      provider: 'sandbox',
      metadata: {},
    });
  });

  it('accepts a full request', () => {
    const request = {
      amount_minor: 45_050,
      currency: 'ETB',
      provider: 'sandbox',
      merchant_reference: 'order-1042',
      return_url: 'https://shop.example/orders/1042',
      metadata: { sandbox_behavior: 'decline', items: 3, gift: false, note: null },
    };
    expect(createPaymentRequestSchema.parse(request)).toEqual(request);
  });

  it.each<[string, Record<string, unknown>]>([
    ['an unknown field (typo of amount_minor)', { amount: 45_050 }],
    ['an extra unknown field', { amount_minor: 45_050, amout_minor: 1 }],
    ['birr as a decimal', { amount_minor: 450.5 }],
    ['another currency', { amount_minor: 45_050, currency: 'USD' }],
    ['an unsupported provider', { amount_minor: 45_050, provider: 'paypal' }],
    ['a javascript: return URL', { amount_minor: 45_050, return_url: 'javascript:alert(1)' }],
    ['nested metadata', { amount_minor: 45_050, metadata: { customer: { id: 1 } } }],
    [
      'more than 20 metadata keys',
      {
        amount_minor: 45_050,
        metadata: Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`k${index}`, 1])),
      },
    ],
  ])('rejects %s', (_label, body) => {
    expect(createPaymentRequestSchema.safeParse(body).success).toBe(false);
  });
});
