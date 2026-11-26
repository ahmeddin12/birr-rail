import { Injectable, Logger } from '@nestjs/common';
import type { Payment } from '../generated/prisma/client.js';
import type { PaymentStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { canTransition } from './payment-state.js';

export type TransitionResult =
  | { outcome: 'applied'; from: PaymentStatus; to: PaymentStatus; version: number }
  | { outcome: 'ignored'; current: PaymentStatus }
  | { outcome: 'not_found' };

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Scoped by merchant: another merchant's payment is indistinguishable from a missing one. */
  findForMerchant(merchantId: string, paymentId: string): Promise<Payment | null> {
    return this.prisma.payment.findFirst({ where: { id: paymentId, merchantId } });
  }

  /**
   * The only way a payment's status may change. Internal callers only (webhook worker, jobs);
   * merchant-facing code must load the payment scoped to the merchant before calling this.
   *
   * One transaction: lock the row so concurrent callers queue up, check the move is allowed,
   * update status and version, append the event. Never call a provider from inside it.
   */
  transition(paymentId: string, to: PaymentStatus, reason: string): Promise<TransitionResult> {
    return this.prisma.$transaction(async (tx): Promise<TransitionResult> => {
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
    });
  }
}
