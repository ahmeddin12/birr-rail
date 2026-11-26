import { Controller, Get, Param } from '@nestjs/common';
import { z } from 'zod';
import { CurrentMerchant } from '../auth/authenticated-request.js';
import { ApiError } from '../errors/api-error.js';
import { type PaymentResponse, toPaymentResponse } from './payment.response.js';
import { PaymentsService } from './payments.service.js';

const paymentIdSchema = z.uuid();

@Controller('v1/payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get(':id')
  async get(
    @CurrentMerchant() merchantId: string,
    @Param('id') id: string,
  ): Promise<PaymentResponse> {
    // A malformed id, a missing payment and another merchant's payment all get the same 404.
    const payment = paymentIdSchema.safeParse(id).success
      ? await this.payments.findForMerchant(merchantId, id)
      : null;
    if (payment === null) {
      throw new ApiError(404, 'not_found_error', 'payment_not_found', 'No such payment.');
    }
    return toPaymentResponse(payment);
  }
}
