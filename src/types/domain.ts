import { IconName } from '@/src/components/core/AppIcon';
import { AccountSubtype, AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';

export declare const __brand: unique symbol;
export type Brand<T, B> = T & { readonly [__brand]: B };

export type WorkplaceId = Brand<string, 'WorkplaceId'>;
export const asWorkplaceId = (id: string): WorkplaceId => id as WorkplaceId;

export type AccountId = Brand<string, 'AccountId'>;
export const EMPTY_ACCOUNT_ID: AccountId = '' as AccountId;

export type JournalId = Brand<string, 'JournalId'>;
export type TransactionId = Brand<string, 'TransactionId'>;
export type BudgetId = Brand<string, 'BudgetId'>;
export type PlannedPaymentId = Brand<string, 'PlannedPaymentId'>;

export type TabType = 'expense' | 'income' | 'transfer';
export type AccountRole = 'source' | 'destination';

export enum JournalDisplayType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
  TRANSFER = 'TRANSFER',
  MIXED = 'MIXED',
}

export enum SemanticType {
  // Asset sourced
  TRANSFER = 'TRANSFER',
  DEBT_PAYMENT = 'DEBT_PAYMENT',
  OWNER_WITHDRAWAL = 'OWNER_WITHDRAWAL',
  INCOME_REVERSAL = 'INCOME_REVERSAL',
  PURCHASE = 'PURCHASE',

  // Liability sourced
  BORROWING = 'BORROWING',
  LIABILITY_TRANSFER = 'LIABILITY_TRANSFER',
  DEBT_CONVERSION = 'DEBT_CONVERSION',
  LIABILITY_ADJUSTMENT = 'LIABILITY_ADJUSTMENT',
  EXPENSE_ON_CREDIT = 'EXPENSE_ON_CREDIT',

  // Equity sourced
  BALANCE_ADJUSTMENT = 'BALANCE_ADJUSTMENT',
  LIABILITY_FUNDING = 'LIABILITY_FUNDING',
  EQUITY_TRANSFER = 'EQUITY_TRANSFER',
  EQUITY_INCOME_ADJUSTMENT = 'EQUITY_INCOME_ADJUSTMENT',
  OWNER_SPENDING = 'OWNER_SPENDING',

  // Income sourced
  INCOME_RECEIVED = 'INCOME_RECEIVED',
  DEBT_PAYDOWN = 'DEBT_PAYDOWN',
  SAVINGS_ALLOCATION = 'SAVINGS_ALLOCATION',
  INCOME_RECLASSIFICATION = 'INCOME_RECLASSIFICATION',
  TAX_OR_FEE = 'TAX_OR_FEE',

  // Expense sourced
  REFUND = 'REFUND',
  CREDIT_REFUND = 'CREDIT_REFUND',
  EXPENSE_CAPITALIZATION = 'EXPENSE_CAPITALIZATION',
  EXPENSE_REVERSAL = 'EXPENSE_REVERSAL',
  EXPENSE_RECLASSIFICATION = 'EXPENSE_RECLASSIFICATION',

  UNKNOWN = 'UNKNOWN',
}

export { AccountType, TransactionType };

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
 * DisplayTransaction - Unified read model for transactions in the UI.
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
  counterAccountName?: string;
  counterAccountType?: AccountType;
  displayTitle: string;
  displayType?: JournalDisplayType;
  icon?: string;
  counterAccountIcon?: string;

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
  }[];
  semanticType?: SemanticType;
  semanticLabel?: string;
  notes?: string;
  plannedPaymentId?: PlannedPaymentId;
}

export interface SmsDuplicateCandidate {
  journalId: JournalId;
  journalDate: number;
  description?: string;
  score: number;
  reasons: string[];
}

export interface SmsLinkedJournalInfo {
  journalId: JournalId;
  description?: string;
  journalDate: number;
  status: string;
}

export interface SmsInboxItem {
  id: string; // Internal record ID, keeping as string for now as it's not a primary domain entity yet
  deviceSmsId: string;
  senderAddress: string;
  rawBody: string;
  smsDate: number;
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
  linkedJournal?: SmsLinkedJournalInfo;
  duplicateCandidate?: SmsDuplicateCandidate;
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
 * @deprecated Use JournalMetadata instead
 */
export type JournalSmsMetadata = JournalMetadata;

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
/**
 * Audit State Interfaces - Used for type-safe reversion logic
 */

export interface TransactionAuditState {
  accountId: AccountId;
  amount: number;
  transactionType: TransactionType;
  notes?: string;
  exchangeRate?: number;
  currencyCode?: string;
}

export interface JournalAuditState {
  description?: string;
  journalDate?: number;
  currencyCode?: string;
  status?: string;
  totalAmount?: number;
  transactions?: TransactionAuditState[];
  deletedAt?: Date;
  restoredAt?: Date;
}

export interface AccountAuditState {
  name?: string;
  accountType?: AccountType;
  accountSubtype?: AccountSubtype;
  currencyCode?: string;
  description?: string;
  icon?: IconName;
  parentAccountId?: AccountId;
  deletedAt?: Date;
  restoredAt?: Date;
}
/**
 * TransactionLike - Minimal interface for mapping transactions to audit state.
 */
export interface TransactionLike {
  accountId: AccountId;
  amount: number;
  transactionType: TransactionType;
  notes?: string;
  exchangeRate?: number;
  currencyCode?: string;
}

/**
 * Maps a Transaction model or object to a TransactionAuditState for logging.
 */
export function mapTransactionToAudit(t: TransactionLike): TransactionAuditState {
  return {
    accountId: t.accountId,
    amount: t.amount,
    transactionType: t.transactionType,
    notes: t.notes || undefined,
    exchangeRate: t.exchangeRate || undefined,
    currencyCode: t.currencyCode || undefined,
  };
}
