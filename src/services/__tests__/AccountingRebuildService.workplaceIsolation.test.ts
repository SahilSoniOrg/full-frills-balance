import { database } from '@/src/data/database/Database';
import BalanceSnapshot from '@/src/data/models/BalanceSnapshot';
import Transaction from '@/src/data/models/Transaction';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { balanceSnapshotRepository } from '@/src/data/repositories/BalanceSnapshotRepository';
import { createJournalFixture } from '@/src/testing/journalFixtures';
import { transactionRawRebuildQueries } from '@/src/data/repositories/raw/TransactionRawRebuildQueries';
import {
  transactionQueryRepository,
  transactionWriteRepository,
} from '@/src/data/repositories/transaction';
import { accountingRebuildService } from '@/src/services/AccountingRebuildService';
import { resetDatabase } from '@/src/testing/resetDatabase';
import { AccountId, TransactionId, WorkplaceId } from '@/src/types/ids';
import { AccountType, TransactionType } from '@/src/types/enums';
import { Q, Model } from '@nozbe/watermelondb';

const WORKPLACE_ONE = 'wp-rebuild-isolation-1' as WorkplaceId;
const WORKPLACE_TWO = 'wp-rebuild-isolation-2' as WorkplaceId;

describe('AccountingRebuildService workplace isolation', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    await resetDatabase();
  });

  it('does not update foreign transactions or delete foreign snapshots from scoped repair data', async () => {
    const targetAccount = await accountWriteRepository.create({
      name: 'Target cash',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WORKPLACE_ONE,
    });

    const foreignJournal = await createJournalFixture(
      {
        description: 'Malformed foreign link',
        journalDate: 1_000,
        currencyCode: 'USD',
        transactions: [
          {
            accountId: targetAccount.id,
            amount: 25,
            transactionType: TransactionType.DEBIT,
          },
        ],
      },
      WORKPLACE_TWO,
    );
    const [foreignTransaction] = await database.collections
      .get<Transaction>('transactions')
      .query(Q.where('workplace_id', WORKPLACE_TWO), Q.where('journal_id', foreignJournal.id))
      .fetch();
    await database.write(async () => {
      await foreignTransaction.update(transaction => {
        transaction.runningBalance = 777;
      });
    });

    const foreignSnapshot = await balanceSnapshotRepository.create(WORKPLACE_TWO, {
      accountId: targetAccount.id,
      transactionId: foreignTransaction.id,
      transactionDate: 2_000,
      absoluteBalance: 777,
      transactionCount: 1,
    });

    jest.spyOn(transactionRawRebuildQueries, 'getRebuildDataRaw').mockResolvedValue([
      {
        id: foreignTransaction.id,
        amount: 25,
        transactionType: TransactionType.DEBIT,
        transactionDate: 1_000,
        runningBalance: 777,
        createdAt: foreignTransaction.createdAt.getTime(),
      },
    ]);

    await accountingRebuildService.rebuildAccountBalances(WORKPLACE_ONE, targetAccount.id, 0);

    const unchangedForeignTransaction = await database.collections
      .get<Transaction>('transactions')
      .find(foreignTransaction.id);
    const unchangedForeignSnapshot = await database.collections
      .get<BalanceSnapshot>('balance_snapshots')
      .find(foreignSnapshot.id);

    expect(unchangedForeignTransaction.runningBalance).toBe(777);
    expect(unchangedForeignSnapshot.absoluteBalance).toBe(777);
    expect(unchangedForeignSnapshot.workplaceId).toBe(WORKPLACE_TWO);
  });

  it('does not commit when cancellation arrives during model preparation', async () => {
    const targetAccount = await accountWriteRepository.create({
      name: 'Cancellable cash',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WORKPLACE_ONE,
    });
    const controller = new AbortController();
    const batchSpy = jest.spyOn(database, 'batch');

    jest.spyOn(transactionRawRebuildQueries, 'getRebuildDataRaw').mockResolvedValue([
      {
        id: 'tx-during-cancel' as TransactionId,
        amount: 25,
        transactionType: TransactionType.DEBIT,
        transactionDate: 1_000,
        runningBalance: 0,
        createdAt: 1_000,
      },
    ]);
    jest.spyOn(transactionQueryRepository, 'findByIds').mockImplementation(async () => {
      controller.abort();
      return [];
    });

    await accountingRebuildService.rebuildAccountBalances(
      WORKPLACE_ONE,
      targetAccount.id,
      undefined,
      [],
      controller.signal,
    );

    expect(batchSpy).not.toHaveBeenCalled();
  });

  it('delegates rebuild model preparation to the scoped repositories', async () => {
    const account = await accountWriteRepository.create({
      name: 'Repository-owned cash',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WORKPLACE_ONE,
    });
    const journal = await createJournalFixture(
      {
        description: 'Rebuild preparation',
        journalDate: 1_000,
        currencyCode: 'USD',
        transactions: [
          {
            accountId: account.id,
            amount: 25,
            transactionType: TransactionType.DEBIT,
          },
        ],
      },
      WORKPLACE_ONE,
    );
    const [transaction] = await transactionQueryRepository.findByJournal(WORKPLACE_ONE, journal.id);
    await balanceSnapshotRepository.create(WORKPLACE_ONE, {
      accountId: account.id,
      transactionId: transaction.id,
      transactionDate: 2_000,
      absoluteBalance: 777,
      transactionCount: 1,
    });

    jest.spyOn(transactionRawRebuildQueries, 'getRebuildDataRaw').mockResolvedValue([
      {
        id: transaction.id,
        amount: 25,
        transactionType: TransactionType.DEBIT,
        transactionDate: 1_000,
        runningBalance: 0,
        createdAt: transaction.createdAt.getTime(),
      },
    ]);
    const runningBalanceUpdateSpy = jest.spyOn(
      transactionWriteRepository,
      'prepareRunningBalanceUpdate',
    );
    const snapshotDeleteSpy = jest.spyOn(balanceSnapshotRepository, 'prepareDeleteForAccount');
    const accountRefreshSpy = jest.spyOn(accountWriteRepository, 'prepareRefresh');

    await accountingRebuildService.rebuildAccountBalances(WORKPLACE_ONE, account.id, 0);

    expect(runningBalanceUpdateSpy).toHaveBeenCalledWith(WORKPLACE_ONE, transaction, 25);
    expect(snapshotDeleteSpy).toHaveBeenCalledWith(
      WORKPLACE_ONE,
      account.id,
      expect.objectContaining({ accountId: account.id }),
    );
    expect(accountRefreshSpy).toHaveBeenCalledWith(WORKPLACE_ONE, account);
  });
});

