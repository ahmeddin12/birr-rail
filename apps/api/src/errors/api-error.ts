export type ApiErrorType =
  'invalid_request_error' | 'authentication_error' | 'not_found_error' | 'api_error';

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
