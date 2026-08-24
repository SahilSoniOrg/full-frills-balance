import { AccountType, TransactionType, JournalStatus } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';

import { accountQueryRepository } from '@/src/data/repositories/account';
import { prepareJournalData } from '@/src/services/ledger/prepareJournalData';

jest.mock('@/src/data/repositories/account', () => ({
  ...jest.requireActual('@/src/data/repositories/account'),

  accountQueryRepository: {
    findAllByIds: jest.fn(),
  },
}));

jest.mock('@/src/data/repositories/transaction', () => ({
  ...jest.requireActual('@/src/data/repositories/transaction'),

  transactionQueryRepository: {
    findLatestForAccountBeforeDate: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('@/src/services/currency-read-service', () => ({
  currencyReadService: {
    getPrecision: jest.fn().mockResolvedValue(2),
  },
}));

const workplaceId = 'wp-1' as WorkplaceId;

function balancedPayload(accountIds: [string, string]) {
  return {
    journalDate: Date.now(),
    description: 'Test',
    currencyCode: 'USD',
    status: JournalStatus.POSTED,
    transactions: [
      {
        accountId: accountIds[0] as AccountId,
        amount: 10,
        transactionType: TransactionType.DEBIT,
      },
      {
        accountId: accountIds[1] as AccountId,
        amount: 10,
        transactionType: TransactionType.CREDIT,
      },
    ],
  };
}

describe('prepareJournalData account validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects journals that reference a missing account id', async () => {
    (accountQueryRepository.findAllByIds as jest.Mock).mockResolvedValue([
      { id: 'acc-cash', accountType: AccountType.ASSET, currencyCode: 'USD' },
    ]);

    await expect(
      prepareJournalData(balancedPayload(['acc-cash', 'acc-gone']), workplaceId),
    ).rejects.toThrow(/missing or deleted account\(s\): acc-gone/);
  });

  it('rejects journals with a blank account id', async () => {
    await expect(
      prepareJournalData(balancedPayload(['acc-cash', '']), workplaceId),
    ).rejects.toThrow(/must have a valid accountId/);
    expect(accountQueryRepository.findAllByIds).not.toHaveBeenCalled();
  });

  it('accepts journals when every account id resolves', async () => {
    (accountQueryRepository.findAllByIds as jest.Mock).mockResolvedValue([
      { id: 'acc-cash', accountType: AccountType.ASSET, currencyCode: 'USD' },
      { id: 'acc-expense', accountType: AccountType.EXPENSE, currencyCode: 'USD' },
    ]);

    const prepared = await prepareJournalData(
      balancedPayload(['acc-cash', 'acc-expense']),
      workplaceId,
    );
    expect(prepared.transactions).toHaveLength(2);
    expect(prepared.accountsToRebuild.has('acc-cash' as AccountId)).toBe(true);
  });
});
