import { AppConfig } from '@/src/constants';

/**
 * Rounds a number to a specific precision (decimal places).
 * Essential for the "edge-rounding" strategy to prevent floating-point drift.
 */
export const roundToPrecision = (amount: number, precision: number): number => {
  const factor = Math.pow(10, precision);
  return Math.round((amount + Number.EPSILON) * factor) / factor;
};

/** Scale that turns a major-unit amount into whole minor units. */
export const minorUnitFactor = (precision: number): number => 10 ** precision;

/** Whole minor units (cents, etc.) using the same edge-rounding as `roundToPrecision`. */
export const toMinorUnits = (amount: number, precision: number): number => {
  return Math.round((amount + Number.EPSILON) * minorUnitFactor(precision));
};

export const fromMinorUnits = (minorUnits: number, precision: number): number => {
  return minorUnits / minorUnitFactor(precision);
};

/** Display string for an amount already rounded to the currency's precision. */
export const formatRoundedAmount = (amount: number, precision: number): string => {
  return roundToPrecision(amount, precision).toFixed(precision);
};

/**
 * Returns dynamic epsilon for zero-balance checks based on precision.
 * e.g., for precision 2, epsilon is 0.001.
 */
export const getEpsilon = (precision: number): number => {
  return Math.pow(10, -(precision + 1));
};

/**
 * Compares two amounts for equality using rounding to specific precision.
 * This is more robust against accumulated floating-point noise than simple epsilon checks.
 */
export const amountsAreEqual = (a: number, b: number, precision: number): boolean => {
  return roundToPrecision(a, precision) === roundToPrecision(b, precision);
};

/**
 * Safe addition with immediate rounding.
 */
export const safeAdd = (a: number, b: number, precision: number): number => {
  return roundToPrecision(a + b, precision);
};

/**
 * Safe subtraction with immediate rounding.
 */
export const safeSubtract = (a: number, b: number, precision: number): number => {
  return roundToPrecision(a - b, precision);
};

/**
 * Safe multiplication with immediate rounding.
 */
export const safeMultiply = (a: number, factor: number, precision: number): number => {
  return roundToPrecision(a * factor, precision);
};

/**
 * Money - Standard value object for currency amounts.
 * Encapsulates amount and currencyCode.
 */
export class Money {
  public readonly amount: number;
  public readonly currencyCode: string;

  constructor(amount: number, currencyCode: string = AppConfig.defaultCurrency) {
    this.amount = amount;
    this.currencyCode = currencyCode;
  }

  /**
   * Creates a new Money instance with the amount rounded to the given precision.
   */
  public round(precision: number = AppConfig.defaultCurrencyPrecision): Money {
    return new Money(roundToPrecision(this.amount, precision), this.currencyCode);
  }

  /**
   * Adds another Money instance of the SAME currency.
   */
  public add(other: Money): Money {
    if (this.currencyCode !== other.currencyCode) {
      throw new Error(
        `Currency mismatch in addition: ${this.currencyCode} vs ${other.currencyCode}`,
      );
    }
    return new Money(
      safeAdd(this.amount, other.amount, AppConfig.defaultCurrencyPrecision),
      this.currencyCode,
    );
  }

  /**
   * Subtracts another Money instance of the SAME currency.
   */
  public subtract(other: Money): Money {
    if (this.currencyCode !== other.currencyCode) {
      throw new Error(
        `Currency mismatch in subtraction: ${this.currencyCode} vs ${other.currencyCode}`,
      );
    }
    return new Money(
      safeSubtract(this.amount, other.amount, AppConfig.defaultCurrencyPrecision),
      this.currencyCode,
    );
  }

  /**
   * Multiplies the amount by a factor (e.g., exchange rate).
   */
  public multiply(factor: number): Money {
    return new Money(
      safeMultiply(this.amount, factor, AppConfig.defaultCurrencyPrecision),
      this.currencyCode,
    );
  }

  /**
   * Static factory for easier creation.
   */
  public static from(amount: number, currencyCode?: string): Money {
    return new Money(amount, currencyCode);
  }
}
