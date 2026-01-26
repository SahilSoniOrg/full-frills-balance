/**
 * Accounting Constants
 * 
 * Centralized constants for accounting calculations.
 * Extract magic numbers to named constants for maintainability.
 */

/**
 * Epsilon for balance comparisons.
 * Two balances differing by less than this are considered equal.
 */
export const BALANCE_EPSILON = 0.01

/**
 * Minimum valid exchange rate.
 * Prevents division by zero and unrealistic rates.
 */
export const MIN_EXCHANGE_RATE = 0.000001

/**
 * Default currency code used as a last-resort fallback.
 * Applications should prioritize using user preferences.
 */
export const FALLBACK_CURRENCY = 'USD'
