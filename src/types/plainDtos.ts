import { IconName } from '@/src/types/domainIcons';
import { AccountId, BudgetId, JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import {
  AccountSubtype,
  AccountType,
  AuditAction,
  AuditEntityType,
  JournalDisplayType,
  JournalStatus,
  PlannedPaymentInterval,
  PlannedPaymentStatus,
  TransactionDirection,
} from '@/src/types/enums';

/**
 * PlainAccount - Plain JSON object representation of an Account model.
 * Used for high-performance snapshot serialization (MMKV) and type safety.
 */
export interface AccountFields {
  id: AccountId;
  name: string;
  accountType: AccountType;
  accountSubtype?: AccountSubtype;
  currencyCode: string;
  parentAccountId?: AccountId;
  description?: string;
  icon?: IconName;
  color?: string;
  orderNum?: number;
  reconciledAt?: Date | number;
  createdAt?: Date | number;
  updatedAt?: Date | number;
  deletedAt?: Date | number;
  archivedAt?: Date | number;
}

export interface PlainAccount {
  id: AccountId;
  name: string;
  accountType: AccountType;
  accountSubtype?: AccountSubtype;
  currencyCode: string;
  parentAccountId?: AccountId;
  description?: string;
  icon?: IconName;
  color?: string;
  orderNum?: number;
  reconciledAt?: number;
  createdAt?: number;
  updatedAt?: number;
  deletedAt?: number;
  archivedAt?: number;
}

export interface PlainAccountMetadata {
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
}

export interface PlainCurrency {
  id: string;
  code: string;
  symbol: string;
  name: string;
  precision: number;
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
  startMonth?: string;
  assetAccountIds?: string;
  active?: boolean;
}

export interface PlainBudgetScope {
  budgetId: BudgetId;
  accountId: AccountId;
}

export interface PlainPlannedPayment {
  id: PlannedPaymentId;
  name: string;
  description?: string;
  amount: number;
  currencyCode: string;
  fromAccountId: AccountId;
  toAccountId: AccountId;
  intervalN: number;
  intervalType: PlannedPaymentInterval;
  startDate: number;
  endDate?: number;
  nextOccurrence: number;
  status: PlannedPaymentStatus;
  isAutoPost: boolean;
  recurrenceDay?: number;
  recurrenceMonth?: number;
}

export interface PlainWorkplace {
  id: WorkplaceId;
  name: string;
  icon: string;
  defaultCurrencyCode: string;
}

export interface PlainExchangeRate {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  effectiveDate: number;
}

export interface PlainAuditLog {
  id: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  changes: string;
  timestamp: number;
  canRevert: boolean;
}

export interface PlainSmsRule {
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
}

export interface PlainInboxRecord {
  id: string;
  channel: 'sms' | 'voice';
  deviceSourceId: string;
  senderAddress?: string;
  rawBody?: string;
  inputDate: number;
  parseStatus: string;
  parsedAmount?: number;
  parsedCurrencyCode?: string;
  parsedMerchant?: string;
  parsedAccountSource?: string;
  referenceNumber?: string;
  direction: TransactionDirection | 'debit' | 'credit' | 'unknown';
  processingStatus: string;
  linkedJournalId?: JournalId;
  duplicateJournalId?: JournalId;
  duplicateConfidence?: number;
  parseConfidence?: number;
  parseReason?: string;
  metadataJson?: string;
}

export interface PlainJournal {
  id: JournalId;
  journalDate: number;
  description?: string;
  notes?: string;
  currencyCode: string;
  status: JournalStatus;
  originalJournalId?: JournalId;
  reversingJournalId?: JournalId;
  plannedPaymentId?: PlannedPaymentId;
  totalAmount: number;
  transactionCount: number;
  displayType: JournalDisplayType;
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
