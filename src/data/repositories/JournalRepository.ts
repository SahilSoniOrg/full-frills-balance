import { database } from '@/src/data/database/Database';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { AccountType } from '@/src/data/models/Account';
import Journal, { JournalStatus } from '@/src/data/models/Journal';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import Transaction, { TransactionType } from '@/src/data/models/Transaction';
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
import { map, of } from 'rxjs';
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
    if (journalIds.length === 0) {
      return of([] as Journal[]);
    }

    return this.journals
      .query(Q.where('id', Q.oneOf(journalIds)), Q.where('workplace_id', workplaceId))
      .observeWithColumns([
        'journal_date',
        'description',
        'notes',
        'currency_code',
        'status',
        'total_amount',
        'transaction_count',
        'display_type',
        'updated_at',
        'deleted_at',
      ]);
  }

  /**
   * Reactive Observation Methods
   */

  observeAccountTransactions(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    limit: number,
    dateRange?: { startDate: number; endDate: number },
  ) {
    const clauses: Q.Clause[] = [
      Q.experimentalJoinTables(['journals']),
      Q.where('account_id', accountId),
      Q.where('workplace_id', workplaceId),
      Q.where('deleted_at', Q.eq(null)),
      Q.on('journals', [
        Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
        Q.where('deleted_at', Q.eq(null)),
      ]),
      Q.sortBy('transaction_date', 'desc'),
      Q.take(limit),
    ];

    if (dateRange) {
      clauses.push(Q.where('transaction_date', Q.gte(dateRange.startDate)));
      clauses.push(Q.where('transaction_date', Q.lte(dateRange.endDate)));
    }

    return this.transactions
      .query(...clauses)
      .observeWithColumns([
        'amount',
        'currency_code',
        'transaction_type',
        'transaction_date',
        'notes',
        'running_balance',
        'exchange_rate',
        'account_id',
        'journal_id',
        'deleted_at',
      ]);
  }

  observeById(workplaceId: WorkplaceId, journalId: string, includeDeleted: boolean = false) {
    const clauses = [Q.where('id', journalId), Q.where('workplace_id', workplaceId)];
    if (!includeDeleted) {
      clauses.push(Q.where('deleted_at', Q.eq(null)));
    }

    return this.journals
      .query(...clauses)
      .observeWithColumns([
        'journal_date',
        'description',
        'notes',
        'currency_code',
        'status',
        'total_amount',
        'transaction_count',
        'display_type',
        'updated_at',
        'deleted_at',
      ])
      .pipe(map(journals => journals[0] || null));
  }

  observeByIds(workplaceId: WorkplaceId, journalIds: JournalId[]) {
    if (journalIds.length === 0) return of([] as Journal[]);
    return this.journals
      .query(
        Q.where('id', Q.oneOf(journalIds)),
        Q.where('workplace_id', workplaceId),
        Q.where('deleted_at', Q.eq(null)),
      )
      .observeWithColumns([
        'journal_date',
        'description',
        'notes',
        'currency_code',
        'status',
        'total_amount',
        'transaction_count',
        'display_type',
        'updated_at',
        'deleted_at',
      ]);
  }

  observeStatusMeta(workplaceId: WorkplaceId) {
    return this.journals
      .query(Q.where('deleted_at', Q.eq(null)), Q.where('workplace_id', workplaceId))
      .observeWithColumns(['status', 'deleted_at', 'journal_date', 'updated_at', 'total_amount']);
  }

  observePlannedInRange(workplaceId: WorkplaceId, startDate: number, endDate: number) {
    return this.journals
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('status', JournalStatus.PLANNED),
        Q.where('journal_date', Q.gte(startDate)),
        Q.where('journal_date', Q.lte(endDate)),
        Q.where('deleted_at', Q.eq(null)),
      )
      .observe();
  }

  /**
   * PURE PERSISTENCE METHODS
   */

  async find(workplaceId: WorkplaceId, id: JournalId): Promise<Journal | null> {
    try {
      const journal = await this.journals.find(id);
      if (journal.deletedAt) return null;
      if (journal.workplaceId !== workplaceId) return null;
      return journal;
    } catch {
      return null;
    }
  }

  async findWithDeleted(workplaceId: WorkplaceId, id: JournalId): Promise<Journal | null> {
    try {
      const journal = await this.journals.find(id);
      if (journal.workplaceId !== workplaceId) return null;
      return journal;
    } catch {
      return null;
    }
  }

  async findByIds(workplaceId: WorkplaceId, ids: JournalId[]): Promise<Journal[]> {
    if (ids.length === 0) return [];
    return this.journals
      .query(
        Q.where('id', Q.oneOf(ids)),
        Q.where('deleted_at', Q.eq(null)),
        Q.where('workplace_id', workplaceId),
      )
      .fetch();
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
    const sql = `
      SELECT description, COUNT(*) as usage_count
      FROM journals
      WHERE workplace_id = ?
        AND deleted_at IS NULL
        AND description IS NOT NULL
        AND description != ''
      GROUP BY description
      ORDER BY MAX(journal_date) DESC
      LIMIT ?
    `;

    try {
      const results = await transactionRawRepository.queryRaw<{
        description: string;
        usage_count: number;
      }>(sql, [workplaceId, limit]);

      if (!results) {
        // Fallback to ORM if raw SQL fails
        const journals = await this.journals
          .query(
            Q.where('workplace_id', workplaceId),
            Q.where('deleted_at', Q.eq(null)),
            Q.where('description', Q.notEq(null)),
            Q.where('description', Q.notEq('')),
            Q.sortBy('journal_date', 'desc'),
            Q.take(limit * 2),
          )
          .fetch();

        const counts = new Map<string, number>();
        for (const j of journals) {
          if (j.description) {
            counts.set(j.description, (counts.get(j.description) || 0) + 1);
          }
        }
        return Array.from(counts.entries())
          .map(([description, count]) => ({ description, count }))
          .slice(0, limit);
      }

      return results.map(r => ({
        description: r.description,
        count: r.usage_count,
      }));
    } catch (error) {
      logger.error('[JournalRepository] getRecentUniqueDescriptions failed', error);
      return [];
    }
  }

  /**
   * Fetches transactions and account info for a batch of journals in a single raw query.
   * Optimized for JournalService.observeEnrichedJournals.
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
    if (journalIds.length === 0) return [];

    const placeholders = journalIds.map(() => '?').join(',');
    const sql = `
      SELECT 
        t.journal_id as journal_id, 
        t.account_id as account_id, 
        t.amount as amount, 
        t.transaction_type as transaction_type, 
        a.name as account_name, 
        a.account_type as account_type, 
        a.icon as account_icon
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      WHERE t.journal_id IN (${placeholders}) AND t.deleted_at IS NULL
    `;

    const results = await transactionRawRepository.queryRaw<any>(sql, journalIds);
    if (results !== null) {
      return results;
    }

    // Fallback for LokiJS/Test environment where queryRaw is not supported
    const journals = await this.journals.query(Q.where('id', Q.oneOf(journalIds))).fetch();
    const enriched: any[] = [];

    for (const journal of journals) {
      const txs = await this.transactions
        .query(Q.where('journal_id', journal.id), Q.where('deleted_at', Q.eq(null)))
        .fetch();

      for (const tx of txs) {
        try {
          const account: any = await database.collections.get('accounts').find(tx.accountId);
          if (account) {
            enriched.push({
              journal_id: journal.id,
              account_id: tx.accountId,
              amount: tx.amount,
              transaction_type: tx.transactionType,
              account_name: account.name,
              account_type: account.accountType,
              account_icon: account.icon,
            });
          }
        } catch (e) {
          // Account might be deleted/missing in tests
        }
      }
    }

    return enriched;
  }
}

export const journalRepository = new JournalRepository();
