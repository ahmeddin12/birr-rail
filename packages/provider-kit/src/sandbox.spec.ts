import { describe, expect, it } from 'vitest';
import { ProviderUnavailableError } from './provider.js';
import { SandboxProvider } from './sandbox.js';

const sandbox = new SandboxProvider({
  checkoutBaseUrl: 'http://localhost:3000/sandbox/checkout',
  slowDelayMs: 60,
});

const input = (metadata: Record<string, unknown> = {}) => ({
  txRef: '7d1f6f6e-3a4b-4c5d-8e9f-0a1b2c3d4e5f',
  amountMinor: 45_050,
  returnUrl: null,
  metadata,
});

describe('SandboxProvider.createPayment', () => {
  it('creates a checkout by default, keyed by our payment id', async () => {
    const result = await sandbox.createPayment(input());
    expect(result).toEqual({
      kind: 'created',
      providerRef: expect.stringMatching(/^sbx_[0-9a-f-]{36}$/) as string,
      checkoutUrl: 'http://localhost:3000/sandbox/checkout/7d1f6f6e-3a4b-4c5d-8e9f-0a1b2c3d4e5f',
    });
  });

  it('gives every checkout its own provider reference', async () => {
    const [first, second] = await Promise.all([
      sandbox.createPayment(input()),
      sandbox.createPayment(input()),
    ]);
    expect(first).not.toEqual(second);
  });

  it('declines definitively with sandbox_behavior=decline', async () => {
    expect(await sandbox.createPayment(input({ sandbox_behavior: 'decline' }))).toMatchObject({
      kind: 'rejected',
      code: 'sandbox_declined',
    });
  });

  it('throws ProviderUnavailableError, an unknown outcome, with sandbox_behavior=unavailable', async () => {
    await expect(
      sandbox.createPayment(input({ sandbox_behavior: 'unavailable' })),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it('waits before succeeding with sandbox_behavior=slow', async () => {
    const started = performance.now();
    const result = await sandbox.createPayment(input({ sandbox_behavior: 'slow' }));
    expect(performance.now() - started).toBeGreaterThanOrEqual(50);
    expect(result.kind).toBe('created');
  });

  it('rejects an unknown behaviour instead of guessing', async () => {
    expect(await sandbox.createPayment(input({ sandbox_behavior: 'explode' }))).toMatchObject({
      kind: 'rejected',
      code: 'sandbox_unknown_behavior',
    });
  });
});
