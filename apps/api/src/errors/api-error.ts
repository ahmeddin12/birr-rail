export type ApiErrorType =
  | 'invalid_request_error'
  | 'authentication_error'
  | 'not_found_error'
  | 'idempotency_error'
  | 'api_error';

/** Details are structured data for the client. Never put secrets or raw input values in them. */
export type ApiErrorDetails = Record<string, unknown>;

/** An error the API returns on purpose. Anything else becomes a generic 500. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly type: ApiErrorType,
    readonly code: string,
    message: string,
    readonly details: ApiErrorDetails | null = null,
    /** Response headers that belong to this error, e.g. Retry-After or WWW-Authenticate. */
    readonly headers: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The body of every error response. */
export interface ApiErrorBody {
  error: {
    type: ApiErrorType;
    code: string;
    message: string;
    request_id: string;
    details: ApiErrorDetails | null;
  };
}

/** Used by the exception filter and by stored idempotent responses, so both have the same shape. */
export function toErrorBody(error: ApiError, requestId: string): ApiErrorBody {
  return {
    error: {
      type: error.type,
      code: error.code,
      message: error.message,
      request_id: requestId,
      details: error.details,
    },
  };
}
