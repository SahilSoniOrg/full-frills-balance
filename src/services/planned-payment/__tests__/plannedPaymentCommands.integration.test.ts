import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import {
  JournalStatus,
  PlannedPaymentInterval,
  PlannedPaymentStatus,
  AccountType,
  AccountId,
  JournalId,
  WorkplaceId,
} from '@/src/types/domain';
import Transaction from '@/src/data/models/Transaction';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { journalPlannedQueries } from '@/src/data/repositories/journal/journalPlannedModule';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import {
  createPlannedPayment,
  deletePlannedPayment,
  updatePlannedPayment,
} from '@/src/services/planned-payment/plannedPaymentCommands';
import { journalService } from '@/src/services/journal/journalDomainService';
import { togglePlannedPaymentStatus } from '@/src/services/planned-payment/plannedPaymentLifecycle';
import { Q } from '@nozbe/watermelondb';

const WP = 'wp-pp-cmd' as WorkplaceId;

describe('planned payment commands (integration)', () => {
  let fromAccountId: AccountId;
  let toAccountId: AccountId;

  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });

    const from = await accountWriteRepository.create({
      name: 'Checking',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const to = await accountWriteRepository.create({
      name: 'Rent',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    fromAccountId = from.id;
    toAccountId = to.id;
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

    const reloaded = await plannedPaymentRepository.find(WP, created.id);
    expect(reloaded?.name).toBe('Monthly rent');

    const journals = await journalPlannedQueries.findByPlannedPaymentIds(WP, [created.id]);
    expect(journals.length).toBeGreaterThan(0);
    expect(journals.some(j => j.status === JournalStatus.PLANNED)).toBe(true);
  });

  it('non-schedule update changes fields without resetting nextOccurrence', async () => {
    const created = await createPlannedPayment(WP, baseInput());
    const beforeNext = created.nextOccurrence;

    const updated = await updatePlannedPayment(WP, created.id, {
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

    const updated = await updatePlannedPayment(WP, created.id, {
      ...baseInput(),
      startDate: newStart,
      intervalN: 2,
    });

    expect(updated.nextOccurrence).toBe(newStart);
    expect(updated.intervalN).toBe(2);
  });

  it('delete soft-deletes active payment and cascades to unposted planned journals and transactions', async () => {
    const created = await createPlannedPayment(WP, baseInput());

    const journalsBefore = await journalPlannedQueries.findByPlannedPaymentIds(WP, [created.id]);
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

    await deletePlannedPayment(WP, created.id);

    const gone = await plannedPaymentRepository.find(WP, created.id);
    expect(gone).toBeNull();

    const journalsAfter = await journalPlannedQueries.findByPlannedPaymentIds(WP, [created.id]);
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

    const plannedJournals = await journalPlannedQueries.findByPlannedPaymentIds(WP, [created.id]);
    expect(plannedJournals.length).toBeGreaterThan(0);

    // Simulate posting one of the journals
    const postedJournal = plannedJournals[0];
    await database.write(async () => {
      await postedJournal.update(record => {
        record.status = JournalStatus.POSTED;
      });
    });

    await deletePlannedPayment(WP, created.id);

    // POSTED journal still exists and is not soft deleted
    const reloaded = await database.collections.get<Journal>('journals').find(postedJournal.id);
    expect(reloaded.deletedAt).toBeFalsy();
    expect(reloaded.status).toBe(JournalStatus.POSTED);

    // Only the POSTED journal remains; all PLANNED journals are deleted
    const remaining = await journalPlannedQueries.findByPlannedPaymentIds(WP, [created.id]);
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe(postedJournal.id);
    expect(remaining[0].status).toBe(JournalStatus.POSTED);

    const remainingPlanned = await journalPlannedQueries.findByPlannedPaymentAndStatus(
      WP,
      created.id,
      JournalStatus.PLANNED,
    );
    expect(remainingPlanned.length).toBe(0);
  });

  it('refuses to revert a posted journal to scheduled after its planned payment is deleted', async () => {
    const created = await createPlannedPayment(WP, baseInput());
    const plannedJournals = await journalPlannedQueries.findByPlannedPaymentIds(WP, [created.id]);
    const postedJournal = plannedJournals[0];
    await database.write(async () => {
      await postedJournal.update(record => {
        record.status = JournalStatus.POSTED;
      });
    });

    await deletePlannedPayment(WP, created.id);

    await expect(journalService.revertToPlanned(postedJournal.id as JournalId, WP)).rejects.toThrow(
      /planned payment was deleted/,
    );

    const reloaded = await database.collections.get<Journal>('journals').find(postedJournal.id);
    expect(reloaded.status).toBe(JournalStatus.POSTED);
  });

  it('pause and resume go through service façade', async () => {
    const created = await createPlannedPayment(WP, baseInput());
    const pausedStatus = await togglePlannedPaymentStatus(WP, created.id);
    expect(pausedStatus).toBe(PlannedPaymentStatus.PAUSED);

    const paused = await plannedPaymentRepository.find(WP, created.id);
    expect(paused?.status).toBe(PlannedPaymentStatus.PAUSED);

    const resumedStatus = await togglePlannedPaymentStatus(WP, paused!.id);
    expect(resumedStatus).toBe(PlannedPaymentStatus.ACTIVE);
  });
});
