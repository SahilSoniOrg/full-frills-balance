import { importRepository } from '@/src/data/repositories/ImportRepository';
import { nativePlugin } from '@/src/services/import/plugins/native-plugin';
import { integrityService } from '@/src/services/integrity-service';
import { preferences } from '@/src/utils/preferences';

// Mock dependencies
jest.mock('@/src/data/repositories/ImportRepository', () => ({
    importRepository: {
        batchInsert: jest.fn().mockResolvedValue(true),
    }
}));

jest.mock('@/src/services/integrity-service', () => ({
    integrityService: {
        resetDatabase: jest.fn().mockResolvedValue(true),
    }
}));

jest.mock('@/src/utils/preferences', () => ({
    preferences: {
        restorePreferences: jest.fn().mockResolvedValue(true),
    }
}));

describe('NativeImportPlugin', () => {
    const validNativeData = {
        version: '1.2.0',
        preferences: { userName: 'Test User' },
        accounts: [{ id: 'a1', name: 'Acc 1', accountType: 'ASSET', currencyCode: 'USD' }],
        journals: [{ id: 'j1', journalDate: '2024-01-01T00:00:00Z', currencyCode: 'USD', status: 'POSTED', totalAmount: 10, transactionCount: 2, displayType: 'EXPENSE' }],
        transactions: [{ id: 't1', accountId: 'a1', journalId: 'j1', amount: 10, transactionType: 'DEBIT', currencyCode: 'USD', transactionDate: '2024-01-01T00:00:00Z' }],
        auditLogs: [{ id: 'log1', entityType: 'account', entityId: 'a1', action: 'CREATE', changes: '{}', timestamp: Date.now() }],
        budgets: [{ id: 'b1', name: 'Food', amount: 1000, currencyCode: 'USD', startMonth: '2024-01', active: true }],
        budgetScopes: [{ id: 'bs1', budgetId: 'b1', accountId: 'a1' }],
        currencies: [{ id: 'c1', code: 'USD', symbol: '$', name: 'US Dollar', precision: 2 }],
        exchangeRates: [{ id: 'er1', fromCurrency: 'USD', toCurrency: 'INR', rate: 80, effectiveDate: '2024-01-01T00:00:00Z', source: 'manual' }],
        accountMetadata: [{ id: 'm1', accountId: 'a1', statementDay: 5 }],
    };

    describe('detect', () => {
        it('returns true for valid native format', () => {
            expect(nativePlugin.detect(validNativeData)).toBe(true);
        });

        it('returns false if version is missing', () => {
            const data = { ...validNativeData };
            delete (data as any).version;
            expect(nativePlugin.detect(data)).toBe(false);
        });

        it('returns false if categories is present (Ivy format)', () => {
            const data = { ...validNativeData, categories: [] };
            expect(nativePlugin.detect(data)).toBe(false);
        });
    });

    describe('import', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        it('performs full import process', async () => {
            const stats = await nativePlugin.import(JSON.stringify(validNativeData));

            expect(integrityService.resetDatabase).toHaveBeenCalled();
            expect(preferences.restorePreferences).toHaveBeenCalledWith(validNativeData.preferences);
            expect(importRepository.batchInsert).toHaveBeenCalled();
            expect(importRepository.batchInsert).toHaveBeenCalledWith(expect.objectContaining({
                budgets: expect.any(Array),
                budgetScopes: expect.any(Array),
                currencies: expect.any(Array),
                exchangeRates: expect.any(Array),
                accountMetadata: expect.any(Array),
            }));

            expect(stats.accounts).toBe(1);
            expect(stats.journals).toBe(1);
            expect(stats.transactions).toBe(1);
            expect(stats.budgets).toBe(1);
            expect(stats.auditLogs).toBe(1);
        });

        it('throws error for invalid JSON', async () => {
            await expect(nativePlugin.import('invalid-json')).rejects.toThrow(/Invalid JSON/);
        });

        it('throws error for missing sections', async () => {
            const incompleteData = { version: '1.0' };
            await expect(nativePlugin.import(JSON.stringify(incompleteData))).rejects.toThrow(/missing required data/);
        });
    });
});
