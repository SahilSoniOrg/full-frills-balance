import { AccountType, AccountId, PlannedPaymentId, WorkplaceId } from '@/src/types/domain';
/**
 * Planned-payment command lifecycle (integration).
 */

import { database } from '@/src/data/database/Database';

import { JournalStatus } from '@/src/data/models/Journal';
import { PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/data/models/PlannedPayment';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { journalPlannedQueries } from '@/src/data/repositories/journal/journalPlannedModule';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import {
  createPlannedPayment,
  deletePlannedPayment,
  updatePlannedPayment,
} from '@/src/services/planned-payment/plannedPaymentCommands';
import { plannedPaymentService } from '@/src/services/PlannedPaymentService';

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

  it('delete soft-deletes active payment', async () => {
    const created = await createPlannedPayment(WP, baseInput());
    await deletePlannedPayment(WP, created);

    const gone = await plannedPaymentRepository.find(WP, created.id as PlannedPaymentId);
    expect(gone).toBeNull();
  });

  it('pause and resume go through service façade', async () => {
    const created = await createPlannedPayment(WP, baseInput());
    const pausedStatus = await plannedPaymentService.toggleStatus(WP, created);
    expect(pausedStatus).toBe(PlannedPaymentStatus.PAUSED);

    const paused = await plannedPaymentRepository.find(WP, created.id as PlannedPaymentId);
    expect(paused?.status).toBe(PlannedPaymentStatus.PAUSED);

    const resumedStatus = await plannedPaymentService.toggleStatus(WP, paused!);
    expect(resumedStatus).toBe(PlannedPaymentStatus.ACTIVE);
  });
});
