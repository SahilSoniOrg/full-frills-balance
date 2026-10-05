import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import AccountMetadata from '@/src/data/models/AccountMetadata';
import AuditLog from '@/src/data/models/AuditLog';
import BalanceSnapshot from '@/src/data/models/BalanceSnapshot';
import Budget from '@/src/data/models/Budget';
import BudgetScope from '@/src/data/models/BudgetScope';
import Journal from '@/src/data/models/Journal';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import Transaction from '@/src/data/models/Transaction';
import TransactionAutoPostRule from '@/src/data/models/TransactionAutoPostRule';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import {
  pickImportedSubtype,
  toAccountType,
  toAuditAction,
  toInboxParseStatus,
  toInboxProcessingStatus,
  toJournalStatus,
  toTransactionDirection,
  toTransactionType,
} from '@/src/data/repositories/importValueParsers';
import type {
  BatchImportData,
  CanonicalAccount,
  CanonicalJournal,
  CanonicalTransaction,
} from '@/src/types/importContracts';
import type { AuditEntityType } from '@/src/types/enums';
import { PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/types/enums';
import { TransactionChannel } from '@/src/types/domainJournal';
import { WorkplaceId } from '@/src/types/ids';
import { Collection, Model } from '@nozbe/watermelondb';
import { hashLegacySmsFingerprint } from '@/src/utils/smsFingerprintHash';
import {
  sanitizeSmsAuditChanges,
  hashSmsMetadataFingerprints,
} from '@/src/utils/smsPrivateMetadata';

type ImportPersistenceRaw = Record<string, unknown> & {
  id?: string;
  created_at?: number;
  updated_at?: number;
  deleted_at?: number | null;
  _status?: string;
};

function getImportPersistenceRaw(record: Model): ImportPersistenceRaw {
  return record._raw as ImportPersistenceRaw;
}

function setRecordTimestamps(
  record: Model,
  timestamps: { createdAt?: number; updatedAt?: number; deletedAt?: number | null },
): void {
  const raw = getImportPersistenceRaw(record);
  if (timestamps.createdAt !== undefined) raw.created_at = timestamps.createdAt;
  if (timestamps.updatedAt !== undefined) raw.updated_at = timestamps.updatedAt;
  if (timestamps.deletedAt !== undefined) raw.deleted_at = timestamps.deletedAt;
}

function setImportPersistenceRawField(record: Model, field: string, value: unknown): void {
  getImportPersistenceRaw(record)[field] = value;
}

export function prepareCoreImportRecords(
  workplaceId: WorkplaceId,
  collections: {
    accounts: Collection<Account>;
    journals: Collection<Journal>;
    transactions: Collection<Transaction>;
  },
  data: {
    accounts: CanonicalAccount[];
    journals: CanonicalJournal[];
    transactions: CanonicalTransaction[];
  },
): Model[] {
  const accountPrepares = data.accounts.map(account =>
    collections.accounts.prepareCreate(record => {
      record._raw.id = account.id;
      record.workplaceId = workplaceId;
      record.name = account.name;
      record.accountType = toAccountType(account.accountType);
      record.accountSubtype = pickImportedSubtype(account);
      record.currencyCode = account.currencyCode;
      record.parentAccountId = account.parentAccountId;
      record.description = account.description;
      record.icon = account.icon;
      record.color = account.color;
      record.orderNum = account.orderNum;
      if (account.reconciledAt !== undefined && account.reconciledAt !== null) {
        record.reconciledAt = new Date(account.reconciledAt);
      }
      if (account.archivedAt !== undefined && account.archivedAt !== null) {
        record.archivedAt = new Date(account.archivedAt);
      }
      record._raw._status = 'synced';
      setRecordTimestamps(record, {
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
        deletedAt: account.deletedAt,
      });
    }),
  );

  const journalPrepares = data.journals.map(journal =>
    collections.journals.prepareCreate(record => {
      record._raw.id = journal.id;
      record.workplaceId = workplaceId;
      record.journalDate = journal.journalDate;
      record.description = journal.description;
      record.notes = journal.notes;
      record.currencyCode = journal.currencyCode;
      record.status = toJournalStatus(journal.status);
      record.originalJournalId = journal.originalJournalId;
      record.reversingJournalId = journal.reversingJournalId;
      record.totalAmount = journal.totalAmount;
      record.transactionCount = journal.transactionCount;
      record.displayType = journal.displayType;
      if (journal.plannedPaymentId) record.plannedPaymentId = journal.plannedPaymentId;
      record._raw._status = 'synced';
      setRecordTimestamps(record, {
        createdAt: journal.createdAt,
        updatedAt: journal.updatedAt,
        deletedAt: journal.deletedAt,
      });
    }),
  );

  const transactionPrepares = data.transactions.map(transaction =>
    collections.transactions.prepareCreate(record => {
      record._raw.id = transaction.id;
      record.workplaceId = workplaceId;
      record.journalId = transaction.journalId;
      record.accountId = transaction.accountId;
      record.amount = transaction.amount;
      record.transactionType = toTransactionType(transaction.transactionType);
      record.currencyCode = transaction.currencyCode;
      record.transactionDate = transaction.transactionDate;
      record.notes = transaction.notes;
      record.exchangeRate = transaction.exchangeRate;
      record.runningBalance = transaction.runningBalance;
      record._raw._status = 'synced';
      setRecordTimestamps(record, {
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
        deletedAt: transaction.deletedAt,
      });
    }),
  );

  return [...accountPrepares, ...journalPrepares, ...transactionPrepares];
}

function readAuditPayloadString(changes: string, key: string): string | undefined {
  try {
    const value: unknown = JSON.parse(changes);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
    const field = (value as Record<string, unknown>)[key];
    return typeof field === 'string' ? field : undefined;
  } catch {
    return undefined;
  }
}

export function prepareAuxiliaryImportRecords(
  workplaceId: WorkplaceId,
  data: BatchImportData,
): Model[] {
  const auditLogs = database.collections.get<AuditLog>('audit_logs');
  const budgets = database.collections.get<Budget>('budgets');
  const budgetScopes = database.collections.get<BudgetScope>('budget_scopes');
  const accountMetadata = database.collections.get<AccountMetadata>('account_metadata');
  const plannedPayments = database.collections.get<PlannedPayment>('planned_payments');
  const journalMetadata = database.collections.get<JournalMetadata>('journal_metadata');
  const autoPostRules = database.collections.get<TransactionAutoPostRule>(
    'transaction_auto_post_rules',
  );
  const inboxRecords = database.collections.get<TransactionInboxRecord>(
    'transaction_inbox_records',
  );
  const balanceSnapshots = database.collections.get<BalanceSnapshot>('balance_snapshots');

  const auditLogPrepares = (data.auditLogs || []).map(log =>
    auditLogs.prepareCreate(record => {
      const entityType = String(log.entityType).toLowerCase() as AuditEntityType;
      record._raw.id = log.id;
      record.workplaceId = workplaceId;
      record.entityType = entityType;
      record.entityId = entityType === 'workplace' ? workplaceId : log.entityId;
      record.action = toAuditAction(log.action);
      record.changes = sanitizeSmsAuditChanges(log.changes) ?? log.changes;
      record.timestamp = log.timestamp;
      record.source = readAuditPayloadString(log.changes, 'source') ?? 'app';
      record.eventType =
        readAuditPayloadString(log.changes, 'eventType') ??
        `${entityType}.${log.action.toLowerCase()}`;
      record.correlationId = readAuditPayloadString(log.changes, 'correlationId') ?? null;
      record._raw._status = 'synced';
      setRecordTimestamps(record, { createdAt: log.createdAt });
    }),
  );

  const budgetPrepares = (data.budgets || []).map(budget =>
    budgets.prepareCreate(record => {
      record._raw.id = budget.id;
      record.workplaceId = workplaceId;
      record.name = budget.name;
      record.amount = budget.amount;
      record.currencyCode = budget.currencyCode;
      record.startMonth = budget.startMonth;
      if (budget.intervalType) record.intervalType = budget.intervalType;
      if (budget.intervalN !== undefined) record.intervalN = budget.intervalN;
      if (budget.startDate !== undefined && budget.startDate !== null)
        record.startDate = budget.startDate;
      if (budget.recurrenceDay !== undefined) record.recurrenceDay = budget.recurrenceDay;
      if (budget.recurrenceMonth !== undefined) record.recurrenceMonth = budget.recurrenceMonth;
      if (budget.assetAccountIds) record.assetAccountIds = budget.assetAccountIds;
      record.active = budget.active;
      record._raw._status = 'synced';
      setRecordTimestamps(record, { createdAt: budget.createdAt, updatedAt: budget.updatedAt });
    }),
  );

  const budgetScopePrepares = (data.budgetScopes || []).map(scope =>
    budgetScopes.prepareCreate(record => {
      record._raw.id = scope.id;
      record.workplaceId = workplaceId;
      setImportPersistenceRawField(record, 'budget_id', scope.budgetId);
      setImportPersistenceRawField(record, 'account_id', scope.accountId);
      record._raw._status = 'synced';
      setRecordTimestamps(record, { createdAt: scope.createdAt, updatedAt: scope.updatedAt });
    }),
  );

  const accountMetadataPrepares = (data.accountMetadata || []).map(metadata =>
    accountMetadata.prepareCreate(record => {
      record._raw.id = metadata.id;
      record.workplaceId = workplaceId;
      setImportPersistenceRawField(record, 'account_id', metadata.accountId);
      record.statementDay = metadata.statementDay;
      record.dueDay = metadata.dueDay;
      record.minimumPaymentAmount = metadata.minimumPaymentAmount;
      record.minimumBalanceAmount = metadata.minimumBalanceAmount;
      record.creditLimitAmount = metadata.creditLimitAmount;
      record.aprBps = metadata.aprBps;
      record.emiDay = metadata.emiDay;
      record.loanTenureMonths = metadata.loanTenureMonths;
      record.autopayEnabled = metadata.autopayEnabled;
      record.gracePeriodDays = metadata.gracePeriodDays;
      if (metadata.payFromAccountId) record.payFromAccountId = metadata.payFromAccountId;
      if (metadata.minPaymentOnly !== undefined) record.minPaymentOnly = metadata.minPaymentOnly;
      if (metadata.minimumPaymentPercent !== undefined) {
        record.minimumPaymentPercent = metadata.minimumPaymentPercent;
      }
      record.notes = metadata.notes;
      record._raw._status = 'synced';
      setRecordTimestamps(record, { createdAt: metadata.createdAt, updatedAt: metadata.updatedAt });
    }),
  );

  const plannedPaymentPrepares = (data.plannedPayments || []).map(payment =>
    plannedPayments.prepareCreate(record => {
      record._raw.id = payment.id;
      record.workplaceId = workplaceId;
      record.name = payment.name;
      record.description = payment.description;
      record.amount = payment.amount;
      record.currencyCode = payment.currencyCode;
      record.fxMode = payment.fxMode;
      record.destinationAmount = payment.destinationAmount;
      record.fromAccountId = payment.fromAccountId;
      record.toAccountId = payment.toAccountId;
      record.intervalN = payment.intervalN;
      record.intervalType = payment.intervalType as PlannedPaymentInterval;
      record.startDate = payment.startDate;
      record.endDate = payment.endDate;
      record.nextOccurrence = payment.nextOccurrence;
      record.status = payment.status as PlannedPaymentStatus;
      record.isAutoPost = payment.isAutoPost;
      record.recurrenceDay = payment.recurrenceDay;
      record.recurrenceMonth = payment.recurrenceMonth;
      record._raw._status = 'synced';
      setRecordTimestamps(record, {
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        deletedAt: payment.deletedAt,
      });
    }),
  );

  const journalMetadataPrepares = (data.journalMetadata || []).map(metadata =>
    journalMetadata.prepareCreate(record => {
      record._raw.id = metadata.id;
      record.workplaceId = workplaceId;
      setImportPersistenceRawField(record, 'journal_id', metadata.journalId);
      record.importSource = metadata.importSource;
      record.originalSmsId = metadata.originalSmsId;
      record.originalSmsSender = metadata.originalSmsSender;
      record.originalSmsBody = metadata.originalSmsBody;
      record.metadataJson = hashSmsMetadataFingerprints(metadata.metadataJson);
      record._raw._status = 'synced';
      setRecordTimestamps(record, { createdAt: metadata.createdAt, updatedAt: metadata.updatedAt });
    }),
  );

  const autoPostRulePrepares = (data.transactionAutoPostRules || []).map(rule =>
    autoPostRules.prepareCreate(record => {
      record._raw.id = rule.id;
      record.workplaceId = workplaceId;
      record.channelsJson = rule.channelsJson;
      record.senderMatch = rule.senderMatch;
      record.bodyMatch = rule.bodyMatch;
      record.conditionsJson = rule.conditionsJson;
      record.actionsJson = rule.actionsJson;
      record.priority = rule.priority;
      record.sourceAccountId = rule.sourceAccountId;
      record.categoryAccountId = rule.categoryAccountId;
      record.isActive = rule.isActive;
      record._raw._status = 'synced';
      setRecordTimestamps(record, { createdAt: rule.createdAt, updatedAt: rule.updatedAt });
    }),
  );

  const inboxPrepares = (data.transactionInboxRecords || []).map(inbox =>
    inboxRecords.prepareCreate(record => {
      record._raw.id = inbox.id;
      record.workplaceId = workplaceId;
      record.channel = inbox.channel as TransactionChannel;
      record.deviceSourceId = inbox.deviceSourceId;
      const isSms = inbox.channel === 'sms';
      const processingStatus = toInboxProcessingStatus(inbox.processingStatus);
      record.senderAddress = inbox.senderAddress;
      record.rawBody = inbox.rawBody;
      record.inputDate = inbox.inputDate;
      record.inputFingerprint = isSms
        ? hashLegacySmsFingerprint(inbox.inputFingerprint)
        : inbox.inputFingerprint;
      record.parseStatus = toInboxParseStatus(inbox.parseStatus);
      record.parsedAmount = inbox.parsedAmount;
      record.parsedCurrencyCode = inbox.parsedCurrencyCode;
      record.parsedMerchant = inbox.parsedMerchant;
      record.parsedAccountSource = inbox.parsedAccountSource;
      record.referenceNumber = inbox.referenceNumber;
      record.direction = toTransactionDirection(inbox.direction);
      record.processingStatus = processingStatus;
      record.linkedJournalId = inbox.linkedJournalId;
      record.duplicateJournalId = inbox.duplicateJournalId;
      record.duplicateConfidence = inbox.duplicateConfidence;
      record.parseConfidence = inbox.parseConfidence;
      record.parseReason = inbox.parseReason;
      record.metadataJson = hashSmsMetadataFingerprints(inbox.metadataJson);
      record.firstSeenAt = inbox.firstSeenAt;
      record.lastScannedAt = inbox.lastScannedAt;
      record.processedAt = inbox.processedAt;
      record._raw._status = 'synced';
      setRecordTimestamps(record, { createdAt: inbox.createdAt, updatedAt: inbox.updatedAt });
    }),
  );

  const balanceSnapshotPrepares = (data.balanceSnapshots || []).map(snapshot =>
    balanceSnapshots.prepareCreate(record => {
      record._raw.id = snapshot.id;
      record.workplaceId = workplaceId;
      setImportPersistenceRawField(record, 'account_id', snapshot.accountId);
      setImportPersistenceRawField(record, 'transaction_id', snapshot.transactionId);
      record.transactionDate = snapshot.transactionDate;
      record.absoluteBalance = snapshot.absoluteBalance;
      record.transactionCount = snapshot.transactionCount;
      record._raw._status = 'synced';
      setRecordTimestamps(record, { createdAt: snapshot.createdAt, updatedAt: snapshot.updatedAt });
    }),
  );

  return [
    ...auditLogPrepares,
    ...budgetPrepares,
    ...budgetScopePrepares,
    ...accountMetadataPrepares,
    ...plannedPaymentPrepares,
    ...journalMetadataPrepares,
    ...autoPostRulePrepares,
    ...inboxPrepares,
    ...balanceSnapshotPrepares,
  ];
}
