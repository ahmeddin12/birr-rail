import { type PaymentProvider, SandboxProvider } from '@birr-rail/provider-kit';
import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';

/** Every provider adapter this deployment can use, looked up by name. */
@Injectable()
export class PaymentProviders {
  private readonly byName: ReadonlyMap<string, PaymentProvider>;

  constructor(@Inject(ENV) env: Env) {
    const providers: PaymentProvider[] = [
      new SandboxProvider({
        checkoutBaseUrl: env.BIRRRAIL_SANDBOX_CHECKOUT_URL.replace(/\/+$/, ''),
        slowDelayMs: env.BIRRRAIL_SANDBOX_SLOW_MS,
      }),
    ];
    this.byName = new Map(providers.map((provider) => [provider.name, provider]));
  }

  get(name: string): PaymentProvider {
    const provider = this.byName.get(name);
    if (provider === undefined) {
      // Request validation only allows known names, so this is a programming error.
      throw new Error(`No payment provider named "${name}"`);
    }
    return provider;
  }
}
