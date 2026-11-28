import type { CreatePaymentRequest } from '@birr-rail/shared';
import { type CreatePaymentResult, ProviderUnavailableError } from '@birr-rail/provider-kit';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import type { Payment, Prisma } from '../generated/prisma/client.js';
import type { PaymentStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaymentProviders } from '../providers/payment-providers.js';
import { canTransition } from './payment-state.js';

export type TransitionResult =
  | { outcome: 'applied'; from: PaymentStatus; to: PaymentStatus; version: number }
  | { outcome: 'ignored'; current: PaymentStatus }
  | { outcome: 'not_found' };

export type CreatePaymentOutcome =
  /** The provider answered; the payment is now pending (checkout ready) or failed (refused). */
  | { kind: 'processed'; payment: Payment }
  /** The provider's answer is unknown. The payment stays created until it is resolved later. */
  | { kind: 'provider_unavailable'; paymentId: string };

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: PaymentProviders,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Scoped by merchant: another merchant's payment is indistinguishable from a missing one. */
  findForMerchant(merchantId: string, paymentId: string): Promise<Payment | null> {
    return this.prisma.payment.findFirst({ where: { id: paymentId, merchantId } });
  }

  /**
   * Creates a payment in three steps, never holding a transaction while the provider works:
   * 1. insert it as created and commit, 2. call the provider with our id as its tx_ref,
   * 3. record the answer through transition().
   */
  async create(merchantId: string, request: CreatePaymentRequest): Promise<CreatePaymentOutcome> {
    const payment = await this.prisma.payment.create({
      data: {
        merchantId,
        amountMinor: BigInt(request.amount_minor),
        provider: request.provider,
        merchantReference: request.merchant_reference ?? null,
        returnUrl: request.return_url ?? null,
        metadata: request.metadata,
        expiresAt: new Date(Date.now() + this.env.BIRRRAIL_PAYMENT_TTL_MINUTES * 60_000),
      },
    });

    let result: CreatePaymentResult;
    try {
      result = await this.providers.get(payment.provider).createPayment({
        txRef: payment.id,
        amountMinor: request.amount_minor,
        returnUrl: payment.returnUrl,
        metadata: request.metadata,
      });
    } catch (error) {
      if (!(error instanceof ProviderUnavailableError)) {
        throw error;
      }
      // The provider may have the payment. Marking it failed and then receiving the money would
      // be the worst outcome, so it stays created for the stuck-payment job to resolve.
      this.logger.warn(
        { paymentId: payment.id, provider: error.provider, reason: error.message },
        'Provider outcome unknown; payment left as created',
      );
      return { kind: 'provider_unavailable', paymentId: payment.id };
    }

    if (result.kind === 'created') {
      const { providerRef, checkoutUrl } = result;
      await this.prisma.$transaction(async (tx) => {
        const transition = await this.transitionWithin(
          tx,
          payment.id,
          'pending',
          'provider_checkout_created',
        );
        if (transition.outcome === 'applied') {
          await tx.payment.update({
            where: { id: payment.id },
            data: { providerRef, checkoutUrl },
          });
        }
      });
    } else {
      await this.transition(payment.id, 'failed', `provider_rejected:${result.code}`);
    }

    return {
      kind: 'processed',
      payment: await this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }),
    };
  }

  /**
   * The only way a payment's status may change. Internal callers only (webhook worker, jobs);
   * merchant-facing code must load the payment scoped to the merchant before calling this.
   */
  transition(paymentId: string, to: PaymentStatus, reason: string): Promise<TransitionResult> {
    return this.prisma.$transaction((tx) => this.transitionWithin(tx, paymentId, to, reason));
  }

  /**
   * transition() inside a transaction the caller controls, so related writes (provider data now,
   * outbox and ledger rows later) commit or roll back together with the status change.
   *
   * Locks the row so concurrent callers queue up, checks the move is allowed, updates status and
   * version, appends the event. Never call a provider while the transaction is open.
   */
  async transitionWithin(
    tx: Prisma.TransactionClient,
    paymentId: string,
    to: PaymentStatus,
    reason: string,
  ): Promise<TransitionResult> {
    // FOR UPDATE: a second caller blocks here until the first commits, then reads its result.
    const [current] = await tx.$queryRaw<{ status: PaymentStatus; version: number }[]>`
      SELECT status, version FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
    if (current === undefined) {
      return { outcome: 'not_found' };
    }

    if (!canTransition(current.status, to)) {
      this.logger.warn(
        { paymentId, from: current.status, to, reason },
        'Ignored illegal payment status change',
      );
      return { outcome: 'ignored', current: current.status };
    }

    const version = current.version + 1;
    await tx.$executeRaw`
      UPDATE payments
      SET status = ${to}::payment_status, version = ${version}, updated_at = now()
      WHERE id = ${paymentId}::uuid`;
    await tx.paymentEvent.create({
      data: { paymentId, fromStatus: current.status, toStatus: to, reason, version },
    });
    return { outcome: 'applied', from: current.status, to, version };
  }
}
