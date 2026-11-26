import { transactionCaptureStrings } from '@/src/constants/copy/domains/transactionCaptureStrings';
import {
  filterAndSortCaptureSuggestions,
  filterAndSortHistoricalPatterns,
  sortHistoricalPatterns,
  sortReviewRows,
} from '@/src/features/settings/utils/captureSuggestionSort';
import { descriptionScope } from '@/src/features/settings/utils/descriptionScope';
import { captureDescriptionKey } from '@/src/domain/transaction-intelligence/descriptionDefaults';
import type {
  CaptureReviewItem,
  HistoricalCategoryPattern,
} from '@/src/services/transaction-intelligence/captureReviewService';
import { asAccountId, asJournalId } from '@/src/types/ids';

function reviewItem(partial: Partial<CaptureReviewItem> & Pick<CaptureReviewItem, 'journalId'>) {
  return {
    journalDate: 0,
    merchantKey: String(partial.journalId),
    description: '',
    ...partial,
  } as CaptureReviewItem;
}

function pattern(
  partial: Partial<HistoricalCategoryPattern> & Pick<HistoricalCategoryPattern, 'key' | 'merchant'>,
) {
  return {
    journalCount: 1,
    latestJournalDate: 0,
    financialAccountName: 'Cash',
    currencyCode: 'INR',
    kind: 'expense',
    categories: [{ accountId: asAccountId('c1'), name: 'Food', journalCount: 1 }],
    journalIds: [],
    categoryByJournalId: {},
    sourceCount: 1,
    ...partial,
  } as HistoricalCategoryPattern;
}

describe('captureSuggestionSort', () => {
  it('sorts review rows alphabetically then by latest date', () => {
    const left = reviewItem({
      journalId: asJournalId('a'),
      merchantKey: 'Beta',
      journalDate: 10,
    });
    const right = reviewItem({
      journalId: asJournalId('b'),
      merchantKey: 'Alpha',
      journalDate: 5,
    });
    const title = (item: CaptureReviewItem) => item.merchantKey || '';

    expect(sortReviewRows(left, right, 'alphabetical', title)).toBeGreaterThan(0);
    expect(sortReviewRows(left, right, 'latest', title)).toBeLessThan(0);
  });

  it('sorts historical patterns by latest, repeats, and alphabetical', () => {
    const older = pattern({ key: '1', merchant: 'Zebra', latestJournalDate: 1, journalCount: 9 });
    const newer = pattern({ key: '2', merchant: 'Apple', latestJournalDate: 9, journalCount: 2 });

    expect(sortHistoricalPatterns(older, newer, 'latest')).toBeGreaterThan(0);
    expect(sortHistoricalPatterns(older, newer, 'repeats')).toBeLessThan(0);
    expect(sortHistoricalPatterns(older, newer, 'alphabetical')).toBeGreaterThan(0);
  });

  it('filters historical patterns by search text', () => {
    const patterns = [
      pattern({ key: '1', merchant: 'Coffee Shop', categories: [] }),
      pattern({
        key: '2',
        merchant: 'Bookstore',
        categories: [{ accountId: asAccountId('c2'), name: 'Education', journalCount: 2 }],
      }),
    ];

    expect(filterAndSortHistoricalPatterns(patterns, 'coffee', 'latest')).toHaveLength(1);
    expect(filterAndSortHistoricalPatterns(patterns, 'education', 'latest')[0]?.key).toBe('2');
  });

  it('extracts description scope from valid keys and falls back for invalid keys', () => {
    const key = captureDescriptionKey('Cafe', 420, 'USD', 'expense');
    expect(descriptionScope({ descriptionDefaultKey: key, currencyCode: 'INR' })).toEqual({
      amount: 420,
      currencyCode: 'USD',
      kind: 'expense',
    });

    expect(descriptionScope({ descriptionDefaultKey: 'not-json', currencyCode: 'INR' })).toEqual({
      amount: undefined,
      currencyCode: 'INR',
      kind: transactionCaptureStrings.unknownType,
    });
  });

  it('filters capture suggestions with narrow input including parsed description scope', () => {
    const key = captureDescriptionKey('Cafe', 420, 'USD', 'income');
    const result = filterAndSortCaptureSuggestions(
      {
        defaulted: [],
        categoryCandidates: [],
        historicalCategorySuggestions: [],
        mixedHistoricalCategoryPatterns: [],
        descriptionCandidates: [
          reviewItem({
            journalId: asJournalId('d1'),
            description: 'Morning coffee',
            merchantKey: 'Cafe',
            currencyCode: 'INR',
            descriptionDefaultKey: key,
          }),
        ],
      },
      'income',
      'latest',
    );

    expect(result.names.map(item => item.journalId)).toEqual([asJournalId('d1')]);
  });
});
