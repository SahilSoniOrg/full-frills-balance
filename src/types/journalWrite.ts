import { JournalStatus, TransactionType } from './enums';
import { AccountId, JournalId, PlannedPaymentId } from './ids';

export interface JournalWriteLine {
  accountId: AccountId;
  amount: number;
  transactionType: TransactionType;
  notes?: string;
  exchangeRate?: number;
  currencyCode?: string;
}

export interface JournalWriteMetadata {
  importSource: string;
  originalSmsId?: string;
  originalSmsSender?: string;
  originalSmsBody?: string;
  metadataJson?: string;
}

/** Shared fields for a complete journal write; excludes persistence-only identifiers. */
export interface JournalWriteFields {
  journalDate: number;
  description?: string;
  notes?: string;
  currencyCode: string;
  originalJournalId?: JournalId;
  status?: JournalStatus;
  plannedPaymentId?: PlannedPaymentId;
  transactions: JournalWriteLine[];
  metadata?: JournalWriteMetadata;
}

/** Plain journal input shared by editor, SMS, and import preparation flows. */
export type CreateJournalData = JournalWriteFields;
