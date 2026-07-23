import { IconName } from '@/src/types/domainIcons';
import { database } from '@/src/data/database/Database';
import Account, {
  AccountSubtype,
  AccountType,
  getDefaultSubtypeForTypeLike,
  isAccountSubtype,
  isAccountType,
} from '@/src/data/models/Account';
import AccountMetadata from '@/src/data/models/AccountMetadata';
import AuditLog, { AuditAction, AuditEntityType } from '@/src/data/models/AuditLog';
import BalanceSnapshot from '@/src/data/models/BalanceSnapshot';
import Budget from '@/src/data/models/Budget';
import BudgetScope from '@/src/data/models/BudgetScope';
import Currency from '@/src/data/models/Currency';
import Journal, { JournalStatus } from '@/src/data/models/Journal';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import PlannedPayment, {
  PlannedPaymentInterval,
  PlannedPaymentStatus,
} from '@/src/data/models/PlannedPayment';
import TransactionAutoPostRule from '@/src/data/models/TransactionAutoPostRule';
import TransactionInboxRecord, {
  TransactionDirection,
  InboxParseStatus,
  InboxProcessingStatus,
  TransactionChannel,
} from '@/src/data/models/TransactionInboxRecord';
import Transaction, { TransactionType } from '@/src/data/models/Transaction';
import {
  AccountId,
  BudgetId,
  JournalDisplayType,
  JournalId,
  PlannedPaymentId,
  TransactionId,
  WorkplaceId,
} from '@/src/types/domain';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { accountingService } from '@/src/utils/accountingService';
import { roundToPrecision } from '@/src/utils/money';
import { logger } from '@/src/utils/logger';
import { Collection, Model, Q } from '@nozbe/watermelondb';

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

const DEFAULT_ACCOUNT_TYPE = AccountType.ASSET;

function toAccountType(value: AccountType | string): AccountType {
  return isAccountType(value) ? value : DEFAULT_ACCOUNT_TYPE;
}

function toAccountSubtype(value?: AccountSubtype | string): AccountSubtype | undefined {
  if (!value) return undefined;
  return isAccountSubtype(value) ? value : undefined;
}

function pickImportedSubtype(account: ImportedAccount): AccountSubtype | undefined {
  return (
    toAccountSubtype(account.accountSubtype) ?? getDefaultSubtypeForTypeLike(account.accountType)
  );
}

function toJournalStatus(value: string): JournalStatus {
  const statuses = Object.values(JournalStatus);
  return statuses.includes(value as JournalStatus)
    ? (value as JournalStatus)
    : JournalStatus.POSTED;
}

function toTransactionType(value: string): TransactionType {
  const types = Object.values(TransactionType);
  return types.includes(value as TransactionType)
    ? (value as TransactionType)
    : TransactionType.DEBIT;
}

function toAuditAction(value: string): AuditAction {
  const actions = Object.values(AuditAction);
  return actions.includes(value as AuditAction) ? (value as AuditAction) : AuditAction.UPDATE;
}

function toInboxParseStatus(value: string): InboxParseStatus {
  return Object.values(InboxParseStatus).includes(value as InboxParseStatus)
    ? (value as InboxParseStatus)
    : InboxParseStatus.PARSE_FAILED;
}

function toInboxProcessingStatus(value: string): InboxProcessingStatus {
  return Object.values(InboxProcessingStatus).includes(value as InboxProcessingStatus)
    ? (value as InboxProcessingStatus)
    : InboxProcessingStatus.PENDING;
}

function toTransactionDirection(value: string): TransactionDirection {
  return Object.values(TransactionDirection).includes(value as TransactionDirection)
    ? (value as TransactionDirection)
    : TransactionDirection.UNKNOWN;
}

