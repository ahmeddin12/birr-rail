import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiError } from '../errors/api-error.js';
import { ApiKeysService } from './api-keys.service.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { parseBearerToken } from './api-key.js';
import { IS_PUBLIC } from './public.decorator.js';

/** Registered globally: a route is protected unless explicitly marked @Public(). */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeys: ApiKeysService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (header === undefined) {
      throw new ApiError(
        401,
        'authentication_error',
        'missing_api_key',
        'No API key provided. Send it as "Authorization: Bearer <key>".',
      );
    }

    const token = parseBearerToken(header);
    const merchantId = token === null ? null : await this.apiKeys.authenticate(token);
    if (merchantId === null) {
      // One message for malformed, unknown and revoked keys: callers learn nothing about which.
      throw new ApiError(
        401,
        'authentication_error',
        'invalid_api_key',
        'The API key is invalid or has been revoked.',
      );
    }

    request.merchantId = merchantId;
    return true;
  }
}