describe('AccountingRebuildService lock vs extraOps', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects audit operations on a rebuild already in progress', async () => {
    let finish!: (result: boolean) => void;
    jest.spyOn(accountingRebuildService, 'rebuildAccountBalancesInternal').mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    );
    const accountId = 'acc-locked' as AccountId;
    const active = accountingRebuildService.rebuildAccountBalances(WORKPLACE_ONE, accountId);
    try {
      await expect(
        accountingRebuildService.rebuildAccountBalances(WORKPLACE_ONE, accountId, undefined, [
          {} as Model,
        ]),
      ).rejects.toThrow(/cannot attach extraOps/);
      await expect(
        accountingRebuildService.rebuildAccountBalances(WORKPLACE_ONE, accountId),
      ).resolves.toBe(false);
    } finally {
      finish(true);
      await active;
    }
  });

  it('scopes simultaneous rebuild locks by Workplace as well as account', async () => {
    const rebuild = jest
      .spyOn(accountingRebuildService, 'rebuildAccountBalancesInternal')
      .mockResolvedValue(true);
    const accountId = 'same-account' as AccountId;

    await expect(
      Promise.all([
        accountingRebuildService.rebuildAccountBalances(WORKPLACE_ONE, accountId),
        accountingRebuildService.rebuildAccountBalances(WORKPLACE_TWO, accountId),
      ]),
    ).resolves.toEqual([true, true]);
    expect(rebuild).toHaveBeenCalledTimes(2);
  });
});
