import { IconName } from '@/src/types/domainIcons';

export enum AccountType {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
}

export enum AccountSubtype {
  CASH = 'CASH',
  WALLET = 'WALLET',
  BANK_CHECKING = 'BANK_CHECKING',
  BANK_SAVINGS = 'BANK_SAVINGS',
  FIXED_DEPOSIT = 'FIXED_DEPOSIT',
  MONEY_MARKET = 'MONEY_MARKET',
  BROKERAGE = 'BROKERAGE',
  RETIREMENT = 'RETIREMENT',
  EMERGENCY_FUND = 'EMERGENCY_FUND',
  CREDIT_CARD = 'CREDIT_CARD',
  LINE_OF_CREDIT = 'LINE_OF_CREDIT',
  OVERDRAFT = 'OVERDRAFT',
  MORTGAGE = 'MORTGAGE',
  STUDENT_LOAN = 'STUDENT_LOAN',
  AUTO_LOAN = 'AUTO_LOAN',
  PERSONAL_LOAN = 'PERSONAL_LOAN',
  LOAN = 'LOAN',
  INVESTMENT = 'INVESTMENT',
  RECEIVABLE = 'RECEIVABLE',
  TAX_RECEIVABLE = 'TAX_RECEIVABLE',
  PAYABLE = 'PAYABLE',
  TAX_PAYABLE = 'TAX_PAYABLE',
  OPENING_BALANCE = 'OPENING_BALANCE',
  NET_WORTH_ADJUSTMENT = 'NET_WORTH_ADJUSTMENT',
  TRANSFER_CLEARING = 'TRANSFER_CLEARING',
  SALARY = 'SALARY',
  BUSINESS_INCOME = 'BUSINESS_INCOME',
  INTEREST_INCOME = 'INTEREST_INCOME',
  DIVIDEND_INCOME = 'DIVIDEND_INCOME',
  RENT_INCOME = 'RENT_INCOME',
  FOOD = 'FOOD',
  HOUSING = 'HOUSING',
  TRANSPORT = 'TRANSPORT',
  UTILITIES = 'UTILITIES',
  HEALTHCARE = 'HEALTHCARE',
  EDUCATION = 'EDUCATION',
  ENTERTAINMENT = 'ENTERTAINMENT',
  SHOPPING = 'SHOPPING',
  TAX = 'TAX',
  TRANSFER = 'TRANSFER',
  OTHER = 'OTHER',
}

export enum TransactionType {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

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

/**
 * PlainAccount - Plain JSON object representation of an Account model.
 * Used for high-performance snapshot serialization (MMKV) and type safety.
 */
export interface PlainAccount {
  id: AccountId;
  name: string;
  accountType: AccountType;
  accountSubtype?: AccountSubtype;
  currencyCode: string;
  parentAccountId?: AccountId;
  description?: string;
  icon?: IconName;
  orderNum?: number;
  reconciledAt?: number;
  createdAt?: number;
  updatedAt?: number;
  deletedAt?: number;
  archivedAt?: number;
}

export interface PlainBudget {
  id: BudgetId;
  name: string;
  amount: number;
  currencyCode: string;
  intervalType?: string;
  periodType?: string;
  intervalN?: number;
  startDate?: number;
  recurrenceDay?: number;
  recurrenceMonth?: number;
  createdAt?: Date | number;
}

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
  score: number;
  reasons: string[];
}

export interface TransactionLinkedJournalInfo {
  journalId: JournalId;
  description?: string;
  journalDate: number;
  status: string;
}

export interface TransactionInboxItem {
  id: string; // Internal record ID
  channel: 'sms' | 'voice' | 'email';
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
  /** null = explicitly not archived. Persisted audits use ISO strings; normalized to Date at revert. */
  archivedAt?: Date | null;
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

export interface SerializedAccountMetadataPayload {
  statementDay: number | null;
  dueDay: number | null;
  creditLimitAmount: number | null;
  aprBps: number | null;
  emiDay: number | null;
  loanTenureMonths: number | null;
  minimumPaymentAmount: number | null;
  minimumPaymentPercent: number | null;
  minPaymentOnly: boolean;
  payFromAccountId: AccountId | null;
  notes: string | null;
}
