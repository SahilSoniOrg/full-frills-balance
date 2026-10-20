import { database } from '@/src/data/database/Database';
import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import { AccountType, JournalStatus, TransactionType } from '@/src/types/enums';
import Transaction from '@/src/data/models/Transaction';
import { createJournalFixture } from '@/src/testing/journalFixtures';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { resetDatabase } from '@/src/testing/resetDatabase';

describe('AccountWriteRepository refresh operations', () => {
  const localWorkplace = 'wp-account-refresh-local' as WorkplaceId;
  const foreignWorkplace = 'wp-account-refresh-foreign' as WorkplaceId;

  beforeEach(async () => {
    jest.restoreAllMocks();
    await resetDatabase();
  });

  it('refreshes only requested live accounts in the workplace', async () => {
    const localAccount = await accountWriteRepository.create({
      name: 'Local account',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: localWorkplace,
    });
    const foreignAccount = await accountWriteRepository.create({
      name: 'Foreign account',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: foreignWorkplace,
    });
    const deletedAccount = await accountWriteRepository.create({
      name: 'Deleted account',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: localWorkplace,
    });

    await database.write(async () => {
      await localAccount.update(account => {
        account.updatedAt = new Date(100);
      });
      await foreignAccount.update(account => {
        account.updatedAt = new Date(200);
      });
    });
    await accountWriteRepository.delete(localWorkplace, deletedAccount);
    const deletedUpdatedAt = deletedAccount.updatedAt.getTime();

    const batchSpy = jest.spyOn(database, 'batch');
    await accountWriteRepository.refreshAccounts(localWorkplace, [
      localAccount.id,
      foreignAccount.id,
      deletedAccount.id,
    ] as AccountId[]);

    expect(batchSpy).toHaveBeenCalledTimes(1);
    expect(batchSpy.mock.calls[0][0]).toHaveLength(1);
    expect(
      (await accountQueryRepository.find(localWorkplace, localAccount.id))?.updatedAt.getTime(),
    ).toBeGreaterThan(100);
    expect(
      (await accountQueryRepository.find(foreignWorkplace, foreignAccount.id))?.updatedAt.getTime(),
    ).toBe(200);
    expect(deletedAccount.updatedAt.getTime()).toBe(deletedUpdatedAt);
  });
});

describe('AccountWriteRepository currency history guard', () => {
  const workplaceId = 'wp-account-currency' as WorkplaceId;

  beforeEach(async () => {
    jest.restoreAllMocks();
    await resetDatabase();
  });

  it('allows changing currency when no transaction has ever been recorded', async () => {
    const account = await accountWriteRepository.create({
      name: 'Checking',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId,
    });

    const result = await accountWriteRepository.update(
      account,
      { name: 'Renamed', currencyCode: 'EUR' },
      workplaceId,
    );
    expect(account.name).toBe('Renamed');
    expect(account.currencyCode).toBe('EUR');
    expect(result.commitFacts.balanceRebuildAccountIds).toEqual([account.id]);
  });

  it('rejects a changed currency in direct batch preparation', async () => {
    const account = await accountWriteRepository.create({
      name: 'Checking',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId,
    });

    expect(() =>
      accountWriteRepository.prepareUpdateBatchOps(account, { currencyCode: 'EUR' }, null),
    ).toThrow('Account currency changes require a validated update plan');
  });

  it.each(['active', 'deleted lines', 'deleted journal', 'planned'])(
    'rejects currency changes with %s transaction history',
    async state => {
      const account = await accountWriteRepository.create({
        name: 'Checking',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        workplaceId,
      });
      const counterparty = await accountWriteRepository.create({
        name: 'Other',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        workplaceId,
      });
      const journal = await createJournalFixture(
        {
          currencyCode: 'USD',
          journalDate: Date.now(),
          status: state === 'planned' ? JournalStatus.PLANNED : JournalStatus.POSTED,
          transactions: [
            { accountId: account.id, amount: 10, transactionType: TransactionType.DEBIT },
            { accountId: counterparty.id, amount: 10, transactionType: TransactionType.CREDIT },
          ],
        },
        workplaceId,
      );
      if (state === 'deleted lines' || state === 'deleted journal') {
        const lines = await database.collections.get<Transaction>('transactions').query().fetch();
        await database.write(async () => {
          await database.batch(
            journal.prepareUpdate(record => {
              record.deletedAt = new Date();
            }),
            ...(state === 'deleted lines'
              ? lines.map(line =>
                  line.prepareUpdate(record => {
                    record.deletedAt = new Date();
                  }),
                )
              : []),
          );
        });
      }
      expect(
        await transactionQueryRepository.countByAccountIncludingDeleted(workplaceId, account.id),
      ).toBe(1);
      await expect(
        accountWriteRepository.update(
          account,
          {
            name: 'Renamed',
            currencyCode: 'EUR',
          },
          workplaceId,
        ),
      ).rejects.toThrow('including deleted transactions');
      expect(account.name).toBe('Checking');
      expect(account.currencyCode).toBe('USD');
    },
  );

  it('allows unchanged currency alongside an ordinary update', async () => {
    const account = await accountWriteRepository.create({
      name: 'Checking',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId,
    });

    await accountWriteRepository.update(
      account,
      { name: 'Renamed', currencyCode: 'USD' },
      workplaceId,
    );
    expect(account.name).toBe('Renamed');
    expect(account.currencyCode).toBe('USD');
  });
});
