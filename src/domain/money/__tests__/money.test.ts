/**
 * Unit tests for precision-aware money utilities
 */

import {
  headlineCurrency,
  sanitizeDecimalInput,
  amountsAreEqual,
  getEpsilon,
  Money,
  roundToPrecision,
  safeAdd,
  safeMultiply,
  safeSubtract,
} from '@/src/domain/money/money';
import { sumByCurrency } from '@/src/domain/money/sumByCurrency';

describe('money utilities', () => {
  describe('roundToPrecision', () => {
    it('should round to 2 decimal places (USD)', () => {
      expect(roundToPrecision(10.555, 2)).toBe(10.56);
      expect(roundToPrecision(10.554, 2)).toBe(10.55);
      expect(roundToPrecision(10.5, 2)).toBe(10.5);
    });

    it('should round to 0 decimal places (JPY)', () => {
      expect(roundToPrecision(100.6, 0)).toBe(101);
      expect(roundToPrecision(100.4, 0)).toBe(100);
      expect(roundToPrecision(100.5, 0)).toBe(101);
    });

    it('should round to 3 decimal places (KWD)', () => {
      expect(roundToPrecision(10.5555, 3)).toBe(10.556);
      expect(roundToPrecision(10.5554, 3)).toBe(10.555);
    });

    it('should handle negative numbers', () => {
      expect(roundToPrecision(-10.555, 2)).toBe(-10.55);
      expect(roundToPrecision(-10.556, 2)).toBe(-10.56);
    });

    it('should handle floating-point edge cases', () => {
      // Classic floating-point issue: 0.1 + 0.2 !== 0.3
      const result = roundToPrecision(0.1 + 0.2, 2);
      expect(result).toBe(0.3);
    });
  });

  describe('getEpsilon', () => {
    it('should return correct epsilon for different precisions', () => {
      expect(getEpsilon(2)).toBeCloseTo(0.001, 10);
      expect(getEpsilon(0)).toBeCloseTo(0.1, 10);
      expect(getEpsilon(3)).toBeCloseTo(0.0001, 10);
    });
  });

  describe('amountsAreEqual', () => {
    it('should return true for equal amounts', () => {
      expect(amountsAreEqual(100.0, 100.0, 2)).toBe(true);
      expect(amountsAreEqual(100, 100, 0)).toBe(true);
    });

    it('should return true for amounts within epsilon', () => {
      expect(amountsAreEqual(100.0, 100.0005, 2)).toBe(true);
      expect(amountsAreEqual(100.0, 100.05, 0)).toBe(true);
    });

    it('should return false for amounts outside epsilon', () => {
      expect(amountsAreEqual(100.0, 100.01, 2)).toBe(false);
      expect(amountsAreEqual(100, 101, 0)).toBe(false);
    });
  });

  describe('safeAdd', () => {
    it('should add and round correctly', () => {
      expect(safeAdd(10.1, 20.2, 2)).toBe(30.3);
      expect(safeAdd(100, 50, 0)).toBe(150);
    });

    it('should handle floating-point addition correctly', () => {
      // Without rounding: 0.1 + 0.2 = 0.30000000000000004
      expect(safeAdd(0.1, 0.2, 2)).toBe(0.3);
    });
  });

  describe('safeSubtract', () => {
    it('should subtract and round correctly', () => {
      expect(safeSubtract(30.3, 10.1, 2)).toBe(20.2);
      expect(safeSubtract(150, 50, 0)).toBe(100);
    });

    it('should handle floating-point subtraction correctly', () => {
      expect(safeSubtract(0.3, 0.1, 2)).toBe(0.2);
    });
  });

  describe('safeMultiply', () => {
    it('should multiply and round correctly', () => {
      expect(safeMultiply(10.1, 2, 2)).toBe(20.2);
      expect(safeMultiply(0.1, 0.2, 2)).toBe(0.02);
    });

    it('should handle floating-point multiplication drift', () => {
      expect(safeMultiply(100, 1.005, 2)).toBe(100.5);
    });
  });

  describe('Money.multiply', () => {
    it('should round product like add/subtract', () => {
      const money = new Money(10.555, 'USD');
      expect(money.multiply(2).amount).toBe(21.11);
    });
  });

  describe('currency-aware Money defaults', () => {
    it('preserves three-decimal KWD amounts across arithmetic', () => {
      const amount = new Money(1.001, 'KWD');
      expect(amount.round().amount).toBe(1.001);
      expect(amount.add(new Money(0.001, 'KWD')).amount).toBe(1.002);
      expect(amount.subtract(new Money(0.001, 'KWD')).amount).toBe(1);
      expect(amount.multiply(1.5).amount).toBe(1.502);
    });

    it('uses zero-decimal precision for JPY and still honors explicit overrides', () => {
      const jpy = new Money(1.6, 'JPY');
      expect(jpy.round().amount).toBe(2);
      expect(jpy.add(new Money(1, 'JPY')).amount).toBe(3);
      expect(jpy.multiply(2).amount).toBe(3);
      expect(jpy.round(3).amount).toBe(1.6);
      expect(jpy.add(new Money(0.4, 'JPY'), 2).amount).toBe(2);
    });
  });

  describe('currency mismatch', () => {
    it('rejects add across currencies', () => {
      expect(() => new Money(10, 'USD').add(new Money(5, 'EUR'))).toThrow(
        'Currency mismatch in addition: USD vs EUR',
      );
    });

    it('rejects subtract across currencies', () => {
      expect(() => new Money(10, 'USD').subtract(new Money(5, 'JPY'))).toThrow(
        'Currency mismatch in subtraction: USD vs JPY',
      );
    });
  });
});

describe('headlineCurrency', () => {
  it('keeps the workplace currency when any item uses it', () => {
    expect(headlineCurrency(['EUR', 'USD', 'EUR'], 'USD')).toBe('USD');
  });
  it('falls back to the most common currency instead of an empty $0 headline', () => {
    expect(headlineCurrency(['INR', 'EUR', 'EUR'], 'USD')).toBe('EUR');
  });
  it('keeps the workplace currency when there is nothing to total', () => {
    expect(headlineCurrency([], 'USD')).toBe('USD');
  });
});

describe('sanitizeDecimalInput', () => {
  it('drops a minus sign by default', () => {
    expect(sanitizeDecimalInput('-50', 2)).toBe('50');
  });

  it('keeps one leading minus when negative amounts are allowed', () => {
    expect(sanitizeDecimalInput('-50', 2, { allowNegative: true })).toBe('-50');
    expect(sanitizeDecimalInput('−50.5', 2, { allowNegative: true })).toBe('-50.5');
  });

  it('keeps a lone minus so the user can type the digits after it', () => {
    expect(sanitizeDecimalInput('-', 2, { allowNegative: true })).toBe('-');
  });

  it('still rejects too many decimal places and stray separators', () => {
    expect(sanitizeDecimalInput('-1.234', 2, { allowNegative: true })).toBeNull();
    expect(sanitizeDecimalInput('-1.2.3', 2, { allowNegative: true })).toBeNull();
  });
});

describe('sumByCurrency', () => {
  it('skips non-finite amounts and blank currency codes safely', () => {
    expect(
      sumByCurrency([
        { amount: Number.NaN, currencyCode: 'USD' },
        { amount: Number.POSITIVE_INFINITY, currencyCode: 'USD' },
        { amount: 25, currencyCode: '' },
        { amount: 12.34, currencyCode: 'usd' },
        { amount: 7.66, currencyCode: 'USD' },
      ]),
    ).toEqual([{ amount: 20, currencyCode: 'USD' }]);
  });
});
