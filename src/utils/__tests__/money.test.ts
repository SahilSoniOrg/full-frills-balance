/**
 * Unit tests for precision-aware money utilities
 */

import {
  amountsAreEqual,
  getEpsilon,
  Money,
  roundToPrecision,
  safeAdd,
  safeMultiply,
  safeSubtract,
} from '@/src/utils/money';

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
});
