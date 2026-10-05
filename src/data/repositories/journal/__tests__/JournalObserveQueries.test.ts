import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import { journalObserveQueries } from '@/src/data/repositories/journal/JournalObserveQueries';
import { expectObserveEmitsAfterUpdate } from '@/src/testing/observeAfterInitial';
import { JournalDisplayType, JournalStatus } from '@/src/types/enums';
import { PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import {
  createJournalFixture,
  createPlannedJournalsForPayment,
  softDeleteJournalFixture,
} from '@/src/testing/journalFixtures';
import { firstValueFrom } from 'rxjs';
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

    await expectObserveEmitsAfterUpdate(
      journalObserveQueries
        .observePlannedInRange(workplaceId, journalDate - 1000, journalDate + 1000)
        .pipe(map(items => items.find(item => item.id === journal.id)?.totalAmount)),
      async () => {
        await database.write(async () => {
          await journal.update(record => {
            record.totalAmount = 1400;
            record.updatedAt = new Date();
          });
        });
      },
      1400,
    );
  });

  it('observes all linked occurrences, scopes workplaces, excludes deleted rows, and reacts to amount edits', async () => {
    const workplaceId = 'wp-detail' as WorkplaceId;
    const plannedPaymentId = 'plan' as PlannedPaymentId;
    const linked = await createPlannedJournalsForPayment(workplaceId, plannedPaymentId, 23);
    await createJournalFixture(
      {
        journalDate: Date.now(),
        currencyCode: 'USD',
        totalAmount: 10,
        plannedPaymentId,
        status: JournalStatus.PLANNED,
        transactions: [],
      },
      'other-workplace' as WorkplaceId,
    );
    await createJournalFixture(
      {
        journalDate: Date.now(),
        currencyCode: 'USD',
        totalAmount: 10,
        plannedPaymentId: 'other-plan' as PlannedPaymentId,
        status: JournalStatus.PLANNED,
        transactions: [],
      },
      workplaceId,
    );
    await softDeleteJournalFixture(workplaceId, linked[0].id);
    const source = journalObserveQueries.observeByPlannedPayment(workplaceId, plannedPaymentId);
    expect(await firstValueFrom(source)).toHaveLength(22);

    await expectObserveEmitsAfterUpdate(
      source.pipe(map(items => items.find(item => item.id === linked[1].id)?.totalAmount)),
      async () => {
        await database.write(async () => {
          await linked[1].update(record => {
            record.totalAmount = 12.5;
          });
        });
      },
      12.5,
    );
  });
});
