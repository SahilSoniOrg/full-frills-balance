import { PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/data/models/PlannedPayment';
import {
  buildCreatePersistenceInput,
  buildUpdatePersistenceInput,
  isPlannedPaymentScheduleChange,
} from '@/src/services/planned-payment/plannedPaymentSchedulePolicy';
import { AccountId } from '@/src/types/domain';

describe('plannedPaymentSchedulePolicy', () => {
  const baseInput = {
    name: 'Rent',
    amount: 1000,
    currencyCode: 'USD',
    fromAccountId: 'from' as AccountId,
    toAccountId: 'to' as AccountId,
    intervalN: 1,
    intervalType: PlannedPaymentInterval.MONTHLY,
    startDate: new Date(2026, 2, 1).getTime(),
    isAutoPost: false,
    recurrenceDay: 1,
  };

  const existing = {
    startDate: baseInput.startDate,
    intervalType: PlannedPaymentInterval.MONTHLY,
    intervalN: 1,
    nextOccurrence: new Date(2026, 3, 1).getTime(),
  } as Parameters<typeof isPlannedPaymentScheduleChange>[0];

  it('detects schedule-changing edits', () => {
    expect(isPlannedPaymentScheduleChange(existing, baseInput)).toBe(false);
    expect(
      isPlannedPaymentScheduleChange(existing, {
        ...baseInput,
        intervalN: 2,
      }),
    ).toBe(true);
    expect(
      isPlannedPaymentScheduleChange(existing, {
        ...baseInput,
        intervalType: PlannedPaymentInterval.WEEKLY,
      }),
    ).toBe(true);
    expect(
      isPlannedPaymentScheduleChange(existing, {
        ...baseInput,
        startDate: baseInput.startDate + 86_400_000,
      }),
    ).toBe(true);
  });

  it('buildCreatePersistenceInput assigns active status and first occurrence', () => {
    const result = buildCreatePersistenceInput(baseInput);
    expect(result.status).toBe(PlannedPaymentStatus.ACTIVE);
    expect(result.nextOccurrence).toBeGreaterThan(0);
    expect(result.name).toBe('Rent');
  });

  it('buildUpdatePersistenceInput resets next occurrence only on schedule change', () => {
    const nonSchedule = buildUpdatePersistenceInput(existing, {
      ...baseInput,
      name: 'Rent updated',
      amount: 1100,
    });
    expect(nonSchedule.nextOccurrence).toBe(existing.nextOccurrence);
    expect(nonSchedule.name).toBe('Rent updated');

    const schedule = buildUpdatePersistenceInput(existing, {
      ...baseInput,
      intervalN: 2,
    });
    expect(schedule.nextOccurrence).toBe(baseInput.startDate);
  });
});
