import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import { journalObserveQueries } from '@/src/data/repositories/journal/JournalObserveQueries';
import { observeAfterInitial } from '@/src/data/repositories/__tests__/helpers/observeAfterInitial';
import { JournalDisplayType, JournalStatus } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';
import { map } from 'rxjs/operators';

describe('JournalObserveQueries', () => {
  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
  });

  it('re-emits planned journal projections when a planned journal is edited', async () => {
    const workplaceId = 'wp-planned-journals' as WorkplaceId;
    const journalDate = Date.now();
    const journal = await database.write(async () =>
      database.collections.get<Journal>('journals').create(record => {
        record.workplaceId = workplaceId;
        record.journalDate = journalDate;
        record.description = 'Rent';
        record.currencyCode = 'USD';
        record.status = JournalStatus.PLANNED;
        record.totalAmount = 1200;
        record.transactionCount = 2;
        record.displayType = JournalDisplayType.EXPENSE;
        record.createdAt = new Date();
        record.updatedAt = new Date();
      }),
    );
    const amount = observeAfterInitial(
      journalObserveQueries
        .observePlannedInRange(workplaceId, journalDate - 1000, journalDate + 1000)
        .pipe(map(items => items.find(item => item.id === journal.id)?.totalAmount)),
    );

    await amount.initial;
    await database.write(async () => {
      await journal.update(record => {
        record.totalAmount = 1400;
        record.updatedAt = new Date();
      });
    });

    await expect(amount.nextValue).resolves.toBe(1400);
  });
});
