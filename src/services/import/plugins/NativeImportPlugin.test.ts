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
        clearPreferences: jest.fn().mockResolvedValue(true),
        setTheme: jest.fn().mockResolvedValue(true),
        setOnboardingCompleted: jest.fn().mockResolvedValue(true),
        setUserName: jest.fn().mockResolvedValue(true),
        setDefaultCurrencyCode: jest.fn().mockResolvedValue(true),
        setIsPrivacyMode: jest.fn().mockResolvedValue(true),
    }
}));

describe('NativeImportPlugin', () => {
    const validNativeData = {
        version: '1.1.0',
        preferences: { userName: 'Test User' },
        accounts: [{ id: 'a1', name: 'Acc 1' }],
        journals: [{ id: 'j1', journalDate: Date.now() }],
        transactions: [{ id: 't1', accountId: 'a1', journalId: 'j1' }],
        auditLogs: [],
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

            expect(integrityService.resetDatabase).toHaveBeenCalledWith({ seedDefaults: false });
            expect(preferences.clearPreferences).toHaveBeenCalled();
            expect(preferences.setUserName).toHaveBeenCalledWith('Test User');
            expect(importRepository.batchInsert).toHaveBeenCalled();

            expect(stats.accounts).toBe(1);
            expect(stats.journals).toBe(1);
            expect(stats.transactions).toBe(1);
            expect(stats.auditLogs).toBe(0);
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
