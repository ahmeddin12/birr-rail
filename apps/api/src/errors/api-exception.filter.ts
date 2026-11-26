import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiError, type ApiErrorBody, type ApiErrorType } from './api-error.js';

const GENERIC_SERVER_ERROR =
  'An unexpected error occurred. Quote the request_id when reporting it.';

const HTTP_STATUS_ERRORS: Partial<Record<number, { type: ApiErrorType; code: string }>> = {
  [HttpStatus.BAD_REQUEST]: { type: 'invalid_request_error', code: 'bad_request' },
  [HttpStatus.UNAUTHORIZED]: { type: 'authentication_error', code: 'unauthorized' },
  [HttpStatus.NOT_FOUND]: { type: 'not_found_error', code: 'not_found' },
  [HttpStatus.PAYLOAD_TOO_LARGE]: { type: 'invalid_request_error', code: 'payload_too_large' },
};

/** Turns every exception into the standard error body. Internal details stay in the logs. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const error = toApiError(exception);

    if (error.status >= 500 && !(exception instanceof ApiError)) {
      this.logger.error(exception);
    }
    if (error.status === 401) {
      response.setHeader('WWW-Authenticate', 'Bearer');
    }

    const body: ApiErrorBody = {
      error: {
        type: error.type,
        code: error.code,
        message: error.message,
        // Always a string: buildPinoHttpOptions generates it for every request.
        request_id: typeof request.id === 'string' ? request.id : 'unknown',
        details: error.details,
      },
    };
    response.status(error.status).json(body);
  }
}

function toApiError(exception: unknown): ApiError {
  if (exception instanceof ApiError) {
    return exception;
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const mapped = HTTP_STATUS_ERRORS[status];
    if (status < 500) {
      return new ApiError(
        status,
        mapped?.type ?? 'invalid_request_error',
        mapped?.code ?? `http_${status}`,
        exception.message,
      );
    }
  }
  return new ApiError(500, 'api_error', 'internal_error', GENERIC_SERVER_ERROR);
}
