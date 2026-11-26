import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export type AuthenticatedRequest = Request & { merchantId?: string };

/**
 * The id of the merchant that owns the request's API key. Every query on a merchant's
 * resources must be scoped by this value.
 */
export const CurrentMerchant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const { merchantId } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (merchantId === undefined) {
      // A programming error (route marked @Public but reading the merchant), so a 500 is right.
      throw new Error('CurrentMerchant used on a route that is not authenticated');
    }
    return merchantId;
  },
);
