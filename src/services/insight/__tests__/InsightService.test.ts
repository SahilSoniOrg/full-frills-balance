import { AccountSubtype, AccountType } from '@/src/data/models/Account';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { insightService as patternService, Insight } from '@/src/services/insight/InsightService';
import { clearReactiveWorkplaceObservesCache } from '@/src/services/reactive/reactiveWorkplaceObserves';
import { of } from 'rxjs';
import { take } from 'rxjs/operators';
import { WorkplaceId } from '@/src/types/domain';

// Mock dependencies
jest.mock('@/src/data/repositories/AccountRepository');
jest.mock('@/src/data/repositories/JournalRepository');
jest.mock('@/src/data/repositories/TransactionRepository');
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
  beforeEach(() => {
    jest.clearAllMocks();
    clearReactiveWorkplaceObservesCache();
    patternService.clearCache();

    // Default simple mocks
    (accountRepository.observeAll as jest.Mock).mockReturnValue(of([]));
    (journalRepository.findByIds as jest.Mock).mockResolvedValue([]);
    (transactionRepository.observeByDateRange as jest.Mock).mockReturnValue(of([]));
    (plannedPaymentRepository.observeActive as jest.Mock).mockReturnValue(of([]));
    (transactionRepository.findByAccountsAndDateRange as jest.Mock).mockResolvedValue([]);
    (transactionRepository.findByJournals as jest.Mock).mockResolvedValue([]);
    (journalRepository.observeStatusMeta as jest.Mock).mockReturnValue(
      of({ count: 1, lastUpdatedAt: new Date() }),
    );
    (transactionRawRepository.getRecurringPatternsRaw as jest.Mock).mockResolvedValue([]);
    (transactionRawRepository.getTransactionsMetadataRaw as jest.Mock).mockResolvedValue([]);
  });

  describe('observePatterns', () => {
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

      (accountRepository.observeAll as jest.Mock).mockReturnValue(of(mockAccounts));
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

      (accountRepository.observeAll as jest.Mock).mockReturnValue(of(mockAccounts));

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

      (accountRepository.observeAll as jest.Mock).mockReturnValue(of(mockAccounts));
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
      (transactionRepository.findByJournals as jest.Mock).mockResolvedValue(mockTransactions);
      (journalRepository.findByIds as jest.Mock).mockResolvedValue(Object.values(mockJournals));
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

      (accountRepository.observeAll as jest.Mock).mockReturnValue(of(mockAccounts));

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
