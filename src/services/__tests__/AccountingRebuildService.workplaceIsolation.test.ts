import { database } from '@/src/data/database/Database';
import BalanceSnapshot from '@/src/data/models/BalanceSnapshot';
import Transaction from '@/src/data/models/Transaction';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { balanceSnapshotRepository } from '@/src/data/repositories/BalanceSnapshotRepository';
import { journalWriteRepository } from '@/src/data/repositories/journal/journalWriteModule';
import {
  transactionQueryRepository,
  transactionWriteRepository,
} from '@/src/data/repositories/transaction';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { accountingRebuildService } from '@/src/services/AccountingRebuildService';
import { AccountId, TransactionId, WorkplaceId } from '@/src/types/ids';
import { AccountType, TransactionType } from '@/src/types/enums';
import { storage } from '@/src/utils/storage';
import { Q, Model } from '@nozbe/watermelondb';

const WORKPLACE_ONE = 'wp-rebuild-isolation-1' as WorkplaceId;
const WORKPLACE_TWO = 'wp-rebuild-isolation-2' as WorkplaceId;

describe('AccountingRebuildService workplace isolation', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
  });

  it('does not update foreign transactions or delete foreign snapshots from scoped repair data', async () => {
    const targetAccount = await accountWriteRepository.create({
      name: 'Target cash',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WORKPLACE_ONE,
    });

    const foreignJournal = await journalWriteRepository.createJournalWithTransactions(
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

    jest.spyOn(transactionRawRepository, 'getRebuildDataRaw').mockResolvedValue([
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

    jest.spyOn(transactionRawRepository, 'getRebuildDataRaw').mockResolvedValue([
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
    const journal = await journalWriteRepository.createJournalWithTransactions(
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

    jest.spyOn(transactionRawRepository, 'getRebuildDataRaw').mockResolvedValue([
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

  it('throws when extraOps are attached while a rebuild lock is held', async () => {
    jest.spyOn(storage, 'getString').mockReturnValue(String(Date.now()));
    await expect(
      accountingRebuildService.rebuildAccountBalances(
        WORKPLACE_ONE,
        'acc-locked' as AccountId,
        undefined,
        [{} as Model],
      ),
    ).rejects.toThrow(/cannot attach extraOps/);
  });

  it('skips silently when a rebuild lock is held without extraOps', async () => {
    jest.spyOn(storage, 'getString').mockReturnValue(String(Date.now()));
    await expect(
      accountingRebuildService.rebuildAccountBalances(
        WORKPLACE_ONE,
        'acc-locked-empty' as AccountId,
      ),
    ).resolves.toBeUndefined();
  });

  it('scopes concurrent rebuild locks by workplace as well as account', async () => {
    const getString = jest.spyOn(storage, 'getString').mockReturnValue(undefined);
    jest.spyOn(storage, 'set').mockImplementation(() => undefined);
    jest.spyOn(storage, 'remove').mockImplementation(() => true);

    await Promise.all([
      accountingRebuildService.rebuildAccountBalances(WORKPLACE_ONE, 'same-account' as AccountId),
      accountingRebuildService.rebuildAccountBalances(WORKPLACE_TWO, 'same-account' as AccountId),
    ]);

    expect(getString).toHaveBeenCalledWith(`rebuild_lock_${WORKPLACE_ONE}__same-account`);
    expect(getString).toHaveBeenCalledWith(`rebuild_lock_${WORKPLACE_TWO}__same-account`);
  });
});
