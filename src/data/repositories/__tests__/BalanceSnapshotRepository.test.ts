import { database } from '@/src/data/database/Database';
import { AccountType, TransactionType } from '@/src/types/enums';
import { TransactionId, WorkplaceId } from '@/src/types/ids';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { balanceSnapshotRepository } from '@/src/data/repositories/BalanceSnapshotRepository';
import Transaction from '@/src/data/models/Transaction';
import { createJournalFixture } from '@/src/testing/journalFixtures';
import { Q } from '@nozbe/watermelondb';
import { resetDatabase } from '@/src/testing/resetDatabase';

describe('BalanceSnapshotRepository', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('finds latest snapshot for accounts and respects workplace isolation in ORM and raw fallback', async () => {
    const wp1 = 'wp-1' as WorkplaceId;
    const wp2 = 'wp-2' as WorkplaceId;

    const acc1 = await accountWriteRepository.create({
      name: 'Checking',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: wp1,
    });

    const foreignAcc = await accountWriteRepository.create({
      name: 'Foreign Checking',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: wp2,
    });

    const localJournal = await createJournalFixture(
      {
        journalDate: 1000,
        description: 'Local snapshot fixture',
        currencyCode: 'USD',
        transactions: [{ accountId: acc1.id, amount: 100, transactionType: TransactionType.DEBIT }],
      },
      wp1,
    );
    const foreignJournal = await createJournalFixture(
      {
        journalDate: 1000,
        description: 'Foreign snapshot fixture',
        currencyCode: 'USD',
        transactions: [
          { accountId: foreignAcc.id, amount: 500, transactionType: TransactionType.DEBIT },
        ],
      },
      wp2,
    );
    const [tx1] = await database.collections
      .get<Transaction>('transactions')
      .query(Q.where('journal_id', localJournal.id))
      .fetch();
    const [foreignTx] = await database.collections
      .get<Transaction>('transactions')
      .query(Q.where('journal_id', foreignJournal.id))
      .fetch();

    await balanceSnapshotRepository.create(wp1, {
      accountId: acc1.id,
      transactionId: tx1.id as TransactionId,
      transactionDate: 1000,
      absoluteBalance: 100,
      transactionCount: 1,
    });

    await balanceSnapshotRepository.create(wp2, {
      accountId: foreignAcc.id,
      transactionId: foreignTx.id as TransactionId,
      transactionDate: 1000,
      absoluteBalance: 500,
      transactionCount: 1,
    });

    // Query for wp-1
    const wp1Snapshots = await balanceSnapshotRepository.findLatestForAccountsRaw(
      wp1,
      [acc1.id, foreignAcc.id],
      2000,
    );

    expect(wp1Snapshots.has(acc1.id)).toBe(true);
    expect(wp1Snapshots.get(acc1.id)?.absoluteBalance).toBe(100);
    // foreignAcc snapshot from wp-2 must NOT be returned for wp-1
    expect(wp1Snapshots.has(foreignAcc.id)).toBe(false);

    // Query for wp-2
    const wp2Snapshots = await balanceSnapshotRepository.findLatestForAccountsRaw(
      wp2,
      [acc1.id, foreignAcc.id],
      2000,
    );

    expect(wp2Snapshots.has(foreignAcc.id)).toBe(true);
    expect(wp2Snapshots.get(foreignAcc.id)?.absoluteBalance).toBe(500);
    expect(wp2Snapshots.has(acc1.id)).toBe(false);
  });
});
