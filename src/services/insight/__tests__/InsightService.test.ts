import { AccountSubtype, AccountType } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';
import { AppConfig } from '@/src/constants';

import { accountObserveQueries } from '@/src/data/repositories/account';
import {
  journalObserveQueries,
  journalQueryRepository,
} from '@/src/data/repositories/journal/journalTimelineModule';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import {
  transactionObserveQueries,
  transactionQueryRepository,
} from '@/src/data/repositories/transaction';
import { insightService as patternService, Insight } from '@/src/services/insight/InsightService';
import { clearReactiveWorkplaceObservesCache } from '@/src/services/reactive/reactiveWorkplaceObserves';
import { firstValueFrom, of } from 'rxjs';
import { take } from 'rxjs/operators';

// Mock dependencies
jest.mock('@/src/data/repositories/account');
jest.mock('@/src/data/repositories/journal/journalTimelineModule');
jest.mock('@/src/data/repositories/transaction');
jest.mock('@/src/data/repositories/TransactionRawRepository');
jest.mock('@/src/data/repositories/PlannedPaymentRepository');
jest.mock('@/src/utils/logger');
jest.mock('@/src/utils/preferences', () => ({
  preferences: {
    defaultCurrencyCode: 'USD',
    insights: {
      dismissedPatternIds: [],
      dismissPattern: jest.fn(),
      undismissPattern: jest.fn(),
    },
  },
  preferencesMigration: { legacyCurrencyCode: undefined, clearLegacyCurrencyCode: jest.fn() },
}));

