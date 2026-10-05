import { AccountSubtype, AccountType } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';
import { AppConfig } from '@/src/constants';

import { accountObserveQueries } from '@/src/data/repositories/account';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { transactionRawPatternQueries } from '@/src/data/repositories/raw/TransactionRawPatternQueries';
import { transactionInsightQueries } from '@/src/data/repositories/transaction/TransactionInsightQueries';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { insightService as patternService } from '@/src/services/insight/InsightService';
import type { Insight } from '@/src/services/insight/insightTypes';
import { firstValueFrom, of } from 'rxjs';
import { take } from 'rxjs/operators';
import {
  emergencyFundAssetAccounts,
  resetInsightServiceTestState,
} from './insightServiceTestSetup';

jest.mock('@/src/data/repositories/raw/TransactionRawPatternQueries', () => ({
  transactionRawPatternQueries: { getRecurringPatternsRaw: jest.fn() },
}));
jest.mock('@/src/data/repositories/transaction/TransactionInsightQueries', () => ({
  transactionInsightQueries: { findActiveMetadata: jest.fn() },
}));

jest.mock('@/src/data/repositories/account');
jest.mock('@/src/data/repositories/journal/JournalObserveQueries');
jest.mock('@/src/data/repositories/journal/journalQueryRepository');
jest.mock('@/src/data/repositories/transaction');
jest.mock('@/src/data/repositories/PlannedPaymentRepository');
jest.mock('@/src/utils/logger');
jest.mock('@/src/services/preferences', () => ({
  preferences: {
    insights: {
      dismissedPatternIds: jest.fn(() => []),
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
    resetInsightServiceTestState();
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
        (transactionRawPatternQueries.getRecurringPatternsRaw as jest.Mock).mockClear();

        patternService.clearCache(firstWorkplace);
        await jest.advanceTimersByTimeAsync(AppConfig.insights.refreshIntervalMs);

        expect(firstCompleted).toHaveBeenCalledTimes(1);
        expect(secondCompleted).not.toHaveBeenCalled();
        expect(transactionRawPatternQueries.getRecurringPatternsRaw).not.toHaveBeenCalledWith(
          firstWorkplace,
          expect.any(Number),
          expect.any(Number),
        );
        expect(transactionRawPatternQueries.getRecurringPatternsRaw).toHaveBeenCalledWith(
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
      (transactionRawPatternQueries.getRecurringPatternsRaw as jest.Mock).mockImplementation(
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

      expect(transactionRawPatternQueries.getRecurringPatternsRaw).toHaveBeenCalledWith(
        workplaceOne,
        expect.any(Number),
        expect.any(Number),
      );
      expect(transactionRawPatternQueries.getRecurringPatternsRaw).toHaveBeenCalledWith(
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

    it('should group slow leak expenses by subcategory instead of account id', async () => {
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
      (transactionInsightQueries.findActiveMetadata as jest.Mock).mockResolvedValue(
        mockTransactions,
      );

      const patterns = await firstValueFrom(
        patternService.observePatterns('test-wp' as WorkplaceId).pipe(take(1)),
      );

      expect(patterns).toContainEqual(
        expect.objectContaining({
          id: 'leak_test-wp_FOOD',
          type: 'slow-leak',
        }),
      );

      const leakPattern = patterns.find((p: Insight) => p.id === 'leak_test-wp_FOOD');
      expect(leakPattern?.journalIds).toContain('j3');
      expect(leakPattern?.journalIds).toContain('j4');
    });

    it.each([
      [
        'detects',
        emergencyFundAssetAccounts,
        expect.objectContaining({
          id: 'no_emergency_fund_test-wp',
          type: 'lifestyle-drift',
        }),
      ],
      [
        'does not detect',
        [
          ...emergencyFundAssetAccounts,
          {
            id: 'a5',
            accountType: AccountType.ASSET,
            accountSubtype: AccountSubtype.EMERGENCY_FUND,
          },
        ],
        undefined,
      ],
    ])('%s No Emergency Fund pattern', async (_label, mockAccounts, expected) => {
      (accountObserveQueries.observeAll as jest.Mock).mockReturnValue(of(mockAccounts));

      const patterns = await firstValueFrom(
        patternService.observePatterns('test-wp' as WorkplaceId).pipe(take(1)),
      );

      if (expected) {
        expect(patterns).toContainEqual(expected);
      } else {
        expect(patterns.find((p: Insight) => p.id === 'no_emergency_fund_test-wp')).toBeUndefined();
      }
    });

    it('should detect multiple subscriptions with same amount and account by grouping by description', async () => {
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

      const mockTransactions = [
        { id: 't1', accountId: 'acc1', amount: 10, transactionDate: now, journalId: 'j1' },
        { id: 't2', accountId: 'acc1', amount: 10, transactionDate: oneMonthAgo, journalId: 'j2' },
        { id: 't3', accountId: 'acc1', amount: 10, transactionDate: twoMonthsAgo, journalId: 'j3' },
        { id: 't4', accountId: 'acc1', amount: 10, transactionDate: now - 5000, journalId: 'j4' },
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
      (transactionRawPatternQueries.getRecurringPatternsRaw as jest.Mock).mockResolvedValue([
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
      (transactionInsightQueries.findActiveMetadata as jest.Mock).mockResolvedValue([]);

      const patterns = await firstValueFrom(
        patternService.observePatterns('wp1' as WorkplaceId).pipe(take(1)),
      );

      const netflixPattern = patterns.find((p: Insight) => p.description.includes('Netflix'));
      const spotifyPattern = patterns.find((p: Insight) => p.description.includes('Spotify'));

      expect(netflixPattern).toBeDefined();
      expect(spotifyPattern).toBeDefined();
      expect(netflixPattern?.id).not.toBe(spotifyPattern?.id);
    });
  });
});
