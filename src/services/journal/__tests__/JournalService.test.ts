import { AccountType, TransactionType } from '@/src/types/enums';
import { JournalId, WorkplaceId } from '@/src/types/ids';

import { accountQueryRepository } from '@/src/data/repositories/account';
import {
  journalEnrichmentQueries,
  journalQueryRepository,
} from '@/src/data/repositories/journal/journalTimelineModule';
import { JournalService } from '@/src/services/journal/journalDomainService';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { workplaceService } from '@/src/services/WorkplaceService';
import { currencyReadService } from '@/src/services/currency-read-service';
import { JournalBalanceError } from '@/src/domain/accounting/journalBalanceEvaluator';

// Mock dependencies
jest.mock('@/src/data/repositories/account');
jest.mock('@/src/data/repositories/journal/journalTimelineModule');
jest.mock('@/src/data/repositories/transaction');
jest.mock('@/src/services/audit-service');
jest.mock('@/src/services/RebuildQueueService');
jest.mock('@/src/utils/logger');
jest.mock('@/src/services/journal/JournalPersistenceService', () => ({
  journalPersistenceService: {
    put: jest.fn(),
    putAndLinkInboxRecord: jest.fn(),
    putMany: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
    recover: jest.fn(),
    bulkRestore: jest.fn(),
    revertToPlanned: jest.fn(),
    reverse: jest.fn(),
  },
}));
jest.mock('@/src/services/preferences', () => ({
  preferences: { defaultCurrencyCode: 'USD' },
  preferencesMigration: { legacyCurrencyCode: undefined, clearLegacyCurrencyCode: jest.fn() },
}));
jest.mock('@/src/services/WorkplaceService', () => ({
  workplaceService: {
    getCurrency: jest.fn(() => Promise.resolve('USD')),
  },
}));
jest.mock('@/src/services/currency-read-service', () => ({
  currencyReadService: { getPrecision: jest.fn().mockResolvedValue(2) },
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
    (journalQueryRepository.find as jest.Mock).mockResolvedValue({ currencyCode: 'USD' });
    (workplaceService.getCurrency as jest.Mock).mockResolvedValue('USD');
    (journalPersistenceService.put as jest.Mock).mockResolvedValue({ id: 'j1' });
    (journalPersistenceService.putMany as jest.Mock).mockResolvedValue([]);
    (journalPersistenceService.post as jest.Mock).mockResolvedValue({ id: 'j1' });
    (journalPersistenceService.reverse as jest.Mock).mockResolvedValue({ id: 'j1' });
  });

  describe('saveJournalEntry', () => {
    const validLines = [
      { accountId: 'acc1', amount: '100', transactionType: TransactionType.DEBIT, notes: '' },
      { accountId: 'acc2', amount: '100', transactionType: TransactionType.CREDIT, notes: '' },
    ];

    it('should create new journal if no ID provided', async () => {
      const result = await service.saveJournalEntry({
        lines: validLines as any,
        description: 'Test Journal',
        journalDate: '2024-01-01',
        journalTime: '12:00:00',
        workplaceId: 'wp-1' as WorkplaceId,
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('created');
      expect(journalPersistenceService.put).toHaveBeenCalledWith(
        expect.objectContaining({ currencyCode: 'USD' }),
        'wp-1',
      );
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

    it('validates and saves an edit in its saved currency after Workplace currency changes', async () => {
      (workplaceService.getCurrency as jest.Mock).mockResolvedValue('INR');
      (journalQueryRepository.find as jest.Mock).mockResolvedValue({ currencyCode: 'USD' });
      const updateSpy = jest.spyOn(service, 'updateJournal').mockResolvedValue({ id: 'j1' } as any);

      const result = await service.saveJournalEntry({
        lines: [
          {
            accountId: 'eur-account',
            amount: '100',
            transactionType: TransactionType.DEBIT,
            accountCurrency: 'EUR',
            exchangeRate: '1.1',
            notes: '',
          },
          {
            accountId: 'usd-account',
            amount: '110',
            transactionType: TransactionType.CREDIT,
            accountCurrency: 'USD',
            exchangeRate: '',
            notes: '',
          },
        ] as any,
        description: 'Edited foreign journal',
        journalDate: '2024-01-01',
        journalId: 'journal123' as JournalId,
        workplaceId: 'wp-1' as WorkplaceId,
      });

      expect(result).toMatchObject({ success: true, action: 'updated' });
      expect(updateSpy).toHaveBeenCalledWith(
        'journal123' as JournalId,
        expect.objectContaining({
          currencyCode: 'USD',
          transactions: expect.arrayContaining([
            expect.objectContaining({ currencyCode: 'EUR', exchangeRate: 1.1 }),
            expect.objectContaining({ currencyCode: 'USD', exchangeRate: undefined }),
          ]),
        }),
        'wp-1' as WorkplaceId,
      );
      expect(workplaceService.getCurrency).not.toHaveBeenCalled();
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
      jest
        .spyOn(journalPersistenceService, 'put')
        .mockRejectedValueOnce(
          new JournalBalanceError('Journal debits and credits differ by 10.00 USD'),
        );
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
      expect(result.error).toContain('10.00 USD');
    });

    it('should handle timestamp dates', async () => {
      const ts = Date.now();

      const result = await service.saveJournalEntry({
        lines: validLines as any,
        description: 'Test Journal',
        journalDate: ts,
        workplaceId: 'wp-1' as WorkplaceId,
      });

      expect(result.success).toBe(true);
      expect(journalPersistenceService.put).toHaveBeenCalledWith(
        expect.objectContaining({
          journalDate: ts,
        }),
        'wp-1' as WorkplaceId,
      );
    });
  });

  describe('standard journal write routes', () => {
    it('routes edits through the persistence service', async () => {
      await service.updateJournal(
        'journal123' as JournalId,
        {
          journalDate: 1_000,
          currencyCode: 'USD',
          transactions: [],
        } as any,
        'wp-1' as WorkplaceId,
      );

      expect(journalPersistenceService.put).toHaveBeenCalledWith(
        expect.objectContaining({ journalId: 'journal123' }),
        'wp-1',
      );
    });

    it('routes manual posting through the persistence service', async () => {
      await service.postJournal('journal123' as JournalId, 'wp-1' as WorkplaceId);

      expect(journalPersistenceService.post).toHaveBeenCalledWith('journal123', 'wp-1');
    });

    it('routes reversals through the persistence service', async () => {
      await service.createReversalJournal(
        'journal123' as JournalId,
        'Correction',
        'wp-1' as WorkplaceId,
      );

      expect(journalPersistenceService.reverse).toHaveBeenCalledWith(
        'journal123',
        'Correction',
        'wp-1',
      );
    });
  });

  describe('saveBulkJournalEntries', () => {
    it('rejects batches larger than the bridge-safe limit', async () => {
      const result = await service.saveBulkJournalEntries(
        Array.from({ length: 101 }, (_, index) => ({
          lines: [],
          description: `Entry ${index}`,
          journalDate: Date.now(),
          workplaceId: 'wp-1' as WorkplaceId,
        })),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('at most 100 entries');
      expect(journalPersistenceService.putMany).not.toHaveBeenCalled();
    });
  });

  describe('postPostingPlan', () => {
    const postingPlan = {
      lines: [
        {
          id: 'line-1',
          accountId: 'acc1',
          accountName: 'Cash',
          accountType: AccountType.ASSET,
          accountCurrency: 'USD',
          amount: '100',
          transactionType: TransactionType.DEBIT,
          notes: '',
          exchangeRate: '',
        },
        {
          id: 'line-2',
          accountId: 'acc2',
          accountName: 'Income',
          accountType: AccountType.INCOME,
          accountCurrency: 'USD',
          amount: '100',
          transactionType: TransactionType.CREDIT,
          notes: '',
          exchangeRate: '',
        },
      ],
      currencyCode: 'USD',
      description: 'Salary',
      date: Date.now(),
    };

    it('validates the plan against current accounts before saving', async () => {
      (accountQueryRepository.findAllByIds as jest.Mock).mockResolvedValue([
        { id: 'acc1', name: 'Cash', accountType: AccountType.ASSET, currencyCode: 'USD' },
        { id: 'acc2', name: 'Income', accountType: AccountType.INCOME, currencyCode: 'USD' },
      ]);
      const saveSpy = jest.spyOn(service, 'saveJournalEntry').mockResolvedValue({
        success: true,
        action: 'created',
      });

      const result = await service.postPostingPlan({
        plan: postingPlan as any,
        workplaceId: 'wp-1' as WorkplaceId,
      });

      expect(result).toEqual({ success: true, action: 'created' });
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: postingPlan.lines,
          description: 'Salary',
          journalDate: postingPlan.date,
          workplaceId: 'wp-1',
        }),
      );
    });

    it('does not save a plan with stale account metadata', async () => {
      const saveSpy = jest.spyOn(service, 'saveJournalEntry');

      const result = await service.postPostingPlan({
        plan: postingPlan as any,
        workplaceId: 'wp-1' as WorkplaceId,
      });

      expect(result).toEqual({ success: false, error: 'Posting line account metadata is stale' });
      expect(saveSpy).not.toHaveBeenCalled();
    });

    it('validates an advanced mixed-currency plan exactly before saving', async () => {
      (accountQueryRepository.findAllByIds as jest.Mock).mockResolvedValue([
        { id: 'acc1', name: 'Expense', accountType: AccountType.EXPENSE, currencyCode: 'EUR' },
        { id: 'acc2', name: 'Bank', accountType: AccountType.ASSET, currencyCode: 'USD' },
      ]);
      const saveSpy = jest.spyOn(service, 'saveJournalEntry').mockResolvedValue({
        success: true,
        action: 'created',
      });
      const plan = {
        ...postingPlan,
        lines: [
          {
            ...postingPlan.lines[0],
            accountName: 'Expense',
            accountType: AccountType.EXPENSE,
            accountCurrency: 'EUR',
            amount: '10.00',
            transactionType: TransactionType.DEBIT,
            exchangeRate: '1.2',
          },
          {
            ...postingPlan.lines[1],
            accountName: 'Bank',
            accountType: AccountType.ASSET,
            accountCurrency: 'USD',
            amount: '12.00',
            transactionType: TransactionType.CREDIT,
            exchangeRate: '',
          },
        ],
      };

      const result = await service.postPostingPlan({
        plan: plan as any,
        mode: 'advanced',
        workplaceId: 'wp-1' as WorkplaceId,
      });

      expect(result.success).toBe(true);
      expect(currencyReadService.getPrecision).toHaveBeenCalledWith('EUR');
      expect(currencyReadService.getPrecision).toHaveBeenCalledWith('USD');
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({ lines: plan.lines, mode: 'advanced' }),
      );
    });

    it('rejects a one-minor-unit difference in an exact advanced plan', async () => {
      (accountQueryRepository.findAllByIds as jest.Mock).mockResolvedValue([
        { id: 'acc1', name: 'Expense', accountType: AccountType.EXPENSE, currencyCode: 'EUR' },
        { id: 'acc2', name: 'Bank', accountType: AccountType.ASSET, currencyCode: 'USD' },
      ]);
      const saveSpy = jest.spyOn(service, 'saveJournalEntry');
      const plan = {
        ...postingPlan,
        lines: [
          {
            ...postingPlan.lines[0],
            accountName: 'Expense',
            accountType: AccountType.EXPENSE,
            accountCurrency: 'EUR',
            amount: '10.00',
            transactionType: TransactionType.DEBIT,
            exchangeRate: '1.2',
          },
          {
            ...postingPlan.lines[1],
            accountName: 'Bank',
            accountType: AccountType.ASSET,
            accountCurrency: 'USD',
            amount: '12.01',
            transactionType: TransactionType.CREDIT,
            exchangeRate: '',
          },
        ],
      };

      const result = await service.postPostingPlan({
        plan: plan as any,
        mode: 'advanced',
        workplaceId: 'wp-1' as WorkplaceId,
      });

      expect(result).toEqual({
        success: false,
        error: 'Journal debits and credits differ by 0.01 USD',
      });
      expect(saveSpy).not.toHaveBeenCalled();
    });

    it('keeps exact edits in the journal saved currency', async () => {
      (accountQueryRepository.findAllByIds as jest.Mock).mockResolvedValue([
        { id: 'acc1', name: 'Cash', accountType: AccountType.ASSET, currencyCode: 'USD' },
        { id: 'acc2', name: 'Income', accountType: AccountType.INCOME, currencyCode: 'USD' },
      ]);
      (journalQueryRepository.find as jest.Mock).mockResolvedValue({ currencyCode: 'USD' });
      const saveSpy = jest.spyOn(service, 'saveJournalEntry');

      const result = await service.postPostingPlan({
        plan: { ...postingPlan, currencyCode: 'INR' } as any,
        journalId: 'journal123' as JournalId,
        workplaceId: 'wp-1' as WorkplaceId,
      });

      expect(result).toEqual({
        success: false,
        error: 'Posting plan currency must match the journal currency (USD)',
      });
      expect(saveSpy).not.toHaveBeenCalled();
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
