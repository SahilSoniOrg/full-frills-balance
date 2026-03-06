import { AccountSubtype, AccountType } from '@/src/data/models/Account';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { patternService } from '@/src/services/insight/PatternService';
import { of } from 'rxjs';
import { take } from 'rxjs/operators';

// Mock dependencies
jest.mock('@/src/data/repositories/AccountRepository');
jest.mock('@/src/data/repositories/TransactionRepository');
jest.mock('@/src/data/repositories/TransactionRawRepository');
jest.mock('@/src/data/repositories/PlannedPaymentRepository');
jest.mock('@/src/utils/logger');
jest.mock('@/src/utils/preferences', () => ({
    preferences: {
        defaultCurrencyCode: 'USD',
        dismissedPatternIds: [],
        dismissPattern: jest.fn(),
        undismissPattern: jest.fn(),
    }
}));

describe('PatternService', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Default simple mocks
        (accountRepository.observeAll as jest.Mock).mockReturnValue(of([]));
        (transactionRepository.observeByDateRange as jest.Mock).mockReturnValue(of([]));
        (plannedPaymentRepository.observeActive as jest.Mock).mockReturnValue(of([]));
        (transactionRepository.findByAccountsAndDateRange as jest.Mock).mockResolvedValue([]);
        (transactionRepository.findByJournals as jest.Mock).mockResolvedValue([]);
        (transactionRawRepository.getRecurringPatternsRaw as jest.Mock).mockResolvedValue([]);
    });

    describe('observePatterns', () => {
        it('should group slow leak expenses by subcategory instead of account id', (done) => {
            const mockAccounts = [
                { id: 'acc1', name: 'Groceries 1', accountType: AccountType.EXPENSE, accountSubtype: AccountSubtype.FOOD },
                { id: 'acc2', name: 'Groceries 2', accountType: AccountType.EXPENSE, accountSubtype: AccountSubtype.FOOD },
            ];

            const now = Date.now();
            const threeDaysAgo = now - (3 * 24 * 60 * 60 * 1000);
            const fiveWeeksAgo = now - (35 * 24 * 60 * 60 * 1000);

            const mockTransactions = [
                { id: 't1', accountId: 'acc1', amount: 60, transactionDate: fiveWeeksAgo, transactionType: 'DEBIT', currencyCode: 'USD', journalId: 'j1' },
                { id: 't2', accountId: 'acc2', amount: 60, transactionDate: fiveWeeksAgo, transactionType: 'DEBIT', currencyCode: 'USD', journalId: 'j2' },
                { id: 't3', accountId: 'acc1', amount: 20, transactionDate: threeDaysAgo, transactionType: 'DEBIT', currencyCode: 'USD', journalId: 'j3' },
                { id: 't4', accountId: 'acc2', amount: 30, transactionDate: threeDaysAgo, transactionType: 'DEBIT', currencyCode: 'USD', journalId: 'j4' },
            ];

            (accountRepository.observeAll as jest.Mock).mockReturnValue(of(mockAccounts));
            (transactionRepository.findByAccountsAndDateRange as jest.Mock).mockResolvedValue(mockTransactions);

            patternService.observePatterns().pipe(take(1)).subscribe(patterns => {
                expect(patterns).toContainEqual(
                    expect.objectContaining({
                        id: 'leak_FOOD',
                        type: 'slow-leak',
                    })
                );

                const leakPattern = patterns.find(p => p.id === 'leak_FOOD');
                expect(leakPattern?.journalIds).toContain('j3');
                expect(leakPattern?.journalIds).toContain('j4');
                done();
            });
        });

        it('should detect No Emergency Fund pattern', (done) => {
            const mockAccounts = [
                { id: 'a1', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.BANK_CHECKING },
                { id: 'a2', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.RETIREMENT },
                { id: 'a3', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.INVESTMENT },
                { id: 'a4', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.INVESTMENT },
            ];

            (accountRepository.observeAll as jest.Mock).mockReturnValue(of(mockAccounts));

            patternService.observePatterns().pipe(take(1)).subscribe(patterns => {
                expect(patterns).toContainEqual(
                    expect.objectContaining({
                        id: 'no_emergency_fund',
                        type: 'lifestyle-drift',
                    })
                );
                done();
            });
        });

        it('should detect multiple subscriptions with same amount and account by grouping by description', (done) => {
            const mockAccounts = [
                { id: 'acc1', name: 'Checking', accountType: AccountType.EXPENSE, accountSubtype: AccountSubtype.BANK_CHECKING },
            ];

            const now = Date.now();
            const oneMonthAgo = now - (30 * 24 * 60 * 60 * 1000);
            const twoMonthsAgo = now - (60 * 24 * 60 * 60 * 1000);

            // Two subscriptions of $10: Netflix and Spotify
            const mockTransactions = [
                { id: 't1', accountId: 'acc1', amount: 10, transactionDate: now, journalId: 'j1' },
                { id: 't2', accountId: 'acc1', amount: 10, transactionDate: oneMonthAgo, journalId: 'j2' },
                { id: 't3', accountId: 'acc1', amount: 10, transactionDate: twoMonthsAgo, journalId: 'j3' },
                { id: 't4', accountId: 'acc1', amount: 10, transactionDate: now - 5000, journalId: 'j4' }, // Interleaved
                { id: 't5', accountId: 'acc1', amount: 10, transactionDate: oneMonthAgo - 5000, journalId: 'j5' },
                { id: 't6', accountId: 'acc1', amount: 10, transactionDate: twoMonthsAgo - 5000, journalId: 'j6' },
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
                { accountId: 'acc1', amount: 10, currencyCode: 'USD', occurrenceCount: 6, journalIds: 'j1,j2,j3,j4,j5,j6' }
            ]);
            (transactionRepository.findByJournals as jest.Mock).mockResolvedValue(mockTransactions);
            (transactionRepository.findByAccountsAndDateRange as jest.Mock).mockResolvedValue([]);

            // Mock tx.journal.fetch()
            mockTransactions.forEach(tx => {
                (tx as any).journal = {
                    fetch: jest.fn().mockResolvedValue(mockJournals[tx.journalId as keyof typeof mockJournals])
                };
            });

            patternService.observePatterns().pipe(take(1)).subscribe(patterns => {
                const netflixPattern = patterns.find(p => p.description.includes('Netflix'));
                const spotifyPattern = patterns.find(p => p.description.includes('Spotify'));

                expect(netflixPattern).toBeDefined();
                expect(spotifyPattern).toBeDefined();
                expect(netflixPattern?.id).not.toBe(spotifyPattern?.id);
                done();
            });
        });

        it('should NOT detect No Emergency Fund pattern if they have one', (done) => {
            const mockAccounts = [
                { id: 'a1', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.BANK_CHECKING },
                { id: 'a2', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.RETIREMENT },
                { id: 'a3', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.INVESTMENT },
                { id: 'a4', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.EMERGENCY_FUND },
            ];

            (accountRepository.observeAll as jest.Mock).mockReturnValue(of(mockAccounts));

            patternService.observePatterns().pipe(take(1)).subscribe(patterns => {
                const emergencyPattern = patterns.find(p => p.id === 'no_emergency_fund');
                expect(emergencyPattern).toBeUndefined();
                done();
            });
        });
    });
});
