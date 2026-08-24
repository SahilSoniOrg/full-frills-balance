import { database } from '@/src/data/database/Database';
import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import { persistBatch } from '@/src/data/repositories/persistBatch';
import { AccountType } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';

describe('AccountWriteRepository refresh operations', () => {
  const localWorkplace = 'wp-account-refresh-local' as WorkplaceId;
  const foreignWorkplace = 'wp-account-refresh-foreign' as WorkplaceId;

  beforeEach(async () => {
    jest.restoreAllMocks();
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
  });

  it('prepares refreshes only for requested accounts in the workplace', async () => {
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
    await persistBatch(() =>
      accountWriteRepository.prepareRefreshOps(localWorkplace, [
        localAccount.id,
        foreignAccount.id,
        deletedAccount.id,
      ] as AccountId[]),
    );

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
