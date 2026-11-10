import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import Transaction from '@/src/data/models/Transaction';
import Account from '@/src/data/models/Account';
import {
  preservedMerchants,
  readCaptureMetadata,
  captureConfirmationKey,
  captureAllocationsMatchLines,
} from '@/src/domain/transaction-intelligence/captureMetadata';
import { AccountType, JournalStatus } from '@/src/types/enums';
import type { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';
import { fetchSequentiallyInChunks } from '@/src/data/repositories/fetchSequentiallyInChunks';
import { captureDescriptionKey } from '@/src/domain/transaction-intelligence/descriptionDefaults';
import type { CaptureCategoryDefault } from '@/src/domain/transaction-intelligence/categoryDefaults';
import { createCaptureAccountIndex } from '@/src/domain/transaction-intelligence/captureAccountEligibility';

export interface CaptureReviewItem {
  journalId: JournalId;
  description?: string;
  journalDate: number;
  totalAmount: number;
  currencyCode: string;
  reviewState: 'needs_categorization' | 'confirmed' | 'defaulted';
  suggestedCategoryName?: string;
  suggestedDefault?: CaptureCategoryDefault;
  suggestedDefaultAccountName?: string;
  merchantKey?: string;
  keepOpen?: boolean;
  descriptionDefaultKey?: string;
  savedDescriptionDefault?: string;
  recurring?: boolean;
  confirmCategoryKey?: string;
  currentCategoryNames?: string[];
}

/** Capture reads stay scoped and work on both SQLite and the web adapter. */
export class JournalCaptureQueries {
  /** Signal when records used by capture projections change. */
  subscribeToChanges(onChange: () => void): () => void {
    return database.experimentalSubscribe(
      ['journals', 'journal_metadata', 'transactions', 'accounts', 'transaction_inbox_records'],
      onChange,
    );
  }

  private get metadata() {
    return database.collections.get<JournalMetadata>('journal_metadata');
  }

  private async fetchCaptureMetadata(
    workplaceId: WorkplaceId,
    reviewStates?: readonly string[],
  ): Promise<JournalMetadata[]> {
    return this.metadata
      .query(
        Q.where('workplace_id', workplaceId),
        ...(reviewStates?.length
          ? [Q.where('capture_review_state', Q.oneOf([...reviewStates]))]
          : [Q.where('capture_review_state', Q.notEq(null))]),
      )
      .fetch();
  }

  async countNeedsCategorization(workplaceId: WorkplaceId): Promise<number> {
    const rows = await this.fetchCaptureMetadata(workplaceId, ['needs_categorization']);
    const journalIds = [
      ...new Set(
        rows
          .filter(
            row => readCaptureMetadata(row.metadataJson)?.reviewState === 'needs_categorization',
          )
          .map(row => row.journalId),
      ),
    ];
    if (journalIds.length === 0) return 0;
    const postedJournals = await fetchSequentiallyInChunks(journalIds, ids =>
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
    return postedJournals.length;
  }

  async listReview(
    workplaceId: WorkplaceId,
    includeConfirmed = false,
  ): Promise<CaptureReviewItem[]> {
    const metadata = await this.fetchCaptureMetadata(
      workplaceId,
      includeConfirmed
        ? ['needs_categorization', 'confirmed', 'defaulted']
        : ['needs_categorization'],
    );
    if (
      !includeConfirmed &&
      !metadata.some(
        row => readCaptureMetadata(row.metadataJson)?.reviewState === 'needs_categorization',
      )
    )
      return [];
    const journalIds = [
      ...new Set(
        metadata
          .filter(row => readCaptureMetadata(row.metadataJson) !== null)
          .map(row => row.journalId),
      ),
    ];
    if (journalIds.length === 0) return [];
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
    const transactions = await fetchSequentiallyInChunks(journalIds, ids =>
      database.collections
        .get<Transaction>('transactions')
        .query(
          Q.where('workplace_id', workplaceId),
          Q.where('journal_id', Q.oneOf([...ids])),
          Q.where('deleted_at', Q.eq(null)),
        )
        .fetch(),
    );
    const accounts = await database.collections
      .get<Account>('accounts')
      .query(Q.where('workplace_id', workplaceId), Q.where('deleted_at', Q.eq(null)))
      .fetch();
    const accountIndex = createCaptureAccountIndex(accounts);
    const accountMap = accountIndex.byId;
    const captures = new Map(
      metadata.map(row => [row.journalId, readCaptureMetadata(row.metadataJson)]),
    );
    const journalIdsSet = new Set(journals.map(journal => journal.id));
    const financialByJournal = new Map<JournalId, Set<AccountId>>();
    const transactionsByJournal = new Map<JournalId, Transaction[]>();
    for (const transaction of transactions) {
      if (!journalIdsSet.has(transaction.journalId)) continue;
      const journalLines = transactionsByJournal.get(transaction.journalId) ?? [];
      journalLines.push(transaction);
      transactionsByJournal.set(transaction.journalId, journalLines);
      const account = accountMap.get(transaction.accountId);
      if (!account || !accountIndex.isFinancialLeaf(account.id)) continue;
      const ids = financialByJournal.get(transaction.journalId) ?? new Set<AccountId>();
      ids.add(transaction.accountId);
      financialByJournal.set(transaction.journalId, ids);
    }
    const keyFor = (journal: Journal): string | undefined => {
      const capture = captures.get(journal.id);
      const merchant = capture?.merchant?.trim().toLowerCase();
      const financial = financialByJournal.get(journal.id);
      if (
        !merchant ||
        !financial ||
        financial.size !== 1 ||
        !capture ||
        capture.economicKind === 'transfer'
      )
        return undefined;
      return JSON.stringify([
        merchant,
        [...financial][0],
        capture.economicKind,
        journal.currencyCode,
      ]);
    };
    const history = new Map<string, Set<AccountId>>();
    const splitHistory = new Set<string>();
    const repeatedDates = new Map<string, Set<number>>();
    for (const journal of journals) {
      const capture = captures.get(journal.id);
      const key = keyFor(journal);
      if (!key || capture?.reviewState !== 'confirmed') continue;
      if (capture.allocations.length !== 1) {
        splitHistory.add(key);
        continue;
      }
      const allocation = capture.allocations[0];
      if (allocation.origin !== 'user' || !allocation.confirmedAt) continue;
      const ids = history.get(key) ?? new Set<AccountId>();
      ids.add(allocation.accountId);
      history.set(key, ids);
      const repeatKey = JSON.stringify([key, journal.totalAmount]);
      const dates = repeatedDates.get(repeatKey) ?? new Set<number>();
      dates.add(Math.floor(journal.journalDate / 86_400_000));
      repeatedDates.set(repeatKey, dates);
    }
    return journals
      .filter(journal => {
        const state = captures.get(journal.id)?.reviewState;
        return (
          state === 'needs_categorization' ||
          (includeConfirmed && (state === 'confirmed' || state === 'defaulted'))
        );
      })
      .sort((left, right) => right.journalDate - left.journalDate)
      .map(journal => {
        const key = keyFor(journal);
        const merchantKey = captures.get(journal.id)?.merchant?.trim().toLowerCase() || undefined;
        const descriptionDefaultKey = captureDescriptionKey(
          merchantKey,
          journal.totalAmount,
          journal.currencyCode,
          captures.get(journal.id)?.economicKind ?? 'transfer',
        );
        const candidates = key ? history.get(key) : undefined;
        const priorDays = key
          ? repeatedDates.get(JSON.stringify([key, journal.totalAmount]))
          : undefined;
        const recurring =
          !!priorDays &&
          [...priorDays].filter(day => day < Math.floor(journal.journalDate / 86_400_000)).length >=
            2;
        const capture = captures.get(journal.id);
        const candidateId =
          capture?.reviewState === 'confirmed'
            ? capture.allocations.length === 1 && capture.allocations[0].origin === 'user'
              ? capture.allocations[0].accountId
              : undefined
            : candidates?.size === 1 && key && !splitHistory.has(key)
              ? [...candidates][0]
              : undefined;
        const candidate = candidateId ? accountMap.get(candidateId) : undefined;
        const financialId =
          financialByJournal.get(journal.id)?.size === 1
            ? [...financialByJournal.get(journal.id)!][0]
            : undefined;
        const financialAccount = financialId ? accountMap.get(financialId) : undefined;
        const categoryKind =
          capture?.economicKind === 'expense' || capture?.economicKind === 'income'
            ? capture.economicKind
            : undefined;
        const category =
          candidate &&
          categoryKind &&
          accountIndex.isCategoryLeaf(
            candidate.id,
            categoryKind,
            journal.currencyCode,
            capture?.uncategorizedAccountIds?.includes(candidate.id) ? candidate.id : undefined,
          )
            ? candidate
            : undefined;
        const currentCategories = capture?.allocations.map(allocation =>
          accountMap.get(allocation.accountId),
        );
        const currentLines = transactionsByJournal.get(journal.id) ?? [];
        const currentCategoryLines = currentLines.filter(line => {
          const type = accountMap.get(line.accountId)?.accountType;
          return type === AccountType.EXPENSE || type === AccountType.INCOME;
        });
        const canConfirmCurrent =
          (capture?.reviewState === 'needs_categorization' ||
            capture?.reviewState === 'defaulted') &&
          capture.allocations.length > 0 &&
          capture.allocations.some(
            allocation => allocation.origin !== 'user' || allocation.confirmedAt === undefined,
          ) &&
          captureAllocationsMatchLines(capture.allocations, currentCategoryLines) &&
          capture.allocations.every(
            allocation =>
              allocation.origin !== 'uncategorized' &&
              !capture.uncategorizedAccountIds?.includes(allocation.accountId),
          ) &&
          currentCategories?.every(
            account =>
              !!account &&
              (capture.economicKind === 'expense' || capture.economicKind === 'income') &&
              accountIndex.isCategoryLeaf(
                account.id,
                capture.economicKind,
                journal.currencyCode,
                capture.uncategorizedAccountIds?.includes(account.id) ? account.id : undefined,
              ),
          );
        return {
          journalId: journal.id,
          description: journal.description,
          journalDate: journal.journalDate,
          totalAmount: journal.totalAmount,
          currencyCode: journal.currencyCode,
          reviewState:
            capture?.reviewState === 'confirmed' || capture?.reviewState === 'defaulted'
              ? capture.reviewState
              : 'needs_categorization',
          ...(category ? { suggestedCategoryName: category.name } : {}),
          ...(category &&
          financialAccount &&
          accountIndex.isFinancialLeaf(financialAccount.id, journal.currencyCode) &&
          merchantKey &&
          capture &&
          capture.economicKind !== 'transfer' &&
          financialByJournal.get(journal.id)?.size === 1
            ? {
                suggestedDefault: {
                  merchant: merchantKey,
                  financialAccountId: financialAccount.id,
                  kind: capture.economicKind,
                  currencyCode: journal.currencyCode,
                  categoryAccountId: category.id,
                },
              }
            : {}),
          ...(category && key
            ? {
                suggestedDefaultAccountName: accountMap.get(
                  [...financialByJournal.get(journal.id)!][0],
                )?.name,
              }
            : {}),
          ...(merchantKey ? { merchantKey } : {}),
          ...(descriptionDefaultKey ? { descriptionDefaultKey } : {}),
          ...(recurring ? { recurring: true } : {}),
          ...(canConfirmCurrent
            ? {
                confirmCategoryKey: captureConfirmationKey(capture.allocations, currentLines),
                currentCategoryNames: [
                  ...new Set(currentCategories!.map(account => account!.name)),
                ],
              }
            : {}),
        };
      });
  }

  async findPreservedMerchants(
    workplaceId: WorkplaceId,
    journalIds: readonly JournalId[],
  ): Promise<Map<JournalId, string[]>> {
    if (journalIds.length === 0) return new Map();
    const rows = await fetchSequentiallyInChunks(journalIds, ids =>
      this.metadata
        .query(Q.where('workplace_id', workplaceId), Q.where('journal_id', Q.oneOf([...ids])))
        .fetch(),
    );
    const merchants = new Map<JournalId, string[]>();
    for (const row of rows) {
      const values = [
        ...new Set([
          ...(merchants.get(row.journalId) ?? []),
          ...preservedMerchants(row.metadataJson),
        ]),
      ];
      if (values.length > 0) merchants.set(row.journalId, values);
    }
    return merchants;
  }
}

export const journalCaptureQueries = new JournalCaptureQueries();
