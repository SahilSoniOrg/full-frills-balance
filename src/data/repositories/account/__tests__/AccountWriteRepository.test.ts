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

describe('AccountWriteRepository currency immutability', () => {
  const workplaceId = 'wp-account-currency' as WorkplaceId;

  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
  });

  it('rejects a changed currency before updating an account', async () => {
    const account = await accountWriteRepository.create({
      name: 'Checking',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId,
    });

    await expect(
      accountWriteRepository.update(account, { name: 'Renamed', currencyCode: 'EUR' }, workplaceId),
    ).rejects.toThrow('Account currency cannot be changed after creation');
    expect(account.name).toBe('Checking');
    expect(account.currencyCode).toBe('USD');
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
    ).toThrow('Account currency cannot be changed after creation');
  });

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
