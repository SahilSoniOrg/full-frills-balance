import {
  AuditEntityType,
  PlannedPaymentInterval,
  PlannedPaymentStatus,
  AccountSubtype,
  AccountType,
  AccountId,
  BudgetId,
  JournalDisplayType,
  JournalId,
  PlannedPaymentId,
  TransactionId,
} from '@/src/types/domain';
import { IconName } from '@/src/types/domainIcons';

export interface ImportedAccount {
  id: string;
  name: string;
  accountType: AccountType | string;
  accountSubtype?: AccountSubtype | string;
  currencyCode: string;
  parentAccountId?: AccountId;
  description?: string;
  icon?: IconName;
  orderNum?: number;
  reconciledAt?: number;
  createdAt?: number;
  updatedAt?: number;
  deletedAt?: number;
}

export interface ImportedJournal {
  id: string;
  journalDate: number;
  description?: string;
  notes?: string;
  currencyCode: string;
  status: string;
  totalAmount: number;
  transactionCount: number;
  displayType: JournalDisplayType;
  createdAt?: number;
  updatedAt?: number;
  deletedAt?: number;
  originalJournalId?: JournalId;
  reversingJournalId?: JournalId;
  plannedPaymentId?: PlannedPaymentId;
}

export interface ImportedTransaction {
  id: string;
  journalId: JournalId;
  accountId: AccountId;
  amount: number;
  transactionType: string;
  currencyCode: string;
  transactionDate: number;
  notes?: string;
  exchangeRate?: number;
  runningBalance?: number;
  createdAt?: number;
  updatedAt?: number;
  deletedAt?: number;
}

export interface ImportedAuditLog {
  id: string;
  entityType: AuditEntityType;
  entityId: string;
  action: string;
  changes: string;
  timestamp: number;
  createdAt?: number;
}

export interface ImportedBudget {
  id: string;
  name: string;
  amount: number;
  currencyCode: string;
  startMonth: string;
  active: boolean;
  intervalType?: string;
  intervalN?: number;
  startDate?: number;
  recurrenceDay?: number;
  recurrenceMonth?: number;
  assetAccountIds?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface ImportedBudgetScope {
  id: string;
  budgetId: BudgetId;
  accountId: AccountId;
  createdAt?: number;
  updatedAt?: number;
}

export interface ImportedCurrency {
  id: string;
  code: string;
  symbol: string;
  name: string;
  precision: number;
  createdAt?: number;
  updatedAt?: number;
  deletedAt?: number;
}

export interface ImportedExchangeRate {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  effectiveDate: number;
  source: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface ImportedAccountMetadata {
  id: string;
  accountId: AccountId;
  statementDay?: number;
  dueDay?: number;
  minimumPaymentAmount?: number;
  minimumBalanceAmount?: number;
  creditLimitAmount?: number;
  aprBps?: number;
  emiDay?: number;
  loanTenureMonths?: number;
  autopayEnabled?: boolean;
  gracePeriodDays?: number;
  payFromAccountId?: AccountId;
  minPaymentOnly?: boolean;
  minimumPaymentPercent?: number;
  notes?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface ImportedPlannedPayment {
  id: string;
  name: string;
  description?: string;
  amount: number;
  currencyCode: string;
  fromAccountId: AccountId;
  toAccountId: AccountId;
  intervalN: number;
  intervalType: PlannedPaymentInterval | string;
  startDate: number;
  endDate?: number;
  nextOccurrence: number;
  status: PlannedPaymentStatus | string;
  isAutoPost: boolean;
  recurrenceDay?: number;
  recurrenceMonth?: number;
  createdAt?: number;
  updatedAt?: number;
  deletedAt?: number;
}

export interface ImportedJournalMetadata {
  id: string;
  journalId: string;
  importSource: string;
  originalSmsId?: string;
  originalSmsSender?: string;
  originalSmsBody?: string;
  metadataJson?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface ImportedTransactionInboxRecord {
  id: string;
  channel: string;
  deviceSourceId: string;
  senderAddress?: string;
  rawBody?: string;
  inputDate: number;
  inputFingerprint: string;
  parseStatus: string;
  parsedAmount?: number;
  parsedCurrencyCode?: string;
  parsedMerchant?: string;
  parsedAccountSource?: string;
  referenceNumber?: string;
  direction: string;
  processingStatus: string;
  linkedJournalId?: JournalId;
  duplicateJournalId?: JournalId;
  duplicateConfidence?: number;
  parseConfidence?: number;
  parseReason?: string;
  metadataJson?: string;
  firstSeenAt: number;
  lastScannedAt: number;
  processedAt?: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface ImportedTransactionAutoPostRule {
  id: string;
  channelsJson?: string;
  senderMatch?: string;
  bodyMatch?: string;
  conditionsJson?: string;
  actionsJson?: string;
  priority?: number;
  sourceAccountId: AccountId;
  categoryAccountId: AccountId;
  isActive: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface ImportedBalanceSnapshot {
  id: string;
  accountId: AccountId;
  transactionId: TransactionId;
  transactionDate: number;
  absoluteBalance: number;
  transactionCount: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface ChangeSet<T> {
  created?: T[];
  updated?: T[];
  deleted?: string[];
}

export interface BatchImportData {
  accounts: ImportedAccount[];
  journals: ImportedJournal[];
  transactions: ImportedTransaction[];
  budgets?: ImportedBudget[];
  budgetScopes?: ImportedBudgetScope[];
  auditLogs?: ImportedAuditLog[];
  currencies?: ImportedCurrency[];
  exchangeRates?: ImportedExchangeRate[];
  accountMetadata?: ImportedAccountMetadata[];
  plannedPayments?: ImportedPlannedPayment[];
  journalMetadata?: ImportedJournalMetadata[];
  transactionAutoPostRules?: ImportedTransactionAutoPostRule[];
  transactionInboxRecords?: ImportedTransactionInboxRecord[];
  balanceSnapshots?: ImportedBalanceSnapshot[];
}
