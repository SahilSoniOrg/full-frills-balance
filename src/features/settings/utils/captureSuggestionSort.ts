import { transactionCaptureStrings as strings } from '@/src/constants/copy/domains/transactionCaptureStrings';
import { descriptionScope } from '@/src/features/settings/utils/descriptionScope';
import type {
  CaptureReviewItem,
  HistoricalCategoryPattern,
} from '@/src/services/transaction-intelligence/captureReviewService';

export interface CaptureSuggestionsInput {
  defaulted: readonly CaptureReviewItem[];
  categoryCandidates: readonly CaptureReviewItem[];
  historicalCategorySuggestions: readonly HistoricalCategoryPattern[];
  mixedHistoricalCategoryPatterns: readonly HistoricalCategoryPattern[];
  descriptionCandidates: readonly CaptureReviewItem[];
}

export type CaptureSuggestionSort = 'latest' | 'alphabetical' | 'repeats';

export const CAPTURE_SUGGESTION_SORT_OPTIONS = [
  { id: 'latest', label: strings.historicalSortLatest },
  { id: 'alphabetical', label: strings.historicalSortAlphabetical },
  { id: 'repeats', label: strings.historicalSortRepeats },
] as const;

export function sortReviewRows(
  left: CaptureReviewItem,
  right: CaptureReviewItem,
  sort: CaptureSuggestionSort,
  title: (item: CaptureReviewItem) => string,
) {
  const nameOrder = title(left).localeCompare(title(right));
  if (sort === 'alphabetical')
    return (
      nameOrder ||
      right.journalDate - left.journalDate ||
      left.journalId.localeCompare(right.journalId)
    );
  return (
    right.journalDate - left.journalDate ||
    nameOrder ||
    left.journalId.localeCompare(right.journalId)
  );
}

export function sortHistoricalPatterns(
  left: HistoricalCategoryPattern,
  right: HistoricalCategoryPattern,
  sort: CaptureSuggestionSort,
) {
  if (sort === 'alphabetical') {
    return (
      left.merchant.localeCompare(right.merchant) ||
      right.latestJournalDate - left.latestJournalDate ||
      right.journalCount - left.journalCount
    );
  }
  if (sort === 'repeats') {
    return (
      right.journalCount - left.journalCount ||
      right.latestJournalDate - left.latestJournalDate ||
      left.merchant.localeCompare(right.merchant)
    );
  }
  return (
    right.latestJournalDate - left.latestJournalDate ||
    right.journalCount - left.journalCount ||
    left.merchant.localeCompare(right.merchant)
  );
}

function includesQuery(query: string, fields: (string | number | undefined)[]) {
  return (
    !query ||
    fields
      .filter(value => value != null)
      .join(' ')
      .toLocaleLowerCase()
      .includes(query)
  );
}

export function filterAndSortHistoricalPatterns(
  patterns: readonly HistoricalCategoryPattern[],
  search: string,
  sort: CaptureSuggestionSort,
) {
  const query = search.trim().toLocaleLowerCase();
  return patterns
    .filter(pattern =>
      includesQuery(query, [
        pattern.merchant,
        pattern.financialAccountName,
        pattern.currencyCode,
        pattern.kind,
        ...pattern.categories.map(category => category.name),
      ]),
    )
    .sort((left, right) => sortHistoricalPatterns(left, right, sort));
}

export function filterAndSortCaptureSuggestions(
  capture: CaptureSuggestionsInput,
  search: string,
  sort: CaptureSuggestionSort,
) {
  const query = search.trim().toLocaleLowerCase();
  const reviewItems = (
    values: readonly CaptureReviewItem[],
    fields: (item: CaptureReviewItem) => (string | number | undefined)[],
    title: (item: CaptureReviewItem) => string = item => item.merchantKey || item.description || '',
  ) =>
    values
      .filter(item => includesQuery(query, fields(item)))
      .sort((left, right) => sortReviewRows(left, right, sort, title));

  return {
    defaulted: reviewItems(
      capture.defaulted,
      item => [
        item.merchantKey,
        item.description,
        item.currencyCode,
        item.financialAccountName,
        item.totalAmount,
        ...(item.currentCategoryNames ?? []),
      ],
      item => item.merchantKey || item.description || '',
    ),
    category: reviewItems(
      capture.categoryCandidates,
      item => [
        item.merchantKey,
        item.description,
        item.suggestedCategoryName,
        item.suggestedDefaultAccountName,
        item.currencyCode,
        item.suggestedDefault?.kind,
        item.totalAmount,
      ],
      item => item.merchantKey || item.description || '',
    ),
    historical: filterAndSortHistoricalPatterns(
      capture.historicalCategorySuggestions,
      search,
      sort,
    ),
    mixed: filterAndSortHistoricalPatterns(capture.mixedHistoricalCategoryPatterns, search, sort),
    names: reviewItems(
      capture.descriptionCandidates,
      item => {
        const scope = descriptionScope(item);
        return [item.description, item.merchantKey, scope.amount, scope.currencyCode, scope.kind];
      },
      item => item.description || item.merchantKey || '',
    ),
  };
}
