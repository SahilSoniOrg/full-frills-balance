import { AccountId, JournalId, TransactionId } from '@/src/types/ids';
import { AccountType, TransactionType } from '@/src/types/enums';

export interface RebuildTransaction {
  id: TransactionId;
  amount: number;
  transactionType: string;
  transactionDate: number;
  runningBalance: number | null;
  createdAt: number;
}

export interface DailyDelta {
  dayStart: number;
  currencyCode: string;
  accountType: AccountType;
  delta: number;
  /** Saved journal context retained until historical valuation is complete. */
  journalCurrencyCode?: string;
  journalDate?: number;
  exchangeRate?: number | null;
}

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

export interface TransactionMetadata {
  id: TransactionId;
  journalId: JournalId;
  accountId: AccountId;
  amount: number;
  transactionDate: number;
  transactionType: TransactionType;
  currencyCode: string;
}

/** Per-account cursor used to count ledger rows after the latest snapshot. */
export interface AccountTransactionBoundary {
  accountId: AccountId;
  startDate: number;
  afterTransactionId?: TransactionId;
  afterTransactionDate?: number;
  afterTransactionCreatedAt?: number;
}

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
