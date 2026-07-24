import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { AccountId } from '@/src/types/domain';

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
