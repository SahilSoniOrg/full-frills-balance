import { AppConfig } from '@/src/constants';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';

/**
 * Rounds a number to a specific precision (decimal places).
 * Essential for the "edge-rounding" strategy to prevent floating-point drift.
 */
export const roundToPrecision = (amount: number, precision: number): number => {
  const factor = Math.pow(10, precision);
  return Math.round((amount + Number.EPSILON) * factor) / factor;
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
 * Formats a number as a currency string.
 * @param amount The value to format
 * @param currencyCode The ISO currency code
 */
export const formatCurrency = (
  amount: number,
  currencyCode: string = AppConfig.defaultCurrency,
): string => {
  // Redirect to centralized CurrencyFormatter to ensure symbol fallback logic is applied
  return CurrencyFormatter.format(amount, currencyCode);
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
    return new Money(this.amount * factor, this.currencyCode);
  }

  /**
   * Formats the amount as a currency string.
   */
  public format(): string {
    return formatCurrency(this.amount, this.currencyCode);
  }

  /**
   * Static factory for easier creation.
   */
  public static from(amount: number, currencyCode?: string): Money {
    return new Money(amount, currencyCode);
  }
}
