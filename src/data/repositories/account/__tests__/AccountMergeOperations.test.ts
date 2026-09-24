import { database } from '@/src/data/database/Database';
import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import { AccountType } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';
import { mergeAccounts } from '@/src/services/accounts/accountMergeCommands';

const WORKPLACE_A = 'wp-account-merge-a' as WorkplaceId;
const WORKPLACE_B = 'wp-account-merge-b' as WorkplaceId;

describe('AccountMergeOperations', () => {
  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
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
});
