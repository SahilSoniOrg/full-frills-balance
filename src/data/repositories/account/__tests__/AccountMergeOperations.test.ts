import { database } from '@/src/data/database/Database';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { AccountId, AccountType, WorkplaceId } from '@/src/types/domain';

const WORKPLACE_A = 'wp-account-merge-a' as WorkplaceId;
const WORKPLACE_B = 'wp-account-merge-b' as WorkplaceId;

describe('AccountMergeOperations', () => {
  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
  }, 15_000);

  it('does not delete a foreign source account included in a mixed-workplace ID list', async () => {
    const target = await accountRepository.create({
      name: 'Target',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WORKPLACE_A,
    });
    const localSource = await accountRepository.create({
      name: 'Local source',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WORKPLACE_A,
    });
    const foreignSource = await accountRepository.create({
      name: 'Foreign source',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WORKPLACE_B,
    });
    const foreignUpdatedAt = foreignSource.updatedAt.getTime();

    await database.write(async () => {
      const operations = await accountRepository.prepareMergeOperations(
        WORKPLACE_A,
        [localSource.id as AccountId, foreignSource.id as AccountId],
        target.id as AccountId,
      );
      await database.batch(operations);
    });

    const [deletedLocalSource, unchangedForeignSource] = await Promise.all([
      accountRepository.findWithDeleted(WORKPLACE_A, localSource.id as AccountId),
      accountRepository.findWithDeleted(WORKPLACE_B, foreignSource.id as AccountId),
    ]);

    expect(deletedLocalSource?.deletedAt).toBeInstanceOf(Date);
    expect(unchangedForeignSource?.deletedAt).toBeNull();
    expect(unchangedForeignSource?.updatedAt.getTime()).toBe(foreignUpdatedAt);
  });
});