describe('PatternService', () => {
  afterEach(() => {
    patternService.clearCache();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    clearReactiveWorkplaceObservesCache();
    patternService.clearCache();

    // Default simple mocks
    (accountObserveQueries.observeAll as jest.Mock).mockReturnValue(of([]));
    (journalQueryRepository.findByIds as jest.Mock).mockResolvedValue([]);
    (transactionObserveQueries.observeByDateRange as jest.Mock).mockReturnValue(of([]));
    (plannedPaymentRepository.observeActive as jest.Mock).mockReturnValue(of([]));
    (transactionQueryRepository.findByAccountsAndDateRange as jest.Mock).mockResolvedValue([]);
    (transactionQueryRepository.findByJournals as jest.Mock).mockResolvedValue([]);
    (journalObserveQueries.observeStatusMeta as jest.Mock).mockReturnValue(
      of({ count: 1, lastUpdatedAt: new Date() }),
    );
    (transactionRawRepository.getRecurringPatternsRaw as jest.Mock).mockResolvedValue([]);
    (transactionRawRepository.getTransactionsMetadataRaw as jest.Mock).mockResolvedValue([]);
  });

  describe('observePatterns', () => {
    it('stops the departed workplace timer without interrupting the active workplace', async () => {
      jest.useFakeTimers();
      const firstWorkplace = 'wp-timer-one' as WorkplaceId;
      const secondWorkplace = 'wp-timer-two' as WorkplaceId;
      const firstCompleted = jest.fn();
      const secondCompleted = jest.fn();

      const firstSubscription = patternService.observePatterns(firstWorkplace).subscribe({
        complete: firstCompleted,
      });
      const secondSubscription = patternService.observePatterns(secondWorkplace).subscribe({
        complete: secondCompleted,
      });

      try {
        await jest.advanceTimersByTimeAsync(0);
        (transactionRawRepository.getRecurringPatternsRaw as jest.Mock).mockClear();

        patternService.clearCache(firstWorkplace);
        await jest.advanceTimersByTimeAsync(AppConfig.insights.refreshIntervalMs);

        expect(firstCompleted).toHaveBeenCalledTimes(1);
        expect(secondCompleted).not.toHaveBeenCalled();
        expect(transactionRawRepository.getRecurringPatternsRaw).not.toHaveBeenCalledWith(
          firstWorkplace,
          expect.any(Number),
          expect.any(Number),
        );
        expect(transactionRawRepository.getRecurringPatternsRaw).toHaveBeenCalledWith(
          secondWorkplace,
          expect.any(Number),
          expect.any(Number),
        );
      } finally {
        firstSubscription.unsubscribe();
        secondSubscription.unsubscribe();
        patternService.clearCache();
        jest.useRealTimers();
      }
    });

    it('acquires recurring candidates separately for each workplace', async () => {
      const workplaceOne = 'wp-insight-one' as WorkplaceId;
      const workplaceTwo = 'wp-insight-two' as WorkplaceId;
      const accountsByWorkplace = new Map<WorkplaceId, object[]>([
        [
          workplaceOne,
          [
            {
              id: 'expense-one',
              name: 'Workplace one expense',
              accountType: AccountType.EXPENSE,
              accountSubtype: AccountSubtype.FOOD,
            },
          ],
        ],
        [
          workplaceTwo,
          [
            {
              id: 'expense-two',
              name: 'Workplace two expense',
              accountType: AccountType.EXPENSE,
              accountSubtype: AccountSubtype.FOOD,
            },
          ],
        ],
      ]);

      (accountObserveQueries.observeAll as jest.Mock).mockImplementation(
        (workplaceId: WorkplaceId) => of(accountsByWorkplace.get(workplaceId) ?? []),
      );
      (transactionRawRepository.getRecurringPatternsRaw as jest.Mock).mockImplementation(
        (workplaceId: WorkplaceId) =>
          Promise.resolve([
            {
              accountId: workplaceId === workplaceOne ? 'expense-one' : 'expense-two',
              amount: 10,
              currencyCode: 'USD',
              description: workplaceId === workplaceOne ? 'Service one' : 'Service two',
              occurrenceCount: 3,
              journalIds: 'j1,j2,j3',
              transactionDates: '0,2592000000,5184000000',
            },
          ]),
      );

      const [workplaceOneInsights, workplaceTwoInsights] = await Promise.all([
        firstValueFrom(patternService.observePatterns(workplaceOne).pipe(take(1))),
        firstValueFrom(patternService.observePatterns(workplaceTwo).pipe(take(1))),
      ]);

      expect(transactionRawRepository.getRecurringPatternsRaw).toHaveBeenCalledWith(
        workplaceOne,
        expect.any(Number),
        expect.any(Number),
      );
      expect(transactionRawRepository.getRecurringPatternsRaw).toHaveBeenCalledWith(
        workplaceTwo,
        expect.any(Number),
        expect.any(Number),
      );
      expect(
        workplaceOneInsights.some(insight => insight.description.includes('Service one')),
      ).toBe(true);
      expect(
        workplaceOneInsights.some(insight => insight.description.includes('Service two')),
      ).toBe(false);
      expect(
        workplaceTwoInsights.some(insight => insight.description.includes('Service two')),
      ).toBe(true);
      expect(
        workplaceTwoInsights.some(insight => insight.description.includes('Service one')),
      ).toBe(false);
    });

    it('should group slow leak expenses by subcategory instead of account id', done => {
      const mockAccounts = [
        {
          id: 'acc1',
          name: 'Groceries 1',
          accountType: AccountType.EXPENSE,
          accountSubtype: AccountSubtype.FOOD,
        },
        {
          id: 'acc2',
          name: 'Groceries 2',
          accountType: AccountType.EXPENSE,
          accountSubtype: AccountSubtype.FOOD,
        },
      ];

      const now = Date.now();
      const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;
      const fiveWeeksAgo = now - 35 * 24 * 60 * 60 * 1000;

      const mockTransactions = [
        {
          id: 't1',
          accountId: 'acc1',
          amount: 60,
          transactionDate: fiveWeeksAgo,
          transactionType: 'DEBIT',
          currencyCode: 'USD',
          journalId: 'j1',
        },
        {
          id: 't2',
          accountId: 'acc2',
          amount: 60,
          transactionDate: fiveWeeksAgo,
          transactionType: 'DEBIT',
          currencyCode: 'USD',
          journalId: 'j2',
        },
        {
          id: 't3',
          accountId: 'acc1',
          amount: 20,
          transactionDate: threeDaysAgo,
          transactionType: 'DEBIT',
          currencyCode: 'USD',
          journalId: 'j3',
        },
        {
          id: 't4',
          accountId: 'acc2',
          amount: 30,
          transactionDate: threeDaysAgo,
          transactionType: 'DEBIT',
          currencyCode: 'USD',
          journalId: 'j4',
        },
      ];

      (accountObserveQueries.observeAll as jest.Mock).mockReturnValue(of(mockAccounts));
      (transactionRawRepository.getTransactionsMetadataRaw as jest.Mock).mockResolvedValue(
        mockTransactions,
      );

      patternService
        .observePatterns('test-wp' as WorkplaceId)
        .pipe(take(1))
        .subscribe((patterns: Insight[]) => {
          expect(patterns).toContainEqual(
            expect.objectContaining({
              id: 'leak_test-wp_FOOD',
              type: 'slow-leak',
            }),
          );

          const leakPattern = patterns.find((p: Insight) => p.id === 'leak_test-wp_FOOD');
          expect(leakPattern?.journalIds).toContain('j3');
          expect(leakPattern?.journalIds).toContain('j4');
          done();
        });
    });

    it('should detect No Emergency Fund pattern', done => {
      const mockAccounts = [
        { id: 'a1', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.BANK_CHECKING },
        { id: 'a2', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.RETIREMENT },
        { id: 'a3', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.INVESTMENT },
        { id: 'a4', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.INVESTMENT },
      ];

      (accountObserveQueries.observeAll as jest.Mock).mockReturnValue(of(mockAccounts));

      patternService
        .observePatterns('test-wp' as WorkplaceId)
        .pipe(take(1))
        .subscribe((patterns: Insight[]) => {
          expect(patterns).toContainEqual(
            expect.objectContaining({
              id: 'no_emergency_fund_test-wp',
              type: 'lifestyle-drift',
            }),
          );
          done();
        });
    });

    it('should detect multiple subscriptions with same amount and account by grouping by description', done => {
      const mockAccounts = [
        {
          id: 'acc1',
          name: 'Checking',
          accountType: AccountType.EXPENSE,
          accountSubtype: AccountSubtype.BANK_CHECKING,
        },
      ];

      const now = Date.now();
      const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;
      const twoMonthsAgo = now - 60 * 24 * 60 * 60 * 1000;

      // Two subscriptions of $10: Netflix and Spotify
      const mockTransactions = [
        { id: 't1', accountId: 'acc1', amount: 10, transactionDate: now, journalId: 'j1' },
        { id: 't2', accountId: 'acc1', amount: 10, transactionDate: oneMonthAgo, journalId: 'j2' },
        { id: 't3', accountId: 'acc1', amount: 10, transactionDate: twoMonthsAgo, journalId: 'j3' },
        { id: 't4', accountId: 'acc1', amount: 10, transactionDate: now - 5000, journalId: 'j4' }, // Interleaved
        {
          id: 't5',
          accountId: 'acc1',
          amount: 10,
          transactionDate: oneMonthAgo - 5000,
          journalId: 'j5',
        },
        {
          id: 't6',
          accountId: 'acc1',
          amount: 10,
          transactionDate: twoMonthsAgo - 5000,
          journalId: 'j6',
        },
      ];

      const mockJournals = {
        j1: { id: 'j1', description: 'Netflix' },
        j2: { id: 'j2', description: 'Netflix' },
        j3: { id: 'j3', description: 'Netflix' },
        j4: { id: 'j4', description: 'Spotify' },
        j5: { id: 'j5', description: 'Spotify' },
        j6: { id: 'j6', description: 'Spotify' },
      };

      (accountObserveQueries.observeAll as jest.Mock).mockReturnValue(of(mockAccounts));
      (transactionRawRepository.getRecurringPatternsRaw as jest.Mock).mockResolvedValue([
        {
          accountId: 'acc1',
          amount: 10,
          currencyCode: 'USD',
          description: 'Netflix',
          occurrenceCount: 3,
          journalIds: 'j1,j2,j3',
          transactionDates: `${twoMonthsAgo},${oneMonthAgo},${now}`,
        },
        {
          accountId: 'acc1',
          amount: 10,
          currencyCode: 'USD',
          description: 'Spotify',
          occurrenceCount: 3,
          journalIds: 'j4,j5,j6',
          transactionDates: `${twoMonthsAgo - 5000},${oneMonthAgo - 5000},${now - 5000}`,
        },
      ]);
      (transactionQueryRepository.findByJournals as jest.Mock).mockResolvedValue(mockTransactions);
      (journalQueryRepository.findByIds as jest.Mock).mockResolvedValue(
        Object.values(mockJournals),
      );
      (transactionRawRepository.getTransactionsMetadataRaw as jest.Mock).mockResolvedValue([]);

      patternService
        .observePatterns('wp1' as WorkplaceId)
        .pipe(take(1))
        .subscribe(patterns => {
          const netflixPattern = patterns.find((p: Insight) => p.description.includes('Netflix'));
          const spotifyPattern = patterns.find((p: Insight) => p.description.includes('Spotify'));

          expect(netflixPattern).toBeDefined();
          expect(spotifyPattern).toBeDefined();
          expect(netflixPattern?.id).not.toBe(spotifyPattern?.id);
          done();
        });
    });

    it('should NOT detect No Emergency Fund pattern if they have one', done => {
      const mockAccounts = [
        { id: 'a1', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.BANK_CHECKING },
        { id: 'a2', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.RETIREMENT },
        { id: 'a3', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.INVESTMENT },
        { id: 'a4', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.EMERGENCY_FUND },
      ];

      (accountObserveQueries.observeAll as jest.Mock).mockReturnValue(of(mockAccounts));

      patternService
        .observePatterns('test-wp' as WorkplaceId)
        .pipe(take(1))
        .subscribe((patterns: Insight[]) => {
          const emergencyPattern = patterns.find(
            (p: Insight) => p.id === 'no_emergency_fund_test-wp',
          );
          expect(emergencyPattern).toBeUndefined();
          done();
        });
    });
  });
});
