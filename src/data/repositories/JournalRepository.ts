import { database } from '@/src/data/database/Database';
import { AccountType } from '@/src/data/models/Account';
import Journal, { JournalStatus } from '@/src/data/models/Journal';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import Transaction, { TransactionType } from '@/src/data/models/Transaction';
import { journalEnrichmentQueries } from '@/src/data/repositories/journal/JournalEnrichmentQueries';
import { journalObserveQueries } from '@/src/data/repositories/journal/JournalObserveQueries';
import { journalPlannedQueries } from '@/src/data/repositories/journal/JournalPlannedQueries';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { smsJournalQueries } from '@/src/data/repositories/journal/SmsJournalQueries';
import {
  AccountId,
  JournalDisplayType,
  JournalId,
  PlannedPaymentId,
  WorkplaceId,
} from '@/src/types/domain';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { logger } from '@/src/utils/logger';
import { safeParseJSON } from '@/src/utils/serialization';
import { Model, Q } from '@nozbe/watermelondb';
// Imported here so the flush runs synchronously outside the write block —
// before any observer sees the new transaction rows.

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

export class JournalRepository {
  private get journals() {
    return database.collections.get<Journal>('journals');
  }

  private get transactions() {
    return database.collections.get<Transaction>('transactions');
  }

  private get journalMetadata() {
    return database.collections.get<JournalMetadata>('journal_metadata');
  }

  journalsQuery(...clauses: Q.Clause[]) {
    return this.journals.query(Q.where('deleted_at', Q.eq(null)), ...clauses);
  }

  observeByIdsWithDeleted(workplaceId: WorkplaceId, journalIds: JournalId[]) {
    return journalObserveQueries.observeByIdsWithDeleted(workplaceId, journalIds);
  }

  observeAccountTransactions(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    limit: number,
    dateRange?: { startDate: number; endDate: number },
  ) {
    return journalObserveQueries.observeAccountTransactions(
      workplaceId,
      accountId,
      limit,
      dateRange,
    );
  }

  observeById(workplaceId: WorkplaceId, journalId: string, includeDeleted: boolean = false) {
    return journalObserveQueries.observeById(workplaceId, journalId, includeDeleted);
  }

  observeByIds(workplaceId: WorkplaceId, journalIds: JournalId[]) {
    return journalObserveQueries.observeByIds(workplaceId, journalIds);
  }

  observeStatusMeta(workplaceId: WorkplaceId) {
    return journalObserveQueries.observeStatusMeta(workplaceId);
  }

  observePlannedInRange(workplaceId: WorkplaceId, startDate: number, endDate: number) {
    return journalObserveQueries.observePlannedInRange(workplaceId, startDate, endDate);
  }

  findEarliestPlannedByPayment(workplaceId: WorkplaceId, plannedPaymentId: PlannedPaymentId) {
    return journalPlannedQueries.findEarliestPlannedByPayment(workplaceId, plannedPaymentId);
  }

  findPlannedOnDay(
    workplaceId: WorkplaceId,
    plannedPaymentId: PlannedPaymentId,
    dayStart: number,
    dayEnd: number,
  ) {
    return journalPlannedQueries.findPlannedOnDay(workplaceId, plannedPaymentId, dayStart, dayEnd);
  }

  findByPlannedPaymentIds(workplaceId: WorkplaceId, plannedPaymentIds: PlannedPaymentId[]) {
    return journalPlannedQueries.findByPlannedPaymentIds(workplaceId, plannedPaymentIds);
  }

  countOnDayByPlannedPayment(
    workplaceId: WorkplaceId,
    plannedPaymentId: PlannedPaymentId,
    dayStart: number,
    dayEnd: number,
  ) {
    return journalPlannedQueries.countOnDay(workplaceId, plannedPaymentId, dayStart, dayEnd);
  }

  findByPlannedPaymentAndStatus(
    workplaceId: WorkplaceId,
    plannedPaymentId: PlannedPaymentId,
    status: JournalStatus,
  ) {
    return journalPlannedQueries.findByPlannedPaymentAndStatus(
      workplaceId,
      plannedPaymentId,
      status,
    );
  }

  preparePlannedStatusUpdates(journals: Journal[], status: JournalStatus) {
    return journalPlannedQueries.prepareStatusUpdates(journals, status);
  }

  batchUpdatePlannedStatus(journals: Journal[], status: JournalStatus) {
    return journalPlannedQueries.batchUpdateStatus(journals, status);
  }

  /**
   * PURE PERSISTENCE METHODS
   */

  async find(workplaceId: WorkplaceId, id: JournalId): Promise<Journal | null> {
    return journalQueryRepository.find(workplaceId, id);
  }

  async findWithDeleted(workplaceId: WorkplaceId, id: JournalId): Promise<Journal | null> {
    return journalQueryRepository.findWithDeleted(workplaceId, id);
  }

  async findByIds(workplaceId: WorkplaceId, ids: JournalId[]): Promise<Journal[]> {
    return journalQueryRepository.findByIds(workplaceId, ids);
  }

