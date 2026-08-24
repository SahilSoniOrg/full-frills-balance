import { database } from '@/src/data/database/Database';
import { AccountType, TransactionType } from '@/src/types/enums';
import { TransactionId, WorkplaceId } from '@/src/types/ids';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { balanceSnapshotRepository } from '@/src/data/repositories/BalanceSnapshotRepository';
import { transactionWriteRepository } from '@/src/data/repositories/transaction';

describe('BalanceSnapshotRepository', () => {
  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
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

    const tx1 = await transactionWriteRepository.create(
      {
        accountId: acc1.id,
        amount: 100,
        transactionType: TransactionType.DEBIT,
        currencyCode: 'USD',
        transactionDate: 1000,
      },
      2,
      true,
      wp1,
    );

    const foreignTx = await transactionWriteRepository.create(
      {
        accountId: foreignAcc.id,
        amount: 500,
        transactionType: TransactionType.DEBIT,
        currencyCode: 'USD',
        transactionDate: 1000,
      },
      2,
      true,
      wp2,
    );

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
