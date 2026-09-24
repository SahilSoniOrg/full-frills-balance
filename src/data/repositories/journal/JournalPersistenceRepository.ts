import { database } from '@/src/data/database/Database';
import {
  getStagedAccounts,
  runAccountingWriteSession,
  stageModelWrite,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import Account from '@/src/data/models/Account';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import Journal from '@/src/data/models/Journal';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import Transaction from '@/src/data/models/Transaction';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { MetadataKeys, MetadataSources } from '@/src/constants/ledger-constants';
import {
  evaluateJournalBalance,
  JournalBalanceError,
} from '@/src/domain/accounting/journalBalanceEvaluator';
import { AuditAction, JournalDisplayType, JournalStatus, TransactionType } from '@/src/types/enums';
import { AccountId, JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import type { BulkDeleteUndoToken } from '@/src/types/domainJournal';
import { mapTransactionToAudit } from '@/src/types/audit';
import { referenceNumberFromMetadataJson } from '@/src/utils/sms/SmsReferenceExtractor';
import { safeParseJSON } from '@/src/utils/serialization';
import { Model, Q } from '@nozbe/watermelondb';

export interface JournalPersistenceLine {
  accountId: AccountId;
  amount: number;
  transactionType: TransactionType;
  notes?: string;
  exchangeRate?: number;
  currencyCode?: string;
}

export interface JournalPersistenceMetadata {
  importSource: string;
  originalSmsId?: string;
  originalSmsSender?: string;
  originalSmsBody?: string;
  metadataJson?: string;
}

/** Plain input to the journal persistence boundary. Contains no WatermelonDB models. */
export interface PutJournalInput {
  journalId?: JournalId;
  journalDate: number;
  description?: string;
  notes?: string;
  currencyCode: string;
  status?: JournalStatus;
  originalJournalId?: JournalId;
  plannedPaymentId?: PlannedPaymentId;
  displayType: JournalDisplayType;
  transactions: JournalPersistenceLine[];
  metadata?: JournalPersistenceMetadata;
  runningBalanceByAccountId?: ReadonlyMap<AccountId, number | null>;
}

/** Existing-journal update shape for generic sparse puts, such as a description edit. */
export interface PutJournalPatchInput {
  journalId: JournalId;
  journalDate?: number;
  description?: string;
  notes?: string;
  currencyCode?: string;
  status?: JournalStatus;
  originalJournalId?: JournalId;
  plannedPaymentId?: PlannedPaymentId;
  displayType?: JournalDisplayType;
  transactions?: JournalPersistenceLine[];
  metadata?: JournalPersistenceMetadata;
  runningBalanceByAccountId?: ReadonlyMap<AccountId, number | null>;
}

export type PutJournalRequest = PutJournalInput | PutJournalPatchInput;

export interface MergeJournalsInput {
  sourceJournalIds: readonly JournalId[];
  description?: string;
  journalDate?: number;
  displayType?: JournalDisplayType;
}

export interface ReassignJournalAccountsInput {
  accountIdByTransactionId: ReadonlyMap<string, AccountId>;
  displayTypeByJournalId: ReadonlyMap<JournalId, JournalDisplayType>;
}

export interface JournalPersistenceResult {
  journal: Journal;
  affectedAccountIds: ReadonlySet<AccountId>;
  rebuildFromDate: number;
  previousStatus?: JournalStatus;
  status: JournalStatus;
}

interface ResolvedJournalBalance {
  totalAmount: number;
  accountCurrencyById: ReadonlyMap<AccountId, string>;
}

function localStartOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function nextDeletionTimestamp(rows: readonly { deletedAt?: Date }[]): Date {
  const latestExistingTimestamp = Math.max(0, ...rows.map(row => row.deletedAt?.getTime() ?? 0));
  return new Date(Math.max(Date.now(), latestExistingTimestamp + 1));
}

/**
 * New persistence boundary for journal create/update/post.
 * Every balance decision is made from current persisted account currency and journal status
 * inside the same WatermelonDB writer transaction as the mutation.
 */
export class JournalPersistenceRepository {
  private get journals() {
    return database.collections.get<Journal>('journals');
  }

  private get transactions() {
    return database.collections.get<Transaction>('transactions');
  }

  private get metadata() {
    return database.collections.get<JournalMetadata>('journal_metadata');
  }

  private get accounts() {
    return database.collections.get<Account>('accounts');
  }

  private get plannedPayments() {
    return database.collections.get<PlannedPayment>('planned_payments');
  }

  async put(
    input: PutJournalPatchInput,
    workplaceId: WorkplaceId,
  ): Promise<JournalPersistenceResult>;
  async put(input: PutJournalRequest, workplaceId: WorkplaceId): Promise<JournalPersistenceResult>;
  async put(input: PutJournalInput, workplaceId: WorkplaceId): Promise<JournalPersistenceResult>;
  async put(input: PutJournalRequest, workplaceId: WorkplaceId): Promise<JournalPersistenceResult> {
    return runAccountingWriteSession(session =>
      this.stagePutInSession(session, input, workplaceId),
    );
  }

  /** Stage a plain journal write in a caller-owned accounting write session. */
  async putInSession(
    session: AccountingWriteSession,
    input: PutJournalPatchInput,
    workplaceId: WorkplaceId,
  ): Promise<JournalPersistenceResult>;
  async putInSession(
    session: AccountingWriteSession,
    input: PutJournalRequest,
    workplaceId: WorkplaceId,
  ): Promise<JournalPersistenceResult>;
  async putInSession(
    session: AccountingWriteSession,
    input: PutJournalInput,
    workplaceId: WorkplaceId,
  ): Promise<JournalPersistenceResult>;
  async putInSession(
    session: AccountingWriteSession,
    input: PutJournalRequest,
    workplaceId: WorkplaceId,
  ): Promise<JournalPersistenceResult> {
    return this.stagePutInSession(session, input, workplaceId);
  }

  private async stagePutInSession(
    session: AccountingWriteSession,
    input: PutJournalRequest,
    workplaceId: WorkplaceId,
  ): Promise<JournalPersistenceResult> {
    const prepared = await this.preparePutOperations(input, workplaceId, session);
    stageModelWrite(session, prepared.ops);
    return prepared.result;
  }

  async putMany(
    inputs: readonly PutJournalRequest[],
    workplaceId: WorkplaceId,
  ): Promise<JournalPersistenceResult[]> {
    if (inputs.length === 0) return [];
    const journalIds = inputs.flatMap(input => (input.journalId ? [input.journalId] : []));
    if (new Set(journalIds).size !== journalIds.length) {
      throw new Error('A journal can only appear once in a putMany batch');
    }

    return runAccountingWriteSession(async session => {
      const prepared = [];
      for (const input of inputs) {
        const item = await this.preparePutOperations(input, workplaceId, session);
        stageModelWrite(session, item.ops);
        prepared.push(item);
      }
      return prepared.map(item => item.result);
    });
  }

  /**
   * Rebuilds a merged posted journal from current source rows and commits it with
   * source soft-deletes and metadata/inbox retargeting in one database batch.
   */
  async merge(
    input: MergeJournalsInput,
    workplaceId: WorkplaceId,
  ): Promise<JournalPersistenceResult> {
    const sourceJournalIds = [...new Set(input.sourceJournalIds)];
    if (sourceJournalIds.length < 2 || sourceJournalIds.length !== input.sourceJournalIds.length) {
      throw new Error('Select at least 2 distinct journals to merge');
    }

    return runAccountingWriteSession(async session => {
      const sourceJournals = await this.journals
        .query(
          Q.where('id', Q.oneOf(sourceJournalIds)),
          Q.where('workplace_id', workplaceId),
          Q.where('deleted_at', Q.eq(null)),
        )
        .fetch();
      if (sourceJournals.length !== sourceJournalIds.length) {
        throw new Error('Some selected transactions could not be found.');
      }

      const journalById = new Map(sourceJournals.map(journal => [journal.id, journal]));
      const orderedJournals = sourceJournalIds.map(journalId => journalById.get(journalId)!);
      const currencyCode = orderedJournals[0].currencyCode;
      if (
        orderedJournals.some(
          journal =>
            journal.currencyCode.trim().toUpperCase() !== currencyCode.trim().toUpperCase(),
        )
      ) {
        throw new Error('Cannot merge transactions with different currencies.');
      }

      const plannedPaymentIds = [
        ...new Set(
          orderedJournals
            .map(journal => journal.plannedPaymentId)
            .filter((id): id is PlannedPaymentId => Boolean(id)),
        ),
      ];
      if (plannedPaymentIds.length > 1) {
        throw new Error('Cannot merge transactions linked to different planned payments.');
      }

      const sourceTransactions = await this.transactions
        .query(
          Q.where('journal_id', Q.oneOf(sourceJournalIds)),
          Q.where('deleted_at', Q.eq(null)),
          Q.where('workplace_id', workplaceId),
        )
        .fetch();
      const descriptions = [
        ...new Set(
          orderedJournals
            .map(journal => journal.description?.trim())
            .filter((description): description is string => Boolean(description)),
        ),
      ];
      const firstDisplayType = orderedJournals[0].displayType as JournalDisplayType | undefined;
      const defaultDisplayType =
        firstDisplayType &&
        orderedJournals.every(journal => journal.displayType === firstDisplayType)
          ? firstDisplayType
          : JournalDisplayType.TRANSFER;
      const journalDate =
        input.journalDate ?? Math.max(...orderedJournals.map(journal => journal.journalDate));
      const description =
        input.description ||
        (descriptions.length > 0 ? `Merged: ${descriptions.join(', ')}` : 'Merged Transaction');
      const transactions: JournalPersistenceLine[] = sourceTransactions.map(transaction => ({
        accountId: transaction.accountId,
        amount: transaction.amount,
        transactionType: transaction.transactionType as TransactionType,
        notes: transaction.notes,
        exchangeRate: transaction.exchangeRate,
        currencyCode: transaction.currencyCode,
      }));

      const prepared = await this.preparePutOperations(
        {
          journalDate,
          description,
          currencyCode,
          status: JournalStatus.POSTED,
          plannedPaymentId: plannedPaymentIds[0],
          displayType: input.displayType ?? defaultDisplayType,
          transactions,
        },
        workplaceId,
        session,
      );

      const sourceMetadata = await this.metadata
        .query(
          Q.where('journal_id', Q.oneOf(sourceJournalIds)),
          Q.where('workplace_id', workplaceId),
        )
        .fetch();
      const sourceInboxRecords = await database.collections
        .get<TransactionInboxRecord>('transaction_inbox_records')
        .query(
          Q.where('workplace_id', workplaceId),
          Q.or(
            Q.where('linked_journal_id', Q.oneOf(sourceJournalIds)),
            Q.where('duplicate_journal_id', Q.oneOf(sourceJournalIds)),
          ),
        )
        .fetch();

      const now = new Date();
      const sourceIds = new Set(sourceJournalIds);
      stageModelWrite(session, () => {
        const operations = [
          ...prepared.ops(),
          ...orderedJournals.map(journal =>
            journal.prepareUpdate(record => {
              record.deletedAt = now;
              record.updatedAt = now;
            }),
          ),
          ...sourceTransactions.map(transaction =>
            transaction.prepareUpdate(record => {
              record.deletedAt = now;
              record.updatedAt = now;
            }),
          ),
          ...sourceMetadata.map(metadata =>
            metadata.prepareUpdate(record => {
              record.journalId = prepared.result.journal.id;
              record.updatedAt = now;
            }),
          ),
          ...sourceInboxRecords.map(inboxRecord =>
            inboxRecord.prepareUpdate(record => {
              if (record.linkedJournalId && sourceIds.has(record.linkedJournalId)) {
                record.linkedJournalId = prepared.result.journal.id;
              }
              if (record.duplicateJournalId && sourceIds.has(record.duplicateJournalId)) {
                record.duplicateJournalId = prepared.result.journal.id;
              }
            }),
          ),
        ];
        return operations;
      });

      const affectedAccountIds = new Set<AccountId>([
        ...sourceTransactions.map(transaction => transaction.accountId),
        ...transactions.map(transaction => transaction.accountId),
      ]);
      return {
        ...prepared.result,
        affectedAccountIds,
        rebuildFromDate: Math.min(
          journalDate,
          ...orderedJournals.map(journal => journal.journalDate),
          ...sourceTransactions.map(transaction => transaction.transactionDate),
        ),
      };
    });
  }

  /** Reassigns transaction accounts after reloading and validating affected journals in-session. */
  async reassignAccounts(
    input: ReassignJournalAccountsInput,
    workplaceId: WorkplaceId,
  ): Promise<{ affectedAccountIds: ReadonlySet<AccountId>; rebuildFromDate: number }> {
    if (input.accountIdByTransactionId.size === 0) {
      return { affectedAccountIds: new Set(), rebuildFromDate: Number.POSITIVE_INFINITY };
    }

    return runAccountingWriteSession(async session => {
      const transactionIds = [...input.accountIdByTransactionId.keys()];
      const transactions = await this.transactions
        .query(
          Q.where('id', Q.oneOf(transactionIds)),
          Q.where('workplace_id', workplaceId),
          Q.where('deleted_at', Q.eq(null)),
        )
        .fetch();
      if (transactions.length !== transactionIds.length) {
        throw new Error('Some transactions could not be found for account reassignment.');
      }

      const journalIds = [...new Set(transactions.map(transaction => transaction.journalId))];
      const [journals, journalTransactions] = await Promise.all([
        this.journals
          .query(
            Q.where('id', Q.oneOf(journalIds)),
            Q.where('workplace_id', workplaceId),
            Q.where('deleted_at', Q.eq(null)),
          )
          .fetch(),
        this.transactions
          .query(
            Q.where('journal_id', Q.oneOf(journalIds)),
            Q.where('workplace_id', workplaceId),
            Q.where('deleted_at', Q.eq(null)),
          )
          .fetch(),
      ]);
      if (journals.length !== journalIds.length) {
        throw new Error('Some journals could not be found for account reassignment.');
      }

      const replacements = input.accountIdByTransactionId;
      const groupedTransactions = new Map<string, Transaction[]>();
      for (const transaction of journalTransactions) {
        const group = groupedTransactions.get(transaction.journalId) ?? [];
        group.push(transaction);
        groupedTransactions.set(transaction.journalId, group);
      }

      for (const journal of journals) {
        const lines = groupedTransactions.get(journal.id) ?? [];
        await this.validateJournal({
          currencyCode: journal.currencyCode,
          status: journal.status as JournalStatus,
          workplaceId,
          session,
          transactions: lines.map(transaction => ({
            accountId: replacements.get(transaction.id) ?? transaction.accountId,
            amount: transaction.amount,
            transactionType: transaction.transactionType as TransactionType,
            exchangeRate: transaction.exchangeRate,
            currencyCode: transaction.currencyCode,
          })),
        });
      }

      const now = new Date();
      stageModelWrite(session, () => [
        ...transactions.map(transaction => {
          const accountId = replacements.get(transaction.id)!;
          return transaction.prepareUpdate(record => {
            record.accountId = accountId;
            record.runningBalance = null;
            record.updatedAt = now;
          });
        }),
        ...journals.flatMap(journal => {
          const displayType = input.displayTypeByJournalId.get(journal.id);
          return displayType === undefined
            ? []
            : [
                journal.prepareUpdate(record => {
                  record.displayType = displayType;
                  record.updatedAt = now;
                }),
              ];
        }),
      ]);

      const affectedAccountIds = new Set<AccountId>();
      for (const transaction of transactions) {
        affectedAccountIds.add(transaction.accountId);
        affectedAccountIds.add(replacements.get(transaction.id)!);
      }
      return {
        affectedAccountIds,
        rebuildFromDate: Math.min(
          ...journals.map(journal => journal.journalDate),
          ...transactions.map(transaction => transaction.transactionDate),
        ),
      };
    });
  }

  /** Restores a deleted journal only when its posted entries still satisfy current rules. */
  async recover(journalId: JournalId, workplaceId: WorkplaceId): Promise<JournalPersistenceResult> {
    return runAccountingWriteSession(async session => {
      let journal: Journal;
      try {
        journal = await this.journals.find(journalId);
      } catch {
        throw new Error('Journal not found');
      }
      if (journal.workplaceId !== workplaceId) throw new Error('Journal not found');

      const transactions = await this.transactions
        .query(Q.where('journal_id', journalId), Q.where('workplace_id', workplaceId))
        .fetch();
      const restoreTransactions = transactions.filter(
        transaction =>
          transaction.deletedAt &&
          journal.deletedAt &&
          transaction.deletedAt.getTime() === journal.deletedAt.getTime(),
      );
      const activeTransactions = transactions.filter(transaction => !transaction.deletedAt);
      const resultingTransactions = [...activeTransactions, ...restoreTransactions];
      await this.validateJournal({
        currencyCode: journal.currencyCode,
        status: journal.status as JournalStatus,
        workplaceId,
        session,
        transactions: resultingTransactions.map(transaction => ({
          accountId: transaction.accountId,
          amount: transaction.amount,
          transactionType: transaction.transactionType as TransactionType,
          exchangeRate: transaction.exchangeRate,
          currencyCode: transaction.currencyCode,
        })),
      });

      const previousDeletedAt = journal.deletedAt
        ? new Date(journal.deletedAt.getTime())
        : undefined;
      const now = new Date();
      stageModelWrite(session, () => [
        journal.prepareUpdate(record => {
          record.deletedAt = undefined;
          record.updatedAt = now;
        }),
        ...restoreTransactions.map(transaction =>
          transaction.prepareUpdate(record => {
            record.deletedAt = undefined;
            record.updatedAt = now;
          }),
        ),
        auditRepository.prepareLog(
          {
            entityType: 'journal',
            entityId: journalId,
            action: AuditAction.UPDATE,
            changes: {
              before: { deletedAt: previousDeletedAt },
              after: { restoredAt: now },
            },
          },
          workplaceId,
        ),
      ]);

      return {
        journal,
        affectedAccountIds: new Set(
          resultingTransactions.map(transaction => transaction.accountId),
        ),
        rebuildFromDate: Math.min(
          journal.journalDate,
          ...resultingTransactions.map(transaction => transaction.transactionDate),
        ),
        status: journal.status as JournalStatus,
      };
    });
  }

  /** Soft-deletes a journal and its currently active lines as one repository command. */
  async delete(
    journalId: JournalId,
    workplaceId: WorkplaceId,
  ): Promise<{ affectedAccountIds: ReadonlySet<AccountId>; rebuildFromDate: number }> {
    return runAccountingWriteSession(async session => {
      const journal = await this.findActiveJournal(journalId, workplaceId);
      if (!journal) {
        return { affectedAccountIds: new Set(), rebuildFromDate: Number.POSITIVE_INFINITY };
      }
      const allTransactions = await this.transactions
        .query(Q.where('journal_id', journalId), Q.where('workplace_id', workplaceId))
        .fetch();
      const activeTransactions = allTransactions.filter(transaction => !transaction.deletedAt);
      const deletedAt = nextDeletionTimestamp([journal, ...allTransactions]);
      const now = deletedAt;
      stageModelWrite(session, () => [
        journal.prepareUpdate(record => {
          record.deletedAt = deletedAt;
          record.updatedAt = now;
        }),
        ...activeTransactions.map(transaction =>
          transaction.prepareUpdate(record => {
            record.deletedAt = deletedAt;
            record.updatedAt = now;
          }),
        ),
        auditRepository.prepareLog(
          {
            entityType: 'journal',
            entityId: journalId,
            action: AuditAction.DELETE,
            changes: {
              before: {
                description: journal.description,
                totalAmount: journal.totalAmount,
                currencyCode: journal.currencyCode,
                transactions: activeTransactions.map(mapTransactionToAudit),
              },
              after: { deletedAt },
            },
          },
          workplaceId,
        ),
      ]);
      return {
        affectedAccountIds: new Set(activeTransactions.map(transaction => transaction.accountId)),
        rebuildFromDate: Math.min(
          journal.journalDate,
          ...activeTransactions.map(transaction => transaction.transactionDate),
        ),
      };
    });
  }

  /** Bulk soft-delete plus a token that can restore exactly this operation. */
  async bulkDelete(
    workplaceId: WorkplaceId,
    journalIds: readonly JournalId[],
  ): Promise<{
    affectedAccountIds: ReadonlySet<AccountId>;
    rebuildFromDate: number;
    undoToken: BulkDeleteUndoToken;
  }> {
    if (journalIds.length === 0) {
      return {
        affectedAccountIds: new Set(),
        rebuildFromDate: Number.POSITIVE_INFINITY,
        undoToken: { journals: [], transactions: [] },
      };
    }
    const distinctJournalIds = [...new Set(journalIds)];

    return runAccountingWriteSession(async session => {
      const journals = await this.journals
        .query(
          Q.where('id', Q.oneOf(distinctJournalIds)),
          Q.where('workplace_id', workplaceId),
          Q.where('deleted_at', Q.eq(null)),
        )
        .fetch();
      if (journals.length === 0) {
        return {
          affectedAccountIds: new Set(),
          rebuildFromDate: Number.POSITIVE_INFINITY,
          undoToken: { journals: [], transactions: [] },
        };
      }
      const ids = journals.map(journal => journal.id);
      const allTransactions = await this.transactions
        .query(Q.where('journal_id', Q.oneOf(ids)), Q.where('workplace_id', workplaceId))
        .fetch();
      const transactions = allTransactions.filter(transaction => !transaction.deletedAt);
      const deletedAt = nextDeletionTimestamp([...journals, ...allTransactions]);
      const now = deletedAt;
      stageModelWrite(session, () => [
        ...journals.map(journal =>
          journal.prepareUpdate(record => {
            record.deletedAt = deletedAt;
            record.updatedAt = now;
          }),
        ),
        ...transactions.map(transaction =>
          transaction.prepareUpdate(record => {
            record.deletedAt = deletedAt;
            record.updatedAt = now;
          }),
        ),
        ...journals.map(journal =>
          auditRepository.prepareLog(
            {
              entityType: 'journal',
              entityId: journal.id,
              action: AuditAction.DELETE,
              changes: {
                before: {
                  description: journal.description,
                  totalAmount: journal.totalAmount,
                  currencyCode: journal.currencyCode,
                  transactions: transactions
                    .filter(transaction => transaction.journalId === journal.id)
                    .map(mapTransactionToAudit),
                },
                after: { deletedAt },
              },
            },
            workplaceId,
          ),
        ),
      ]);

      const affectedAccountIds = new Set(transactions.map(transaction => transaction.accountId));
      return {
        affectedAccountIds,
        rebuildFromDate: Math.min(
          ...journals.map(journal => journal.journalDate),
          ...transactions.map(transaction => transaction.transactionDate),
        ),
        undoToken: {
          journals: journals.map(journal => ({ id: journal.id, deletedAt: deletedAt.getTime() })),
          transactions: transactions.map(transaction => ({
            id: transaction.id,
            journalId: transaction.journalId,
            deletedAt: deletedAt.getTime(),
          })),
        },
      };
    });
  }

  /** Stages the unposted journal cascade for a planned-payment deletion. */
  async deleteUnpostedByPlannedPaymentInSession(
    session: AccountingWriteSession,
    workplaceId: WorkplaceId,
    plannedPaymentId: PlannedPaymentId,
  ): Promise<void> {
    const journals = await this.journals
      .query(
        Q.where('planned_payment_id', plannedPaymentId),
        Q.where('workplace_id', workplaceId),
        Q.where(
          'status',
          Q.oneOf([JournalStatus.PLANNED, JournalStatus.PAUSED, JournalStatus.SKIPPED]),
        ),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
    if (journals.length === 0) return;

    const journalIds = journals.map(journal => journal.id);
    const transactions = await this.transactions
      .query(
        Q.where('journal_id', Q.oneOf(journalIds)),
        Q.where('workplace_id', workplaceId),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
    const deletedAt = nextDeletionTimestamp(transactions);
    stageModelWrite(session, () => [
      ...journals.map(journal =>
        journal.prepareUpdate(record => {
          record.deletedAt = deletedAt;
          record.updatedAt = deletedAt;
        }),
      ),
      ...transactions.map(transaction =>
        transaction.prepareUpdate(record => {
          record.deletedAt = deletedAt;
          record.updatedAt = deletedAt;
        }),
      ),
      ...journals.map(journal =>
        auditRepository.prepareLog(
          {
            entityType: 'journal',
            entityId: journal.id,
            action: AuditAction.DELETE,
            changes: {
              before: {
                status: journal.status,
                description: journal.description,
                totalAmount: journal.totalAmount,
              },
              after: { deletedAt },
            },
          },
          workplaceId,
        ),
      ),
    ]);
  }

  /** Restores exactly one bulk-delete operation after validating each resulting journal. */
  async bulkRestore(
    workplaceId: WorkplaceId,
    token: BulkDeleteUndoToken,
  ): Promise<{ affectedAccountIds: ReadonlySet<AccountId>; rebuildFromDate: number }> {
    if (token.journals.length === 0 && token.transactions.length === 0) {
      return { affectedAccountIds: new Set(), rebuildFromDate: Number.POSITIVE_INFINITY };
    }

    return runAccountingWriteSession(async session => {
      const journalIds = token.journals.map(item => item.id);
      const transactionIds = token.transactions.map(item => item.id);
      const journalIdSet = new Set(journalIds);
      const transactionIdSet = new Set(transactionIds);
      const deletedAt = token.journals[0]?.deletedAt ?? token.transactions[0]?.deletedAt;
      if (
        token.journals.length === 0 ||
        journalIdSet.size !== journalIds.length ||
        transactionIdSet.size !== transactionIds.length ||
        token.journals.some(item => item.deletedAt !== deletedAt) ||
        token.transactions.some(
          item => item.deletedAt !== deletedAt || !journalIdSet.has(item.journalId),
        )
      ) {
        throw new Error('Undo token does not match the journal delete operation');
      }

      const [journals, allTransactions] = await Promise.all([
        this.journals
          .query(Q.where('id', Q.oneOf(journalIds)), Q.where('workplace_id', workplaceId))
          .fetch(),
        this.transactions
          .query(Q.where('journal_id', Q.oneOf(journalIds)), Q.where('workplace_id', workplaceId))
          .fetch(),
      ]);
      const journalById = new Map(journals.map(journal => [journal.id, journal]));
      const transactionById = new Map(
        allTransactions.map(transaction => [transaction.id, transaction]),
      );
      const tokenTransactions = token.transactions.map(expected =>
        transactionById.get(expected.id),
      );
      const deletedTransactions = allTransactions.filter(
        transaction => transaction.deletedAt?.getTime() === deletedAt,
      );
      if (
        journals.length !== token.journals.length ||
        token.journals.some(
          expected => journalById.get(expected.id)?.deletedAt?.getTime() !== expected.deletedAt,
        ) ||
        tokenTransactions.some(
          (transaction, index) =>
            !transaction ||
            transaction.deletedAt?.getTime() !== token.transactions[index].deletedAt ||
            transaction.journalId !== token.transactions[index].journalId,
        ) ||
        deletedTransactions.length !== token.transactions.length ||
        deletedTransactions.some(transaction => !transactionIdSet.has(transaction.id))
      ) {
        throw new Error('Undo token does not match the journal delete operation');
      }

      const restoreIdSet = new Set(token.transactions.map(transaction => transaction.id));
      const now = new Date();
      const affectedAccountIds = new Set<AccountId>();
      let rebuildFromDate = Number.POSITIVE_INFINITY;
      const transactionsByJournal = new Map<JournalId, Transaction[]>();
      for (const transaction of allTransactions) {
        if (!restoreIdSet.has(transaction.id) && transaction.deletedAt) continue;
        const group = transactionsByJournal.get(transaction.journalId) ?? [];
        group.push(transaction);
        transactionsByJournal.set(transaction.journalId, group);
      }

      for (const expected of token.journals) {
        const journal = journalById.get(expected.id)!;
        const resultingTransactions = transactionsByJournal.get(journal.id) ?? [];
        await this.validateJournal({
          currencyCode: journal.currencyCode,
          status: journal.status as JournalStatus,
          workplaceId,
          session,
          transactions: resultingTransactions.map(transaction => ({
            accountId: transaction.accountId,
            amount: transaction.amount,
            transactionType: transaction.transactionType as TransactionType,
            exchangeRate: transaction.exchangeRate,
            currencyCode: transaction.currencyCode,
          })),
        });
        for (const transaction of resultingTransactions) {
          affectedAccountIds.add(transaction.accountId);
          rebuildFromDate = Math.min(rebuildFromDate, transaction.transactionDate);
        }
        rebuildFromDate = Math.min(rebuildFromDate, journal.journalDate);
      }

      stageModelWrite(session, () => [
        ...journals.map(journal =>
          journal.prepareUpdate(record => {
            record.deletedAt = undefined;
            record.updatedAt = now;
          }),
        ),
        ...tokenTransactions.map(transaction =>
          transaction!.prepareUpdate(record => {
            record.deletedAt = undefined;
            record.updatedAt = now;
          }),
        ),
        ...journals.map(journal =>
          auditRepository.prepareLog(
            {
              entityType: 'journal',
              entityId: journal.id,
              action: AuditAction.UPDATE,
              changes: {
                before: { deletedAt: journal.deletedAt },
                after: { restoredAt: now },
              },
            },
            workplaceId,
          ),
        ),
      ]);

      return { affectedAccountIds, rebuildFromDate };
    });
  }

  /** Reverts a posted or skipped journal to its planned state atomically. */
  async revertToPlanned(
    journalId: JournalId,
    workplaceId: WorkplaceId,
  ): Promise<JournalPersistenceResult> {
    return runAccountingWriteSession(async session => {
      const journal = await this.findActiveJournal(journalId, workplaceId);
      if (!journal) throw new Error('Journal not found');
      if (journal.status !== JournalStatus.POSTED && journal.status !== JournalStatus.SKIPPED) {
        throw new Error(
          `Cannot revert journal with status ${journal.status}. Only POSTED or SKIPPED journals can be reverted.`,
        );
      }

      if (journal.plannedPaymentId) {
        const plannedPayment = await this.plannedPayments
          .query(
            Q.where('id', journal.plannedPaymentId),
            Q.where('workplace_id', workplaceId),
            Q.where('deleted_at', Q.eq(null)),
          )
          .fetch();
        if (plannedPayment.length === 0) {
          throw new Error('Cannot revert to scheduled because the planned payment was deleted.');
        }
      }

      const currentJournalDate = journal.journalDate;
      const [metadata] = await this.metadata
        .query(Q.where('journal_id', journalId), Q.where('workplace_id', workplaceId))
        .fetch();
      const storedDate = metadata?.metadataJson
        ? safeParseJSON<Record<string, unknown>>(metadata.metadataJson, {})[
            MetadataKeys.ORIGINAL_PLANNED_DATE
          ]
        : undefined;
      const revertTime =
        typeof storedDate === 'number' && Number.isFinite(storedDate)
          ? storedDate
          : localStartOfDay(currentJournalDate);
      const transactions = await this.transactions
        .query(
          Q.where('journal_id', journalId),
          Q.where('workplace_id', workplaceId),
          Q.where('deleted_at', Q.eq(null)),
        )
        .fetch();
      const now = new Date();

      stageModelWrite(session, () => [
        journal.prepareUpdate(record => {
          record.status = JournalStatus.PLANNED;
          record.journalDate = revertTime;
          record.updatedAt = now;
        }),
        ...transactions.map(transaction =>
          transaction.prepareUpdate(record => {
            record.transactionDate = revertTime;
            record.updatedAt = now;
          }),
        ),
        auditRepository.prepareLog(
          {
            entityType: 'journal',
            entityId: journalId,
            action: AuditAction.UPDATE,
            changes: {
              before: { status: journal.status, journalDate: currentJournalDate },
              after: { status: JournalStatus.PLANNED, journalDate: revertTime },
            },
          },
          workplaceId,
        ),
      ]);

      return {
        journal,
        affectedAccountIds: new Set(transactions.map(transaction => transaction.accountId)),
        rebuildFromDate: Math.min(currentJournalDate, revertTime),
        previousStatus: journal.status as JournalStatus,
        status: JournalStatus.PLANNED,
      };
    });
  }

  private async preparePutOperations(
    input: PutJournalRequest,
    workplaceId: WorkplaceId,
    session?: AccountingWriteSession,
  ): Promise<{ ops: () => readonly Model[]; result: JournalPersistenceResult }> {
    const existingJournal = input.journalId
      ? await this.findActiveJournal(input.journalId, workplaceId)
      : null;
    if (input.journalId && !existingJournal) throw new Error('Journal not found');

    const oldTransactions = existingJournal
      ? await this.transactions
          .query(
            Q.where('journal_id', existingJournal.id),
            Q.where('workplace_id', workplaceId),
            Q.where('deleted_at', Q.eq(null)),
          )
          .fetch()
      : [];
    const hasTransactionPayload = input.transactions !== undefined;
    const transactionLines =
      input.transactions ??
      oldTransactions.map(transaction => ({
        accountId: transaction.accountId,
        amount: transaction.amount,
        transactionType: transaction.transactionType as TransactionType,
        notes: transaction.notes,
        exchangeRate: transaction.exchangeRate,
        currencyCode: transaction.currencyCode,
      }));
    const journalDate = input.journalDate ?? existingJournal?.journalDate;
    const description = Object.prototype.hasOwnProperty.call(input, 'description')
      ? input.description
      : existingJournal?.description;
    const notes = Object.prototype.hasOwnProperty.call(input, 'notes')
      ? input.notes
      : existingJournal?.notes;
    const displayType = input.displayType ?? existingJournal?.displayType;
    const previousStatus = existingJournal?.status;
    const previousJournalDate = existingJournal?.journalDate;
    const journalCurrency = existingJournal?.currencyCode ?? input.currencyCode;
    if (journalCurrency === undefined) {
      throw new Error('A new journal requires a currency');
    }
    if (
      existingJournal &&
      input.currencyCode !== undefined &&
      input.currencyCode.trim().toUpperCase() !== journalCurrency.trim().toUpperCase()
    ) {
      throw new JournalBalanceError('A saved journal currency cannot be changed');
    }
    if (
      !existingJournal &&
      (!hasTransactionPayload || journalDate === undefined || !journalCurrency || !displayType)
    ) {
      throw new Error(
        'A new journal requires a date, currency, display type, and transaction lines',
      );
    }
    if (journalDate === undefined || displayType === undefined) {
      throw new Error('Journal update is missing required persisted values');
    }

    const effectiveStatus = input.status ?? existingJournal?.status ?? JournalStatus.POSTED;
    const balance = await this.validateJournal({
      currencyCode: journalCurrency,
      transactions: transactionLines,
      status: effectiveStatus,
      workplaceId,
      session,
    });

    const now = new Date();
    const journal =
      existingJournal ??
      this.journals.prepareCreate(record => {
        record.workplaceId = workplaceId;
        record.journalDate = journalDate;
        record.description = description;
        record.notes = notes;
        record.currencyCode = journalCurrency;
        record.status = effectiveStatus;
        record.originalJournalId = input.originalJournalId;
        record.plannedPaymentId = input.plannedPaymentId;
        record.totalAmount = balance.totalAmount;
        record.transactionCount = transactionLines.length;
        record.displayType = displayType;
        record.createdAt = now;
        record.updatedAt = now;
      });

    const existingMetadata =
      input.metadata && existingJournal
        ? await this.metadata
            .query(Q.where('journal_id', existingJournal.id), Q.where('workplace_id', workplaceId))
            .fetch()
            .then(rows => rows[0] ?? null)
        : null;

    const auditChanges = existingJournal
      ? {
          before: {
            description: existingJournal.description,
            journalDate: existingJournal.journalDate,
            currencyCode: existingJournal.currencyCode,
            status: existingJournal.status,
            totalAmount: existingJournal.totalAmount,
            transactions: oldTransactions.map(mapTransactionToAudit),
          },
          after: {
            description,
            journalDate,
            currencyCode: journalCurrency,
            status: effectiveStatus,
            totalAmount: balance.totalAmount,
            transactions: transactionLines.map(line =>
              mapTransactionToAudit({
                ...line,
                currencyCode: balance.accountCurrencyById.get(line.accountId),
              }),
            ),
          },
        }
      : { description: input.description };
    const ops = (): readonly Model[] => {
      const journalOp = existingJournal
        ? existingJournal.prepareUpdate(record => {
            record.journalDate = journalDate;
            record.description = description;
            record.notes = notes;
            record.totalAmount = balance.totalAmount;
            record.transactionCount = transactionLines.length;
            record.displayType = displayType;
            record.status = effectiveStatus;
            record.updatedAt = now;
          })
        : journal;
      const transactionOps = hasTransactionPayload
        ? [
            ...oldTransactions.map(transaction =>
              transaction.prepareUpdate(record => {
                record.deletedAt = now;
                record.updatedAt = now;
              }),
            ),
            ...transactionLines.map(line =>
              this.transactions.prepareCreate(record => {
                record.journalId = journal.id;
                record.workplaceId = workplaceId;
                record.accountId = line.accountId;
                record.amount = line.amount;
                record.transactionType = line.transactionType;
                record.currencyCode = balance.accountCurrencyById.get(line.accountId)!;
                record.transactionDate = journalDate;
                record.notes = line.notes;
                record.exchangeRate = line.exchangeRate;
                record.runningBalance =
                  effectiveStatus === JournalStatus.POSTED
                    ? (input.runningBalanceByAccountId?.get(line.accountId) ?? null)
                    : null;
                record.createdAt = now;
                record.updatedAt = now;
              }),
            ),
          ]
        : journalDate !== existingJournal?.journalDate || effectiveStatus !== previousStatus
          ? oldTransactions.map(transaction =>
              transaction.prepareUpdate(record => {
                if (journalDate !== existingJournal?.journalDate) {
                  record.transactionDate = journalDate;
                }
                record.runningBalance = null;
                record.updatedAt = now;
              }),
            )
          : [];

      const operations: Model[] = [journalOp, ...transactionOps];
      if (input.metadata) {
        if (existingMetadata) {
          operations.push(
            existingMetadata.prepareUpdate(record => {
              record.importSource = input.metadata!.importSource;
              record.originalSmsId = input.metadata!.originalSmsId;
              record.originalSmsSender = input.metadata!.originalSmsSender;
              record.originalSmsBody = input.metadata!.originalSmsBody;
              record.metadataJson = input.metadata!.metadataJson;
              record.referenceNumber = referenceNumberFromMetadataJson(
                input.metadata!.metadataJson,
              );
              record.updatedAt = now;
            }),
          );
        } else {
          operations.push(
            this.metadata.prepareCreate(record => {
              record.journalId = journal.id;
              record.workplaceId = workplaceId;
              record.importSource = input.metadata!.importSource;
              record.originalSmsId = input.metadata!.originalSmsId;
              record.originalSmsSender = input.metadata!.originalSmsSender;
              record.originalSmsBody = input.metadata!.originalSmsBody;
              record.metadataJson = input.metadata!.metadataJson;
              record.referenceNumber = referenceNumberFromMetadataJson(
                input.metadata!.metadataJson,
              );
              record.createdAt = now;
              record.updatedAt = now;
            }),
          );
        }
      }
      operations.push(
        auditRepository.prepareLog(
          {
            entityType: 'journal',
            entityId: journal.id,
            action: existingJournal ? AuditAction.UPDATE : AuditAction.CREATE,
            changes: auditChanges,
          },
          workplaceId,
        ),
      );
      return operations;
    };

    return {
      ops,
      result: {
        journal,
        affectedAccountIds:
          hasTransactionPayload ||
          journalDate !== previousJournalDate ||
          effectiveStatus !== previousStatus
            ? new Set<AccountId>([
                ...oldTransactions.map(transaction => transaction.accountId),
                ...transactionLines.map(transaction => transaction.accountId),
              ])
            : new Set<AccountId>(),
        rebuildFromDate: Math.min(previousJournalDate ?? journalDate, journalDate),
        previousStatus,
        status: effectiveStatus,
      },
    };
  }

  async reverse(
    originalJournalId: JournalId,
    reason: string,
    workplaceId: WorkplaceId,
    reversedAt = Date.now(),
    displayType?: JournalDisplayType,
  ): Promise<JournalPersistenceResult> {
    return database.write(async () => {
      const originalJournal = await this.findActiveJournal(originalJournalId, workplaceId);
      if (!originalJournal) throw new Error('Original journal not found');
      if (originalJournal.status !== JournalStatus.POSTED || originalJournal.reversingJournalId) {
        throw new Error('Only a posted journal without an existing reversal can be reversed');
      }
      const originalTransactions = await this.transactions
        .query(
          Q.where('journal_id', originalJournalId),
          Q.where('workplace_id', workplaceId),
          Q.where('deleted_at', Q.eq(null)),
        )
        .fetch();

      const prepared = await this.preparePutOperations(
        {
          journalDate: reversedAt,
          description: `Reversal of: ${originalJournal.description || originalJournalId} (${reason})`,
          currencyCode: originalJournal.currencyCode,
          originalJournalId,
          displayType: displayType ?? originalJournal.displayType,
          transactions: originalTransactions.map(transaction => ({
            accountId: transaction.accountId,
            amount: transaction.amount,
            transactionType:
              transaction.transactionType === TransactionType.DEBIT
                ? TransactionType.CREDIT
                : TransactionType.DEBIT,
            notes: `Reversal: ${transaction.notes || ''}`,
            exchangeRate: transaction.exchangeRate,
            currencyCode: transaction.currencyCode,
          })),
        },
        workplaceId,
      );
      const markOriginalReversed = originalJournal.prepareUpdate(record => {
        record.reversingJournalId = prepared.result.journal.id;
        record.status = JournalStatus.REVERSED;
        record.updatedAt = new Date();
      });
      const auditOriginalReversal = auditRepository.prepareLog(
        {
          entityType: 'journal',
          entityId: originalJournalId,
          action: AuditAction.UPDATE,
          changes: {
            before: {
              status: originalJournal.status,
              reversingJournalId: originalJournal.reversingJournalId,
            },
            after: {
              status: JournalStatus.REVERSED,
              reversingJournalId: prepared.result.journal.id,
            },
          },
        },
        workplaceId,
      );

      await database.batch(...prepared.ops(), markOriginalReversed, auditOriginalReversal);
      return {
        ...prepared.result,
        affectedAccountIds: new Set([
          ...prepared.result.affectedAccountIds,
          ...originalTransactions.map(transaction => transaction.accountId),
        ]),
        rebuildFromDate: Math.min(originalJournal.journalDate, reversedAt),
      };
    });
  }

  async post(
    journalId: JournalId,
    workplaceId: WorkplaceId,
    postedAt = Date.now(),
  ): Promise<JournalPersistenceResult> {
    return runAccountingWriteSession(session =>
      this.postInSession(session, journalId, workplaceId, postedAt),
    );
  }

  async postInSession(
    session: AccountingWriteSession,
    journalId: JournalId,
    workplaceId: WorkplaceId,
    postedAt = Date.now(),
  ): Promise<JournalPersistenceResult> {
    const journal = await this.findActiveJournal(journalId, workplaceId);
    if (!journal) throw new Error('Journal not found');
    if (journal.status !== JournalStatus.PLANNED) {
      throw new Error(
        `Cannot post journal with status ${journal.status}. Only PLANNED journals can be posted.`,
      );
    }
    const originalPlannedDate = journal.journalDate;

    const transactions = await this.transactions
      .query(
        Q.where('journal_id', journalId),
        Q.where('workplace_id', workplaceId),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
    await this.validateJournal({
      currencyCode: journal.currencyCode,
      status: JournalStatus.POSTED,
      workplaceId,
      transactions: transactions.map(transaction => ({
        accountId: transaction.accountId,
        amount: transaction.amount,
        transactionType: transaction.transactionType,
        exchangeRate: transaction.exchangeRate,
      })),
      session,
    });

    const now = new Date();
    const [existingMetadata] = await this.metadata
      .query(Q.where('journal_id', journalId), Q.where('workplace_id', workplaceId))
      .fetch();
    const ops = (): readonly Model[] => {
      const metadataOp = existingMetadata
        ? existingMetadata.prepareUpdate(record => {
            const currentJson = safeParseJSON<Record<string, unknown>>(record.metadataJson, {});
            record.metadataJson = JSON.stringify({
              ...currentJson,
              [MetadataKeys.ORIGINAL_PLANNED_DATE]: originalPlannedDate,
            });
            record.importSource = MetadataSources.MANUAL_POST;
            record.updatedAt = now;
          })
        : this.metadata.prepareCreate(record => {
            record.journalId = journalId;
            record.workplaceId = workplaceId;
            record.importSource = MetadataSources.MANUAL_POST;
            record.metadataJson = JSON.stringify({
              [MetadataKeys.ORIGINAL_PLANNED_DATE]: originalPlannedDate,
            });
            record.createdAt = now;
            record.updatedAt = now;
          });
      const auditOp = auditRepository.prepareLog(
        {
          entityType: 'journal',
          entityId: journalId,
          action: AuditAction.UPDATE,
          changes: {
            before: { status: JournalStatus.PLANNED, journalDate: originalPlannedDate },
            after: { status: JournalStatus.POSTED, journalDate: postedAt },
          },
        },
        workplaceId,
      );
      return [
        metadataOp,
        journal.prepareUpdate(record => {
          record.status = JournalStatus.POSTED;
          record.journalDate = postedAt;
          record.updatedAt = now;
        }),
        ...transactions.map(transaction =>
          transaction.prepareUpdate(record => {
            record.transactionDate = postedAt;
            record.updatedAt = now;
          }),
        ),
        auditOp,
      ];
    };
    stageModelWrite(session, ops);
    return {
      journal,
      affectedAccountIds: new Set(transactions.map(transaction => transaction.accountId)),
      rebuildFromDate: Math.min(originalPlannedDate, postedAt),
      previousStatus: JournalStatus.PLANNED,
      status: JournalStatus.POSTED,
    };
  }

  async setNonPostedStatusesInSession(
    session: AccountingWriteSession,
    workplaceId: WorkplaceId,
    updates: readonly {
      journalId: JournalId;
      status: JournalStatus;
      expectedStatus?: JournalStatus;
    }[],
  ): Promise<void> {
    const allowedStatuses = new Set([
      JournalStatus.PLANNED,
      JournalStatus.PAUSED,
      JournalStatus.SKIPPED,
    ]);
    const ids = updates.map(update => update.journalId);
    if (new Set(ids).size !== ids.length) {
      throw new Error('A journal can only receive one planned-status update per session');
    }

    const validatedUpdates: { journal: Journal; status: JournalStatus; updatedAt: Date }[] = [];
    for (const update of updates) {
      if (!allowedStatuses.has(update.status)) {
        throw new Error(`Unsupported non-posted journal status: ${update.status}`);
      }
      const journal = await this.findActiveJournal(update.journalId, workplaceId);
      if (!journal) throw new Error(`Journal ${update.journalId} not found`);
      if (update.expectedStatus !== undefined && journal.status !== update.expectedStatus) {
        throw new Error(
          `Journal ${update.journalId} changed from ${update.expectedStatus} to ${journal.status}`,
        );
      }
      if (!allowedStatuses.has(journal.status)) {
        throw new Error(`Cannot change planned status for journal in ${journal.status} status`);
      }
      if (journal.status === update.status) continue;

      validatedUpdates.push({ journal, status: update.status, updatedAt: new Date() });
    }
    stageModelWrite(session, () =>
      validatedUpdates.flatMap(({ journal, status, updatedAt }) => [
        journal.prepareUpdate(record => {
          record.status = status;
          record.updatedAt = updatedAt;
        }),
        auditRepository.prepareLog(
          {
            entityType: 'journal',
            entityId: journal.id,
            action: AuditAction.UPDATE,
            changes: {
              before: { status: journal.status },
              after: { status },
            },
          },
          workplaceId,
        ),
      ]),
    );
  }

  /**
   * Retarget transaction lines as part of an account merge. Existing posted
   * journals are revalidated against the resulting account references before
   * the transaction updates are staged for the enclosing atomic write.
   */
  async retargetAccountsForMergeInSession(
    session: AccountingWriteSession,
    workplaceId: WorkplaceId,
    sourceAccountIds: readonly AccountId[],
    targetAccountId: AccountId,
  ): Promise<void> {
    if (sourceAccountIds.length === 0) return;

    const sourceIds = new Set(sourceAccountIds);
    const movedTransactions = await this.transactions
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('account_id', Q.oneOf([...sourceAccountIds])),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
    if (movedTransactions.length === 0) return;

    const affectedJournalIds = [
      ...new Set(movedTransactions.map(transaction => transaction.journalId)),
    ];
    const [journals, journalTransactions] = await Promise.all([
      this.journals
        .query(
          Q.where('workplace_id', workplaceId),
          Q.where('id', Q.oneOf(affectedJournalIds)),
          Q.where('deleted_at', Q.eq(null)),
        )
        .fetch(),
      this.transactions
        .query(
          Q.where('workplace_id', workplaceId),
          Q.where('journal_id', Q.oneOf(affectedJournalIds)),
          Q.where('deleted_at', Q.eq(null)),
        )
        .fetch(),
    ]);
    const transactionsByJournal = new Map<string, Transaction[]>();
    for (const transaction of journalTransactions) {
      const group = transactionsByJournal.get(transaction.journalId) ?? [];
      group.push(transaction);
      transactionsByJournal.set(transaction.journalId, group);
    }

    for (const journal of journals) {
      if (journal.status !== JournalStatus.POSTED) continue;
      const lines = transactionsByJournal.get(journal.id) ?? [];
      await this.validateJournal({
        currencyCode: journal.currencyCode,
        status: JournalStatus.POSTED,
        workplaceId,
        session,
        transactions: lines.map(transaction => ({
          accountId: sourceIds.has(transaction.accountId) ? targetAccountId : transaction.accountId,
          amount: transaction.amount,
          transactionType: transaction.transactionType as TransactionType,
          exchangeRate: transaction.exchangeRate,
          currencyCode: transaction.currencyCode,
        })),
      });
    }

    const now = new Date();
    stageModelWrite(session, () =>
      movedTransactions.map(transaction =>
        transaction.prepareUpdate(record => {
          record.accountId = targetAccountId;
          record.runningBalance = null;
          record.updatedAt = now;
        }),
      ),
    );
  }

  async assertPlannedOccurrenceAvailable(
    workplaceId: WorkplaceId,
    plannedPaymentId: PlannedPaymentId,
    dayStart: number,
    dayEnd: number,
    allowedJournalIds: ReadonlySet<JournalId> = new Set(),
  ): Promise<void> {
    const journals = await this.journals
      .query(
        Q.where('planned_payment_id', plannedPaymentId),
        Q.where('workplace_id', workplaceId),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
    const journalIds = journals
      .filter(journal => !allowedJournalIds.has(journal.id))
      .map(journal => journal.id);
    const matchingDateJournal = journals.find(
      journal =>
        !allowedJournalIds.has(journal.id) &&
        journal.journalDate >= dayStart &&
        journal.journalDate <= dayEnd,
    );
    const metadata =
      !matchingDateJournal && journalIds.length > 0
        ? await this.metadata
            .query(Q.where('workplace_id', workplaceId), Q.where('journal_id', Q.oneOf(journalIds)))
            .fetch()
        : [];
    const originalOccurrenceJournal = metadata.find(row => {
      const metadataJson = safeParseJSON<Record<string, unknown>>(row.metadataJson, {});
      const rawOriginalDate = metadataJson[MetadataKeys.ORIGINAL_PLANNED_DATE];
      const originalDate =
        typeof rawOriginalDate === 'number' || typeof rawOriginalDate === 'string'
          ? Number(rawOriginalDate)
          : Number.NaN;
      return Number.isFinite(originalDate) && originalDate >= dayStart && originalDate <= dayEnd;
    });
    const conflicting =
      matchingDateJournal ??
      (originalOccurrenceJournal
        ? journals.find(journal => journal.id === originalOccurrenceJournal.journalId)
        : undefined);
    if (conflicting) {
      throw new Error(
        `Planned payment ${plannedPaymentId} already has a journal for this occurrence (${conflicting.id})`,
      );
    }
  }

  private async findActiveJournal(
    journalId: JournalId,
    workplaceId: WorkplaceId,
  ): Promise<Journal | null> {
    try {
      const journal = await this.journals.find(journalId);
      return journal.workplaceId === workplaceId && !journal.deletedAt ? journal : null;
    } catch {
      return null;
    }
  }

  private async validateJournal(params: {
    currencyCode: string;
    status: JournalStatus;
    workplaceId: WorkplaceId;
    transactions: readonly JournalPersistenceLine[];
    session?: AccountingWriteSession;
  }): Promise<ResolvedJournalBalance> {
    const { currencyCode, status, workplaceId, transactions, session } = params;
    const accountIds = [...new Set(transactions.map(line => line.accountId))];
    const persistedAccounts =
      accountIds.length === 0
        ? []
        : await this.accounts
            .query(
              Q.where('id', Q.oneOf(accountIds)),
              Q.where('workplace_id', workplaceId),
              Q.where('deleted_at', Q.eq(null)),
            )
            .fetch();
    const accountsById = new Map(
      (session ? getStagedAccounts(session, workplaceId, new Set(accountIds)) : []).map(account => [
        account.id,
        account,
      ]),
    );
    for (const account of persistedAccounts) accountsById.set(account.id, account);
    const missingAccountIds = accountIds.filter(accountId => !accountsById.has(accountId));
    if (missingAccountIds.length > 0) {
      throw new JournalBalanceError(
        `Journal references missing or deleted account(s): ${missingAccountIds.join(', ')}`,
      );
    }

    const accounts = [...accountsById.values()];
    const currencies = [currencyCode, ...accounts.map(account => account.currencyCode)].map(code =>
      code.trim().toUpperCase(),
    );
    const precisionEntries = await Promise.all(
      [...new Set(currencies)].map(
        async code => [code, await currencyRepository.getPrecision(code)] as const,
      ),
    );
    const precisionByCurrency = new Map(precisionEntries);
    const evaluation = evaluateJournalBalance({
      journalCurrency: currencyCode,
      precisionByCurrency,
      lines: transactions.map((line, index) => ({
        id: String(index),
        accountId: line.accountId,
        accountCurrency: accountsById.get(line.accountId)?.currencyCode,
        amount: line.amount,
        exchangeRate: line.exchangeRate,
        transactionType: line.transactionType,
      })),
    });

    const invalidIssue = evaluation.issues.find(
      issue => issue.code !== 'unbalanced' || status === JournalStatus.POSTED,
    );
    if (invalidIssue) throw new JournalBalanceError(invalidIssue.message);

    if (transactions.some(line => !Object.values(TransactionType).includes(line.transactionType))) {
      throw new JournalBalanceError('Journal lines must be debit or credit entries');
    }

    const precisionViolation = evaluation.lineValues.find(
      (line, index) => line.nativeAmount !== transactions[index]?.amount,
    );
    if (precisionViolation) {
      throw new JournalBalanceError(
        `Journal line ${precisionViolation.id} exceeds ${precisionViolation.accountCurrency} precision`,
      );
    }

    const totalMinorUnits =
      evaluation.journalTotalAmount !== undefined
        ? Math.round(evaluation.journalTotalAmount * 10 ** evaluation.journalPrecision)
        : Math.max(evaluation.debitTotalMinorUnits, evaluation.creditTotalMinorUnits);
    return {
      totalAmount: totalMinorUnits / 10 ** evaluation.journalPrecision,
      accountCurrencyById: new Map(accounts.map(account => [account.id, account.currencyCode])),
    };
  }
}

export const journalPersistenceRepository = new JournalPersistenceRepository();
