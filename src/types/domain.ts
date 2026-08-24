import { AccountId, JournalId, PlannedPaymentId, TransactionId } from './ids';
import { AccountType, JournalDisplayType, SemanticType, TransactionType } from './enums';

export * from './ids';
export * from './enums';
export * from './plainDtos';
export * from './audit';

export type TabType = 'expense' | 'income' | 'transfer';
export type AccountRole = 'source' | 'destination';

/**
 * Money - Standard value object for currency amounts.
 */
export interface Money {
  amount: number;
  currencyCode: string;
}

/**
 * Domain-owned models and read models for UI consumption.
 * These are types that often combine multiple entities for presentation.
 * Follows Rule 3: Data-Driven UI (these define the 'data' the UI consumes).
 */

/**
 * AccountBalance - Summary of an account's financial state
 */
export interface AccountBalance {
  accountId: AccountId;
  balance: number;
  directBalance: number;
  currencyCode: string;
  transactionCount: number;
  directTransactionCount: number;
  asOfDate: number;
  accountType: AccountType;
  icon?: string;
  monthlyIncome: number;
  monthlyExpenses: number;
  childBalances?: { currencyCode: string; balance: number; transactionCount: number }[];
}

/**
 * Counterparty account summary for ledger transaction cards.
 */
export interface DisplayCounterAccount {
  id: AccountId;
  name: string;
  accountType: AccountType;
  icon?: string;
}

/**
 * DisplayTransaction - Leg-level read model for journal details and ingestion.
 * List cards use EnrichedJournal via the journal timeline mapper instead.
 */
export interface DisplayTransaction {
  id: TransactionId;
  journalId?: JournalId;
  accountId: AccountId;
  amount: number;
  currencyCode: string;
  transactionType: TransactionType;
  transactionDate: number;
  notes?: string;
  journalDescription?: string;

  // Account information for display
  accountName?: string;
  accountType?: AccountType;
  counterAccounts?: DisplayCounterAccount[];
  displayTitle: string;
  displayType?: JournalDisplayType;
  icon?: string;

  // Semantic and derived flags
  isIncrease: boolean;
  flowDirection?: 'IN' | 'OUT';
  balanceImpact?: 'INCREASE' | 'DECREASE';

  // Running balance for this transaction
  runningBalance?: number;
  exchangeRate?: number;

  // Feature-specific metadata
  semanticType?: string;
  semanticLabel?: string;

  // Audit fields
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * JournalWithTransactionSummary - Journal data with computed summary from its transactions
 */
export interface JournalWithTransactionSummary {
  id: JournalId;
  journalDate: number;
  description?: string;
  currencyCode: string;
  status: string;

  // Computed transaction summary
  totalDebits: number;
  totalCredits: number;
  transactionCount: number;
  isBalanced: boolean;

  // Audit fields
  createdAt: Date;
  updatedAt: Date;
}

/**
 * AccountWithBalance - Account data with its current balance information
 */
export interface AccountWithBalance {
  id: AccountId;
  name: string;
  accountType: AccountType;
  currencyCode: string;
  description?: string;

  // Computed balance information
  currentBalance: number;
  transactionCount: number;
  lastActivityDate?: number;
  icon?: string;

  // Audit fields
  createdAt: Date;
  updatedAt: Date;
}

/**
 * EnrichedJournal - Highly processed journal data for card-style list display
 */
export interface EnrichedJournal {
  id: JournalId;
  journalDate: number;
  description?: string;
  currencyCode: string;
  status: string;
  totalAmount: number;
  transactionCount: number;
  displayType: JournalDisplayType;
  accounts: {
    id: AccountId;
    name: string;
    accountType: string;
    icon?: string;
    role: 'SOURCE' | 'DESTINATION' | 'NEUTRAL';
    /** Per-leg amount for this account; used by account-scoped ledger views. */
    amount?: number;
  }[];
  semanticType?: SemanticType;
  semanticLabel?: string;
  notes?: string;
  plannedPaymentId?: PlannedPaymentId;
}

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
}

export type TransactionChannel = 'sms' | 'voice';

export interface TransactionInboxItem {
  id: string; // Internal record ID
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

/**
 * SmsSourceMetadata - Detailed metadata for entries imported from SMS.
 */
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

/**
 * JournalMetadata - Consolidated domain metadata for a journal entry.
 */
export interface JournalMetadata {
  importSource: 'SMS' | 'CASHEW' | 'MANUAL' | string;
  sms?: SmsSourceMetadata;
  externalId?: string;
  metadataJson?: string; // Fallback for unstructured historical data
}

/**
 * JournalEntryLine - UI-specific model for a single line in the journal editor.
 * Used in guided and advanced forms.
 */
export interface JournalEntryLine {
  id: TransactionId; // Line ID is transient
  accountId: AccountId;
  accountName: string;
  accountType: AccountType;
  amount: string;
  transactionType: TransactionType;
  notes: string;
  exchangeRate: string;
  accountCurrency?: string;
}

/**
 * AccountCreateInput - Input for creating a new account
 */
export interface AccountCreateInput {
  name: string;
  accountType: AccountType;
  currencyCode: string;
  description?: string;
  parentAccountId?: AccountId;
  icon?: string;
  initialBalance?: number;
}

/**
 * AccountUpdateInput - Input for updating an existing account
 */
export interface AccountUpdateInput {
  name?: string;
  description?: string;
  parentAccountId?: AccountId;
  accountType?: AccountType;
  icon?: string;
}

/**
 * AccountSummary - Aggregated financial summary across accounts
 */
export interface AccountSummary {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  totalIncome: number;
  totalExpenses: number;
  netWorth: number;
}
