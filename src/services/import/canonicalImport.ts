import { AuditEntityType } from '@/src/data/models/AuditLog';
import {
  AccountSubtype,
  AccountType,
  TransactionType,
  AccountId,
  BudgetId,
  JournalDisplayType,
  JournalId,
  PlannedPaymentId,
  TransactionId,
} from '@/src/types/domain';

import { JournalStatus } from '@/src/data/models/Journal';
import { PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/data/models/PlannedPayment';

import { IconName } from '@/src/types/domainIcons';
import { UIPreferences } from '@/src/utils/preferences';

/** Discriminant for the canonical import contract; extend with new versions as unions. */
export const CANONICAL_IMPORT_VERSION_V1 = 'canonical-import.v1' as const;

export type CanonicalImportVersion = typeof CANONICAL_IMPORT_VERSION_V1;

/**
 * Versioned discriminated union for plugin output. Only v1 today; add v2 as a new member.
 */
export type CanonicalImport = CanonicalImportV1;

export interface CanonicalImportV1 {
  readonly version: typeof CANONICAL_IMPORT_VERSION_V1;
  /** Source file format version (e.g. native backup `1.4.0`), when known. */
  sourceFormatVersion?: string;
  accounts: CanonicalAccount[];
  journals: CanonicalJournal[];
  transactions: CanonicalTransaction[];
  budgets?: CanonicalBudget[];
  budgetScopes?: CanonicalBudgetScope[];
  auditLogs?: CanonicalAuditLog[];
  currencies?: CanonicalCurrency[];
  exchangeRates?: CanonicalExchangeRate[];
  accountMetadata?: CanonicalAccountMetadata[];
  plannedPayments?: CanonicalPlannedPayment[];
  journalMetadata?: CanonicalJournalMetadata[];
  transactionAutoPostRules?: CanonicalTransactionAutoPostRule[];
  transactionInboxRecords?: CanonicalTransactionInboxRecord[];
  balanceSnapshots?: CanonicalBalanceSnapshot[];
  /** Preferences and workplace hints carried alongside ledger data. */
  importMetadata?: CanonicalImportMetadata;
}

export interface CanonicalImportMetadata {
  preferences?: Partial<UIPreferences>;
  workplace?: {
    name?: string;
    defaultCurrencyCode?: string;
    icon?: string;
  };
  /** Plugin that produced this import (e.g. `native`). */
  pluginId?: string;
}

export interface CanonicalAccount {
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

export interface CanonicalJournal {
  id: string;
  journalDate: number;
  description?: string;
  notes?: string;
  currencyCode: string;
  status: JournalStatus | string;
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

export interface CanonicalTransaction {
  id: string;
  journalId: JournalId;
  accountId: AccountId;
  amount: number;
  transactionType: TransactionType | string;
  currencyCode: string;
  transactionDate: number;
  notes?: string;
  exchangeRate?: number;
  runningBalance?: number;
  createdAt?: number;
  updatedAt?: number;
  deletedAt?: number;
}

export interface CanonicalAuditLog {
  id: string;
  entityType: AuditEntityType;
  entityId: string;
  action: string;
  changes: string;
  timestamp: number;
  createdAt?: number;
}

export interface CanonicalBudget {
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

export interface CanonicalBudgetScope {
  id: string;
  budgetId: BudgetId;
  accountId: AccountId;
  createdAt?: number;
  updatedAt?: number;
}

export interface CanonicalCurrency {
  id: string;
  code: string;
  symbol: string;
  name: string;
  precision: number;
  createdAt?: number;
  updatedAt?: number;
  deletedAt?: number;
}

export interface CanonicalExchangeRate {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  effectiveDate: number;
  source: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface CanonicalAccountMetadata {
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

export interface CanonicalPlannedPayment {
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

export interface CanonicalJournalMetadata {
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

export interface CanonicalTransactionInboxRecord {
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

export interface CanonicalTransactionAutoPostRule {
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

export interface CanonicalBalanceSnapshot {
  id: string;
  accountId: AccountId;
  transactionId: TransactionId;
  transactionDate: number;
  absoluteBalance: number;
  transactionCount: number;
  createdAt?: number;
  updatedAt?: number;
}

export function isCanonicalImportV1(value: CanonicalImport): value is CanonicalImportV1 {
  return value.version === CANONICAL_IMPORT_VERSION_V1;
}
