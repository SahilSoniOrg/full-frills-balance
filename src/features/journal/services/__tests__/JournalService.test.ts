import { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { JournalService } from '@/src/services/journal/journalDomainService';
import { ledgerWriteService } from '@/src/services/ledger';
import { accountingDomainService as accountingService } from '@/src/services/accounting/AccountingDomainService';
import { JournalId, WorkplaceId } from '@/src/types/domain';

// Mock dependencies
jest.mock('@/src/data/repositories/AccountRepository');
jest.mock('@/src/data/repositories/JournalRepository');
jest.mock('@/src/data/repositories/TransactionRepository');
jest.mock('@/src/data/repositories/CurrencyRepository');
jest.mock('@/src/services/audit-service');
jest.mock('@/src/services/RebuildQueueService');
jest.mock('@/src/services/accounting/AccountingDomainService');
jest.mock('@/src/utils/logger');
jest.mock('@/src/services/ledger', () => ({
  ledgerWriteService: {
    createJournal: jest.fn(),
    createMany: jest.fn(),
    updateJournal: jest.fn(),
    deleteJournal: jest.fn(),
    recoverJournal: jest.fn(),
    postJournal: jest.fn(),
    revertToPlanned: jest.fn(),
  },
}));
jest.mock('@/src/utils/preferences', () => ({
  preferences: { defaultCurrencyCode: 'USD' },
  preferencesMigration: { legacyCurrencyCode: undefined, clearLegacyCurrencyCode: jest.fn() },
}));
jest.mock('@/src/services/WorkplaceService', () => ({
  workplaceService: {
    getCurrency: jest.fn(() => Promise.resolve('USD')),
  },
}));

describe('JournalService - saveJournalEntry', () => {
  let service: JournalService;

  beforeEach(() => {
    service = new JournalService();
    jest.clearAllMocks();

    // Default: Balance valid
    (accountingService.validateJournal as jest.Mock).mockReturnValue({
      isValid: true,
      imbalance: 0,
    });
    (accountingService.validateDistinctAccounts as jest.Mock).mockReturnValue({ isValid: true });

    // Mock account lookups
    (accountRepository.find as jest.Mock).mockResolvedValue({ id: 'acc1', currencyCode: 'USD' });
    (accountRepository.findAllByIds as jest.Mock).mockResolvedValue([
      { id: 'acc1', currencyCode: 'USD' },
      { id: 'acc2', currencyCode: 'USD' },
    ]);
  });

  describe('saveJournalEntry', () => {
    const validLines = [
      { accountId: 'acc1', amount: '100', transactionType: TransactionType.DEBIT, notes: '' },
      { accountId: 'acc2', amount: '100', transactionType: TransactionType.CREDIT, notes: '' },
    ];

    it('should create new journal if no ID provided', async () => {
      const createSpy = jest
        .spyOn(ledgerWriteService, 'createJournal')
        .mockResolvedValue({ id: 'j1' } as any);

      const result = await service.saveJournalEntry({
        lines: validLines as any,
        description: 'Test Journal',
        journalDate: '2024-01-01',
        journalTime: '12:00:00',
        workplaceId: 'wp-1' as WorkplaceId,
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('created');
      expect(createSpy).toHaveBeenCalled();
    });

    it('should update existing journal if ID provided', async () => {
      const updateSpy = jest.spyOn(service, 'updateJournal').mockResolvedValue({ id: 'j1' } as any);

      const result = await service.saveJournalEntry({
        lines: validLines as any,
        description: 'Updated Journal',
        journalDate: '2024-01-01',
        journalTime: '12:00:00',
        journalId: 'journal123' as JournalId,
        workplaceId: 'wp-1' as WorkplaceId,
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('updated');
      expect(updateSpy).toHaveBeenCalledWith(
        'journal123' as JournalId,
        expect.any(Object),
        'wp-1' as WorkplaceId,
      );
    });

    it('should fail if description is empty', async () => {
      const result = await service.saveJournalEntry({
        lines: validLines as any,
        description: '',
        journalDate: '2024-01-01',
        journalTime: '12:00:00',
        workplaceId: 'wp-1' as WorkplaceId,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Description is required');
    });

    it('should fail if journal is unbalanced', async () => {
      (accountingService.validateJournal as jest.Mock).mockReturnValue({
        isValid: false,
        imbalance: 10,
      });

      const result = await service.saveJournalEntry({
        lines: validLines as any,
        description: 'Test',
        journalDate: '2024-01-01',
        journalTime: '12:00:00',
        workplaceId: 'wp-1' as WorkplaceId,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Journal is not balanced');
    });

    it('should handle timestamp dates', async () => {
      const createSpy = jest
        .spyOn(ledgerWriteService, 'createJournal')
        .mockResolvedValue({ id: 'j1' } as any);
      const ts = Date.now();

      const result = await service.saveJournalEntry({
        lines: validLines as any,
        description: 'Test Journal',
        journalDate: ts,
        workplaceId: 'wp-1' as WorkplaceId,
      });

      expect(result.success).toBe(true);
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          journalDate: ts,
        }),
        'wp-1' as WorkplaceId,
      );
    });
  });
});
