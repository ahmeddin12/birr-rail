import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiError } from '../errors/api-error.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const pipe = new ZodValidationPipe(
  z.object({ reference: z.string().min(1), customer: z.object({ email: z.email() }) }),
);

describe('ZodValidationPipe', () => {
  it('returns the parsed value when valid', () => {
    const input = { reference: 'order-1', customer: { email: 'abebe@example.com' } };
    expect(pipe.transform(input)).toEqual(input);
  });

  it('strips unknown keys instead of passing them through', () => {
    const input = { reference: 'order-1', customer: { email: 'abebe@example.com' }, extra: 1 };
    expect(pipe.transform(input)).not.toHaveProperty('extra');
  });

  it('throws a 400 validation_failed error listing every invalid field by path', () => {
    const error = thrownBy(() => pipe.transform({ reference: '', customer: { email: 'nope' } }));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: 'validation_failed' });
    const issues = (error as ApiError).details?.issues as { path: string }[];
    expect(issues.map((issue) => issue.path).sort()).toEqual(['customer.email', 'reference']);
  });

  it('never echoes the rejected input in the error', () => {
    const error = thrownBy(() =>
      pipe.transform({ reference: 'x', customer: { email: 'leaked-secret-value' } }),
    );
    expect(JSON.stringify((error as ApiError).details)).not.toContain('leaked-secret-value');
  });
});

function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected function to throw');
}
