import {
  AccountId,
  AccountType,
  JournalId,
  TransactionId,
  TransactionType,
} from '@/src/types/domain';

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
  id: TransactionId;
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
  accountType: AccountType;
  delta: number;
}

/**
 * Account-level net balance change data.
 */
export interface AccountDelta {
  accountId: AccountId;
  currencyCode: string;
  delta: number;
}

/**
 * Recurring transaction pattern candidate.
 */
export interface RecurringPattern {
  amount: number;
  accountId: AccountId;
  currencyCode: string;
  occurrenceCount: number;
  journalIds: string;
  transactionDates: string; // Comma-separated timestamps
  description?: string;
  firstDate: number;
  lastDate: number;
}

/**
 * Minimal transaction projection used by insight calculations.
 */
export interface TransactionMetadata {
  id: TransactionId;
  journalId: JournalId;
  accountId: AccountId;
  amount: number;
  transactionDate: number;
  transactionType: TransactionType;
  currencyCode: string;
}

/**
 * Internal interface for raw account query results matching the SQL schema.
 */
export interface RawAccountRow {
  id: AccountId;
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
