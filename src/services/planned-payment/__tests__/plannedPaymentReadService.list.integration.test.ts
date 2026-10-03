import { database } from '@/src/data/database/Database';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import {
  createJournalFixture,
  resetJournalIntegrationWorkplace,
  softDeleteJournalFixture,
} from '@/src/testing/journalFixtures';
import { observeAfterInitial } from '@/src/testing/observeAfterInitial';
import { JournalStatus, PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/types/enums';
import type { WorkplaceId } from '@/src/types/ids';
import { firstValueFrom, map } from 'rxjs';
import { plannedPaymentReadService } from '../plannedPaymentReadService';

describe('planned list read boundary', () => {
  it('scopes pending entries and reacts to amount/currency edits without updated_at changes', async () => {
    const { cashAccountId, expenseAccountId } = await resetJournalIntegrationWorkplace();
    const workplaceId = 'wp-1' as WorkplaceId;
    const plan = await plannedPaymentRepository.create(workplaceId, {
      name: 'Rent',
      amount: 100,
      currencyCode: 'USD',
      fromAccountId: cashAccountId,
      toAccountId: expenseAccountId,
      intervalN: 1,
      intervalType: PlannedPaymentInterval.MONTHLY,
      startDate: 1,
      nextOccurrence: 1,
      status: PlannedPaymentStatus.COMPLETED,
      isAutoPost: false,
    });
    const create = (workplace = workplaceId, status = JournalStatus.PLANNED) =>
      createJournalFixture(
        {
          plannedPaymentId: plan.id,
          journalDate: 1,
          totalAmount: 75,
          currencyCode: 'EUR',
          status,
          transactions: [],
        },
        workplace,
      );
    const saved = await create();
    const deleted = await create();
    await softDeleteJournalFixture(workplaceId, deleted.id);
    await create('other' as WorkplaceId);
    for (const status of [
      JournalStatus.POSTED,
      JournalStatus.SKIPPED,
      JournalStatus.REVERSED,
      JournalStatus.PAUSED,
    ])
      await create(workplaceId, status);
    const source = plannedPaymentReadService.observeListData(workplaceId);
    const initial = await firstValueFrom(source);
    expect(initial.items).toHaveLength(1);
    expect(initial.items[0]).toMatchObject({
      flowDirection: 'outflow',
      outstandingJournalId: saved.id,
      amount: 100,
    });
    expect(initial.savedOccurrences).toEqual([
      { plannedPaymentId: plan.id, journalId: saved.id, date: 1, amount: 75, currencyCode: 'EUR' },
    ]);

    const edited = observeAfterInitial(source.pipe(map(data => data.savedOccurrences[0])));
    await edited.initial;
    await database.write(async () => {
      await saved.update(record => {
        record.totalAmount = 88;
      });
    });
    await expect(edited.nextValue).resolves.toMatchObject({ amount: 88, currencyCode: 'EUR' });
    const currencyEdit = observeAfterInitial(source.pipe(map(data => data.savedOccurrences[0])));
    await currencyEdit.initial;
    await database.write(async () => {
      await saved.update(record => {
        record.currencyCode = 'GBP';
      });
    });
    await expect(currencyEdit.nextValue).resolves.toMatchObject({
      amount: 88,
      currencyCode: 'GBP',
    });
    expect(initial.savedOccurrences[0].amount).toBe(75);

    const settled = observeAfterInitial(source.pipe(map(data => data.savedOccurrences.length)));
    await settled.initial;
    await database.write(async () => {
      await saved.update(record => {
        record.status = JournalStatus.POSTED;
      });
    });
    await expect(settled.nextValue).resolves.toBe(0);
  });
});