  async findAll(workplaceId: WorkplaceId): Promise<Journal[]> {
    const start = Date.now();
    const results = await this.journals
      .query(
        Q.where('deleted_at', Q.eq(null)),
        Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
        Q.where('workplace_id', workplaceId),
      )
      .extend(Q.sortBy('journal_date', 'desc'))
      .fetch();

    logger.info(`[Trace] JournalRepository.findAll: ${Date.now() - start}ms`, {
      count: results.length,
    });
    return results;
  }

  async findAllPlanned(workplaceId: WorkplaceId): Promise<Journal[]> {
    return this.journalsQuery(
      Q.where('status', JournalStatus.PLANNED),
      Q.where('deleted_at', Q.eq(null)),
      Q.where('workplace_id', workplaceId),
    ).fetch();
  }

  async findAllNonDeleted(workplaceId: WorkplaceId): Promise<Journal[]> {
    return this.journals
      .query(
        Q.where('deleted_at', Q.eq(null)),
        Q.sortBy('journal_date', 'desc'),
        Q.where('workplace_id', workplaceId),
      )
      .fetch();
  }

  async findMetadataByJournalId(
    journalId: string,
    workplaceId: WorkplaceId,
  ): Promise<JournalMetadata | null> {
    const records = await this.journalMetadata
      .query(Q.where('journal_id', journalId), Q.where('workplace_id', workplaceId))
      .fetch();

    return records[0] || null;
  }

  /**
   * Updates or creates metadata for a journal, merging existing metadata JSON.
   * Assumes it's being called inside a database.write() block.
   */
  async patchMetadata(
    workplaceId: WorkplaceId,
    journalId: JournalId,
    partialMetadata: Record<string, unknown>,
    source?: string,
  ): Promise<void> {
    const existingMeta = await this.findMetadataByJournalId(journalId, workplaceId);
    if (existingMeta) {
      await existingMeta.update((record: JournalMetadata) => {
        const currentJson = safeParseJSON<Record<string, unknown>>(record.metadataJson, {});
        record.metadataJson = JSON.stringify({ ...currentJson, ...partialMetadata });
        if (source) record.importSource = source;
        record.updatedAt = new Date();
      });
    } else {
      await this.journalMetadata.create((record: JournalMetadata) => {
        record.journalId = journalId;
        record.workplaceId = workplaceId;
        record.importSource = source || 'manual';
        record.metadataJson = JSON.stringify(partialMetadata);
        record.createdAt = new Date();
        record.updatedAt = new Date();
      });
    }
  }

  /**
   * Prepare-only version of patchMetadata.
   *
   * Returns a prepareUpdate / prepareCreate model op that can be included in
   * a parent database.batch() call WITHOUT opening its own write transaction.
   * Use this whenever calling from inside an existing database.write() block
   * to avoid the nested-write violation.
   */
  async prepareMetadataPatch(
    workplaceId: WorkplaceId,
    journalId: JournalId,
    partialMetadata: Record<string, unknown>,
    source?: string,
  ): Promise<Model> {
    const existingMeta = await this.findMetadataByJournalId(journalId, workplaceId);
    if (existingMeta) {
      return existingMeta.prepareUpdate((record: JournalMetadata) => {
        const currentJson = safeParseJSON<Record<string, unknown>>(record.metadataJson, {});
        record.metadataJson = JSON.stringify({ ...currentJson, ...partialMetadata });
        if (source) record.importSource = source;
        record.updatedAt = new Date();
      });
    }
    return this.journalMetadata.prepareCreate((record: JournalMetadata) => {
      record.journalId = journalId;
      record.workplaceId = workplaceId;
      record.importSource = source || 'manual';
      record.metadataJson = JSON.stringify(partialMetadata);
      record.createdAt = new Date();
      record.updatedAt = new Date();
    });
  }

  async findJournalByOriginalSmsId(
    originalSmsId: string,
    workplaceId: WorkplaceId,
  ): Promise<Journal | null> {
    return smsJournalQueries.findJournalByOriginalSmsId(originalSmsId, workplaceId);
  }

  async findJournalsByOriginalSmsIds(
    smsIds: string[],
    workplaceId: WorkplaceId,
  ): Promise<Map<string, Journal>> {
    return smsJournalQueries.findJournalsByOriginalSmsIds(smsIds, workplaceId);
  }

  async findJournalBySmsFingerprint(
    smsFingerprint: string,
    workplaceId: WorkplaceId,
  ): Promise<Journal | null> {
    return smsJournalQueries.findJournalBySmsFingerprint(smsFingerprint, workplaceId);
  }

  async findJournalsBySmsFingerprints(
    fingerprints: string[],
    workplaceId: WorkplaceId,
  ): Promise<Map<string, Journal>> {
    return smsJournalQueries.findJournalsBySmsFingerprints(fingerprints, workplaceId);
  }

  async findNearbyJournals(
    params: {
      centerDate: number;
      windowMs: number;
      amount?: number;
      amounts?: number[];
      excludeJournalId?: string;
      limit?: number;
    },
    workplaceId: WorkplaceId,
  ): Promise<Journal[]> {
    return smsJournalQueries.findNearbyJournals(params, workplaceId);
  }

