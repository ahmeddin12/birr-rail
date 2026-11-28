import { ApiError } from '../errors/api-error.js';

/** 1 to 255 visible ASCII characters: no spaces, no control characters, no Unicode lookalikes. */
const IDEMPOTENCY_KEY = /^[\x21-\x7E]{1,255}$/;

/** Validates the Idempotency-Key header. Required on every request that creates something. */
export function parseIdempotencyKey(header: string | undefined): string {
  if (header === undefined || header === '') {
    throw new ApiError(
      400,
      'invalid_request_error',
      'idempotency_key_missing',
      'This request requires an Idempotency-Key header. Generate a unique value (a UUID works) per operation and reuse it when retrying.',
    );
  }
  if (!IDEMPOTENCY_KEY.test(header)) {
    throw new ApiError(
      400,
      'invalid_request_error',
      'idempotency_key_invalid',
      'The Idempotency-Key must be 1 to 255 visible ASCII characters, without spaces.',
    );
  }
  return header;
}
