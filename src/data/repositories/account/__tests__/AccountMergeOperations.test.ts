import { database } from '@/src/data/database/Database';
import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import { AccountType, WorkplaceId } from '@/src/types/domain';

const WORKPLACE_A = 'wp-account-merge-a' as WorkplaceId;
const WORKPLACE_B = 'wp-account-merge-b' as WorkplaceId;

describe('AccountMergeOperations', () => {
  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
  }, 15_000);

  it('does not delete a foreign source account included in a mixed-workplace ID list', async () => {
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

    await database.write(async () => {
      const operations = await accountWriteRepository.prepareMergeOperations(
        WORKPLACE_A,
        [localSource.id, foreignSource.id],
        target.id,
      );
      await database.batch(operations);
    });

    const [deletedLocalSource, unchangedForeignSource] = await Promise.all([
      accountQueryRepository.findWithDeleted(WORKPLACE_A, localSource.id),
      accountQueryRepository.findWithDeleted(WORKPLACE_B, foreignSource.id),
    ]);

    expect(deletedLocalSource?.deletedAt).toBeInstanceOf(Date);
    expect(unchangedForeignSource?.deletedAt).toBeNull();
    expect(unchangedForeignSource?.updatedAt.getTime()).toBe(foreignUpdatedAt);
  });
});
