import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import Journal from '@/src/data/models/Journal';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import Transaction from '@/src/data/models/Transaction';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { readCaptureMetadata } from '@/src/domain/transaction-intelligence/captureMetadata';
import {
  mergeHistoricalSmsSources,
  repairHistoricalSmsMerchant,
  readHistoricalSmsEvidence,
  withHistoricalSmsEvidence,
  withoutHistoricalSmsEvidence,
  type HistoricalSmsMerchantRepair,
  type HistoricalSmsSourceEvidence,
} from '@/src/domain/transaction-intelligence/historicalSmsEvidence';
import { AccountType, JournalStatus } from '@/src/types/enums';
import type { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';
import { fetchSequentiallyInChunks } from '@/src/data/repositories/fetchSequentiallyInChunks';
import { safeParseJSON } from '@/src/utils/serialization';
import { createCaptureAccountIndex } from '@/src/domain/transaction-intelligence/captureAccountEligibility';

export interface HistoricalCategoryPattern {
  key: string;
  merchant: string;
  journalIds: JournalId[];
  financialAccountId: AccountId;
  financialAccountName: string;
  kind: 'expense' | 'income';
  currencyCode: string;
  latestJournalDate: number;
  journalCount: number;
  sourceCount: number;
  categories: {
    accountId: AccountId;
    name: string;
    journalCount: number;
  }[];
}

const MIN_HISTORICAL_PATTERN_JOURNALS = 2;

function displayMerchant(value?: string | null): string | undefined {
  const merchant = value?.trim();
  return merchant ? merchant.slice(0, 200) : undefined;
}

function sourceEvidenceFromInbox(record: TransactionInboxRecord): HistoricalSmsSourceEvidence {
  return {
    sourceId: record.deviceSourceId,
    occurredAt: record.inputDate,
    ...(record.parsedMerchant ? { merchant: record.parsedMerchant } : {}),
    ...(typeof record.parsedAmount === 'number' ? { amount: record.parsedAmount } : {}),
    ...(typeof record.parsedCurrencyCode === 'string'
      ? { currencyCode: record.parsedCurrencyCode }
      : {}),
  };
}

function sourceEvidenceFromMetadata(
  row: JournalMetadata,
  occurredAt: number,
): HistoricalSmsSourceEvidence | null {
  if (!row.originalSmsId) return null;
  const parsed = safeParseJSON<Record<string, unknown>>(row.metadataJson, {});
  const merchant = typeof parsed.parsedMerchant === 'string' ? parsed.parsedMerchant : undefined;
  const amount =
    typeof parsed.parsedAmount === 'number' && Number.isFinite(parsed.parsedAmount)
      ? parsed.parsedAmount
      : undefined;
  const currencyCode =
    typeof parsed.parsedCurrencyCode === 'string' ? parsed.parsedCurrencyCode : undefined;
  return {
    sourceId: row.originalSmsId,
    occurredAt,
    ...(merchant ? { merchant } : {}),
    ...(amount !== undefined ? { amount } : {}),
    ...(currencyCode ? { currencyCode } : {}),
  };
}

function isJsonObject(value: string | undefined): boolean {
  if (!value) return true;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

function accountTypeIsFinancial(type?: AccountType): boolean {
  return type === AccountType.ASSET || type === AccountType.LIABILITY;
}

/** Adds source facts to existing SMS-linked journals without labeling old categories confirmed. */
export class JournalHistoricalCaptureQueries {
  private get metadata() {
    return database.collections.get<JournalMetadata>('journal_metadata');
  }

  async backfillSmsEvidence(workplaceId: WorkplaceId): Promise<number> {
    // Ownership discovery and row preparation share the accounting writer with journal edits,
    // inbox relinks, and account merges. A stale link can therefore never complete the backfill.
    return database.write(() => this.backfillSmsEvidenceInSession(workplaceId));
  }

  private async backfillSmsEvidenceInSession(workplaceId: WorkplaceId): Promise<number> {
    const [metadataRows, inboxRows] = await Promise.all([
      this.metadata.query(Q.where('workplace_id', workplaceId)).fetch(),
      database.collections
        .get<TransactionInboxRecord>('transaction_inbox_records')
        .query(Q.where('workplace_id', workplaceId), Q.where('channel', 'sms'))
        .fetch(),
    ]);
    const inboxBySourceId = new Map<string, TransactionInboxRecord[]>();
    for (const row of inboxRows) {
      const records = inboxBySourceId.get(row.deviceSourceId) ?? [];
      records.push(row);
      inboxBySourceId.set(row.deviceSourceId, records);
    }

    const metadataByJournal = new Map<JournalId, JournalMetadata[]>();
    for (const row of metadataRows) {
      const rows = metadataByJournal.get(row.journalId) ?? [];
      rows.push(row);
      metadataByJournal.set(row.journalId, rows);
    }
    const candidateJournalIds = new Set<JournalId>();
    const journalIdsBySource = new Map<string, Set<JournalId>>();
    const linkSource = (sourceId: string, journalId: JournalId) => {
      const owners = journalIdsBySource.get(sourceId) ?? new Set<JournalId>();
      owners.add(journalId);
      journalIdsBySource.set(sourceId, owners);
    };
    for (const row of metadataRows) {
      if (row.originalSmsId) {
        candidateJournalIds.add(row.journalId);
        linkSource(row.originalSmsId, row.journalId);
      }
    }
    for (const row of inboxRows) {
      if (row.linkedJournalId) {
        candidateJournalIds.add(row.linkedJournalId);
        linkSource(row.deviceSourceId, row.linkedJournalId);
      }
    }
    const journalIds = [...candidateJournalIds];
    if (journalIds.length === 0) return 0;

    const journals = await fetchSequentiallyInChunks(journalIds, ids =>
      database.collections
        .get<Journal>('journals')
        .query(
          Q.where('workplace_id', workplaceId),
          Q.where('id', Q.oneOf([...ids])),
          Q.where('deleted_at', Q.eq(null)),
          Q.where('status', JournalStatus.POSTED),
        )
        .fetch(),
    );
    const postedIds = new Set(journals.map(journal => journal.id));
    const sourcesByJournal = new Map<JournalId, HistoricalSmsSourceEvidence[]>();
    const addSource = (journalId: JournalId, source: HistoricalSmsSourceEvidence) => {
      if (!source.sourceId || !Number.isFinite(source.occurredAt)) return;
      const previous = sourcesByJournal.get(journalId) ?? [];
      sourcesByJournal.set(journalId, mergeHistoricalSmsSources(previous, [source]));
    };

    for (const record of inboxRows) {
      const owners = journalIdsBySource.get(record.deviceSourceId);
      if (!owners || owners.size !== 1) continue;
      const [journalId] = owners;
      if (!postedIds.has(journalId)) continue;
      addSource(journalId, sourceEvidenceFromInbox(record));
    }
    const journalDateById = new Map(journals.map(journal => [journal.id, journal.journalDate]));
    for (const row of metadataRows) {
      if (!row.originalSmsId || !postedIds.has(row.journalId)) continue;
      const existingInboxRows = inboxBySourceId.get(row.originalSmsId) ?? [];
      const owners = journalIdsBySource.get(row.originalSmsId);
      if (owners && owners.size > 1) continue;
      if (existingInboxRows.length > 0) continue;
      const fallback = sourceEvidenceFromMetadata(
        row,
        journalDateById.get(row.journalId) ?? Date.now(),
      );
      if (fallback) addSource(row.journalId, fallback);
    }

    const updates: {
      row: JournalMetadata;
      sources?: HistoricalSmsSourceEvidence[];
      clear: boolean;
    }[] = [];
    const creates: { journalId: JournalId; sources: HistoricalSmsSourceEvidence[] }[] = [];
    for (const [journalId, incomingSources] of sourcesByJournal) {
      const rows = metadataByJournal.get(journalId) ?? [];
      if (rows.some(row => readCaptureMetadata(row.metadataJson))) continue;
      const sources = mergeHistoricalSmsSources(
        rows.flatMap(row => readHistoricalSmsEvidence(row.metadataJson)?.sources ?? []),
        incomingSources,
      );
      if (sources.length === 0) continue;
      const existingEvidenceRows = rows.filter(row => readHistoricalSmsEvidence(row.metadataJson));
      const writable =
        existingEvidenceRows.find(row => isJsonObject(row.metadataJson)) ??
        rows.find(row => isJsonObject(row.metadataJson));
      if (writable) {
        const current = readHistoricalSmsEvidence(writable.metadataJson)?.sources ?? [];
        const next = mergeHistoricalSmsSources(current, sources);
        if (JSON.stringify(next) !== JSON.stringify(current)) {
          updates.push({ row: writable, sources, clear: false });
        }
        for (const duplicate of existingEvidenceRows) {
          if (duplicate !== writable) updates.push({ row: duplicate, clear: true });
        }
      } else {
        creates.push({ journalId, sources });
      }
    }
    if (updates.length === 0 && creates.length === 0) return 0;

    const now = new Date();
    const prepareOperations: (() => JournalMetadata)[] = [
      ...updates.map(
        ({ row, sources, clear }): (() => JournalMetadata) =>
          () =>
            row.prepareUpdate(record => {
              record.metadataJson = clear
                ? withoutHistoricalSmsEvidence(record.metadataJson)
                : withHistoricalSmsEvidence(record.metadataJson, sources ?? []);
              record.updatedAt = now;
            }),
      ),
      ...creates.map(
        ({ journalId, sources }): (() => JournalMetadata) =>
          () =>
            this.metadata.prepareCreate(record => {
              record.workplaceId = workplaceId;
              record.journalId = journalId;
              record.importSource = 'sms';
              record.metadataJson = withHistoricalSmsEvidence(undefined, sources);
              record.createdAt = now;
              record.updatedAt = now;
            }),
      ),
    ];
    for (let index = 0; index < prepareOperations.length; index += 100) {
      const operations = prepareOperations.slice(index, index + 100).map(prepare => prepare());
      await database.batch(...operations);
    }
    return updates.length + creates.length;
  }

  async repairSmsEvidenceMerchants(
    workplaceId: WorkplaceId,
    repairs: readonly HistoricalSmsMerchantRepair[],
  ): Promise<number> {
    if (!repairs.length) return 0;

    return database.write(async () => {
      const rows = await this.metadata
        .query(
          Q.where('workplace_id', workplaceId),
          Q.where('metadata_json', Q.like('%\"historicalSmsEvidence\"%')),
        )
        .fetch();
      const now = new Date();
      const prepareUpdates: (() => JournalMetadata)[] = [];
      const repairedSources = new Set<string>();

      for (const row of rows) {
        let nextJson = row.metadataJson;
        for (const repair of repairs) {
          const repairedJson = repairHistoricalSmsMerchant(nextJson, repair);
          if (!repairedJson) continue;
          nextJson = repairedJson;
          repairedSources.add(repair.sourceId);
        }
        if (nextJson === row.metadataJson) continue;
        prepareUpdates.push(() =>
          row.prepareUpdate(entry => {
            entry.metadataJson = nextJson;
            entry.updatedAt = now;
          }),
        );
      }

      for (let index = 0; index < prepareUpdates.length; index += 100) {
        const operations = prepareUpdates.slice(index, index + 100).map(prepare => prepare());
        await database.batch(...operations);
      }
      return repairedSources.size;
    });
  }

  async listCategoryPatterns(workplaceId: WorkplaceId): Promise<HistoricalCategoryPattern[]> {
    const sourcesByJournal = new Map<JournalId, HistoricalSmsSourceEvidence[]>();
    const METADATA_BATCH_SIZE = 200;
    for (let offset = 0; ; offset += METADATA_BATCH_SIZE) {
      const rows = await this.metadata
        .query(
          Q.where('workplace_id', workplaceId),
          Q.where('metadata_json', Q.like('%"historicalSmsEvidence"%')),
          Q.sortBy('id', Q.asc),
          Q.take(METADATA_BATCH_SIZE),
          ...(offset > 0 ? [Q.skip(offset)] : []),
        )
        .fetch();
      for (const row of rows) {
        const sources = readHistoricalSmsEvidence(row.metadataJson)?.sources ?? [];
        if (sources.length === 0) continue;
        sourcesByJournal.set(
          row.journalId,
          mergeHistoricalSmsSources(sourcesByJournal.get(row.journalId) ?? [], sources),
        );
      }
      if (rows.length < METADATA_BATCH_SIZE) break;
    }
    const journalIds = [...sourcesByJournal.keys()];
    if (journalIds.length === 0) return [];
    const accounts = await database.collections
      .get<Account>('accounts')
      .query(Q.where('workplace_id', workplaceId), Q.where('deleted_at', Q.eq(null)))
      .fetch();
    const accountIndex = createCaptureAccountIndex(accounts);
    const accountById = accountIndex.byId;
    const groups = new Map<
      string,
      {
        merchant: string;
        financialAccountId: AccountId;
        financialAccountName: string;
        kind: 'expense' | 'income';
        currencyCode: string;
        latestJournalDate: number;
        journals: Map<JournalId, number>;
        sourceIds: Set<string>;
        categories: Map<AccountId, { name: string; journals: Set<JournalId> }>;
      }
    >();

    // Load transaction lines in bounded windows; the UI's display pagination does not force us
    // to hold every historical journal and every line in memory at once.
    const JOURNAL_BATCH_SIZE = 100;
    for (let offset = 0; offset < journalIds.length; offset += JOURNAL_BATCH_SIZE) {
      const ids = journalIds.slice(offset, offset + JOURNAL_BATCH_SIZE);
      const [journals, transactions] = await Promise.all([
        database.collections
          .get<Journal>('journals')
          .query(
            Q.where('workplace_id', workplaceId),
            Q.where('id', Q.oneOf(ids)),
            Q.where('deleted_at', Q.eq(null)),
            Q.where('status', JournalStatus.POSTED),
          )
          .fetch(),
        database.collections
          .get<Transaction>('transactions')
          .query(
            Q.where('workplace_id', workplaceId),
            Q.where('journal_id', Q.oneOf(ids)),
            Q.where('deleted_at', Q.eq(null)),
          )
          .fetch(),
      ]);
      const transactionsByJournal = new Map<JournalId, Transaction[]>();
      for (const transaction of transactions) {
        const rows = transactionsByJournal.get(transaction.journalId) ?? [];
        rows.push(transaction);
        transactionsByJournal.set(transaction.journalId, rows);
      }

      for (const journal of journals) {
        const sources = sourcesByJournal.get(journal.id) ?? [];
        if (sources.length === 0) continue;
        const merchants = sources.map(source => displayMerchant(source.merchant));
        if (merchants.some(merchant => !merchant)) continue;
        const uniqueMerchants = new Set(merchants as string[]);
        if (uniqueMerchants.size !== 1) continue;
        if (
          sources.some(
            source =>
              source.amount === undefined ||
              Math.abs(source.amount - journal.totalAmount) > 0.000001 ||
              source.currencyCode !== journal.currencyCode,
          )
        )
          continue;
        const lines = transactionsByJournal.get(journal.id) ?? [];
        if (lines.length !== 2) continue;
        const financial = lines.filter(line =>
          accountTypeIsFinancial(accountById.get(line.accountId)?.accountType),
        );
        const categories = lines.filter(line => {
          const type = accountById.get(line.accountId)?.accountType;
          return type === AccountType.EXPENSE || type === AccountType.INCOME;
        });
        if (financial.length !== 1 || categories.length !== 1) continue;
        const financialAccount = accountById.get(financial[0].accountId);
        const categoryAccount = accountById.get(categories[0].accountId);
        if (!financialAccount || !categoryAccount) continue;
        const kind =
          categoryAccount.accountType === AccountType.EXPENSE
            ? 'expense'
            : categoryAccount.accountType === AccountType.INCOME
              ? 'income'
              : undefined;
        if (!kind) continue;
        if (
          !accountIndex.isFinancialLeaf(financialAccount.id, journal.currencyCode) ||
          !accountIndex.isCategoryLeaf(categoryAccount.id, kind, journal.currencyCode)
        )
          continue;
        const merchantIdentity = [...uniqueMerchants][0];
        const key = JSON.stringify([
          merchantIdentity,
          financialAccount.id,
          kind,
          journal.currencyCode,
        ]);
        let group = groups.get(key);
        if (!group) {
          group = {
            merchant: merchantIdentity,
            financialAccountId: financialAccount.id,
            financialAccountName: financialAccount.name,
            kind,
            currencyCode: journal.currencyCode,
            latestJournalDate: journal.journalDate,
            journals: new Map(),
            sourceIds: new Set(),
            categories: new Map(),
          };
          groups.set(key, group);
        }
        group.journals.set(journal.id, journal.journalDate);
        group.latestJournalDate = Math.max(group.latestJournalDate, journal.journalDate);
        for (const source of sources) {
          if (group.sourceIds.has(source.sourceId)) continue;
          group.sourceIds.add(source.sourceId);
        }
        const category = group.categories.get(categoryAccount.id) ?? {
          name: categoryAccount.name,
          journals: new Set<JournalId>(),
        };
        category.journals.add(journal.id);
        group.categories.set(categoryAccount.id, category);
      }
    }

    return (
      [...groups.entries()]
        .map(([key, group]) => ({
          key,
          merchant: group.merchant,
          journalIds: [...group.journals.entries()]
            .sort((left, right) => right[1] - left[1])
            .map(([journalId]) => journalId),
          financialAccountId: group.financialAccountId,
          financialAccountName: group.financialAccountName,
          kind: group.kind,
          currencyCode: group.currencyCode,
          latestJournalDate: group.latestJournalDate,
          journalCount: group.journals.size,
          sourceCount: group.sourceIds.size,
          categories: [...group.categories.entries()].map(([accountId, value]) => ({
            accountId,
            name: value.name,
            journalCount: value.journals.size,
          })),
        }))
        // A pattern needs repeat transactions, not just repeated SMS evidence for one journal.
        .filter(pattern => pattern.journalCount >= MIN_HISTORICAL_PATTERN_JOURNALS)
        .sort(
          (left, right) =>
            right.latestJournalDate - left.latestJournalDate ||
            right.journalCount - left.journalCount ||
            left.merchant.localeCompare(right.merchant),
        )
    );
  }
}

export const journalHistoricalCaptureQueries = new JournalHistoricalCaptureQueries();
