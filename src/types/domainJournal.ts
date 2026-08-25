import { AccountId, JournalId, TransactionId } from './ids';

export type TabType = 'expense' | 'income' | 'transfer';
export type AccountRole = 'source' | 'destination';

export interface TransactionDuplicateCandidate {
  journalId: JournalId;
  journalDate: number;
  description?: string;
  totalAmount?: number;
  currencyCode?: string;
  score: number;
  reasons: string[];
}

export interface BulkDeleteUndoToken {
  journals: { id: JournalId; deletedAt: number }[];
  transactions: { id: TransactionId; journalId: JournalId; deletedAt: number }[];
}

export interface TransactionLinkedJournalInfo {
  journalId: JournalId;
  description?: string;
  journalDate: number;
  status: string;
  totalAmount?: number;
  currencyCode?: string;
  displayType?: string;
}

export type TransactionChannel = 'sms' | 'voice';

export interface TransactionInboxItem {
  id: string;
  channel: TransactionChannel;
  deviceSourceId: string;
  senderAddress?: string;
  rawBody?: string;
  inputDate: number;
  parseStatus: string;
  processingStatus: string;
  parsedAmount?: number;
  parsedCurrencyCode?: string;
  parsedMerchant?: string;
  parsedAccountSource?: string;
  referenceNumber?: string;
  direction: 'debit' | 'credit' | 'unknown';
  parseConfidence?: number;
  parseReason?: string;
  linkedJournal?: TransactionLinkedJournalInfo;
  duplicateCandidate?: TransactionDuplicateCandidate;
}

export interface SmsSourceMetadata {
  smsFingerprint?: string;
  deviceSmsId: string;
  senderAddress: string;
  rawBody: string;
  smsDate: number;
  parsedMerchant?: string;
  parsedAmount?: number;
  parsedCurrencyCode?: string;
  referenceNumber?: string;
}

export interface JournalMetadata {
  importSource: 'SMS' | 'CASHEW' | 'MANUAL' | string;
  sms?: SmsSourceMetadata;
  externalId?: string;
  metadataJson?: string;
}

export interface JournalEntryLine {
  id: TransactionId;
  accountId: AccountId;
  accountName: string;
  accountType: import('./enums').AccountType;
  amount: string;
  transactionType: import('./enums').TransactionType;
  notes: string;
  exchangeRate: string;
  accountCurrency?: string;
}
