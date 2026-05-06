import { database } from '@/src/data/database/Database';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import Journal, { JournalStatus } from '@/src/data/models/Journal';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import SmsInboxRecord from '@/src/data/models/SmsInboxRecord';
import Transaction, { TransactionType } from '@/src/data/models/Transaction';
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
    originalSmsId: string, // SMS ID is still string
    workplaceId: WorkplaceId,
  ): Promise<Journal | null> {
    const metadata = await this.journalMetadata
      .query(Q.where('original_sms_id', originalSmsId), Q.where('workplace_id', workplaceId))
      .fetch();

    if (metadata.length === 0) return null;
    return this.find(workplaceId, metadata[0].journalId);
  }

  async findJournalsByOriginalSmsIds(
    smsIds: string[], // SMS IDs are still string
    workplaceId: WorkplaceId,
  ): Promise<Map<string, Journal>> {
    if (smsIds.length === 0) return new Map();
    const metadataRecords = await this.journalMetadata
      .query(Q.where('original_sms_id', Q.oneOf(smsIds)), Q.where('workplace_id', workplaceId))
      .fetch();

    if (metadataRecords.length === 0) return new Map();

    const journalIds = metadataRecords.map(m => m.journalId);
    const journals = await this.findByIds(workplaceId, journalIds);
    const journalMap = new Map(journals.map(j => [j.id, j]));

    const resultMap = new Map<string, Journal>();
    for (const metadata of metadataRecords) {
      const journal = journalMap.get(metadata.journalId);
      if (journal && metadata.originalSmsId) {
        resultMap.set(metadata.originalSmsId, journal);
      }
    }
    return resultMap;
  }

  async findJournalBySmsFingerprint(
    smsFingerprint: string,
    workplaceId: WorkplaceId,
  ): Promise<Journal | null> {
    // Optimized: Query indexed inbox records instead of scanning metadata JSON
    const inboxRecords = await database.collections
      .get<SmsInboxRecord>('sms_inbox_records')
      .query(Q.where('sms_fingerprint', smsFingerprint), Q.where('workplace_id', workplaceId))
      .fetch();

    const record = inboxRecords.find(r => r.linkedJournalId);
    if (!record || !record.linkedJournalId) return null;

    return this.find(workplaceId, record.linkedJournalId);
  }

  async findJournalsBySmsFingerprints(
    fingerprints: string[],
    workplaceId: WorkplaceId,
  ): Promise<Map<string, Journal>> {
    if (fingerprints.length === 0) return new Map();

    // Optimized: Use indexed sms_inbox_records to find linked journals in O(Log N)
    const inboxRecords = await database.collections
      .get<SmsInboxRecord>('sms_inbox_records')
      .query(
        Q.where('sms_fingerprint', Q.oneOf(fingerprints)),
        Q.where('workplace_id', workplaceId),
      )
      .fetch();

    const fingerprintToJournalId = new Map<string, JournalId>();
    const journalIds: JournalId[] = [];

    for (const record of inboxRecords) {
      const linkedJournalId = record.linkedJournalId;
      const smsFingerprint = record.smsFingerprint;
      if (linkedJournalId && smsFingerprint) {
        journalIds.push(linkedJournalId);
        fingerprintToJournalId.set(smsFingerprint, linkedJournalId);
      }
    }

    if (journalIds.length === 0) return new Map();

    const journals = await this.findByIds(workplaceId, journalIds);
    const journalMap = new Map(journals.map(j => [j.id, j]));
    const resultMap = new Map<string, Journal>();

    for (const [fingerprint, journalId] of fingerprintToJournalId) {
      const journal = journalMap.get(journalId);
      if (journal) {
        resultMap.set(fingerprint, journal);
      }
    }

    return resultMap;
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
    const { centerDate, windowMs, amount, amounts, excludeJournalId, limit = 10 } = params;
    const clauses: Q.Clause[] = [
      Q.where('deleted_at', Q.eq(null)),
      Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
      Q.where('journal_date', Q.gte(centerDate - windowMs)),
      Q.where('journal_date', Q.lte(centerDate + windowMs)),
      Q.where('workplace_id', workplaceId),
      Q.sortBy('journal_date', 'desc'),
      Q.take(limit),
    ];

    if (typeof amount === 'number') {
      clauses.unshift(Q.where('total_amount', amount));
    } else if (amounts && amounts.length > 0) {
      clauses.unshift(Q.where('total_amount', Q.oneOf(amounts)));
    }

    if (excludeJournalId) {
      clauses.unshift(Q.where('id', Q.notEq(excludeJournalId)));
    }

    return this.journals.query(...clauses).fetch();
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
        j.updatedAt = new Date();
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
    const journal = await this.find(workplaceId, journalId);
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
}

export const journalRepository = new JournalRepository();
