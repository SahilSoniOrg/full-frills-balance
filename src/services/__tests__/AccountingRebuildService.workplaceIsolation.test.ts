import { database } from '@/src/data/database/Database';
import BalanceSnapshot from '@/src/data/models/BalanceSnapshot';
import Transaction from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { balanceSnapshotRepository } from '@/src/data/repositories/BalanceSnapshotRepository';
import { journalWriteRepository } from '@/src/data/repositories/journal/journalWriteModule';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { accountingRebuildService } from '@/src/services/AccountingRebuildService';
import { AccountId, AccountType, TransactionType, WorkplaceId } from '@/src/types/domain';
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
    const targetAccount = await accountRepository.create({
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

    await accountingRebuildService.rebuildAccountBalances(
      WORKPLACE_ONE,
      targetAccount.id as AccountId,
      0,
    );

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
});
