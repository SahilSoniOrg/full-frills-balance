import { database } from '@/src/data/database/Database';
import { exportService } from '@/src/services/export-service';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';

// Mock dependencies
jest.mock('@/src/data/database/Database');
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

            const mockQuery = {
                fetch: jest.fn()
                    .mockResolvedValueOnce(mockAccounts)      // accounts
                    .mockResolvedValueOnce(mockJournals)      // journals
                    .mockResolvedValueOnce(mockTransactions)  // transactions
            };

            (database.collections.get as jest.Mock).mockReturnValue({
                query: jest.fn().mockReturnValue(mockQuery)
            });

            (preferences.loadPreferences as jest.Mock).mockResolvedValue({ theme: 'dark' });

            const json = await exportService.exportToJSON();
            const data = JSON.parse(json);

            expect(data.version).toBe('1.0.0');
            expect(data.accounts).toHaveLength(1);
            expect(data.accounts[0].name).toBe('Cash');
            expect(data.journals).toHaveLength(1);
            expect(data.transactions).toHaveLength(1);
            expect(data.preferences.theme).toBe('dark');
        });

        it('should handle errors', async () => {
            (database.collections.get as jest.Mock).mockImplementation(() => {
                throw new Error('DB Fail');
            });

            await expect(exportService.exportToJSON()).rejects.toThrow('DB Fail');
            expect(logger.error).toHaveBeenCalled();
        });
    });

    describe('getExportSummary', () => {
        it('should return counts', async () => {
            const mockQuery = {
                fetchCount: jest.fn()
                    .mockResolvedValueOnce(5)  // accounts
                    .mockResolvedValueOnce(10) // journals
                    .mockResolvedValueOnce(20) // transactions
            };

            (database.collections.get as jest.Mock).mockReturnValue({
                query: jest.fn().mockReturnValue(mockQuery)
            });

            const summary = await exportService.getExportSummary();

            expect(summary.accounts).toBe(5);
            expect(summary.journals).toBe(10);
            expect(summary.transactions).toBe(20);
        });
    });
});
