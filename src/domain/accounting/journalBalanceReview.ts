import type { TransactionType } from '@/src/types/enums';
import type {
  JournalBalanceEvaluation,
  UniqueJournalFxRateProposal,
} from './journalBalanceEvaluator';

/** One posting line of a journal under balance review. */
export interface JournalBalanceReviewLine {
  id: string;
  accountId: string;
  accountName?: string;
  /** Undefined when the account is missing or deleted. */
  accountCurrency?: string;
  /** Account currency, or the line's stored currency when the account is gone. */
  currency: string;
  transactionType: TransactionType;
  amount: number;
  exchangeRate?: number;
  proposedExchangeRate?: number;
}

/** A journal that fails the balance rule, reviewed during restore or from saved entries. */
export interface JournalBalanceReviewEntry<Id extends string = string> {
  journalId: Id;
  description?: string;
  journalDate: number;
  currencyCode: string;
  precisionByCurrency: ReadonlyMap<string, number>;
  lines: readonly JournalBalanceReviewLine[];
  details: string;
  evaluation: JournalBalanceEvaluation;
  fxProposal?: UniqueJournalFxRateProposal;
}

export interface JournalBalanceLineEdit {
  readonly transactionId: string;
  readonly amount: string;
  readonly exchangeRate?: string;
}
