import { accountQueryRepository } from '@/src/data/repositories/account';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalTimelineModule';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { journalReadService } from '@/src/services/journal/journalReadService';
import { AccountType, JournalId, TransactionType, WorkplaceId } from '@/src/types/domain';

jest.mock('@/src/data/repositories/journal/journalTimelineModule', () => ({
  journalObserveQueries: {
    observeById: jest.fn(),
  },
  journalQueryRepository: {
    find: jest.fn(),
  },
}));

jest.mock('@/src/data/repositories/transaction', () => ({
  transactionQueryRepository: {
    findByJournal: jest.fn(),
  },
}));

jest.mock('@/src/data/repositories/account', () => ({
  accountQueryRepository: {
    findAllByIds: jest.fn(),
  },
}));

describe('JournalReadService.getJournalForEditor', () => {
  const workplaceId = 'wp-test-1' as WorkplaceId;
  const journalId = 'j-test-1' as JournalId;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when journal is not found', async () => {
    (journalQueryRepository.find as jest.Mock).mockResolvedValue(null);
    (transactionQueryRepository.findByJournal as jest.Mock).mockResolvedValue([]);

    const result = await journalReadService.getJournalForEditor(workplaceId, journalId);

    expect(result).toBeNull();
    expect(journalQueryRepository.find).toHaveBeenCalledWith(workplaceId, journalId);
    expect(transactionQueryRepository.findByJournal).toHaveBeenCalledWith(workplaceId, journalId);
  });

  it('loads journal and transactions in parallel and enriches lines', async () => {
    const mockJournal = {
      id: journalId,
      workplaceId,
      description: 'Coffee at cafe',
      notes: 'Morning coffee',
      journalDate: new Date('2024-05-01T10:00:00.000Z'),
      createdAt: new Date('2024-05-01T10:00:00.000Z'),
      updatedAt: new Date('2024-05-01T10:00:00.000Z'),
    };

    const mockTransactions = [
      {
        id: 'tx-1',
        accountId: 'acc-credit',
        amount: 5,
        currencyCode: 'USD',
        transactionType: TransactionType.CREDIT,
        notes: '',
        exchangeRate: null,
      },
      {
        id: 'tx-2',
        accountId: 'acc-debit',
        amount: 5,
        currencyCode: 'USD',
        transactionType: TransactionType.DEBIT,
        notes: '',
        exchangeRate: null,
      },
    ];

    const mockAccounts = [
      {
        id: 'acc-credit',
        name: 'Checking Account',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
      },
      {
        id: 'acc-debit',
        name: 'Dining Out',
        accountType: AccountType.EXPENSE,
        currencyCode: 'USD',
      },
    ];

    (journalQueryRepository.find as jest.Mock).mockResolvedValue(mockJournal);
    (transactionQueryRepository.findByJournal as jest.Mock).mockResolvedValue(mockTransactions);
    (accountQueryRepository.findAllByIds as jest.Mock).mockResolvedValue(mockAccounts);

    const result = await journalReadService.getJournalForEditor(workplaceId, journalId);

    expect(result).not.toBeNull();
    expect(result!.journal.description).toBe('Coffee at cafe');
    expect(result!.lines).toHaveLength(2);
    expect(result!.transactionType).toBe('expense');
    expect(result!.forceAdvancedMode).toBe(false);
    expect(accountQueryRepository.findAllByIds).toHaveBeenCalledWith(workplaceId, [
      'acc-credit',
      'acc-debit',
    ]);
  });
});
