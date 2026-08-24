import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import { BulkDeleteUndoToken } from '@/src/types/domainJournal';
import { JournalStatus, JournalDisplayType, TransactionType } from '@/src/types/enums';
import { AccountId, JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import Transaction from '@/src/data/models/Transaction';
import { journalMetadataRepository } from '@/src/data/repositories/journal/journalMetadataRepository';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { referenceNumberFromMetadataJson } from '@/src/utils/sms/SmsReferenceExtractor';
import { logger } from '@/src/utils/logger';
import { Model, Q } from '@nozbe/watermelondb';

export interface CreateJournalData {
  journalDate: number;
  description?: string;
  notes?: string;
  currencyCode: string;
  originalJournalId?: JournalId;
  status?: JournalStatus;
  plannedPaymentId?: PlannedPaymentId;
  transactions: {
    accountId: AccountId;
    amount: number;
    transactionType: TransactionType;
    notes?: string;
    exchangeRate?: number;
    currencyCode?: string;
  }[];
  metadata?: {
    importSource: string;
    originalSmsId?: string;
    originalSmsSender?: string;
    originalSmsBody?: string;
    metadataJson?: string;
  };
}

export interface PrepareCreateJournalData extends CreateJournalData {
  totalAmount?: number;
  displayType?: JournalDisplayType;
  calculatedBalances?: Map<string, number | null>;
}

/** Journal create/update/delete and reversal persistence. */
export class JournalWriteRepository {
  private get journals() {
    return database.collections.get<Journal>('journals');
  }

  private get transactions() {
    return database.collections.get<Transaction>('transactions');
  }

  private get journalMetadata() {
    return database.collections.get<JournalMetadata>('journal_metadata');
  }

  private prepareTransaction(
    journalId: JournalId,
    txData: CreateJournalData['transactions'][number],
    journalDate: number,
    journalCurrency: string,
    workplaceId: WorkplaceId,
    calculatedBalances?: Map<string, number | null>,
    now = new Date(),
    overrides?: Pick<CreateJournalData['transactions'][number], 'notes' | 'transactionType'>,
  ): Transaction {
    return this.transactions.prepareCreate(tx => {
      tx.journalId = journalId;
      tx.accountId = txData.accountId;
      tx.amount = txData.amount;
      tx.currencyCode = txData.currencyCode || journalCurrency;
      tx.transactionType = overrides?.transactionType ?? txData.transactionType;
      tx.transactionDate = journalDate;
      tx.notes = overrides?.notes ?? txData.notes;
      tx.exchangeRate = txData.exchangeRate;
      tx.runningBalance = calculatedBalances?.get(txData.accountId) ?? null;
      tx.workplaceId = workplaceId;
      tx.createdAt = now;
      tx.updatedAt = now;
    });
  }

  private prepareMetadata(
    journalId: JournalId,
    metadata: NonNullable<CreateJournalData['metadata']>,
    workplaceId: WorkplaceId,
    now = new Date(),
  ): JournalMetadata {
    return this.journalMetadata.prepareCreate(m => {
      m.journalId = journalId;
      m.workplaceId = workplaceId;
      m.importSource = metadata.importSource;
      m.originalSmsId = metadata.originalSmsId;
      m.originalSmsSender = metadata.originalSmsSender;
      m.originalSmsBody = metadata.originalSmsBody;
      m.metadataJson = metadata.metadataJson;
      m.referenceNumber = referenceNumberFromMetadataJson(metadata.metadataJson);
      m.createdAt = now;
      m.updatedAt = now;
    });
  }

  private assertModelOwnership(
    workplaceId: WorkplaceId,
    journals: Journal[],
    transactions: Transaction[] = [],
  ): void {
    const foreignJournal = journals.find(journal => journal.workplaceId !== workplaceId);
    if (foreignJournal) {
      throw new Error(`Journal ${foreignJournal.id} does not belong to workplace ${workplaceId}`);
    }

    const foreignTransaction = transactions.find(
      transaction => transaction.workplaceId !== workplaceId,
    );
    if (foreignTransaction) {
      throw new Error(
        `Transaction ${foreignTransaction.id} does not belong to workplace ${workplaceId}`,
      );
    }
  }

  prepareCreateJournalWithTransactions(
    journalData: PrepareCreateJournalData,
    workplaceId: WorkplaceId,
  ): {
    journal: Journal;
    transactions: Transaction[];
    metadataRecord?: JournalMetadata;
  } {
    const {
      transactions: transactionData,
      totalAmount,
      displayType,
      calculatedBalances,
      metadata,
      ...journalFields
    } = journalData;

    const journal = this.journals.prepareCreate(j => {
      Object.assign(j, journalFields);
      j.workplaceId = workplaceId;
      j.status = journalFields.status ?? JournalStatus.POSTED;
      j.plannedPaymentId = journalFields.plannedPaymentId;
      j.totalAmount = totalAmount ?? 0;
      j.transactionCount = transactionData.length;
      j.displayType = displayType ?? JournalDisplayType.TRANSFER;
      j.createdAt = new Date();
      j.updatedAt = new Date();
    });

    const transactions = transactionData.map(txData =>
      this.prepareTransaction(
        journal.id,
        txData,
        journalFields.journalDate,
        journalFields.currencyCode,
        workplaceId,
        calculatedBalances,
      ),
    );

    let metadataRecord: JournalMetadata | undefined;
    if (metadata) {
      metadataRecord = this.prepareMetadata(journal.id, metadata, workplaceId);
    }

    return { journal, transactions, metadataRecord };
  }

  async createJournalWithTransactions(
    journalData: PrepareCreateJournalData,
    workplaceId: WorkplaceId,
  ): Promise<Journal> {
    const start = Date.now();
    return await database.write(async () => {
      const { journal, transactions, metadataRecord } = this.prepareCreateJournalWithTransactions(
        journalData,
        workplaceId,
      );

      const batchOps: Model[] = [journal, ...transactions];
      if (metadataRecord) batchOps.push(metadataRecord);

      await database.batch(batchOps);

      logger.info(
        `[Trace] JournalWriteRepository.createJournalWithTransactions: ${Date.now() - start}ms`,
        {
          txCount: journalData.transactions.length,
        },
      );

      return journal;
    });
  }

  async updateJournalWithTransactions(
    workplaceId: WorkplaceId,
    journalId: JournalId,
    journalData: PrepareCreateJournalData,
    extraOpCreator?: () => Model,
    afterBatch?: () => void,
  ): Promise<Journal> {
    const {
      transactions: transactionData,
      totalAmount,
      displayType,
      calculatedBalances,
      metadata,
      ...journalFields
    } = journalData;

    const existingJournal = await journalQueryRepository.find(workplaceId, journalId);
    if (!existingJournal) throw new Error('Journal not found');

    const oldTransactions = await this.transactions
      .query(Q.where('journal_id', journalId), Q.where('workplace_id', workplaceId))
      .fetch();
    const existingMeta = metadata
      ? await journalMetadataRepository.findByJournalId(journalId, workplaceId)
      : null;

    const start = Date.now();
    return await database.write(async () => {
      const now = new Date();

      const deleteUpdates = oldTransactions.map(tx =>
        tx.prepareUpdate(t => {
          t.deletedAt = now;
          t.updatedAt = now;
        }),
      );

      const createUpdates = transactionData.map(txData =>
        this.prepareTransaction(
          journalId,
          txData,
          journalFields.journalDate,
          journalFields.currencyCode,
          workplaceId,
          calculatedBalances,
        ),
      );

      const journalUpdate = existingJournal.prepareUpdate((j: Journal) => {
        j.journalDate = journalFields.journalDate;
        j.description = journalFields.description;
        j.notes = journalFields.notes;
        j.currencyCode = journalFields.currencyCode;
        j.status = journalFields.status ?? j.status;
        j.plannedPaymentId = journalFields.plannedPaymentId ?? j.plannedPaymentId;
        j.totalAmount = totalAmount ?? j.totalAmount;
        j.transactionCount = transactionData.length;
        j.displayType = displayType ?? j.displayType;
        j.updatedAt = now;
      });

      const batchOps: Model[] = [journalUpdate, ...deleteUpdates, ...createUpdates];

      if (metadata) {
        if (existingMeta) {
          const metaUpdate = existingMeta.prepareUpdate((m: JournalMetadata) => {
            m.importSource = metadata.importSource;
            m.originalSmsId = metadata.originalSmsId;
            m.originalSmsSender = metadata.originalSmsSender;
            m.originalSmsBody = metadata.originalSmsBody;
            m.metadataJson = metadata.metadataJson;
            m.referenceNumber = referenceNumberFromMetadataJson(metadata.metadataJson);
            m.workplaceId = workplaceId;
            m.updatedAt = now;
          });
          batchOps.push(metaUpdate);
        } else {
          const metaRecord = this.journalMetadata.prepareCreate((m: JournalMetadata) => {
            m.journalId = journalId;
            m.workplaceId = workplaceId;
            m.importSource = metadata.importSource;
            m.originalSmsId = metadata.originalSmsId;
            m.originalSmsSender = metadata.originalSmsSender;
            m.originalSmsBody = metadata.originalSmsBody;
            m.metadataJson = metadata.metadataJson;
            m.referenceNumber = referenceNumberFromMetadataJson(metadata.metadataJson);
            m.createdAt = now;
            m.updatedAt = now;
          });
          batchOps.push(metaRecord);
        }
      }

      if (extraOpCreator) batchOps.push(extraOpCreator());

      await database.batch(batchOps);
      afterBatch?.();

      logger.info(
        `[Trace] JournalWriteRepository.updateJournalWithTransactions: ${Date.now() - start}ms`,
        {
          newTxCount: transactionData.length,
          oldTxCount: oldTransactions.length,
        },
      );

      return existingJournal;
    });
  }

  async updateJournalStatus(
    journalId: JournalId,
    status: JournalStatus,
    workplaceId: WorkplaceId,
  ): Promise<Journal> {
    const journal = await journalQueryRepository.find(workplaceId, journalId);
    if (!journal) throw new Error(`Journal ${journalId} not found`);

    await database.write(async () => {
      await journal.update(record => {
        record.status = status;
        record.updatedAt = new Date();
      });
    });

    return journal;
  }

  async softDeleteJournal(workplaceId: WorkplaceId, journalId: JournalId): Promise<void> {
    const journal = await journalQueryRepository.find(workplaceId, journalId);
    if (!journal) return;

    const associatedTransactions = await this.transactions
      .query(Q.where('journal_id', journalId), Q.where('workplace_id', workplaceId))
      .fetch();

    await database.write(async () => {
      const now = new Date();

      const journalUpdate = journal.prepareUpdate(j => {
        j.deletedAt = now;
        j.updatedAt = now;
      });

      const transactionUpdates = associatedTransactions.map(tx =>
        tx.prepareUpdate(t => {
          t.deletedAt = now;
          t.updatedAt = now;
        }),
      );

      await database.batch([journalUpdate, ...transactionUpdates]);
    });
  }

  async fetchJournalForDeletion(
    journalId: JournalId,
    workplaceId: WorkplaceId,
  ): Promise<{ journal: Journal; transactions: Transaction[] } | null> {
    const journal = await journalQueryRepository.findWithDeleted(workplaceId, journalId);
    if (!journal) return null;

    const associatedTransactions = await this.transactions
      .query(Q.where('journal_id', journalId), Q.where('workplace_id', workplaceId))
      .fetch();

    return { journal, transactions: associatedTransactions };
  }

  prepareMarkReversed(
    journal: Journal,
    reversingJournalId: JournalId,
    workplaceId: WorkplaceId,
  ): Model {
    this.assertModelOwnership(workplaceId, [journal]);
    return journal.prepareUpdate(record => {
      record.reversingJournalId = reversingJournalId;
      record.status = JournalStatus.REVERSED;
      record.updatedAt = new Date();
    });
  }

  async persistReversal(params: {
    workplaceId: WorkplaceId;
    originalJournal: Journal;
    reversingJournalId: JournalId;
    reversalOps: Model[];
    afterBatch?: () => void;
  }): Promise<void> {
    const reverseOp = this.prepareMarkReversed(
      params.originalJournal,
      params.reversingJournalId,
      params.workplaceId,
    );

    await database.write(async () => {
      await database.batch([...params.reversalOps, reverseOp]);
      params.afterBatch?.();
    });
  }

  async replaceJournalWithReversal(params: {
    originalJournal: Journal;
    originalTransactions: Transaction[];
    replacementData: PrepareCreateJournalData;
    workplaceId: WorkplaceId;
  }): Promise<{ reversalJournal: Journal; replacementJournal: Journal }> {
    const { originalJournal, originalTransactions, replacementData, workplaceId } = params;
    this.assertModelOwnership(workplaceId, [originalJournal], originalTransactions);
    const {
      transactions: replacementTransactions,
      totalAmount,
      displayType,
      calculatedBalances,
      ...journalFields
    } = replacementData;

    const start = Date.now();
    return await database.write(async () => {
      const now = new Date();
      const reversalDate = originalJournal.journalDate;

      const reversalJournal = this.journals.prepareCreate(j => {
        j.journalDate = reversalDate;
        j.description = `Reversal of: ${originalJournal.description || originalJournal.id} (Edit)`;
        j.currencyCode = originalJournal.currencyCode;
        j.status = JournalStatus.POSTED;
        j.originalJournalId = originalJournal.id;
        j.totalAmount = originalJournal.totalAmount;
        j.transactionCount = originalTransactions.length;
        j.displayType = originalJournal.displayType;
        j.workplaceId = workplaceId;
        j.createdAt = now;
        j.updatedAt = now;
      });

      const reversalTransactions = originalTransactions.map(tx =>
        this.prepareTransaction(
          reversalJournal.id,
          {
            accountId: tx.accountId,
            amount: tx.amount,
            currencyCode: tx.currencyCode,
            transactionType: tx.transactionType,
            notes: tx.notes,
            exchangeRate: tx.exchangeRate || 1,
          },
          reversalDate,
          originalJournal.currencyCode,
          workplaceId,
          undefined,
          now,
          {
            transactionType:
              tx.transactionType === TransactionType.DEBIT
                ? TransactionType.CREDIT
                : TransactionType.DEBIT,
            notes: `Reversal: ${tx.notes || ''}`,
          },
        ),
      );

      const originalJournalUpdate = originalJournal.prepareUpdate(record => {
        record.reversingJournalId = reversalJournal.id;
        record.status = JournalStatus.REVERSED;
        record.updatedAt = now;
      });

      const replacementJournal = this.journals.prepareCreate(j => {
        Object.assign(j, journalFields);
        j.status = JournalStatus.POSTED;
        j.totalAmount = totalAmount ?? 0;
        j.transactionCount = replacementTransactions.length;
        j.displayType = displayType ?? JournalDisplayType.TRANSFER;
        j.workplaceId = workplaceId;
        j.createdAt = now;
        j.updatedAt = now;
      });

      const newTransactions = replacementTransactions.map(txData =>
        this.prepareTransaction(
          replacementJournal.id,
          txData,
          journalFields.journalDate,
          journalFields.currencyCode,
          workplaceId,
          calculatedBalances,
          now,
        ),
      );

      await database.batch([
        reversalJournal,
        ...reversalTransactions,
        originalJournalUpdate,
        replacementJournal,
        ...newTransactions,
      ]);

      logger.info(
        `[Trace] JournalWriteRepository.replaceJournalWithReversal: ${Date.now() - start}ms`,
        {
          newTxCount: replacementTransactions.length,
          oldTxCount: originalTransactions.length,
        },
      );

      return { reversalJournal, replacementJournal };
    });
  }

  /**
   * Bulk updates descriptions for a list of journals in a single atomic database batch.
   */
  async bulkUpdateDescriptions(
    workplaceId: WorkplaceId,
    journals: Journal[],
    renames: Record<JournalId, string>,
  ): Promise<void> {
    if (journals.length === 0) return;
    this.assertModelOwnership(workplaceId, journals);

    await database.write(async () => {
      const now = new Date();
      const ops: Model[] = [];

      for (const journal of journals) {
        const newName = renames[journal.id];
        if (newName !== undefined && newName !== journal.description) {
          ops.push(
            journal.prepareUpdate(record => {
              record.description = newName;
              record.updatedAt = now;
            }),
          );
        }
      }

      if (ops.length > 0) {
        await database.batch(ops);
      }
    });
  }

  private calculateBulkImpact(
    journals: Journal[],
    transactions: Transaction[],
  ): {
    affectedAccountIds: Set<AccountId>;
    minDate: number;
  } {
    const affectedAccountIds = new Set<AccountId>();
    let minDate = Infinity;

    for (const transaction of transactions) {
      affectedAccountIds.add(transaction.accountId);
      minDate = Math.min(minDate, transaction.transactionDate);
    }
    for (const journal of journals) {
      minDate = Math.min(minDate, journal.journalDate);
    }

    return { affectedAccountIds, minDate };
  }

  private prepareBulkDeletedStateUpdates(
    journals: Journal[],
    transactions: Transaction[],
    deletedAt: Date | undefined,
  ): Model[] {
    const now = new Date();
    return [
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
    ];
  }

  private async updateBulkDeletedState(
    journals: Journal[],
    transactions: Transaction[],
    deletedAt: Date | undefined,
  ): Promise<void> {
    await database.write(async () => {
      await database.batch(this.prepareBulkDeletedStateUpdates(journals, transactions, deletedAt));
    });
  }

  /** Atomically soft deletes multiple journals and their child transactions. */
  async bulkSoftDeleteJournals(
    workplaceId: WorkplaceId,
    journalIds: JournalId[],
  ): Promise<{
    affectedAccountIds: Set<AccountId>;
    minDate: number;
    undoToken: BulkDeleteUndoToken;
  }> {
    if (journalIds.length === 0) {
      return {
        affectedAccountIds: new Set(),
        minDate: Infinity,
        undoToken: { journals: [], transactions: [] },
      };
    }

    const journals = await journalQueryRepository.findByIds(workplaceId, journalIds);
    const transactions = await this.transactions
      .query(
        Q.where('journal_id', Q.oneOf(journalIds)),
        Q.where('deleted_at', Q.eq(null)),
        Q.where('workplace_id', workplaceId),
      )
      .fetch();
    const deletedAt = new Date();
    await this.updateBulkDeletedState(journals, transactions, deletedAt);

    const impact = this.calculateBulkImpact(journals, transactions);
    return {
      ...impact,
      undoToken: {
        journals: journals.map(journal => ({ id: journal.id, deletedAt: deletedAt.getTime() })),
        transactions: transactions.map(transaction => ({
          id: transaction.id,
          journalId: transaction.journalId,
          deletedAt: deletedAt.getTime(),
        })),
      },
    };
  }

  /** Atomically restores exactly the rows recorded by a bulk-delete undo token. */
  async bulkRestoreJournals(
    workplaceId: WorkplaceId,
    token: BulkDeleteUndoToken,
  ): Promise<{ affectedAccountIds: Set<AccountId>; minDate: number }> {
    if (token.journals.length === 0 && token.transactions.length === 0) {
      return { affectedAccountIds: new Set(), minDate: Infinity };
    }

    return database.write(async () => {
      const journals = await journalQueryRepository.findWithDeletedByIds(
        workplaceId,
        token.journals.map(journal => journal.id),
      );
      const transactions = await this.transactions
        .query(
          Q.where('id', Q.oneOf(token.transactions.map(transaction => transaction.id))),
          Q.where('workplace_id', workplaceId),
        )
        .fetch();
      const journalIds = token.journals.map(journal => journal.id);
      const journalIdSet = new Set(journalIds);
      const deletedAt = token.journals[0]?.deletedAt ?? token.transactions[0]?.deletedAt;
      if (
        token.journals.length === 0 ||
        token.journals.some(journal => journal.deletedAt !== deletedAt) ||
        token.transactions.some(
          transaction =>
            transaction.deletedAt !== deletedAt || !journalIdSet.has(transaction.journalId),
        )
      ) {
        throw new Error('Undo token does not match the journal delete operation');
      }
      const allDeletedTransactions = await this.transactions
        .query(
          Q.where('journal_id', Q.oneOf(journalIds)),
          Q.where('deleted_at', Q.eq(deletedAt)),
          Q.where('workplace_id', workplaceId),
        )
        .fetch();
      const journalById = new Map(journals.map(journal => [journal.id, journal]));
      const transactionById = new Map(
        transactions.map(transaction => [transaction.id, transaction]),
      );
      const tokenTransactionIds = new Set(token.transactions.map(transaction => transaction.id));
      if (
        allDeletedTransactions.length !== token.transactions.length ||
        allDeletedTransactions.some(transaction => !tokenTransactionIds.has(transaction.id))
      ) {
        throw new Error('Undo token does not match the journal delete operation');
      }

      for (const expected of token.journals) {
        const journal = journalById.get(expected.id);
        if (!journal || journal.deletedAt?.getTime() !== expected.deletedAt) {
          throw new Error(`Journal ${expected.id} no longer matches the delete operation`);
        }
      }
      for (const expected of token.transactions) {
        const transaction = transactionById.get(expected.id);
        if (
          !transaction ||
          transaction.deletedAt?.getTime() !== expected.deletedAt ||
          transaction.journalId !== expected.journalId
        ) {
          throw new Error(`Transaction ${expected.id} no longer matches the delete operation`);
        }
      }
      if (journals.some(journal => !token.journals.some(expected => expected.id === journal.id))) {
        throw new Error('Undo token does not match the journal delete operation');
      }

      const impact = this.calculateBulkImpact(journals, transactions);
      await database.batch(this.prepareBulkDeletedStateUpdates(journals, transactions, undefined));
      return impact;
    });
  }

  /**
   * Atomically creates a new merged journal and soft-deletes the source journals in a single database batch.
   */
  async mergeJournalsAtomic(params: {
    workplaceId: WorkplaceId;
    sourceJournalIds: JournalId[];
    newJournalData: PrepareCreateJournalData;
  }): Promise<{
    mergedJournal: Journal;
    affectedAccountIds: Set<AccountId>;
    minDate: number;
  }> {
    const { workplaceId, sourceJournalIds, newJournalData } = params;

    const sourceJournals = await journalQueryRepository.findByIds(workplaceId, sourceJournalIds);
    const sourceTransactions = await this.transactions
      .query(
        Q.where('journal_id', Q.oneOf(sourceJournalIds)),
        Q.where('deleted_at', Q.eq(null)),
        Q.where('workplace_id', workplaceId),
      )
      .fetch();

    const { journal, transactions, metadataRecord } = this.prepareCreateJournalWithTransactions(
      newJournalData,
      workplaceId,
    );

    const affectedAccountIds = new Set<AccountId>();
    let minDate = newJournalData.journalDate;

    for (const tx of sourceTransactions) {
      affectedAccountIds.add(tx.accountId);
      minDate = Math.min(minDate, tx.transactionDate);
    }
    for (const tx of newJournalData.transactions) {
      affectedAccountIds.add(tx.accountId);
    }

    await database.write(async () => {
      const now = new Date();
      const sourceJournalDeletes = sourceJournals.map(j =>
        j.prepareUpdate(record => {
          record.deletedAt = now;
          record.updatedAt = now;
        }),
      );
      const sourceTxDeletes = sourceTransactions.map(t =>
        t.prepareUpdate(record => {
          record.deletedAt = now;
          record.updatedAt = now;
        }),
      );

      const batchOps: Model[] = [
        journal,
        ...transactions,
        ...sourceJournalDeletes,
        ...sourceTxDeletes,
      ];
      if (metadataRecord) batchOps.push(metadataRecord);

      await database.batch(batchOps);
    });

    return { mergedJournal: journal, affectedAccountIds, minDate };
  }

  /**
   * Bulk updates accountId for a list of transactions and refreshes parent journals in a single atomic database batch.
   */
  async bulkReassignTransactionAccounts(params: {
    workplaceId: WorkplaceId;
    transactions: Transaction[];
    newAccountId: AccountId;
    journals: Journal[];
    displayTypeByJournalId: Map<JournalId, JournalDisplayType>;
  }): Promise<void> {
    const { workplaceId, transactions, newAccountId, journals, displayTypeByJournalId } = params;
    if (transactions.length === 0 && journals.length === 0) return;
    this.assertModelOwnership(workplaceId, journals, transactions);

    await database.write(async () => {
      const now = new Date();
      const txOps = transactions.map(tx =>
        tx.prepareUpdate(record => {
          record.accountId = newAccountId;
          record.updatedAt = now;
        }),
      );
      const journalOps = journals.map(journal =>
        journal.prepareUpdate(record => {
          const newDisplayType = displayTypeByJournalId.get(journal.id);
          if (newDisplayType !== undefined) {
            record.displayType = newDisplayType;
          }
          record.updatedAt = now;
        }),
      );
      await database.batch([...txOps, ...journalOps]);
    });
  }

  /**
   * Atomically reassigns each transaction back to its own original account and refreshes parent journals in a single batch.
   */
  async bulkReassignTransactionAccountsToOriginals(params: {
    workplaceId: WorkplaceId;
    transactions: Transaction[];
    originalAccountIdByTxId: Record<string, AccountId>;
    journals: Journal[];
    displayTypeByJournalId: Map<JournalId, JournalDisplayType>;
  }): Promise<void> {
    const { workplaceId, transactions, originalAccountIdByTxId, journals, displayTypeByJournalId } =
      params;
    if (transactions.length === 0 && journals.length === 0) return;
    this.assertModelOwnership(workplaceId, journals, transactions);

    await database.write(async () => {
      const now = new Date();
      const txOps = transactions
        .filter(tx => originalAccountIdByTxId[tx.id] !== undefined)
        .map(tx =>
          tx.prepareUpdate(record => {
            record.accountId = originalAccountIdByTxId[tx.id];
            record.updatedAt = now;
          }),
        );
      const journalOps = journals.map(journal =>
        journal.prepareUpdate(record => {
          const newDisplayType = displayTypeByJournalId.get(journal.id);
          if (newDisplayType !== undefined) {
            record.displayType = newDisplayType;
          }
          record.updatedAt = now;
        }),
      );
      await database.batch([...txOps, ...journalOps]);
    });
  }

  /**
   * Atomically creates multiple journals with their transactions in a single database batch.
   */
  async bulkCreateJournals(
    workplaceId: WorkplaceId,
    items: PrepareCreateJournalData[],
  ): Promise<{
    journals: Journal[];
    affectedAccountIds: Set<AccountId>;
    minDate: number;
  }> {
    if (items.length === 0) {
      return { journals: [], affectedAccountIds: new Set(), minDate: Infinity };
    }

    const createdJournals: Journal[] = [];
    const allOps: Model[] = [];
    const affectedAccountIds = new Set<AccountId>();
    let minDate = Infinity;

    for (const item of items) {
      const { journal, transactions, metadataRecord } = this.prepareCreateJournalWithTransactions(
        item,
        workplaceId,
      );
      createdJournals.push(journal);
      allOps.push(journal, ...transactions);
      if (metadataRecord) allOps.push(metadataRecord);

      minDate = Math.min(minDate, item.journalDate);
      for (const tx of item.transactions) {
        affectedAccountIds.add(tx.accountId);
      }
    }

    await database.write(async () => {
      await database.batch(allOps);
    });

    return { journals: createdJournals, affectedAccountIds, minDate };
  }
}

export const journalWriteRepository = new JournalWriteRepository();
