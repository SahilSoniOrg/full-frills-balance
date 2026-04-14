import { database } from '@/src/data/database/Database';
import Journal, { JournalStatus } from '@/src/data/models/Journal';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import Transaction, { TransactionType } from '@/src/data/models/Transaction';
import { JournalDisplayType } from '@/src/types/domain';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { logger } from '@/src/utils/logger';
import { Q } from '@nozbe/watermelondb';
import dayjs from 'dayjs';
import { map, of } from 'rxjs';
// Imported here so the flush runs synchronously outside the write block —
// before any observer sees the new transaction rows.

export interface CreateJournalData {
  journalDate: number;
  description?: string;
  currencyCode: string;
  originalJournalId?: string;
  status?: JournalStatus;
  plannedPaymentId?: string;
  transactions: {
    accountId: string;
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

  journalsQueryWithDeleted(...clauses: Q.Clause[]) {
    return this.journals.query(...clauses);
  }

  observeByIdsWithDeleted(journalIds: string[]) {
    if (journalIds.length === 0) {
      return of([] as Journal[]);
    }

    return this.journals
      .query(Q.where('id', Q.oneOf(journalIds)))
      .observeWithColumns([
        'journal_date',
        'description',
        'currency_code',
        'status',
        'total_amount',
        'transaction_count',
        'display_type',
        'updated_at',
        'deleted_at',
      ]);
  }

  transactionsQuery(...clauses: any[]) {
    return this.transactions.query(...clauses);
  }

  /**
   * Reactive Observation Methods
   */

  observeAccountTransactions(
    accountId: string,
    limit: number,
    dateRange?: { startDate: number; endDate: number },
  ) {
    const clauses: any[] = [
      Q.experimentalJoinTables(['journals']),
      Q.where('account_id', accountId),
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

  observeById(journalId: string, includeDeleted: boolean = false) {
    const clauses = [Q.where('id', journalId)];
    if (!includeDeleted) {
      clauses.push(Q.where('deleted_at', Q.eq(null)));
    }

    return this.journals
      .query(...clauses)
      .observeWithColumns([
        'journal_date',
        'description',
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

  observeByIds(journalIds: string[]) {
    if (journalIds.length === 0) return of([] as Journal[]);
    return this.journals
      .query(Q.where('id', Q.oneOf(journalIds)), Q.where('deleted_at', Q.eq(null)))
      .observeWithColumns([
        'journal_date',
        'description',
        'currency_code',
        'status',
        'total_amount',
        'transaction_count',
        'display_type',
        'deleted_at',
      ]);
  }

  observeStatusMeta() {
    return this.journals
      .query(Q.where('deleted_at', Q.eq(null)))
      .observeWithColumns(['status', 'deleted_at', 'journal_date', 'updated_at', 'total_amount']);
  }

  observePlannedForMonth(targetMonth: string) {
    const startOfMonth = dayjs(`${targetMonth}-01`).startOf('month').valueOf();
    const endOfMonth = dayjs(`${targetMonth}-01`).endOf('month').valueOf();

    return this.journals
      .query(
        Q.where('status', JournalStatus.PLANNED),
        Q.where('journal_date', Q.gte(startOfMonth)),
        Q.where('journal_date', Q.lte(endOfMonth)),
        Q.where('deleted_at', Q.eq(null)),
      )
      .observe();
  }

  observePlannedInRange(startDate: number, endDate: number) {
    return this.journals
      .query(
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

  async find(id: string): Promise<Journal | null> {
    try {
      return await this.journals.find(id);
    } catch {
      return null;
    }
  }

  async findByIds(ids: string[]): Promise<Journal[]> {
    if (ids.length === 0) return [];
    return this.journals.query(Q.where('id', Q.oneOf(ids))).fetch();
  }

  async findAll(): Promise<Journal[]> {
    const start = Date.now();
    const results = await this.journals
      .query(
        Q.where('deleted_at', Q.eq(null)),
        Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
      )
      .extend(Q.sortBy('journal_date', 'desc'))
      .fetch();

    logger.info(`[Trace] JournalRepository.findAll: ${Date.now() - start}ms`, {
      count: results.length,
    });
    return results;
  }

  async findAllPlanned(): Promise<Journal[]> {
    return this.journalsQuery(
      Q.where('status', JournalStatus.PLANNED),
      Q.where('deleted_at', Q.eq(null)),
    ).fetch();
  }

  async findAllNonDeleted(): Promise<Journal[]> {
    return this.journals
      .query(Q.where('deleted_at', Q.eq(null)), Q.sortBy('journal_date', 'desc'))
      .fetch();
  }

  async findMetadataByJournalId(journalId: string): Promise<JournalMetadata | null> {
    const records = await this.journalMetadata.query(Q.where('journal_id', journalId)).fetch();

    return records[0] || null;
  }

  /**
   * Updates or creates metadata for a journal, merging existing metadata JSON.
   * Assumes it's being called inside a database.write() block.
   */
  async patchMetadata(
    journalId: string,
    partialMetadata: Record<string, any>,
    source?: string,
  ): Promise<void> {
    const existingMeta = await this.findMetadataByJournalId(journalId);
    if (existingMeta) {
      await existingMeta.update((record: any) => {
        const currentJson = record.metadataJson ? JSON.parse(record.metadataJson) : {};
        record.metadataJson = JSON.stringify({ ...currentJson, ...partialMetadata });
        if (source) record.importSource = source;
        record.updatedAt = new Date();
      });
    } else {
      await this.journalMetadata.create((record: any) => {
        record.journalId = journalId;
        record.importSource = source || 'manual';
        record.metadataJson = JSON.stringify(partialMetadata);
        record.createdAt = new Date();
        record.updatedAt = new Date();
      });
    }
  }

  async findJournalByOriginalSmsId(originalSmsId: string): Promise<Journal | null> {
    const metadata = await this.journalMetadata
      .query(Q.where('original_sms_id', originalSmsId))
      .fetch();

    if (metadata.length === 0) return null;
    return this.find(metadata[0].journal.id);
  }

  async findJournalBySmsFingerprint(smsFingerprint: string): Promise<Journal | null> {
    const metadataRecords = await this.journalMetadata
      .query(Q.where('import_source', 'sms'))
      .fetch();

    for (const metadata of metadataRecords) {
      try {
        const parsed = metadata.metadataJson ? JSON.parse(metadata.metadataJson) : {};
        if (parsed?.smsFingerprint === smsFingerprint) {
          return this.find(metadata.journal.id);
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  async findNearbyJournals(params: {
    centerDate: number;
    windowMs: number;
    amount?: number;
    excludeJournalId?: string;
    limit?: number;
  }): Promise<Journal[]> {
    const { centerDate, windowMs, amount, excludeJournalId, limit = 10 } = params;
    const clauses: any[] = [
      Q.where('deleted_at', Q.eq(null)),
      Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
      Q.where('journal_date', Q.gte(centerDate - windowMs)),
      Q.where('journal_date', Q.lte(centerDate + windowMs)),
      Q.sortBy('journal_date', 'desc'),
      Q.take(limit),
    ];

    if (typeof amount === 'number') {
      clauses.unshift(Q.where('total_amount', amount));
    }

    if (excludeJournalId) {
      clauses.unshift(Q.where('id', Q.notEq(excludeJournalId)));
    }

    return this.journals.query(...clauses).fetch();
  }

  async countNonDeleted(): Promise<number> {
    return this.journals.query(Q.where('deleted_at', Q.eq(null))).fetchCount();
  }

  async createJournalWithTransactions(
    journalData: CreateJournalData & {
      totalAmount?: number;
      displayType?: JournalDisplayType;
      calculatedBalances?: Map<string, number | null>;
    },
  ): Promise<Journal> {
    const {
      transactions: transactionData,
      totalAmount,
      displayType,
      calculatedBalances,
      metadata,
      ...journalFields
    } = journalData;

    const start = Date.now();
    return await database.write(async () => {
      const journal = this.journals.prepareCreate(j => {
        Object.assign(j, journalFields);
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
          tx.createdAt = new Date();
          tx.updatedAt = new Date();
        });
      });

      const batchOps: any[] = [journal, ...transactions];

      if (metadata) {
        const metaRecord = this.journalMetadata.prepareCreate((m: any) => {
          m.journalId = journal.id;
          m.importSource = metadata.importSource;
          m.originalSmsId = metadata.originalSmsId;
          m.originalSmsSender = metadata.originalSmsSender;
          m.originalSmsBody = metadata.originalSmsBody;
          m.metadataJson = metadata.metadataJson;
        });
        batchOps.push(metaRecord);
      }

      await database.batch(...batchOps);

      logger.info(
        `[Trace] JournalRepository.createJournalWithTransactions: ${Date.now() - start}ms`,
        {
          txCount: transactionData.length,
        },
      );

      return journal;
    });
  }

  async updateJournalWithTransactions(
    journalId: string,
    journalData: CreateJournalData & {
      totalAmount?: number;
      displayType?: JournalDisplayType;
      calculatedBalances?: Map<string, number | null>;
    },
  ): Promise<Journal> {
    const {
      transactions: transactionData,
      totalAmount,
      displayType,
      calculatedBalances,
      metadata,
      ...journalFields
    } = journalData;

    const existingJournal = await this.find(journalId);
    if (!existingJournal) throw new Error('Journal not found');

    const oldTransactions = await this.transactions.query(Q.where('journal_id', journalId)).fetch();

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
        j.currencyCode = journalFields.currencyCode;
        j.status = journalFields.status ?? j.status;
        j.plannedPaymentId = journalFields.plannedPaymentId ?? j.plannedPaymentId;
        j.totalAmount = totalAmount ?? j.totalAmount;
        j.transactionCount = transactionData.length;
        j.displayType = displayType ?? j.displayType;
        j.updatedAt = new Date();
      });

      const batchOps: any[] = [journalUpdate, ...deleteUpdates, ...createUpdates];

      if (metadata) {
        const existingMeta = await this.findMetadataByJournalId(journalId);
        if (existingMeta) {
          const metaUpdate = existingMeta.prepareUpdate((m: any) => {
            m.importSource = metadata.importSource;
            m.originalSmsId = metadata.originalSmsId;
            m.originalSmsSender = metadata.originalSmsSender;
            m.originalSmsBody = metadata.originalSmsBody;
            m.metadataJson = metadata.metadataJson;
            m.updatedAt = now;
          });
          batchOps.push(metaUpdate);
        } else {
          const metaRecord = this.journalMetadata.prepareCreate((m: any) => {
            m.journalId = journalId;
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

      await database.batch(...batchOps);

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
  async updateJournalStatus(journalId: string, status: JournalStatus): Promise<Journal> {
    const journal = await this.find(journalId);
    if (!journal) throw new Error(`Journal ${journalId} not found`);

    await database.write(async () => {
      await journal.update(record => {
        record.status = status;
        record.updatedAt = new Date();
      });
    });

    return journal;
  }

  async deleteJournal(journalId: string): Promise<void> {
    const journal = await this.find(journalId);
    if (!journal) return;

    const associatedTransactions = await this.transactions
      .query(Q.where('journal_id', journalId))
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

      await database.batch(journalUpdate, ...transactionUpdates);
    });
  }

  async recoverJournal(journalId: string): Promise<Journal> {
    const journal = await this.find(journalId);
    if (!journal) throw new Error('Journal not found');

    const associatedTransactions = await this.transactions
      .query(Q.where('journal_id', journalId))
      .fetch();

    await database.write(async () => {
      const journalUpdate = journal.prepareUpdate(j => {
        j.deletedAt = undefined;
        j.updatedAt = new Date();
      });

      const transactionUpdates = associatedTransactions.map(tx =>
        tx.prepareUpdate(t => {
          t.deletedAt = undefined;
          t.updatedAt = new Date();
        }),
      );

      await database.batch(journalUpdate, ...transactionUpdates);
    });

    return journal;
  }

  async markReversed(originalJournalId: string, reversingJournalId: string): Promise<void> {
    const journal = await this.find(originalJournalId);
    if (!journal) return;

    await database.write(async () => {
      const update = journal.prepareUpdate(record => {
        record.reversingJournalId = reversingJournalId;
        record.status = JournalStatus.REVERSED;
        record.updatedAt = new Date();
      });
      await database.batch(update);
    });
  }

  /**
   * Atomically replace a journal by creating a reversal + replacement in a single write.
   */
  async replaceJournalWithReversal(params: {
    originalJournal: Journal;
    originalTransactions: Transaction[];
    replacementData: CreateJournalData & {
      totalAmount?: number;
      displayType?: JournalDisplayType;
      calculatedBalances?: Map<string, number | null>;
    };
  }): Promise<{ reversalJournal: Journal; replacementJournal: Journal }> {
    const { originalJournal, originalTransactions, replacementData } = params;
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
          tx.createdAt = now;
          tx.updatedAt = new Date();
        });
      });

      await database.batch(
        reversalJournal,
        ...reversalTransactions,
        originalJournalUpdate,
        replacementJournal,
        ...newTransactions,
      );

      logger.info(`[Trace] JournalRepository.replaceJournalWithReversal: ${Date.now() - start}ms`, {
        newTxCount: replacementTransactions.length,
        oldTxCount: originalTransactions.length,
      });

      return { reversalJournal, replacementJournal };
    });
  }
}

export const journalRepository = new JournalRepository();
