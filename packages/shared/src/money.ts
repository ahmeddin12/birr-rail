import { z } from 'zod';

// Money is always an integer number of santim (1 birr = 100 santim): never a float, never birr.
// Conversion to a provider's decimal format happens only inside that provider's adapter.

/** Upper bound for a single payment: 10,000,000.00 birr. Far below Number.MAX_SAFE_INTEGER. */
export const MAX_AMOUNT_MINOR = 1_000_000_000;

/** A payment amount as sent by API clients: a positive integer number of santim, within the cap. */
export const amountMinorSchema = z.int().positive().max(MAX_AMOUNT_MINOR);

/**
 * Converts a Postgres bigint (as Prisma returns it) to a number, refusing any value a JS number
 * cannot hold exactly. Use at the repository boundary so bigint never leaks into business logic.
 */
export function amountMinorFromDb(value: bigint): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`Amount ${value} santim is outside the exactly representable range`);
  }
  return Number(value);
}
