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
import { applyJournalMetadataProjections } from '@/src/data/repositories/journal/journalMetadataProjections';
import { parseJSONRecord } from '@/src/utils/serialization';
import {
  createCaptureAccountIndex,
  type CaptureAccountIndex,
} from '@/src/domain/transaction-intelligence/captureAccountEligibility';
import type { AccountDisplay } from '@/src/types/plainDtos';
import { toCaptureAccountDisplay } from '@/src/data/repositories/journal/captureAccountDisplay';

export interface HistoricalCategoryPattern {
  key: string;
  merchant: string;
  journalIds: JournalId[];
  categoryByJournalId: Record<string, AccountId>;
  financialAccountId: AccountId;
  financialAccountName: string;
  /** Presentation fields so the row can show the account colour and icon. */
  financialAccount?: AccountDisplay;
  kind: 'expense' | 'income';
  currencyCode: string;
  latestJournalDate: number;
  earliestJournalDate?: number;
  journalCount: number;
  sourceCount: number;
  /** Newest journal evidence marks for the compact review tape. One mark is one journal. */
  evidenceMarks: HistoricalEvidenceMark[];
  categories: {
    accountId: AccountId;
    name: string;
    journalCount: number;
    color?: string;
    icon?: string;
  }[];
}

export interface HistoricalEvidenceMark {
  journalId: JournalId;
  journalDate: number;
  categoryName: string;
  sourceCount: number;
}

export interface HistoricalEvidenceEntry extends HistoricalEvidenceMark {
  description?: string;
  categoryAccount?: {
    id: AccountId;
    name: string;
    accountType: AccountType;
    icon?: string;
    color?: string;
  };
  totalAmount: number;
  currencyCode: string;
}

const HISTORICAL_EVIDENCE_MARK_LIMIT = 12;

const MIN_HISTORICAL_PATTERN_JOURNALS = 2;

