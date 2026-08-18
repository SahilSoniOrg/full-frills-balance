import { database } from '@/src/data/database/Database';
import Journal, { JournalStatus } from '@/src/data/models/Journal';
import { PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/data/models/PlannedPayment';
import Transaction from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { journalPlannedQueries } from '@/src/data/repositories/journal/journalPlannedModule';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import {
  createPlannedPayment,
  deletePlannedPayment,
  updatePlannedPayment,
} from '@/src/services/planned-payment/plannedPaymentCommands';
import { journalService } from '@/src/services/journal/journalDomainService';
import { togglePlannedPaymentStatus } from '@/src/services/planned-payment/plannedPaymentLifecycle';
import {
  AccountType,
  AccountId,
  JournalId,
  PlannedPaymentId,
  WorkplaceId,
} from '@/src/types/domain';
import { Q } from '@nozbe/watermelondb';

const WP = 'wp-pp-cmd' as WorkplaceId;

describe('planned payment commands (integration)', () => {
  let fromAccountId: AccountId;
  let toAccountId: AccountId;

  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });

    const from = await accountRepository.create({
      name: 'Checking',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const to = await accountRepository.create({
      name: 'Rent',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    fromAccountId = from.id as AccountId;
    toAccountId = to.id as AccountId;
  }, 15000);

  const baseInput = () => ({
    name: 'Monthly rent',
    amount: 1200,
    currencyCode: 'USD',
    fromAccountId,
    toAccountId,
    intervalN: 1,
    intervalType: PlannedPaymentInterval.MONTHLY,
    startDate: new Date(2026, 0, 15).getTime(),
    isAutoPost: false,
    recurrenceDay: 15,
  });

  it('create persists payment, generates planned journals, and advances due processing', async () => {
    const created = await createPlannedPayment(WP, baseInput());

    expect(created.status).toBe(PlannedPaymentStatus.ACTIVE);
    expect(created.nextOccurrence).toBeGreaterThan(0);

    const reloaded = await plannedPaymentRepository.find(WP, created.id as PlannedPaymentId);
    expect(reloaded?.name).toBe('Monthly rent');

    const journals = await journalPlannedQueries.findByPlannedPaymentIds(WP, [
      created.id as PlannedPaymentId,
    ]);
    expect(journals.length).toBeGreaterThan(0);
    expect(journals.some(j => j.status === JournalStatus.PLANNED)).toBe(true);
  });

  it('non-schedule update changes fields without resetting nextOccurrence', async () => {
    const created = await createPlannedPayment(WP, baseInput());
    const beforeNext = created.nextOccurrence;

    const updated = await updatePlannedPayment(WP, created.id as PlannedPaymentId, {
      ...baseInput(),
      name: 'Rent (updated)',
      amount: 1300,
    });

    expect(updated.name).toBe('Rent (updated)');
    expect(updated.nextOccurrence).toBe(beforeNext);
  });

  it('schedule-changing update resets nextOccurrence to startDate', async () => {
    const created = await createPlannedPayment(WP, baseInput());
    const newStart = new Date(2026, 5, 1).getTime();

    const updated = await updatePlannedPayment(WP, created.id as PlannedPaymentId, {
      ...baseInput(),
      startDate: newStart,
      intervalN: 2,
    });

    expect(updated.nextOccurrence).toBe(newStart);
    expect(updated.intervalN).toBe(2);
  });

  it('delete soft-deletes active payment and cascades to unposted planned journals and transactions', async () => {
    const created = await createPlannedPayment(WP, baseInput());

    const journalsBefore = await journalPlannedQueries.findByPlannedPaymentIds(WP, [
      created.id as PlannedPaymentId,
    ]);
    expect(journalsBefore.length).toBeGreaterThan(0);
    const journalIds = journalsBefore.map(j => j.id);

    const txBefore = await database.collections
      .get<Transaction>('transactions')
      .query(
        Q.where('workplace_id', WP),
        Q.where('journal_id', Q.oneOf(journalIds)),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
    expect(txBefore.length).toBeGreaterThan(0);

    await deletePlannedPayment(WP, created);

    const gone = await plannedPaymentRepository.find(WP, created.id as PlannedPaymentId);
    expect(gone).toBeNull();

    const journalsAfter = await journalPlannedQueries.findByPlannedPaymentIds(WP, [
      created.id as PlannedPaymentId,
    ]);
    expect(journalsAfter.length).toBe(0);

    const txAfter = await database.collections
      .get<Transaction>('transactions')
      .query(
        Q.where('workplace_id', WP),
        Q.where('journal_id', Q.oneOf(journalIds)),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
    expect(txAfter.length).toBe(0);
  });

  it('delete preserves POSTED historical journals associated with the planned payment', async () => {
    const created = await createPlannedPayment(WP, baseInput());

    const plannedJournals = await journalPlannedQueries.findByPlannedPaymentIds(WP, [
      created.id as PlannedPaymentId,
    ]);
    expect(plannedJournals.length).toBeGreaterThan(0);

    // Simulate posting one of the journals
    const postedJournal = plannedJournals[0];
    await database.write(async () => {
      await postedJournal.update(record => {
        record.status = JournalStatus.POSTED;
      });
    });

    await deletePlannedPayment(WP, created);

    // POSTED journal still exists and is not soft deleted
    const reloaded = await database.collections.get<Journal>('journals').find(postedJournal.id);
    expect(reloaded.deletedAt).toBeFalsy();
    expect(reloaded.status).toBe(JournalStatus.POSTED);

    // Only the POSTED journal remains; all PLANNED journals are deleted
    const remaining = await journalPlannedQueries.findByPlannedPaymentIds(WP, [
      created.id as PlannedPaymentId,
    ]);
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe(postedJournal.id);
    expect(remaining[0].status).toBe(JournalStatus.POSTED);

    const remainingPlanned = await journalPlannedQueries.findByPlannedPaymentAndStatus(
      WP,
      created.id as PlannedPaymentId,
      JournalStatus.PLANNED,
    );
    expect(remainingPlanned.length).toBe(0);
  });

  it('refuses to revert a posted journal to scheduled after its planned payment is deleted', async () => {
    const created = await createPlannedPayment(WP, baseInput());
    const plannedJournals = await journalPlannedQueries.findByPlannedPaymentIds(WP, [
      created.id as PlannedPaymentId,
    ]);
    const postedJournal = plannedJournals[0];
    await database.write(async () => {
      await postedJournal.update(record => {
        record.status = JournalStatus.POSTED;
      });
    });

    await deletePlannedPayment(WP, created);

    await expect(journalService.revertToPlanned(postedJournal.id as JournalId, WP)).rejects.toThrow(
      /planned payment was deleted/,
    );

    const reloaded = await database.collections.get<Journal>('journals').find(postedJournal.id);
    expect(reloaded.status).toBe(JournalStatus.POSTED);
  });

  it('pause and resume go through service façade', async () => {
    const created = await createPlannedPayment(WP, baseInput());
    const pausedStatus = await togglePlannedPaymentStatus(WP, created);
    expect(pausedStatus).toBe(PlannedPaymentStatus.PAUSED);

    const paused = await plannedPaymentRepository.find(WP, created.id as PlannedPaymentId);
    expect(paused?.status).toBe(PlannedPaymentStatus.PAUSED);

    const resumedStatus = await togglePlannedPaymentStatus(WP, paused!);
    expect(resumedStatus).toBe(PlannedPaymentStatus.ACTIVE);
  });
});
