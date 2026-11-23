import {
  journalCaptureQueries,
  type CaptureReviewItem,
} from '@/src/data/repositories/journal/JournalCaptureQueries';
import type { JournalId, WorkplaceId } from '@/src/types/ids';
import { preferences } from '@/src/services/preferences';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { journalHistoricalCaptureQueries } from '@/src/data/repositories/journal/JournalHistoricalCaptureQueries';
import { categoryDefaultKey } from '@/src/domain/transaction-intelligence/categoryDefaults';
import { ensureHistoricalSmsBackfill } from './captureReviewHistorical';

/** Lightweight overview count; it deliberately avoids loading transaction lines. */
export function countCaptureReviewItems(workplaceId: WorkplaceId): Promise<number> {
  return journalCaptureQueries.countNeedsCategorization(workplaceId);
}

/** All unresolved journals; presentation may page without hiding older review work. */
export async function captureItems(workplaceId: WorkplaceId): Promise<CaptureReviewItem[]> {
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
          suggestedDefaultAccount: undefined,
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
    ? await journalHistoricalCaptureQueries.listCategoryPatterns(
        workplaceId,
        preferences.workplace.getSnapshot(workplaceId).automaticTransactionCapture
          ?.uncategorizedAccountIds,
      )
    : [];
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
    historicalCategorySuggestions: visibleHistoricalPatterns.filter(
      pattern => pattern.categories.length === 1,
    ),
    mixedHistoricalCategoryPatterns,
    mixedHistoricalCategoryCount: mixedHistoricalCategoryPatterns.length,
  };
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
