import { database } from '@/src/data/database/Database';
import Journal, { JournalStatus } from '@/src/data/models/Journal';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import Transaction from '@/src/data/models/Transaction';
import { journalMetadataRepository } from '@/src/data/repositories/journal/journalMetadataRepository';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { referenceNumberFromMetadataJson } from '@/src/utils/sms/SmsReferenceExtractor';
import {
  AccountId,
  JournalDisplayType,
  JournalId,
  PlannedPaymentId,
  TransactionType,
  WorkplaceId,
} from '@/src/types/domain';
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

    const transactions = transactionData.map(txData => {
      return this.transactions.prepareCreate(tx => {
        tx.journalId = journal.id;
        tx.accountId = txData.accountId;
        tx.amount = txData.amount;
        tx.currencyCode = txData.currencyCode || journalFields.currencyCode;
        tx.transactionType = txData.transactionType;
        tx.transactionDate = journalFields.journalDate;
        tx.notes = txData.notes;
        tx.exchangeRate = txData.exchangeRate;
        tx.runningBalance = calculatedBalances?.get(txData.accountId) ?? null;
        tx.workplaceId = workplaceId;
        tx.createdAt = new Date();
        tx.updatedAt = new Date();
      });
    });

    let metadataRecord: JournalMetadata | undefined;
    if (metadata) {
      metadataRecord = this.journalMetadata.prepareCreate((m: JournalMetadata) => {
        m.journalId = journal.id;
        m.workplaceId = workplaceId;
        m.importSource = metadata.importSource;
        m.originalSmsId = metadata.originalSmsId;
        m.originalSmsSender = metadata.originalSmsSender;
        m.originalSmsBody = metadata.originalSmsBody;
        m.metadataJson = metadata.metadataJson;
        m.referenceNumber = referenceNumberFromMetadataJson(metadata.metadataJson);
      });
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

      const createUpdates = transactionData.map(txData => {
        return this.transactions.prepareCreate(tx => {
          tx.accountId = txData.accountId;
          tx.amount = txData.amount;
          tx.currencyCode = txData.currencyCode || journalFields.currencyCode;
          tx.transactionType = txData.transactionType;
          tx.journalId = journalId;
          tx.workplaceId = workplaceId;
          tx.transactionDate = journalFields.journalDate;
          tx.notes = txData.notes;
          tx.exchangeRate = txData.exchangeRate;
          tx.runningBalance = calculatedBalances?.get(txData.accountId) ?? null;
          tx.createdAt = new Date();
          tx.updatedAt = new Date();
        });
      });

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
        (j as any)._setRaw('updated_at', Date.now());
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

  async markReversed(
    originalJournalId: JournalId,
    reversingJournalId: JournalId,
    workplaceId: WorkplaceId,
  ): Promise<void> {
    const journal = await journalQueryRepository.find(workplaceId, originalJournalId);
    if (!journal) return;

    await database.write(async () => {
      const update = journal.prepareUpdate(record => {
        record.reversingJournalId = reversingJournalId;
        record.status = JournalStatus.REVERSED;
        record.updatedAt = new Date();
      });
      await database.batch([update]);
    });
  }

  async replaceJournalWithReversal(params: {
    originalJournal: Journal;
    originalTransactions: Transaction[];
    replacementData: PrepareCreateJournalData;
    workplaceId: WorkplaceId;
  }): Promise<{ reversalJournal: Journal; replacementJournal: Journal }> {
    const { originalJournal, originalTransactions, replacementData, workplaceId } = params;
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

      const reversalTransactions = originalTransactions.map(tx => {
        return this.transactions.prepareCreate(t => {
          t.journalId = reversalJournal.id;
          t.accountId = tx.accountId;
          t.amount = tx.amount;
          t.currencyCode = tx.currencyCode;
          t.transactionType =
            tx.transactionType === TransactionType.DEBIT
              ? TransactionType.CREDIT
              : TransactionType.DEBIT;
          t.transactionDate = reversalDate;
          t.notes = `Reversal: ${tx.notes || ''}`;
          t.exchangeRate = tx.exchangeRate || 1;
          t.runningBalance = null;
          t.workplaceId = workplaceId;
          t.createdAt = now;
          t.updatedAt = now;
        });
      });

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

      const newTransactions = replacementTransactions.map(txData => {
        return this.transactions.prepareCreate(tx => {
          tx.journalId = replacementJournal.id;
          tx.accountId = txData.accountId;
          tx.amount = txData.amount;
          tx.currencyCode = txData.currencyCode || journalFields.currencyCode;
          tx.transactionType = txData.transactionType;
          tx.transactionDate = journalFields.journalDate;
          tx.notes = txData.notes;
          tx.exchangeRate = txData.exchangeRate;
          tx.runningBalance = calculatedBalances?.get(txData.accountId) ?? null;
          tx.workplaceId = workplaceId;
          tx.createdAt = now;
          tx.updatedAt = new Date();
        });
      });

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
    journals: Journal[],
    renames: Record<JournalId, string>,
  ): Promise<void> {
    if (journals.length === 0) return;

    await database.write(async () => {
      const now = new Date();
      const ops: Model[] = [];

      for (const journal of journals) {
        const newName = renames[journal.id as JournalId];
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

  /**
   * Atomically soft deletes multiple journals and their child transactions in a single database batch.
   */
  async bulkSoftDeleteJournals(
    workplaceId: WorkplaceId,
    journalIds: JournalId[],
  ): Promise<{ affectedAccountIds: Set<AccountId>; minDate: number }> {
    if (journalIds.length === 0) {
      return { affectedAccountIds: new Set(), minDate: Infinity };
    }

    const journals = await journalQueryRepository.findByIds(workplaceId, journalIds);
    const transactions = await this.transactions
      .query(
        Q.where('journal_id', Q.oneOf(journalIds)),
        Q.where('deleted_at', Q.eq(null)),
        Q.where('workplace_id', workplaceId),
      )
      .fetch();

    const affectedAccountIds = new Set<AccountId>();
    let minDate = Infinity;

    for (const tx of transactions) {
      affectedAccountIds.add(tx.accountId as AccountId);
      minDate = Math.min(minDate, tx.transactionDate);
    }

    await database.write(async () => {
      const now = new Date();
      const journalUpdates = journals.map(j =>
        j.prepareUpdate(record => {
          record.deletedAt = now;
          record.updatedAt = now;
        }),
      );
      const txUpdates = transactions.map(t =>
        t.prepareUpdate(record => {
          record.deletedAt = now;
          record.updatedAt = now;
        }),
      );

      await database.batch([...journalUpdates, ...txUpdates]);
    });

    return { affectedAccountIds, minDate };
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
      affectedAccountIds.add(tx.accountId as AccountId);
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
   * Bulk updates accountId for a list of transactions in a single atomic database batch.
   */
  async bulkReassignTransactionAccounts(
    transactions: Transaction[],
    newAccountId: AccountId,
  ): Promise<void> {
    if (transactions.length === 0) return;

    await database.write(async () => {
      const now = new Date();
      const ops = transactions.map(tx =>
        tx.prepareUpdate(record => {
          record.accountId = newAccountId;
          record.updatedAt = now;
        }),
      );
      await database.batch(ops);
    });
  }

  /**
   * Atomically reassigns each transaction back to its own original account in a single batch.
   * Used for undo of bulk account changes where each transaction may target a different account.
   */
  async bulkReassignTransactionAccountsToOriginals(
    transactions: Transaction[],
    originalAccountByTxId: Record<string, AccountId>,
  ): Promise<void> {
    if (transactions.length === 0) return;

    await database.write(async () => {
      const now = new Date();
      const ops = transactions
        .filter(tx => originalAccountByTxId[tx.id] !== undefined)
        .map(tx =>
          tx.prepareUpdate(record => {
            record.accountId = originalAccountByTxId[tx.id];
            record.updatedAt = now;
          }),
        );
      if (ops.length > 0) {
        await database.batch(ops);
      }
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