  async countNonDeleted(workplaceId: WorkplaceId): Promise<number> {
    return this.journals
      .query(Q.where('deleted_at', Q.eq(null)), Q.where('workplace_id', workplaceId))
      .fetchCount();
  }

  /**
   * Prepares creation of a journal and its transactions.
   * Returns an array of prepared models that can be used in a database.batch() call.
   */
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
        `[Trace] JournalRepository.createJournalWithTransactions: ${Date.now() - start}ms`,
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
    extraOpCreator?: () => Model, // Synchronous callback to build extra op atomically
    afterBatch?: () => void, // Runs inside the same write after batch (e.g. rebuild enqueue)
  ): Promise<Journal> {
    const {
      transactions: transactionData,
      totalAmount,
      displayType,
      calculatedBalances,
      metadata,
      ...journalFields
    } = journalData;

    const existingJournal = await this.find(workplaceId, journalId);
    if (!existingJournal) throw new Error('Journal not found');

    const oldTransactions = await this.transactions
      .query(Q.where('journal_id', journalId), Q.where('workplace_id', workplaceId))
      .fetch();
    const existingMeta = metadata
      ? await this.findMetadataByJournalId(journalId, workplaceId)
      : null;

    const start = Date.now();
    // C-1 fix reverted: return database.write directly.
    // Ensure the caller delegates flush triggering to the domain service layer.
    return await database.write(async () => {
      const now = new Date();

      // 1. Prepare updates for soft-delete of old transactions
      const deleteUpdates = oldTransactions.map(tx =>
        tx.prepareUpdate(t => {
          t.deletedAt = now;
          t.updatedAt = now;
        }),
      );

      // 2. Prepare creation of new transactions
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

      // 3. Prepare journal update
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
            m.createdAt = now;
            m.updatedAt = now;
          });
          batchOps.push(metaRecord);
        }
      }

      // Include any extra op synchronously (e.g. audit log callback) in the same atomic batch.
      if (extraOpCreator) batchOps.push(extraOpCreator());

      await database.batch(batchOps);
      afterBatch?.();

      logger.info(
        `[Trace] JournalRepository.updateJournalWithTransactions: ${Date.now() - start}ms`,
        {
          newTxCount: transactionData.length,
          oldTxCount: oldTransactions.length,
        },
      );

      return existingJournal;
    });
  }

  /**
   * M-3 fix: Patches only the journal status field.
   * Cheaper than updateJournalWithTransactions — no transaction soft-delete/re-create,
   * no balance churn. Use this whenever only the status needs to change.
   */
  async updateJournalStatus(
    journalId: JournalId,
    status: JournalStatus,
    workplaceId: WorkplaceId,
  ): Promise<Journal> {
    const journal = await this.find(workplaceId, journalId);
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
    const journal = await this.find(workplaceId, journalId);
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

  /**
   * Fetches a journal and its transactions for soft-deletion/recovery.
   * Does NOT call prepareUpdate synchronously, avoiding the yield/diagnostic error.
   */
  async fetchJournalForDeletion(
    journalId: JournalId,
    workplaceId: WorkplaceId,
  ): Promise<{ journal: Journal; transactions: Transaction[] } | null> {
    const journal = await this.findWithDeleted(workplaceId, journalId);
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
    const journal = await this.find(workplaceId, originalJournalId);
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

  /**
   * Atomically replace a journal by creating a reversal + replacement in a single write.
   */
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

      // 1) Prepare reversal journal
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
          t.runningBalance = null; // F-13 Fix: Let rebuild queue handle balance
          t.workplaceId = workplaceId;
          t.createdAt = now;
          t.updatedAt = now;
        });
      });

      // 2) Prepare original journal update
      const originalJournalUpdate = originalJournal.prepareUpdate(record => {
        record.reversingJournalId = reversalJournal.id;
        record.status = JournalStatus.REVERSED;
        record.updatedAt = now;
      });

      // 3) Prepare replacement journal
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

      logger.info(`[Trace] JournalRepository.replaceJournalWithReversal: ${Date.now() - start}ms`, {
        newTxCount: replacementTransactions.length,
        oldTxCount: originalTransactions.length,
      });

      return { reversalJournal, replacementJournal };
    });
  }

  async getRecentUniqueDescriptions(
    workplaceId: WorkplaceId,
    limit: number = 500,
  ): Promise<{ description: string; count: number }[]> {
    return journalEnrichmentQueries.getRecentUniqueDescriptions(workplaceId, limit);
  }

  /**
   * Fetches transactions and account info for a batch of journals in a single raw query.
   * Optimized for observeEnrichedJournals.
   */
  async getEnrichmentDataRaw(journalIds: string[]): Promise<
    {
      journal_id: JournalId;
      account_id: AccountId;
      amount: number;
      transaction_type: TransactionType;
      account_name: string;
      account_type: AccountType;
      account_icon?: string;
    }[]
  > {
    return journalEnrichmentQueries.getEnrichmentDataRaw(journalIds);
  }
}

export { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';

export const journalRepository = new JournalRepository();
