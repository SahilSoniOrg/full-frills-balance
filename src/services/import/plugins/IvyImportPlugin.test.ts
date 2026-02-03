import { importRepository } from '@/src/data/repositories/ImportRepository';
import { ivyPlugin } from '@/src/services/import/plugins/ivy-plugin';
import { integrityService } from '@/src/services/integrity-service';

// Mock dependencies
jest.mock('@/src/data/repositories/ImportRepository', () => ({
    importRepository: {
        batchInsert: jest.fn().mockResolvedValue(true),
    }
}));

jest.mock('@/src/services/integrity-service', () => ({
    integrityService: {
        resetDatabase: jest.fn().mockResolvedValue(true),
        runStartupCheck: jest.fn().mockResolvedValue({ discrepanciesFound: 0, repairsSuccessful: true }),
    }
}));

jest.mock('@/src/utils/preferences', () => ({
    preferences: {
        setOnboardingCompleted: jest.fn().mockResolvedValue(true),
        setDefaultCurrencyCode: jest.fn().mockResolvedValue(true),
    }
}));

// Mock ID generator
jest.mock('@/src/data/database/idGenerator', () => ({
    generator: () => 'mock-id-' + Math.random(),
}));

describe('IvyImportPlugin', () => {
    const validIvyData = {
        accounts: [
            { id: 'ivy-a1', name: 'Wallet', currency: 'USD', color: 0, accountCategory: 'ASSET' }
        ],
        categories: [
            { id: 'ivy-c1', name: 'Food', color: 0 }
        ],
        transactions: [
            { id: 'ivy-t1', accountId: 'ivy-a1', type: 'EXPENSE', amount: 50, categoryId: 'ivy-c1', dateTime: '2023-01-01T10:00:00Z' }
        ]
    };

    describe('detect', () => {
        it('returns true for valid Ivy format', () => {
            expect(ivyPlugin.detect(validIvyData)).toBe(true);
        });

        it('returns false if categories is missing', () => {
            const data = { ...validIvyData };
            delete (data as any).categories;
            expect(ivyPlugin.detect(data)).toBe(false);
        });
    });

    describe('import', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        it('transforms and imports Ivy data correctly', async () => {
            const stats = await ivyPlugin.import(JSON.stringify(validIvyData));

            expect(integrityService.resetDatabase).toHaveBeenCalledWith({ seedDefaults: false });
            expect(importRepository.batchInsert).toHaveBeenCalled();

            // Should create 2 accounts (1 original + 1 category-currency specific)
            expect(stats.accounts).toBe(2);
            expect(stats.journals).toBe(1);
            expect(stats.transactions).toBe(2); // 1 Expense = 2 legs
            expect(stats.skippedTransactions).toBe(0);
            expect(stats.auditLogs).toBe(0);
        });

        it('handles multi-currency transfers correctly', async () => {
            const dataWithTransfer = {
                ...validIvyData,
                accounts: [
                    ...validIvyData.accounts,
                    { id: 'ivy-a2', name: 'Bank EUR', currency: 'EUR', color: 0, accountCategory: 'ASSET' }
                ],
                transactions: [
                    { id: 'ivy-t2', accountId: 'ivy-a1', toAccountId: 'ivy-a2', type: 'TRANSFER', amount: 100, toAmount: 85, dateTime: '2023-01-01T10:00:00Z' }
                ]
            };

            const stats = await ivyPlugin.import(JSON.stringify(dataWithTransfer));
            expect(stats.journals).toBe(1);
            expect(stats.transactions).toBe(2);

            // Check if exchange rate was calculated (100 USD / 85 EUR)
            const lastBatch = (importRepository.batchInsert as jest.Mock).mock.calls[0][0];
            const debitTx = lastBatch.transactions.find((t: any) => t.transactionType === 'DEBIT' && t.exchangeRate !== undefined);
            expect(debitTx.exchangeRate).toBeCloseTo(100 / 85);
            expect(debitTx.currencyCode).toBe('EUR');
        });

        it('skips deleted or planned transactions', async () => {
            const dataWithSkipped = {
                ...validIvyData,
                transactions: [
                    ...validIvyData.transactions,
                    { id: 'ivy-t-deleted', isDeleted: true, type: 'EXPENSE', amount: 10 },
                    { id: 'ivy-t-planned', dueDate: '2025-01-01', type: 'EXPENSE', amount: 20 }
                ]
            };

            const stats = await ivyPlugin.import(JSON.stringify(dataWithSkipped));
            expect(stats.skippedTransactions).toBe(2);
        });
    });
});
