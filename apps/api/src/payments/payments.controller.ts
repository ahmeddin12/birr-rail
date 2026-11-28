import { type CreatePaymentRequest, createPaymentRequestSchema } from '@birr-rail/shared';
import { Body, Controller, Get, Headers, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { CurrentMerchant } from '../auth/authenticated-request.js';
import { ApiError, toErrorBody } from '../errors/api-error.js';
import { parseIdempotencyKey } from '../idempotency/idempotency-key.js';
import { IdempotencyService, type StoredResponse } from '../idempotency/idempotency.service.js';
import { requestIdOf } from '../logging/request-id.js';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import { type PaymentResponse, toPaymentResponse } from './payment.response.js';
import { type CreatePaymentOutcome, PaymentsService } from './payments.service.js';

const paymentIdSchema = z.uuid();

@Controller('v1/payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  /**
   * The body is validated before the Idempotency-Key is claimed, so a rejected body does not use
   * up the key: the merchant can fix the body and retry with the same key.
   */
  @Post()
  async create(
    @CurrentMerchant() merchantId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(createPaymentRequestSchema)) body: CreatePaymentRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<unknown> {
    const requestId = requestIdOf(request);
    const result = await this.idempotency.execute(
      {
        merchantId,
        key: parseIdempotencyKey(idempotencyKey),
        method: 'POST',
        path: '/v1/payments',
        body,
        requestId,
      },
      async () => toHttpResponse(await this.payments.create(merchantId, body), requestId),
    );
    response.status(result.status);
    if (result.replayed) {
      response.setHeader('Idempotent-Replayed', 'true');
    }
    return result.body;
  }

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

function toHttpResponse(outcome: CreatePaymentOutcome, requestId: string): StoredResponse {
  if (outcome.kind === 'processed') {
    return { status: 201, body: toPaymentResponse(outcome.payment) };
  }
  return {
    status: 502,
    body: toErrorBody(
      new ApiError(
        502,
        'api_error',
        'provider_unavailable',
        'The payment provider did not answer. The payment was recorded and will be resolved automatically; check its status before creating another for the same order.',
        { payment_id: outcome.paymentId },
      ),
      requestId,
    ),
  };
}
