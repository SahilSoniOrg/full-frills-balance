import { AccountType, TransactionType, JournalStatus } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';

import { accountQueryRepository } from '@/src/data/repositories/account';
import { prepareJournalData } from '@/src/services/journal/prepareJournalData';

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

  it('rejects a one-minor-unit FX difference at the shared ledger boundary', async () => {
    (accountQueryRepository.findAllByIds as jest.Mock).mockResolvedValue([
      { id: 'acc-thb-expense', accountType: AccountType.EXPENSE, currencyCode: 'THB' },
      { id: 'acc-inr-bank', accountType: AccountType.ASSET, currencyCode: 'INR' },
    ]);

    await expect(
      prepareJournalData(
        {
          journalDate: Date.now(),
          description: 'Trip Stay',
          currencyCode: 'INR',
          status: JournalStatus.POSTED,
          transactions: [
            {
              accountId: 'acc-thb-expense' as AccountId,
              amount: 76.82,
              transactionType: TransactionType.DEBIT,
              currencyCode: 'THB',
              exchangeRate: 2.89,
            },
            {
              accountId: 'acc-inr-bank' as AccountId,
              amount: 222,
              transactionType: TransactionType.CREDIT,
              currencyCode: 'INR',
            },
          ],
        },
        workplaceId,
      ),
    ).rejects.toThrow('0.01 INR');
  });

  it('uses the exact equal side total as the persisted journal total', async () => {
    (accountQueryRepository.findAllByIds as jest.Mock).mockResolvedValue([
      { id: 'acc-thb-expense', accountType: AccountType.EXPENSE, currencyCode: 'THB' },
      { id: 'acc-inr-bank', accountType: AccountType.ASSET, currencyCode: 'INR' },
    ]);

    const prepared = await prepareJournalData(
      {
        journalDate: Date.now(),
        description: 'Trip Stay',
        currencyCode: 'INR',
        status: JournalStatus.POSTED,
        transactions: [
          {
            accountId: 'acc-thb-expense' as AccountId,
            amount: 76.82,
            transactionType: TransactionType.DEBIT,
            currencyCode: 'THB',
            exchangeRate: 2.89,
          },
          {
            accountId: 'acc-inr-bank' as AccountId,
            amount: 222.01,
            transactionType: TransactionType.CREDIT,
            currencyCode: 'INR',
          },
        ],
      },
      workplaceId,
    );

    expect(prepared.totalAmount).toBe(222.01);
  });

  it('allows an unbalanced planned journal and records the larger side as its total', async () => {
    (accountQueryRepository.findAllByIds as jest.Mock).mockResolvedValue([
      { id: 'acc-cash', accountType: AccountType.ASSET, currencyCode: 'USD' },
      { id: 'acc-expense', accountType: AccountType.EXPENSE, currencyCode: 'USD' },
    ]);

    const prepared = await prepareJournalData(
      {
        ...balancedPayload(['acc-cash', 'acc-expense']),
        status: JournalStatus.PLANNED,
        transactions: [
          {
            accountId: 'acc-cash' as AccountId,
            amount: 10,
            transactionType: TransactionType.DEBIT,
          },
          {
            accountId: 'acc-expense' as AccountId,
            amount: 9,
            transactionType: TransactionType.CREDIT,
          },
        ],
      },
      workplaceId,
    );

    expect(prepared.balanceEvaluation.isBalanced).toBe(false);
    expect(prepared.totalAmount).toBe(10);
  });
});
