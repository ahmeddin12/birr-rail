import { describe, expect, it } from 'vitest';
import { MAX_AMOUNT_MINOR, amountMinorFromDb, amountMinorSchema } from './money.js';

describe('amountMinorSchema', () => {
  it.each([1, 45_050, MAX_AMOUNT_MINOR])('accepts %d santim', (amount) => {
    expect(amountMinorSchema.parse(amount)).toBe(amount);
  });

  it.each<[string, unknown]>([
    ['zero', 0],
    ['a negative amount', -100],
    ['negative zero', -0],
    ['birr written as a decimal (450.50)', 450.5],
    ['a float rounding artefact (0.1 + 0.2)', 0.1 + 0.2],
    ['one santim above the cap', MAX_AMOUNT_MINOR + 1],
    ['an integer beyond Number.MAX_SAFE_INTEGER', Number.MAX_SAFE_INTEGER + 2],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a numeric string', '45050'],
    ['a bigint', 45_050n],
    ['null', null],
    ['undefined', undefined],
  ])('rejects %s', (_label, value) => {
    expect(amountMinorSchema.safeParse(value).success).toBe(false);
  });
});

describe('amountMinorFromDb', () => {
  it('converts a bigint to the exact same number', () => {
    expect(amountMinorFromDb(45_050n)).toBe(45_050);
  });

  it('accepts zero and the largest exactly representable value', () => {
    expect(amountMinorFromDb(0n)).toBe(0);
    expect(amountMinorFromDb(BigInt(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('refuses a value that would silently lose precision as a number', () => {
    expect(() => amountMinorFromDb(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow(RangeError);
  });

  it('refuses a negative amount', () => {
    expect(() => amountMinorFromDb(-1n)).toThrow(RangeError);
  });
});
