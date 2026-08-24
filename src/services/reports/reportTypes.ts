import { AccountType, TransactionType } from '@/src/types/enums';
import { AccountId } from '@/src/types/ids';

export interface ConvertedReportTransaction {
  accountId: AccountId;
  accountType: AccountType;
  transactionType: TransactionType;
  transactionDate: number;
  amount: number;
}

export interface ReportAccount {
  id: AccountId;
  name: string;
  currencyCode?: string;
  accountType: AccountType;
  accountSubtype?: string;
  /** Custom per-account accent color (hex, '' = auto). */
  color?: string;
}

export interface ReportingDeltaInput {
  accountId?: AccountId;
  currencyCode: string;
  delta: number;
  amount?: number;
  dayStart?: number;
  accountType?: AccountType;
  /** Per-leg rate from the transaction when available (historical conversion). */
  exchangeRate?: number;
}

export interface CategoryBreakdown {
  category: string; // AccountSubtype
  amount: number;
  percentage: number;
  accountIds: AccountId[];
  color?: string;
}
