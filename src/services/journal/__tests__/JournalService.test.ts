import { TransactionType } from '@/src/types/enums';
import { JournalId, WorkplaceId } from '@/src/types/ids';

import { accountQueryRepository } from '@/src/data/repositories/account';
import { journalEnrichmentQueries } from '@/src/data/repositories/journal/journalTimelineModule';
import { JournalService } from '@/src/services/journal/journalDomainService';
import { ledgerWriteService } from '@/src/services/ledger';

// Mock dependencies
jest.mock('@/src/data/repositories/account');
jest.mock('@/src/data/repositories/journal/journalWriteModule');
jest.mock('@/src/data/repositories/journal/journalTimelineModule');
jest.mock('@/src/data/repositories/transaction');
jest.mock('@/src/services/audit-service');
jest.mock('@/src/services/RebuildQueueService');
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

    (accountQueryRepository.find as jest.Mock).mockResolvedValue({
      id: 'acc1',
      currencyCode: 'USD',
    });
    (accountQueryRepository.findAllByIds as jest.Mock).mockResolvedValue([
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
      const unbalancedLines = [
        { accountId: 'acc1', amount: '100', transactionType: TransactionType.DEBIT, notes: '' },
        { accountId: 'acc2', amount: '90', transactionType: TransactionType.CREDIT, notes: '' },
      ];

      const result = await service.saveJournalEntry({
        lines: unbalancedLines as any,
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

describe('JournalService - suggestion cache', () => {
  let service: JournalService;

  beforeEach(() => {
    service = new JournalService();
    jest.clearAllMocks();
  });

  it('does not let an invalidated request repopulate the cache with stale data', async () => {
    const firstRequest = deferred<any>();
    const secondRequest = deferred<any>();
    (journalEnrichmentQueries.getRecentUniqueDescriptions as jest.Mock)
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);

    const initialLoad = service.getJournalSuggestions('wp-1' as WorkplaceId);
    service.clearSuggestionsCache('wp-1' as WorkplaceId);
    const refreshedLoad = service.getJournalSuggestions('wp-1' as WorkplaceId);

    firstRequest.resolve([{ description: 'old' }] as any);
    await initialLoad;
    secondRequest.resolve([{ description: 'new' }] as any);
    await refreshedLoad;

    await expect(service.getJournalSuggestions('wp-1' as WorkplaceId)).resolves.toEqual([
      { description: 'new' },
    ]);
    expect(journalEnrichmentQueries.getRecentUniqueDescriptions).toHaveBeenCalledTimes(2);
  });
});

function deferred<T>() {
  let resolve!: (result: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
