import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { exportService } from '@/src/services/export-service';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';

// Mock dependencies
jest.mock('@/src/data/repositories/AccountRepository');
jest.mock('@/src/data/repositories/AuditRepository');
jest.mock('@/src/data/repositories/JournalRepository');
jest.mock('@/src/data/repositories/TransactionRepository');
jest.mock('@/src/utils/preferences');
jest.mock('@/src/utils/logger');

describe('ExportService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('exportToJSON', () => {
        it('should export all data correctly', async () => {
            // Mock Date for stable output
            const FIXED_DATE = new Date('2024-01-01T12:00:00Z');

            // Mock DB data
            const mockAccounts = [{
                id: 'acc1',
                name: 'Cash',
                accountType: 'ASSET',
                currencyCode: 'USD',
                createdAt: FIXED_DATE,
            }];
            const mockJournals = [{
                id: 'j1',
                journalDate: FIXED_DATE.valueOf(),
                currencyCode: 'USD',
                totalAmount: 100,
                transactionCount: 2,
                status: 'POSTED',
                createdAt: FIXED_DATE,
            }];
            const mockTransactions = [{
                id: 'tx1',
                journalId: 'j1',
                accountId: 'acc1',
                amount: 100,
                transactionType: 'DEBIT',
                currencyCode: 'USD',
                transactionDate: FIXED_DATE.valueOf(),
                createdAt: FIXED_DATE,
            }];
            const mockAuditLogs = [{
                id: 'log1',
                entityType: 'ACCOUNT',
                entityId: 'acc1',
                action: 'CREATE',
                changes: '{}',
                timestamp: FIXED_DATE.valueOf(),
                createdAt: FIXED_DATE,
            }];

            (accountRepository.findAll as jest.Mock).mockResolvedValue(mockAccounts);
            (journalRepository.findAllNonDeleted as jest.Mock).mockResolvedValue(mockJournals);
            (transactionRepository.findAllNonDeleted as jest.Mock).mockResolvedValue(mockTransactions);
            (auditRepository.findAll as jest.Mock).mockResolvedValue(mockAuditLogs);

            (preferences.loadPreferences as jest.Mock).mockResolvedValue({ theme: 'dark' });

            const json = await exportService.exportToJSON();
            const data = JSON.parse(json);

            expect(data.version).toBe('1.1.0');
            expect(data.accounts).toHaveLength(1);
            expect(data.accounts[0].name).toBe('Cash');
            expect(data.journals).toHaveLength(1);
            expect(data.transactions).toHaveLength(1);
            expect(data.auditLogs).toHaveLength(1);
            expect(data.preferences.theme).toBe('dark');
        });

        it('should handle errors', async () => {
            (accountRepository.findAll as jest.Mock).mockRejectedValue(new Error('DB Fail'));

            await expect(exportService.exportToJSON()).rejects.toThrow('DB Fail');
            expect(logger.error).toHaveBeenCalled();
        });
    });

    describe('getExportSummary', () => {
        it('should return counts', async () => {
            (accountRepository.countNonDeleted as jest.Mock).mockResolvedValue(5);
            (journalRepository.countNonDeleted as jest.Mock).mockResolvedValue(10);
            (transactionRepository.countNonDeleted as jest.Mock).mockResolvedValue(20);
            (auditRepository.countAll as jest.Mock).mockResolvedValue(3);

            const summary = await exportService.getExportSummary();

            expect(summary.accounts).toBe(5);
            expect(summary.journals).toBe(10);
            expect(summary.transactions).toBe(20);
            expect(summary.auditLogs).toBe(3);
        });
    });
});
