import {
  journalCaptureQueries,
  type CaptureReviewItem,
} from '@/src/data/repositories/journal/JournalCaptureQueries';
import type { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { preferences } from '@/src/services/preferences';
import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { journalHistoricalCaptureQueries } from '@/src/data/repositories/journal/JournalHistoricalCaptureQueries';
import type { HistoricalCategoryPattern } from '@/src/data/repositories/journal/JournalHistoricalCaptureQueries';
import {
  categoryDefaultKey,
  type CaptureCategoryDefault,
} from '@/src/domain/transaction-intelligence/categoryDefaults';
import { createCaptureAccountIndex } from '@/src/domain/transaction-intelligence/captureAccountEligibility';

export type { CaptureReviewItem };

/** Lightweight overview count; it deliberately avoids loading transaction lines. */
export function countCaptureReviewItems(workplaceId: WorkplaceId): Promise<number> {
  return journalCaptureQueries.countNeedsCategorization(workplaceId);
}

const HISTORICAL_SMS_BACKFILL_VERSION = 1;
const historicalBackfills = new Map<string, Promise<void>>();

export interface HistoricalMerchantNameLink {
  name: string;
  journalIds: JournalId[];
  journalCount: number;
  sourceCount: number;
}

export interface PossibleHistoricalMerchantMatch {
  key: string;
  names: HistoricalMerchantNameLink[];
}

function possibleVariantKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

/** Finds review-only cosmetic name matches. It never changes a pattern or saved default. */
function possibleHistoricalMerchantMatches(
  patterns: readonly HistoricalCategoryPattern[],
): PossibleHistoricalMerchantMatch[] {
  const candidates = new Map<string, Map<string, HistoricalMerchantNameLink>>();
  for (const pattern of patterns) {
    const key = possibleVariantKey(pattern.merchant);
    if (!key) continue;
    const names = candidates.get(key) ?? new Map<string, HistoricalMerchantNameLink>();
    const value = names.get(pattern.merchant) ?? {
      name: pattern.merchant,
      journalIds: [],
      journalCount: 0,
      sourceCount: 0,
    };
    const journals = new Set([...value.journalIds, ...pattern.journalIds]);
    value.journalIds = [...journals];
    value.journalCount = journals.size;
    value.sourceCount += pattern.sourceCount;
    names.set(pattern.merchant, value);
    candidates.set(key, names);
  }

  return [...candidates.entries()]
    .filter(([, names]) => names.size > 1)
    .map(([key, names]) => ({
      key,
      names: [...names.values()].sort((left, right) => left.name.localeCompare(right.name)),
    }))
    .sort((left, right) => left.names[0].name.localeCompare(right.names[0].name));
}

async function ensureHistoricalSmsBackfill(workplaceId: WorkplaceId): Promise<void> {
  if (
    preferences.workplace.getSnapshot(workplaceId).historicalSmsCaptureBackfillVersion ===
    HISTORICAL_SMS_BACKFILL_VERSION
  )
    return;
  const existing = historicalBackfills.get(workplaceId);
  if (existing) return existing;
  const pending = journalHistoricalCaptureQueries
    .backfillSmsEvidence(workplaceId)
    .then(() => {
      preferences.workplace.update(workplaceId, {
        historicalSmsCaptureBackfillVersion: HISTORICAL_SMS_BACKFILL_VERSION,
      });
    })
    .finally(() => historicalBackfills.delete(workplaceId));
  historicalBackfills.set(workplaceId, pending);
  return pending;
}

/** All unresolved journals; presentation may page without hiding older review work. */
async function captureItems(workplaceId: WorkplaceId): Promise<CaptureReviewItem[]> {
  const items = await journalCaptureQueries.listReview(workplaceId, true);
  const open = new Set(preferences.workplace.getSnapshot(workplaceId).openCaptureMerchants ?? []);
  const defaults = preferences.workplace.getSnapshot(workplaceId).captureDescriptionDefaults ?? {};
  return items.map(item =>
    item.merchantKey && open.has(item.merchantKey)
      ? {
          ...item,
          suggestedCategoryName: undefined,
          suggestedDefault: undefined,
          suggestedDefaultAccountName: undefined,
          keepOpen: true,
          savedDescriptionDefault: item.descriptionDefaultKey
            ? defaults[item.descriptionDefaultKey]
            : undefined,
        }
      : {
          ...item,
          keepOpen: false,
          recurring:
            item.descriptionDefaultKey && defaults[item.descriptionDefaultKey]
              ? false
              : item.recurring,
          savedDescriptionDefault: item.descriptionDefaultKey
            ? defaults[item.descriptionDefaultKey]
            : undefined,
        },
  );
}

export function subscribeToCaptureChanges(onChange: () => void): () => void {
  return journalCaptureQueries.subscribeToChanges(onChange);
}

export async function listCaptureItems(
  workplaceId: WorkplaceId,
  options: { includeHistorical?: boolean } = {},
) {
  if (options.includeHistorical) await ensureHistoricalSmsBackfill(workplaceId);
  const items = await captureItems(workplaceId);
  const confirmed = items.filter(item => item.reviewState === 'confirmed');
  const categoryDefaults =
    preferences.workplace.getSnapshot(workplaceId).captureCategoryDefaults ?? [];
  const categoryCandidates = confirmed.filter(item => {
    const suggestion = item.suggestedDefault;
    if (!suggestion) return false;
    const saved = categoryDefaults.find(
      value => categoryDefaultKey(value) === categoryDefaultKey(suggestion),
    );
    return (
      !!saved?.conflictingCategoryAccountIds?.length ||
      saved?.categoryAccountId !== suggestion.categoryAccountId
    );
  });
  const categoryCandidateIds = new Set(categoryCandidates.map(item => item.journalId));
  const descriptionCandidates = confirmed.filter(item => {
    if (
      categoryCandidateIds.has(item.journalId) ||
      item.keepOpen ||
      !item.descriptionDefaultKey ||
      !item.description ||
      !item.merchantKey
    )
      return false;
    return (
      item.description.trim().toLowerCase() !== item.merchantKey &&
      item.savedDescriptionDefault !== item.description
    );
  });

  const openMerchants = new Set(
    preferences.workplace.getSnapshot(workplaceId).openCaptureMerchants ?? [],
  );
  const historicalPatterns = options.includeHistorical
    ? await journalHistoricalCaptureQueries.listCategoryPatterns(workplaceId)
    : [];
  const possibleMerchantMatches = possibleHistoricalMerchantMatches(historicalPatterns);
  const visibleHistoricalPatterns = historicalPatterns.filter(pattern => {
    const merchantOpen = openMerchants.has(pattern.merchant.trim().toLowerCase());
    const category = pattern.categories.length === 1 ? pattern.categories[0] : undefined;
    const hasSuggestedDefault =
      !!category &&
      categoryDefaults.some(
        value =>
          !value.conflictingCategoryAccountIds?.length &&
          categoryDefaultKey(value) ===
            categoryDefaultKey({
              merchant: pattern.merchant,
              financialAccountId: pattern.financialAccountId,
              kind: pattern.kind,
              currencyCode: pattern.currencyCode,
            }) &&
          value.categoryAccountId === category.accountId,
      );
    return !merchantOpen && !hasSuggestedDefault;
  });
  const mixedHistoricalCategoryPatterns = visibleHistoricalPatterns.filter(
    pattern => pattern.categories.length > 1,
  );

  return {
    review: items.filter(item => item.reviewState === 'needs_categorization'),
    defaulted: items.filter(item => item.reviewState === 'defaulted'),
    categoryCandidates,
    descriptionCandidates,
    possibleMerchantMatches,
    historicalCategorySuggestions: visibleHistoricalPatterns.filter(
      pattern => pattern.categories.length === 1,
    ),
    mixedHistoricalCategoryPatterns,
    mixedHistoricalCategoryCount: mixedHistoricalCategoryPatterns.length,
  };
}

/** A saved choice from the historical review is prospective and never edits old journals. */
export async function saveHistoricalCaptureCategoryDefault(
  workplaceId: WorkplaceId,
  patternKey: string,
  approvedCategoryAccountId: AccountId,
): Promise<void> {
  await ensureHistoricalSmsBackfill(workplaceId);
  await runAccountingWriteSession(async () => {
    const pattern = (await journalHistoricalCaptureQueries.listCategoryPatterns(workplaceId)).find(
      value => value.key === patternKey && value.categories.length === 1,
    );
    if (!pattern || pattern.categories[0].accountId !== approvedCategoryAccountId)
      throw new Error('The historical category suggestion changed. Review it again.');
    const categoryAccountId = pattern.categories[0].accountId;
    const accounts = await accountQueryRepository.findAll(workplaceId);
    const config = preferences.workplace.getSnapshot(workplaceId).automaticTransactionCapture;
    const accountIndex = createCaptureAccountIndex(accounts, config?.uncategorizedAccountIds);
    const uncategorizedId =
      config?.uncategorizedAccountIds[`${pattern.kind}:${pattern.currencyCode}`];
    if (
      !accountIndex.isFinancialLeaf(pattern.financialAccountId, pattern.currencyCode) ||
      !accountIndex.isCategoryLeaf(
        categoryAccountId,
        pattern.kind,
        pattern.currencyCode,
        uncategorizedId,
      )
    )
      throw new Error('The historical category or account is no longer available.');

    const choice: CaptureCategoryDefault = {
      merchant: pattern.merchant,
      financialAccountId: pattern.financialAccountId,
      kind: pattern.kind,
      currencyCode: pattern.currencyCode,
      categoryAccountId,
    };
    const current = preferences.workplace.getSnapshot(workplaceId).captureCategoryDefaults ?? [];
    const key = categoryDefaultKey(choice);
    preferences.workplace.update(workplaceId, {
      captureCategoryDefaults: [
        ...current.filter(value => categoryDefaultKey(value) !== key),
        choice,
      ],
    });
  });
}

/** Explicit confirmation goes through the normal journal writer and rechecks the shown allocations. */
export async function confirmCaptureCategories(
  workplaceId: WorkplaceId,
  journalId: JournalId,
  confirmCaptureKey: string,
): Promise<void> {
  await journalPersistenceService.put({ journalId, confirmCaptureKey }, workplaceId, {
    source: 'app',
    undoable: false,
  });
}

export function listCaptureDescriptionDefaults(workplaceId: WorkplaceId) {
  const snapshot = preferences.workplace.getSnapshot(workplaceId);
  const open = new Set(snapshot.openCaptureMerchants ?? []);
  return Object.entries(snapshot.captureDescriptionDefaults ?? {}).map(([key, description]) => {
    let parts: unknown;
    try {
      parts = JSON.parse(key);
    } catch {
      parts = null;
    }
    const merchant = Array.isArray(parts) && typeof parts[0] === 'string' ? parts[0] : undefined;
    const amount = Array.isArray(parts) && typeof parts[1] === 'number' ? parts[1] : undefined;
    const currencyCode =
      Array.isArray(parts) && typeof parts[2] === 'string' ? parts[2] : undefined;
    return {
      key,
      description,
      merchant,
      amount,
      currencyCode,
      paused: !!merchant && open.has(merchant),
    };
  });
}

export async function listCaptureCategoryDefaults(workplaceId: WorkplaceId) {
  const accounts = await accountQueryRepository.findAll(workplaceId);
  const snapshot = preferences.workplace.getSnapshot(workplaceId);
  const config = snapshot.automaticTransactionCapture;
  const accountIndex = createCaptureAccountIndex(accounts, config?.uncategorizedAccountIds);
  const open = new Set(snapshot.openCaptureMerchants ?? []);
  return (snapshot.captureCategoryDefaults ?? []).map(value => {
    const choices = [value.categoryAccountId, ...(value.conflictingCategoryAccountIds ?? [])];
    const categoryChoices = choices.map(accountId => ({
      accountId,
      name: accountIndex.byId.get(accountId)?.name ?? 'Unavailable category',
      available: accountIndex.isCategoryLeaf(
        accountId,
        value.kind,
        value.currencyCode,
        config?.uncategorizedAccountIds[`${value.kind}:${value.currencyCode}`],
      ),
    }));
    return {
      ...value,
      key: categoryDefaultKey(value),
      financialAccountName:
        accountIndex.byId.get(value.financialAccountId)?.name ?? 'Unavailable account',
      categoryName: categoryChoices[0]?.name ?? 'Unavailable category',
      categoryChoices,
      conflicted: choices.length > 1,
      paused: open.has(value.merchant),
      available:
        accountIndex.isFinancialLeaf(value.financialAccountId, value.currencyCode) &&
        categoryChoices.some(choice => choice.available),
    };
  });
}

/** Recheck the candidate and account context after the user accepts the prompt. */
export async function saveCaptureCategoryDefault(
  workplaceId: WorkplaceId,
  journalId: JournalId,
  choice: CaptureCategoryDefault,
): Promise<void> {
  await runAccountingWriteSession(async () => {
    const item = (await captureItems(workplaceId)).find(row => row.journalId === journalId);
    if (
      !item?.suggestedDefault ||
      categoryDefaultKey(item.suggestedDefault) !== categoryDefaultKey(choice) ||
      item.suggestedDefault.categoryAccountId !== choice.categoryAccountId
    )
      throw new Error('The suggested category changed. Review this entry again.');
    const snapshot = preferences.workplace.getSnapshot(workplaceId);
    if (
      snapshot.automaticTransactionCapture?.uncategorizedAccountIds[
        `${choice.kind}:${choice.currencyCode}`
      ] === choice.categoryAccountId
    )
      throw new Error('Uncategorized cannot be saved as a category default.');
    const current = snapshot.captureCategoryDefaults ?? [];
    const key = categoryDefaultKey(choice);
    preferences.workplace.update(workplaceId, {
      captureCategoryDefaults: [
        ...current.filter(value => categoryDefaultKey(value) !== key),
        choice,
      ],
    });
  });
}

export async function removeCaptureCategoryDefault(
  workplaceId: WorkplaceId,
  key: string,
): Promise<void> {
  await runAccountingWriteSession(async () => {
    const current = preferences.workplace.getSnapshot(workplaceId).captureCategoryDefaults ?? [];
    preferences.workplace.update(workplaceId, {
      captureCategoryDefaults: current.filter(value => categoryDefaultKey(value) !== key),
    });
  });
}

/** Resolve an account-merge collision by explicitly selecting one preserved category. */
export async function resolveCaptureCategoryDefaultConflict(
  workplaceId: WorkplaceId,
  key: string,
  categoryAccountId: AccountId,
): Promise<void> {
  await runAccountingWriteSession(async () => {
    const snapshot = preferences.workplace.getSnapshot(workplaceId);
    const current = snapshot.captureCategoryDefaults ?? [];
    const conflicted = current.find(value => categoryDefaultKey(value) === key);
    const choices = conflicted
      ? [conflicted.categoryAccountId, ...(conflicted.conflictingCategoryAccountIds ?? [])]
      : [];
    if (!conflicted || choices.length < 2 || !choices.includes(categoryAccountId))
      throw new Error('This category default is no longer conflicted. Review it again.');
    const accounts = await accountQueryRepository.findAll(workplaceId);
    const config = snapshot.automaticTransactionCapture;
    const accountIndex = createCaptureAccountIndex(accounts, config?.uncategorizedAccountIds);
    if (
      !accountIndex.isFinancialLeaf(conflicted.financialAccountId, conflicted.currencyCode) ||
      !accountIndex.isCategoryLeaf(
        categoryAccountId,
        conflicted.kind,
        conflicted.currencyCode,
        config?.uncategorizedAccountIds[`${conflicted.kind}:${conflicted.currencyCode}`],
      )
    )
      throw new Error('The selected account is no longer available. Review this default again.');
    preferences.workplace.update(workplaceId, {
      captureCategoryDefaults: [
        ...current.filter(value => categoryDefaultKey(value) !== key),
        { ...conflicted, categoryAccountId, conflictingCategoryAccountIds: undefined },
      ],
    });
  });
}

export async function setCaptureDescriptionDefault(
  workplaceId: WorkplaceId,
  key: string,
  description?: string,
): Promise<void> {
  await runAccountingWriteSession(async () => {
    const defaults = {
      ...preferences.workplace.getSnapshot(workplaceId).captureDescriptionDefaults,
    };
    if (description?.trim()) defaults[key] = description.trim().slice(0, 200);
    else delete defaults[key];
    preferences.workplace.update(workplaceId, { captureDescriptionDefaults: defaults });
  });
}

export async function setCaptureMerchantsOpen(
  workplaceId: WorkplaceId,
  merchantsToChange: readonly string[],
  open: boolean,
): Promise<void> {
  const keys = [
    ...new Set(merchantsToChange.map(merchant => merchant.trim().toLowerCase())),
  ].filter(Boolean);
  if (keys.length === 0) return;
  await runAccountingWriteSession(async () => {
    const merchants = new Set(
      preferences.workplace.getSnapshot(workplaceId).openCaptureMerchants ?? [],
    );
    for (const key of keys) {
      if (open) merchants.add(key);
      else merchants.delete(key);
    }
    preferences.workplace.update(workplaceId, { openCaptureMerchants: [...merchants] });
  });
}

export async function setCaptureMerchantOpen(
  workplaceId: WorkplaceId,
  merchant: string,
  open: boolean,
): Promise<void> {
  return setCaptureMerchantsOpen(workplaceId, [merchant], open);
}
