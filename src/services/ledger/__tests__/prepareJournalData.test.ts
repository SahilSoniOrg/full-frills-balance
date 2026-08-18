import {
  AccountType,
  TransactionType,
  AccountId,
  WorkplaceId,
  JournalStatus,
} from '@/src/types/domain';

import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { prepareJournalData } from '@/src/services/ledger/prepareJournalData';

jest.mock('@/src/data/repositories/AccountRepository', () => ({
  accountRepository: {
    findAllByIds: jest.fn(),
  },
}));

jest.mock('@/src/data/repositories/TransactionRepository', () => ({
  transactionRepository: {
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
    (accountRepository.findAllByIds as jest.Mock).mockResolvedValue([
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
    expect(accountRepository.findAllByIds).not.toHaveBeenCalled();
  });

  it('accepts journals when every account id resolves', async () => {
    (accountRepository.findAllByIds as jest.Mock).mockResolvedValue([
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
