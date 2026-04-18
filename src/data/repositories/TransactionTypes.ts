/**
 * Valid primitive types for raw SQL query arguments.
 * Note: JS Date objects must be converted to timestamps (number) before passing
 * to the SQL engine to ensure driver compatibility.
 */
export type RawSQLArg = string | number | boolean | null;

/**
 * Shared types and DTOs for transaction-related data.
 * These are primarily used for high-performance raw SQL queries.
 */

/**
 * Minimal transaction data required for running balance rebuilds.
 */
export interface RebuildTransaction {
  id: string;
  amount: number;
  transactionType: string;
  transactionDate: number;
  runningBalance: number | null;
  createdAt: number;
}

/**
 * Daily net balance change data.
 */
export interface DailyDelta {
  dayStart: number;
  currencyCode: string;
  accountType: string;
  delta: number;
}

/**
 * Account-level net balance change data.
 */
export interface AccountDelta {
  accountId: string;
  currencyCode: string;
  delta: number;
}

/**
 * Recurring transaction pattern candidate.
 */
export interface RecurringPattern {
  amount: number;
  accountId: string;
  currencyCode: string;
  occurrenceCount: number;
  journalIds: string;
  firstDate: number;
  lastDate: number;
}

/**
 * Internal interface for raw account query results matching the SQL schema.
 */
export interface RawAccountRow {
  id: string;
  name: string;
  account_type: string;
  account_subtype?: string;
  currency_code: string;
  icon?: string;
  parent_account_id?: string;
  direct_balance: number;
  direct_transaction_count: number;
  periodIncrease: number;
  periodDecrease: number;
}
