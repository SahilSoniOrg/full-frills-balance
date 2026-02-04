import { TransactionType } from '@/src/data/models/Transaction';
import { JournalEntryService } from '@/src/features/journal/services/JournalEntryService';
import { journalService } from '@/src/features/journal/services/JournalService';
import { accountingService } from '@/src/utils/accountingService';
import { logger } from '@/src/utils/logger';

// Mock dependencies
// Mock dependencies
jest.mock('@/src/features/journal/services/JournalService', () => ({
    journalService: {
        createJournal: jest.fn(),
        updateJournal: jest.fn()
    }
}));
jest.mock('@/src/utils/accountingService');
jest.mock('@/src/utils/logger');
jest.mock('@/src/utils/preferences', () => ({
    preferences: { defaultCurrencyCode: 'USD' }
}));

describe('JournalEntryService', () => {
    let service: JournalEntryService;

    beforeEach(() => {
        service = new JournalEntryService();
        jest.clearAllMocks();

        // Default: Balance valid
        (accountingService.validateJournal as jest.Mock).mockReturnValue({ isValid: true, imbalance: 0 });
        (accountingService.validateDistinctAccounts as jest.Mock).mockReturnValue({ isValid: true });
    });

    describe('submitJournalEntry', () => {
        const validLines = [
            { accountId: 'acc1', amount: '100', transactionType: TransactionType.DEBIT, notes: '' },
            { accountId: 'acc2', amount: '100', transactionType: TransactionType.CREDIT, notes: '' }
        ];

        it('should create new journal if no ID provided', async () => {
            const result = await service.submitJournalEntry(
                validLines as any,
                'Test Journal',
                '2024-01-01',
                '12:00:00'
            );

            expect(result.success).toBe(true);
            expect(result.action).toBe('created');
            expect(journalService.createJournal).toHaveBeenCalled();
            expect(journalService.updateJournal).not.toHaveBeenCalled();
        });

        it('should update existing journal if ID provided', async () => {
            const result = await service.submitJournalEntry(
                validLines as any,
                'Updated Journal',
                '2024-01-01',
                '12:00:00',
                'journal123'
            );

            expect(result.success).toBe(true);
            expect(result.action).toBe('updated');
            expect(journalService.updateJournal).toHaveBeenCalled();
            expect(journalService.createJournal).not.toHaveBeenCalled();
        });

        it('should fail if description is empty', async () => {
            const result = await service.submitJournalEntry(
                validLines as any,
                '',
                '2024-01-01',
                '12:00:00'
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('Description is required');
        });

        it('should fail if journal is unbalanced', async () => {
            (accountingService.validateJournal as jest.Mock).mockReturnValue({ isValid: false, imbalance: 10 });

            const result = await service.submitJournalEntry(
                validLines as any,
                'Test',
                '2024-01-01',
                '12:00:00'
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('Journal is not balanced');
        });

        it('should fail if accounts are not distinct', async () => {
            (accountingService.validateDistinctAccounts as jest.Mock).mockReturnValue({ isValid: false });

            const result = await service.submitJournalEntry(
                validLines as any,
                'Test',
                '2024-01-01',
                '12:00:00'
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('must involve at least 2 distinct accounts');
        });

        it('should handle repository errors gracefully', async () => {
            (journalService.createJournal as jest.Mock).mockRejectedValue(new Error('DB Error'));

            const result = await service.submitJournalEntry(
                validLines as any,
                'Test',
                '2024-01-01',
                '12:00:00'
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe('Failed to save transaction');
            expect(logger.error).toHaveBeenCalled();
        });
    });
});
