/** What Birr Rail asks a provider for. Amounts are integer santim; adapters convert if they must. */
export interface CreatePaymentInput {
  /** Our payment id, sent as the provider's transaction reference so both sides share one key. */
  txRef: string;
  amountMinor: number;
  returnUrl: string | null;
  metadata: Readonly<Record<string, unknown>>;
}

export type CreatePaymentResult =
  | { kind: 'created'; providerRef: string; checkoutUrl: string }
  /** A definite refusal: the provider will never process this payment, so marking it failed is safe. */
  | { kind: 'rejected'; code: string; message: string };

/**
 * The provider's answer is unknown: a timeout, a 5xx or a network error. The payment may or may
 * not exist on the provider's side, so callers must NOT mark it failed. It is resolved later by
 * asking the provider.
 */
export class ProviderUnavailableError extends Error {
  constructor(
    readonly provider: string,
    reason: string,
  ) {
    super(`${provider} unavailable: ${reason}`);
    this.name = 'ProviderUnavailableError';
  }
}

/** One adapter per provider. Adapters return normalized types only; provider formats stay inside. */
export interface PaymentProvider {
  readonly name: string;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
}
