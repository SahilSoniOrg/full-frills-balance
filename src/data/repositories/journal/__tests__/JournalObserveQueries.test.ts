import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import { journalObserveQueries } from '@/src/data/repositories/journal/JournalObserveQueries';
import { observeAfterInitial } from '@/src/testing/observeAfterInitial';
import { JournalDisplayType, JournalStatus } from '@/src/types/enums';
import { PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { createJournalFixture, softDeleteJournalFixture } from '@/src/testing/journalFixtures';
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

  it('observes all linked occurrences, scopes workplaces, excludes deleted rows, and reacts to amount edits', async () => {
    const workplaceId = 'wp-detail' as WorkplaceId;
    const plannedPaymentId = 'plan' as PlannedPaymentId;
    const create = (workplace: WorkplaceId, plan: PlannedPaymentId) =>
      createJournalFixture(
        {
          journalDate: Date.now(),
          currencyCode: 'USD',
          totalAmount: 10,
          plannedPaymentId: plan,
          status: JournalStatus.PLANNED,
          transactions: [],
        },
        workplace,
      );
    const linked: Journal[] = [];
    for (let index = 0; index < 23; index++)
      linked.push(await create(workplaceId, plannedPaymentId));
    await create('other-workplace' as WorkplaceId, plannedPaymentId);
    await create(workplaceId, 'other-plan' as PlannedPaymentId);
    await softDeleteJournalFixture(workplaceId, linked[0].id);
    const source = journalObserveQueries.observeByPlannedPayment(workplaceId, plannedPaymentId);
    expect(await firstValueFrom(source)).toHaveLength(22);
    const updated = observeAfterInitial(
      source.pipe(map(items => items.find(item => item.id === linked[1].id)?.totalAmount)),
    );
    await updated.initial;
    await database.write(async () => {
      await linked[1].update(record => {
        record.totalAmount = 12.5;
      });
    });
    await expect(updated.nextValue).resolves.toBe(12.5);
  });
});
