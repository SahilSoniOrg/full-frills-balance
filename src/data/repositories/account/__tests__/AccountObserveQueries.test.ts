import { database } from '@/src/data/database/Database';
import AccountMetadata from '@/src/data/models/AccountMetadata';
import { accountObserveQueries } from '@/src/data/repositories/account/AccountObserveQueries';
import { accountWriteRepository } from '@/src/data/repositories/account/AccountWriteRepository';
import { expectObserveEmitsAfterUpdate } from '@/src/testing/observeAfterInitial';
import { AccountType } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';
import { map } from 'rxjs/operators';

describe('AccountObserveQueries', () => {
  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
  });

  it('re-emits account metadata when an existing metadata row is edited', async () => {
    const workplaceId = 'wp-metadata' as WorkplaceId;
    const account = await accountWriteRepository.create({
      name: 'Credit Card',
      accountType: AccountType.LIABILITY,
      currencyCode: 'USD',
      workplaceId,
      metadata: { notes: 'Before' },
    });

    await expectObserveEmitsAfterUpdate(
      accountObserveQueries
        .observeMetadata(workplaceId, account.id)
        .pipe(map(records => records[0]?.notes)),
      async () => {
        const [metadata] = await database.collections
          .get<AccountMetadata>('account_metadata')
          .query()
          .fetch();
        await database.write(async () => {
          await metadata.update(record => {
            record.notes = 'After';
            record.updatedAt = new Date();
          });
        });
      },
      'After',
    );
  });
});
