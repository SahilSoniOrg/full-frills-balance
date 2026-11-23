import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import { AccountType } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';
import { mergeAccounts } from '@/src/services/accounts/accountMergeCommands';
import { resetDatabase } from '@/src/testing/resetDatabase';

const WORKPLACE_A = 'wp-account-merge-a' as WorkplaceId;
const WORKPLACE_B = 'wp-account-merge-b' as WorkplaceId;

describe('AccountMergeOperations', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 15_000);

  it('rejects a mixed-workplace source list without mutating either source', async () => {
    const target = await accountWriteRepository.create({
      name: 'Target',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WORKPLACE_A,
    });
    const localSource = await accountWriteRepository.create({
      name: 'Local source',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WORKPLACE_A,
    });
    const foreignSource = await accountWriteRepository.create({
      name: 'Foreign source',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WORKPLACE_B,
    });
    const foreignUpdatedAt = foreignSource.updatedAt.getTime();

    await expect(
      mergeAccounts(WORKPLACE_A, target.id, [localSource.id, foreignSource.id]),
    ).rejects.toThrow();

    const [unchangedLocalSource, unchangedForeignSource] = await Promise.all([
      accountQueryRepository.findWithDeleted(WORKPLACE_A, localSource.id),
      accountQueryRepository.findWithDeleted(WORKPLACE_B, foreignSource.id),
    ]);

    expect(unchangedLocalSource?.deletedAt).toBeNull();
    expect(unchangedLocalSource?.updatedAt.getTime()).toBe(localSource.updatedAt.getTime());
    expect(unchangedForeignSource?.deletedAt).toBeNull();
    expect(unchangedForeignSource?.updatedAt.getTime()).toBe(foreignUpdatedAt);
  });

  it('merges same-workplace sources through the public façade and rewrites child parents', async () => {
    const target = await accountWriteRepository.create({
      name: 'Keep',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WORKPLACE_A,
    });
    const source = await accountWriteRepository.create({
      name: 'Fold',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WORKPLACE_A,
    });
    await accountWriteRepository.create({
      name: 'Existing keep child',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      parentAccountId: target.id,
      workplaceId: WORKPLACE_A,
    });
    const child = await accountWriteRepository.create({
      name: 'Fold child',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      parentAccountId: source.id,
      workplaceId: WORKPLACE_A,
    });

    await mergeAccounts(WORKPLACE_A, target.id, [source.id]);

    const [movedChild, deletedSource, keptTarget] = await Promise.all([
      accountQueryRepository.find(WORKPLACE_A, child.id),
      accountQueryRepository.findWithDeleted(WORKPLACE_A, source.id),
      accountQueryRepository.find(WORKPLACE_A, target.id),
    ]);

    expect(keptTarget?.deletedAt).toBeNull();
    expect(movedChild?.parentAccountId).toBe(target.id);
    expect(deletedSource?.deletedAt).toBeInstanceOf(Date);
    expect(await accountQueryRepository.find(WORKPLACE_A, source.id)).toBeNull();
  });
});