function displayMerchant(value?: string | null): string | undefined {
  if (value && value.length >= 200) return undefined;
  const merchant = value?.trim();
  // Stored SMS evidence is capped at 200 characters. A value at the limit may
  // already be truncated, so it cannot safely identify a future-match rule.
  return merchant || undefined;
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
  const parsed = parseJSONRecord(row.metadataJson);
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

function classifyHistoricalJournal(
  journal: Journal,
  sources: HistoricalSmsSourceEvidence[],
  lines: Transaction[],
  accounts: CaptureAccountIndex,
) {
  if (sources.length === 0) return undefined;
  const merchants = sources.map(source => displayMerchant(source.merchant));
  if (merchants.some(merchant => !merchant)) return undefined;
  const merchant = merchants[0]!;
  const merchantIdentity = merchant.toLowerCase();
  if (merchantIdentity.length > 200) return undefined;
  if (merchants.some(value => value!.toLowerCase() !== merchantIdentity)) return undefined;
  if (
    sources.some(
      source =>
        source.amount === undefined ||
        Math.abs(source.amount - journal.totalAmount) > 0.000001 ||
        source.currencyCode !== journal.currencyCode,
    )
  )
    return undefined;
  if (lines.length !== 2) return undefined;
  const financial = lines.filter(line =>
    accountTypeIsFinancial(accounts.byId.get(line.accountId)?.accountType),
  );
  const categories = lines.filter(line => {
    const type = accounts.byId.get(line.accountId)?.accountType;
    return type === AccountType.EXPENSE || type === AccountType.INCOME;
  });
  if (financial.length !== 1 || categories.length !== 1) return undefined;
  const financialAccount = accounts.byId.get(financial[0].accountId);
  const categoryAccount = accounts.byId.get(categories[0].accountId);
  if (!financialAccount || !categoryAccount) return undefined;
  const kind: 'expense' | 'income' | undefined =
    categoryAccount.accountType === AccountType.EXPENSE
      ? 'expense'
      : categoryAccount.accountType === AccountType.INCOME
        ? 'income'
        : undefined;
  if (
    !kind ||
    !accounts.isFinancialLeaf(financialAccount.id, journal.currencyCode) ||
    accounts.isUncategorizedRole(categoryAccount.id, kind, journal.currencyCode) ||
    !accounts.isCategoryLeaf(categoryAccount.id, kind, journal.currencyCode)
  )
    return undefined;
  return {
    merchant,
    financialAccount,
    categoryAccount,
    kind,
    key: JSON.stringify([merchantIdentity, financialAccount.id, kind, journal.currencyCode]),
  };
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
              applyJournalMetadataProjections(record);
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
              applyJournalMetadataProjections(record);
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
        .query(Q.where('workplace_id', workplaceId), Q.where('has_historical_sms_evidence', true))
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
            applyJournalMetadataProjections(entry);
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

  async listCategoryPatterns(
    workplaceId: WorkplaceId,
    uncategorizedAccountIds: Readonly<Record<string, AccountId>> = {},
  ): Promise<HistoricalCategoryPattern[]> {
    const sourcesByJournal = new Map<JournalId, HistoricalSmsSourceEvidence[]>();
    const METADATA_BATCH_SIZE = 200;
    for (let offset = 0; ; offset += METADATA_BATCH_SIZE) {
      const rows = await this.metadata
        .query(
          Q.where('workplace_id', workplaceId),
          Q.where('has_historical_sms_evidence', true),
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
    const accountIndex = createCaptureAccountIndex(accounts, uncategorizedAccountIds);
    const accountById = new Map(accounts.map(account => [account.id, account]));
    const groups = new Map<
      string,
      {
        merchant: string;
        financialAccountId: AccountId;
        financialAccountName: string;
        kind: 'expense' | 'income';
        currencyCode: string;
        latestJournalDate: number;
        earliestJournalDate: number;
        journals: Map<JournalId, HistoricalEvidenceMark>;
        sourceIds: Set<string>;
        categories: Map<
          AccountId,
          { name: string; color?: string; icon?: string; journals: Set<JournalId> }
        >;
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
        const match = classifyHistoricalJournal(
          journal,
          sources,
          transactionsByJournal.get(journal.id) ?? [],
          accountIndex,
        );
        if (!match) continue;
        const { key, merchant, financialAccount, categoryAccount, kind } = match;
        let group = groups.get(key);
        if (!group) {
          group = {
            merchant,
            financialAccountId: financialAccount.id,
            financialAccountName: financialAccount.name,
            kind,
            currencyCode: journal.currencyCode,
            latestJournalDate: journal.journalDate,
            earliestJournalDate: journal.journalDate,
            journals: new Map(),
            sourceIds: new Set(),
            categories: new Map(),
          };
          groups.set(key, group);
        }
        if (merchant < group.merchant) group.merchant = merchant;
        group.journals.set(journal.id, {
          journalId: journal.id,
          journalDate: journal.journalDate,
          categoryName: categoryAccount.name,
          sourceCount: sources.length,
        });
        group.latestJournalDate = Math.max(group.latestJournalDate, journal.journalDate);
        group.earliestJournalDate = Math.min(group.earliestJournalDate, journal.journalDate);
        for (const source of sources) {
          if (group.sourceIds.has(source.sourceId)) continue;
          group.sourceIds.add(source.sourceId);
        }
        const category = group.categories.get(categoryAccount.id) ?? {
          name: categoryAccount.name,
          color: accountById.get(categoryAccount.id)?.color,
          icon: accountById.get(categoryAccount.id)?.icon,
          journals: new Set<JournalId>(),
        };
        category.journals.add(journal.id);
        group.categories.set(categoryAccount.id, category);
      }
    }

    return (
      [...groups.entries()]
        .map(([key, group]) => {
          const financialAccount = accountById.get(group.financialAccountId);
          return {
            key,
            merchant: group.merchant,
            categoryByJournalId: Object.fromEntries(
              [...group.categories.entries()].flatMap(([accountId, value]) =>
                [...value.journals].map(journalId => [journalId, accountId]),
              ),
            ),
            journalIds: [...group.journals.entries()]
              .sort(
                (left, right) =>
                  right[1].journalDate - left[1].journalDate || left[0].localeCompare(right[0]),
              )
              .map(([journalId]) => journalId),
            financialAccountId: group.financialAccountId,
            financialAccountName: group.financialAccountName,
            financialAccount: financialAccount
              ? toCaptureAccountDisplay(financialAccount)
              : undefined,
            kind: group.kind,
            currencyCode: group.currencyCode,
            latestJournalDate: group.latestJournalDate,
            earliestJournalDate: group.earliestJournalDate,
            journalCount: group.journals.size,
            sourceCount: group.sourceIds.size,
            evidenceMarks: [...group.journals.values()]
              .sort(
                (left, right) =>
                  right.journalDate - left.journalDate ||
                  left.journalId.localeCompare(right.journalId),
              )
              .slice(0, HISTORICAL_EVIDENCE_MARK_LIMIT),
            categories: [...group.categories.entries()].map(([accountId, value]) => ({
              accountId,
              name: value.name,
              journalCount: value.journals.size,
              color: value.color,
              icon: value.icon,
            })),
          };
        })
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

  /** Read one calendar window for an expanded pattern, revalidating the same eligibility as the list. */
  async listPatternEvidenceWindow(
    workplaceId: WorkplaceId,
    pattern: HistoricalCategoryPattern,
    start: number,
    end: number,
    uncategorizedAccountIds: Readonly<Record<string, AccountId>> = {},
  ): Promise<HistoricalEvidenceEntry[]> {
    const ids: JournalId[] = [];
    for (let offset = 0; offset < pattern.journalIds.length; offset += 100) {
      const chunk = pattern.journalIds.slice(offset, offset + 100);
      const journals = await database.collections
        .get<Journal>('journals')
        .query(
          Q.where('workplace_id', workplaceId),
          Q.where('id', Q.oneOf(chunk)),
          Q.where('deleted_at', Q.eq(null)),
          Q.where('status', JournalStatus.POSTED),
          Q.where('journal_date', Q.gte(start)),
          Q.where('journal_date', Q.lt(end)),
        )
        .fetch();
      ids.push(...journals.map(journal => journal.id));
    }
    const entries: HistoricalEvidenceEntry[] = [];
    const windowPattern = { ...pattern, journalIds: ids };
    for (let offset = 0; offset < ids.length; offset += 100) {
      entries.push(
        ...(await this.listPatternEvidenceEntries(
          workplaceId,
          windowPattern,
          offset,
          100,
          uncategorizedAccountIds,
        )),
      );
    }
    return entries.sort(
      (a, b) => b.journalDate - a.journalDate || a.journalId.localeCompare(b.journalId),
    );
  }

  /** Fetch a bounded page of current entries for one already-grouped historical pattern. */
  async listPatternEvidenceEntries(
    workplaceId: WorkplaceId,
    pattern: Pick<HistoricalCategoryPattern, 'key' | 'journalIds' | 'categoryByJournalId'>,
    offset: number,
    limit: number,
    uncategorizedAccountIds: Readonly<Record<string, AccountId>> = {},
  ): Promise<HistoricalEvidenceEntry[]> {
    const ids = pattern.journalIds.slice(Math.max(0, offset), Math.max(0, offset) + limit);
    if (ids.length === 0) return [];

    const [journals, metadataRows, transactions, accounts] = await Promise.all([
      database.collections
        .get<Journal>('journals')
        .query(
          Q.where('workplace_id', workplaceId),
          Q.where('id', Q.oneOf(ids)),
          Q.where('deleted_at', Q.eq(null)),
          Q.where('status', JournalStatus.POSTED),
        )
        .fetch(),
      this.metadata
        .query(Q.where('workplace_id', workplaceId), Q.where('journal_id', Q.oneOf(ids)))
        .fetch(),
      database.collections
        .get<Transaction>('transactions')
        .query(
          Q.where('workplace_id', workplaceId),
          Q.where('journal_id', Q.oneOf(ids)),
          Q.where('deleted_at', Q.eq(null)),
        )
        .fetch(),
      database.collections
        .get<Account>('accounts')
        .query(Q.where('workplace_id', workplaceId), Q.where('deleted_at', Q.eq(null)))
        .fetch(),
    ]);

    const accountIndex = createCaptureAccountIndex(accounts, uncategorizedAccountIds);
    const accountById = new Map(accounts.map(account => [account.id, account]));
    const journalById = new Map(journals.map(journal => [journal.id, journal]));
    const sourcesByJournal = new Map<JournalId, HistoricalSmsSourceEvidence[]>();
    for (const row of metadataRows) {
      const sources = readHistoricalSmsEvidence(row.metadataJson)?.sources ?? [];
      if (sources.length === 0) continue;
      sourcesByJournal.set(
        row.journalId,
        mergeHistoricalSmsSources(sourcesByJournal.get(row.journalId) ?? [], sources),
      );
    }
    const linesByJournal = new Map<JournalId, Transaction[]>();
    for (const line of transactions) {
      const lines = linesByJournal.get(line.journalId) ?? [];
      lines.push(line);
      linesByJournal.set(line.journalId, lines);
    }

    const entries: HistoricalEvidenceEntry[] = [];
    for (const journalId of ids) {
      const journal = journalById.get(journalId);
      const sources = sourcesByJournal.get(journalId) ?? [];
      if (!journal) continue;
      const match = classifyHistoricalJournal(
        journal,
        sources,
        linesByJournal.get(journalId) ?? [],
        accountIndex,
      );
      if (
        !match ||
        match.key !== pattern.key ||
        pattern.categoryByJournalId[journalId] !== match.categoryAccount.id
      )
        continue;
      entries.push({
        journalId,
        journalDate: journal.journalDate,
        description: journal.description,
        categoryName: match.categoryAccount.name,
        categoryAccount: {
          id: match.categoryAccount.id,
          name: match.categoryAccount.name,
          accountType: match.categoryAccount.accountType,
          icon: accountById.get(match.categoryAccount.id)?.icon,
          color: accountById.get(match.categoryAccount.id)?.color,
        },
        sourceCount: sources.length,
        totalAmount: journal.totalAmount,
        currencyCode: journal.currencyCode,
      });
    }
    return entries;
  }
}

export const journalHistoricalCaptureQueries = new JournalHistoricalCaptureQueries();
