import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  type CreatePaymentInput,
  type CreatePaymentResult,
  type PaymentProvider,
  ProviderUnavailableError,
} from './provider.js';

export const SANDBOX_PROVIDER = 'sandbox';

/** Each payment picks its behaviour with metadata.sandbox_behavior. The default is succeed. */
export const SANDBOX_BEHAVIORS = ['succeed', 'decline', 'unavailable', 'slow'] as const;

export interface SandboxProviderOptions {
  /** The payment id is appended to form each checkout URL. No trailing slash. */
  checkoutBaseUrl: string;
  /** How long the slow behaviour waits before succeeding. */
  slowDelayMs: number;
}

/** Birr Rail Sandbox: a fake provider for demos and tests. It never touches real money. */
export class SandboxProvider implements PaymentProvider {
  readonly name = SANDBOX_PROVIDER;

  constructor(private readonly options: SandboxProviderOptions) {}

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const behavior = input.metadata.sandbox_behavior ?? 'succeed';
    switch (behavior) {
      case 'succeed':
        return this.checkoutFor(input);
      case 'slow':
        await sleep(this.options.slowDelayMs);
        return this.checkoutFor(input);
      case 'decline':
        return {
          kind: 'rejected',
          code: 'sandbox_declined',
          message: 'Declined by Birr Rail Sandbox (sandbox_behavior=decline).',
        };
      case 'unavailable':
        throw new ProviderUnavailableError(
          this.name,
          'simulated outage (sandbox_behavior=unavailable)',
        );
      default:
        return {
          kind: 'rejected',
          code: 'sandbox_unknown_behavior',
          message: `Unknown sandbox_behavior. Use one of: ${SANDBOX_BEHAVIORS.join(', ')}.`,
        };
    }
  }

  private checkoutFor(input: CreatePaymentInput): CreatePaymentResult {
    return {
      kind: 'created',
      providerRef: `sbx_${randomUUID()}`,
      checkoutUrl: `${this.options.checkoutBaseUrl}/${input.txRef}`,
    };
  }
}