export class ImportRepository {
  async batchInsert(
    workplaceId: WorkplaceId,
    data: BatchImportData,
    onProgress?: (message: string, progress?: number) => void,
  ): Promise<void> {
    // 1. Calculate running balances (Segment: 0 to 0.1)
    onProgress?.('Calculating transaction balances...', 0.02);
    logger.info('[ImportRepository] Calculating transaction balances...');

    const journalStatusMap = new Map<string, string>();
    data.journals.forEach(j => journalStatusMap.set(j.id, j.status));

    const transactionsByAccount = new Map<string, ImportedTransaction[]>();
    data.transactions.forEach(t => {
      const list = transactionsByAccount.get(t.accountId) || [];
      list.push(t);
      transactionsByAccount.set(t.accountId, list);
    });

    const accountMap = new Map(data.accounts.map(a => [a.id, a]));
    const currencies = await database.collections.get<Currency>('currencies').query().fetch();
    const precisionMap = new Map(currencies.map(c => [c.code, c.precision]));

    let accountsProcessed = 0;
    const totalAccounts = transactionsByAccount.size;

    for (const [accountId, accountTransactions] of transactionsByAccount.entries()) {
      const account = accountMap.get(accountId);
      if (!account) continue;

      const accountType = toAccountType(account.accountType);
      const precision = precisionMap.get(account.currencyCode) ?? 2;

      accountTransactions.sort((a, b) => {
        if (a.transactionDate !== b.transactionDate) return a.transactionDate - b.transactionDate;
        if (a.createdAt !== b.createdAt) return (a.createdAt || 0) - (b.createdAt || 0);
        return a.id.localeCompare(b.id);
      });

      let currentBalance = 0;
      for (const t of accountTransactions) {
        const journalStatus = journalStatusMap.get(t.journalId);
        const isDeleted = !!t.deletedAt;
        const isActive = !isDeleted && ACTIVE_JOURNAL_STATUSES.includes(journalStatus as any);

        if (isActive) {
          const roundedAmount = roundToPrecision(t.amount, precision);
          currentBalance = accountingService.calculateNewBalance(
            currentBalance,
            roundedAmount,
            accountType,
            toTransactionType(t.transactionType),
            precision,
          );
          t.runningBalance = currentBalance;
          t.amount = roundedAmount;
        } else {
          t.runningBalance = 0;
        }
      }

      accountsProcessed++;
      if (totalAccounts > 0) {
        onProgress?.(
          `Calculating transaction balances (${accountsProcessed}/${totalAccounts})...`,
          0.02 + (accountsProcessed / totalAccounts) * 0.08,
        );
      }
    }

    await database.write(async () => {
      const accountsCollection = database.collections.get<Account>('accounts');
      const journalsCollection = database.collections.get<Journal>('journals');
      const transactionsCollection = database.collections.get<Transaction>('transactions');
      const auditLogsCollection = database.collections.get<AuditLog>('audit_logs');
      const accountMetadataCollection =
        database.collections.get<AccountMetadata>('account_metadata');
      const plannedPaymentsCollection =
        database.collections.get<PlannedPayment>('planned_payments');
      const journalMetadataCollection =
        database.collections.get<JournalMetadata>('journal_metadata');
      const transactionAutoPostRulesCollection = database.collections.get<TransactionAutoPostRule>(
        'transaction_auto_post_rules',
      );
      const transactionInboxCollection = database.collections.get<TransactionInboxRecord>(
        'transaction_inbox_records',
      );
      const balanceSnapshotsCollection =
        database.collections.get<BalanceSnapshot>('balance_snapshots');

      const accountPrepares = data.accounts.map(acc =>
        accountsCollection.prepareCreate(record => {
          record._raw.id = acc.id;
          record.workplaceId = workplaceId;
          record.name = acc.name;
          record.accountType = toAccountType(acc.accountType);
          record.accountSubtype = pickImportedSubtype(acc);
          record.currencyCode = acc.currencyCode;
          record.parentAccountId = acc.parentAccountId;
          record.description = acc.description;
          record.icon = acc.icon;
          record.orderNum = acc.orderNum;
          if (acc.reconciledAt !== undefined && acc.reconciledAt !== null) {
            record.reconciledAt = new Date(acc.reconciledAt);
          }
          record._raw._status = 'synced';
          if (acc.createdAt) (record as any)._raw.created_at = acc.createdAt;
          if (acc.updatedAt) (record as any)._raw.updated_at = acc.updatedAt;
          if (acc.deletedAt) (record as any)._raw.deleted_at = acc.deletedAt;
        }),
      );

      const journalPrepares = data.journals.map(j =>
        journalsCollection.prepareCreate(record => {
          record._raw.id = j.id;
          record.workplaceId = workplaceId;
          record.journalDate = j.journalDate;
          record.description = j.description;
          record.notes = j.notes;
          record.currencyCode = j.currencyCode;
          record.status = toJournalStatus(j.status);
          record.originalJournalId = j.originalJournalId;
          record.reversingJournalId = j.reversingJournalId;
          record.totalAmount = j.totalAmount;
          record.transactionCount = j.transactionCount;
          record.displayType = j.displayType;
          if (j.plannedPaymentId) record.plannedPaymentId = j.plannedPaymentId as PlannedPaymentId;
          record._raw._status = 'synced';
          if (j.createdAt) (record as any)._raw.created_at = j.createdAt;
          if (j.updatedAt) (record as any)._raw.updated_at = j.updatedAt;
          if (j.deletedAt) (record as any)._raw.deleted_at = j.deletedAt;
        }),
      );

      const transactionPrepares = data.transactions.map(t =>
        transactionsCollection.prepareCreate(record => {
          record._raw.id = t.id;
          record.workplaceId = workplaceId;
          record.journalId = t.journalId;
          record.accountId = t.accountId;
          record.amount = t.amount;
          record.transactionType = toTransactionType(t.transactionType);
          record.currencyCode = t.currencyCode;
          record.transactionDate = t.transactionDate;
          record.notes = t.notes;
          record.exchangeRate = t.exchangeRate;
          record.runningBalance = t.runningBalance;
          record._raw._status = 'synced';
          if (t.createdAt) (record as any)._raw.created_at = t.createdAt;
          if (t.updatedAt) (record as any)._raw.updated_at = t.updatedAt;
          if (t.deletedAt) (record as any)._raw.deleted_at = t.deletedAt;
        }),
      );

      const auditLogPrepares = (data.auditLogs || []).map(log =>
        auditLogsCollection.prepareCreate(record => {
          record._raw.id = log.id;
          record.workplaceId = workplaceId;
          record.entityType = log.entityType;
          record.entityId = log.entityId;
          record.action = toAuditAction(log.action);
          record.changes = log.changes;
          record.timestamp = log.timestamp;
          record._raw._status = 'synced';
          if (log.createdAt) (record as any)._raw.created_at = log.createdAt;
        }),
      );

      const budgetPrepares = (data.budgets || []).map(b =>
        database.collections.get<Budget>('budgets').prepareCreate(record => {
          record._raw.id = b.id;
          record.workplaceId = workplaceId;
          record.name = b.name;
          record.amount = b.amount;
          record.currencyCode = b.currencyCode;
          record.startMonth = b.startMonth;
          if (b.intervalType) record.intervalType = b.intervalType;
          if (b.intervalN !== undefined) record.intervalN = b.intervalN;
          if (b.startDate !== undefined && b.startDate !== null) record.startDate = b.startDate;
          if (b.recurrenceDay !== undefined) record.recurrenceDay = b.recurrenceDay;
          if (b.recurrenceMonth !== undefined) record.recurrenceMonth = b.recurrenceMonth;
          if (b.assetAccountIds) record.assetAccountIds = b.assetAccountIds;
          record.active = b.active;
          record._raw._status = 'synced';
          if (b.createdAt) (record as any)._raw.created_at = b.createdAt;
          if (b.updatedAt) (record as any)._raw.updated_at = b.updatedAt;
        }),
      );

      const budgetScopePrepares = (data.budgetScopes || []).map(bs =>
        database.collections.get<BudgetScope>('budget_scopes').prepareCreate(record => {
          record._raw.id = bs.id;
          record.workplaceId = workplaceId;
          (record as any)._raw.budget_id = bs.budgetId;
          (record as any)._raw.account_id = bs.accountId;
          record._raw._status = 'synced';
          if (bs.createdAt) (record as any)._raw.created_at = bs.createdAt;
          if (bs.updatedAt) (record as any)._raw.updated_at = bs.updatedAt;
        }),
      );

      const accountMetadataPrepares = (data.accountMetadata || []).map(metadata =>
        accountMetadataCollection.prepareCreate(record => {
          record._raw.id = metadata.id;
          record.workplaceId = workplaceId;
          (record as any)._raw.account_id = metadata.accountId;
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
          if (metadata.payFromAccountId) {
            record.payFromAccountId = metadata.payFromAccountId;
          }
          if (metadata.minPaymentOnly !== undefined) {
            record.minPaymentOnly = metadata.minPaymentOnly;
          }
          if (metadata.minimumPaymentPercent !== undefined) {
            record.minimumPaymentPercent = metadata.minimumPaymentPercent;
          }
          record.notes = metadata.notes;
          record._raw._status = 'synced';
          if (metadata.createdAt) (record as any)._raw.created_at = metadata.createdAt;
          if (metadata.updatedAt) (record as any)._raw.updated_at = metadata.updatedAt;
        }),
      );

      const plannedPaymentPrepares = (data.plannedPayments || []).map(pp =>
        plannedPaymentsCollection.prepareCreate(record => {
          record._raw.id = pp.id;
          record.workplaceId = workplaceId;
          record.name = pp.name;
          record.description = pp.description;
          record.amount = pp.amount;
          record.currencyCode = pp.currencyCode;
          record.fromAccountId = pp.fromAccountId;
          record.toAccountId = pp.toAccountId;
          record.intervalN = pp.intervalN;
          record.intervalType = pp.intervalType as PlannedPaymentInterval;
          record.startDate = pp.startDate;
          record.endDate = pp.endDate;
          record.nextOccurrence = pp.nextOccurrence;
          record.status = pp.status as PlannedPaymentStatus;
          record.isAutoPost = pp.isAutoPost;
          record.recurrenceDay = pp.recurrenceDay;
          record.recurrenceMonth = pp.recurrenceMonth;
          record._raw._status = 'synced';
          if (pp.createdAt) (record as any)._raw.created_at = pp.createdAt;
          if (pp.updatedAt) (record as any)._raw.updated_at = pp.updatedAt;
          if (pp.deletedAt) (record as any)._raw.deleted_at = pp.deletedAt;
        }),
      );

      const journalMetadataPrepares = (data.journalMetadata || []).map(meta =>
        journalMetadataCollection.prepareCreate(record => {
          record._raw.id = meta.id;
          record.workplaceId = workplaceId;
          (record as any)._raw.journal_id = meta.journalId;
          record.importSource = meta.importSource;
          record.originalSmsId = meta.originalSmsId;
          record.originalSmsSender = meta.originalSmsSender;
          record.originalSmsBody = meta.originalSmsBody;
          record.metadataJson = meta.metadataJson;
          record._raw._status = 'synced';
          if (meta.createdAt) (record as any)._raw.created_at = meta.createdAt;
          if (meta.updatedAt) (record as any)._raw.updated_at = meta.updatedAt;
        }),
      );

      const autoPostRulePrepares = (data.transactionAutoPostRules || []).map(rule =>
        transactionAutoPostRulesCollection.prepareCreate(record => {
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
          if (rule.createdAt) (record as any)._raw.created_at = rule.createdAt;
          if (rule.updatedAt) (record as any)._raw.updated_at = rule.updatedAt;
        }),
      );

      const inboxPrepares = (data.transactionInboxRecords || []).map(inbox =>
        transactionInboxCollection.prepareCreate(record => {
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
          if (inbox.createdAt) (record as any)._raw.created_at = inbox.createdAt;
          if (inbox.updatedAt) (record as any)._raw.updated_at = inbox.updatedAt;
        }),
      );

      const balanceSnapshotPrepares = (data.balanceSnapshots || []).map(bs =>
        balanceSnapshotsCollection.prepareCreate(record => {
          record._raw.id = bs.id;
          record.workplaceId = workplaceId;
          (record as any)._raw.account_id = bs.accountId;
          (record as any)._raw.transaction_id = bs.transactionId;
          record.transactionDate = bs.transactionDate;
          record.absoluteBalance = bs.absoluteBalance;
          record.transactionCount = bs.transactionCount;
          record._raw._status = 'synced';
          if (bs.createdAt) (record as any)._raw.created_at = bs.createdAt;
          if (bs.updatedAt) (record as any)._raw.updated_at = bs.updatedAt;
        }),
      );

      const operations = [
        ...accountPrepares,
        ...journalPrepares,
        ...transactionPrepares,
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

      if (operations.length > 0) {
        // Chunk operations to prevent memory pressure/crashes on large imports
        const CHUNK_SIZE = 5000;
        logger.info(
          `[ImportRepository] Starting batch insert of ${operations.length} operations in chunks of ${CHUNK_SIZE}...`,
        );
        for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
          const chunk = operations.slice(i, i + CHUNK_SIZE);
          const currentCount = i + chunk.length;
          onProgress?.(
            `Saving records (${Math.min(currentCount, operations.length)}/${operations.length})...`,
            i / operations.length,
          );

          await database.batch(chunk);
          // Yield to event loop between chunks
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        onProgress?.('Saving records complete.', 1);
        logger.info('[ImportRepository] Batch insert complete.');
      }
    });
  }

  /**
   * Apply incremental changes (created/updated/deleted) for sync.
   * Preserves tombstones by soft-deleting records.
   */
  async applyChanges(
    workplaceId: WorkplaceId,
    data: {
      accounts: ChangeSet<ImportedAccount>;
      journals: ChangeSet<ImportedJournal>;
      transactions: ChangeSet<ImportedTransaction>;
      auditLogs?: ChangeSet<ImportedAuditLog>;
    },
  ): Promise<void> {
    await database.write(async () => {
      const accountsCollection = database.collections.get<Account>('accounts');
      const journalsCollection = database.collections.get<Journal>('journals');
      const transactionsCollection = database.collections.get<Transaction>('transactions');
      const auditLogsCollection = database.collections.get<AuditLog>('audit_logs');

      const ops: Model[] = [];

      const upsert = async <T extends Model, D extends { id: string }>(
        collection: Collection<T>,
        records: D[],
        prepare: (record: T, data: D) => void,
      ) => {
        if (records.length === 0) return;
        const ids = records.map(r => r.id);
        const existing = await collection
          .query(Q.where('id', Q.oneOf(ids)), Q.where('workplace_id', workplaceId))
          .fetch();
        const existingById = new Map(existing.map(r => [r.id, r]));

        for (const rec of records) {
          const existingRecord = existingById.get(rec.id);
          if (existingRecord) {
            ops.push(
              existingRecord.prepareUpdate((record: T) => {
                prepare(record, rec);
                record._raw._status = 'synced';
              }) as T,
            );
          } else {
            ops.push(
              collection.prepareCreate((record: T) => {
                record._raw.id = rec.id;
                (record as any).workplaceId = workplaceId;
                prepare(record, rec);
                record._raw._status = 'synced';
              }) as T,
            );
          }
        }
      };

      const softDelete = async <T extends Model>(collection: Collection<T>, ids: string[]) => {
        if (ids.length === 0) return;
        const existing = await collection
          .query(Q.where('id', Q.oneOf(ids)), Q.where('workplace_id', workplaceId))
          .fetch();
        const now = Date.now();
        for (const record of existing) {
          ops.push(
            record.prepareUpdate((r: T) => {
              const raw = r._raw as any;
              raw.deleted_at = now;
              raw.updated_at = now;
              raw._status = 'synced';
            }),
          );
        }
      };

      const hardDelete = async <T extends Model>(collection: Collection<T>, ids: string[]) => {
        if (ids.length === 0) return;
        const existing = await collection
          .query(Q.where('id', Q.oneOf(ids)), Q.where('workplace_id', workplaceId))
          .fetch();
        for (const record of existing) {
          ops.push(record.prepareDestroyPermanently());
        }
      };

      await upsert(
        accountsCollection,
        [...(data.accounts.created || []), ...(data.accounts.updated || [])],
        (record: Account, acc: ImportedAccount) => {
          record.name = acc.name;
          record.accountType = toAccountType(acc.accountType);
          record.accountSubtype = pickImportedSubtype(acc);
          record.currencyCode = acc.currencyCode;
          record.parentAccountId = acc.parentAccountId;
          record.description = acc.description;
          record.icon = acc.icon as IconName;
          record.orderNum = acc.orderNum;
          if (acc.reconciledAt !== undefined && acc.reconciledAt !== null) {
            record.reconciledAt = new Date(acc.reconciledAt);
          }
          if (acc.createdAt) (record as Model & { _raw: any })._raw.created_at = acc.createdAt;
          if (acc.updatedAt) (record as Model & { _raw: any })._raw.updated_at = acc.updatedAt;
          if (acc.deletedAt) {
            (record as Model & { _raw: any })._raw.deleted_at = acc.deletedAt;
          } else {
            (record as Model & { _raw: any })._raw.deleted_at = null;
          }
        },
      );

      await upsert(
        journalsCollection,
        [...(data.journals.created || []), ...(data.journals.updated || [])],
        (record: Journal, j: ImportedJournal) => {
          record.journalDate = j.journalDate;
          record.description = j.description;
          record.notes = j.notes;
          record.currencyCode = j.currencyCode;
          record.status = toJournalStatus(j.status);
          record.originalJournalId = j.originalJournalId;
          record.reversingJournalId = j.reversingJournalId;
          record.totalAmount = j.totalAmount;
          record.transactionCount = j.transactionCount;
          record.displayType = j.displayType;
          if (j.plannedPaymentId) {
            record.plannedPaymentId = j.plannedPaymentId as PlannedPaymentId;
          }
          if (j.createdAt) (record as any)._raw.created_at = j.createdAt;
          if (j.updatedAt) (record as any)._raw.updated_at = j.updatedAt;
          if (j.deletedAt) {
            (record as any)._raw.deleted_at = j.deletedAt;
          } else {
            (record as any)._raw.deleted_at = null;
          }
        },
      );

      await upsert(
        transactionsCollection,
        [...(data.transactions.created || []), ...(data.transactions.updated || [])],
        (record: Transaction, t: ImportedTransaction) => {
          record.journalId = t.journalId;
          record.accountId = t.accountId;
          record.amount = t.amount;
          record.transactionType = toTransactionType(t.transactionType);
          record.currencyCode = t.currencyCode;
          record.transactionDate = t.transactionDate;
          record.notes = t.notes;
          record.exchangeRate = t.exchangeRate;
          record.runningBalance = t.runningBalance;
          if (t.createdAt) (record as any)._raw.created_at = t.createdAt;
          if (t.updatedAt) (record as any)._raw.updated_at = t.updatedAt;
          if (t.deletedAt) {
            (record as any)._raw.deleted_at = t.deletedAt;
          } else {
            (record as any)._raw.deleted_at = null;
          }
        },
      );

      if (data.auditLogs) {
        await upsert(
          auditLogsCollection,
          [...(data.auditLogs.created || []), ...(data.auditLogs.updated || [])],
          (record: AuditLog, log: ImportedAuditLog) => {
            record.entityType = log.entityType;
            record.entityId = log.entityId;
            record.action = toAuditAction(log.action);
            record.changes = log.changes;
            record.timestamp = log.timestamp;
            if (log.createdAt) (record as any)._raw.created_at = log.createdAt;
          },
        );
      }

      await softDelete(accountsCollection, data.accounts.deleted || []);
      await softDelete(journalsCollection, data.journals.deleted || []);

      const deletedTransactionIds = data.transactions.deleted || [];
      await softDelete(transactionsCollection, deletedTransactionIds);

      if (data.auditLogs) {
        await hardDelete(auditLogsCollection, data.auditLogs.deleted || []);
      }

      if (ops.length > 0) {
        await database.batch(ops);
      }
    });
  }
}

export const importRepository = new ImportRepository();
