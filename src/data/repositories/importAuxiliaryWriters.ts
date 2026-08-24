import { database } from '@/src/data/database/Database';
import AccountMetadata from '@/src/data/models/AccountMetadata';
import AuditLog from '@/src/data/models/AuditLog';
import BalanceSnapshot from '@/src/data/models/BalanceSnapshot';
import Budget from '@/src/data/models/Budget';
import BudgetScope from '@/src/data/models/BudgetScope';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import TransactionAutoPostRule from '@/src/data/models/TransactionAutoPostRule';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import {
  toAuditAction,
  toInboxParseStatus,
  toInboxProcessingStatus,
  toTransactionDirection,
} from '@/src/data/repositories/importValueParsers';
import {
  setImportPersistenceRawField,
  setRecordTimestamps,
} from '@/src/data/repositories/importPersistenceAdapter';
import type { BatchImportData } from '@/src/data/repositories/importTypes';
import { PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/types/enums';
import { TransactionChannel } from '@/src/types/domainJournal';
import { WorkplaceId } from '@/src/types/ids';
import { Model } from '@nozbe/watermelondb';

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
      record._raw.id = log.id;
      record.workplaceId = workplaceId;
      record.entityType = log.entityType;
      record.entityId = log.entityId;
      record.action = toAuditAction(log.action);
      record.changes = log.changes;
      record.timestamp = log.timestamp;
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
      record.metadataJson = metadata.metadataJson;
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
      record.senderAddress = inbox.senderAddress;
      record.rawBody = inbox.rawBody;
      record.inputDate = inbox.inputDate;
      record.inputFingerprint = inbox.inputFingerprint;
      record.parseStatus = toInboxParseStatus(inbox.parseStatus);
      record.parsedAmount = inbox.parsedAmount;
      record.parsedCurrencyCode = inbox.parsedCurrencyCode;
      record.parsedMerchant = inbox.parsedMerchant;
      record.parsedAccountSource = inbox.parsedAccountSource;
      record.referenceNumber = inbox.referenceNumber;
      record.direction = toTransactionDirection(inbox.direction);
      record.processingStatus = toInboxProcessingStatus(inbox.processingStatus);
      record.linkedJournalId = inbox.linkedJournalId;
      record.duplicateJournalId = inbox.duplicateJournalId;
      record.duplicateConfidence = inbox.duplicateConfidence;
      record.parseConfidence = inbox.parseConfidence;
      record.parseReason = inbox.parseReason;
      record.metadataJson = inbox.metadataJson;
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
