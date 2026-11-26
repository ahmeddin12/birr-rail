import type { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { ApiError } from '../errors/api-error.js';

/**
 * Validates a request part against a zod schema and returns the parsed value.
 * Failures list each field path and message, but never the rejected input itself.
 */
export class ZodValidationPipe<TSchema extends z.ZodType> implements PipeTransform<
  unknown,
  z.output<TSchema>
> {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.output<TSchema> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ApiError(
        400,
        'invalid_request_error',
        'validation_failed',
        'The request is invalid. See details.issues.',
        {
          issues: result.error.issues.map((issue) => ({
            path: issue.path.map(String).join('.'),
            message: issue.message,
          })),
        },
      );
    }
    return result.data;
  }
}
