import { PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/types/enums';
import { AccountId } from '@/src/types/ids';
import {
  buildCreatePersistenceInput,
  buildUpdatePersistenceInput,
  isPlannedPaymentScheduleChange,
} from '@/src/services/planned-payment/plannedPaymentSchedulePolicy';

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
    ...baseInput,
    nextOccurrence: new Date(2026, 3, 1).getTime(),
    recurrenceDay: 1,
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
    expect(
      isPlannedPaymentScheduleChange(existing, {
        ...baseInput,
        recurrenceDay: 15,
      }),
    ).toBe(true);
  });

  it('treats persisted null optional recurrence fields as unchanged', () => {
    const stored = {
      ...existing,
      recurrenceDay: 1,
      recurrenceMonth: null,
    } as unknown as Parameters<typeof isPlannedPaymentScheduleChange>[0];

    expect(isPlannedPaymentScheduleChange(stored, baseInput)).toBe(false);
  });

  it.each([
    { amount: 1100 },
    { currencyCode: 'EUR' },
    { fromAccountId: 'replacement' as AccountId },
    { toAccountId: 'replacement' as AccountId },
    { fxMode: 'automatic' as const },
    { destinationAmount: 900 },
    { endDate: new Date(2026, 10, 1).getTime() },
    { isAutoPost: true },
  ])('regenerates unposted future rows for occurrence changes %p', change => {
    expect(isPlannedPaymentScheduleChange(existing, { ...baseInput, ...change })).toBe(true);
  });

  it('treats legacy null FX fields as unchanged', () => {
    const legacy = {
      ...existing,
      fxMode: null,
      destinationAmount: null,
    } as unknown as typeof existing;
    expect(isPlannedPaymentScheduleChange(legacy, baseInput)).toBe(false);
  });

  it('buildCreatePersistenceInput assigns active status and first occurrence', () => {
    const result = buildCreatePersistenceInput(baseInput);
    expect(result.status).toBe(PlannedPaymentStatus.ACTIVE);
    expect(result.nextOccurrence).toBeGreaterThan(0);
    expect(result.name).toBe('Rent');
  });

  it('buildUpdatePersistenceInput recalculates next occurrence only on schedule change', () => {
    const nonSchedule = buildUpdatePersistenceInput(
      existing,
      {
        ...baseInput,
        name: 'Rent updated',
      },
      baseInput.startDate,
    );
    expect(nonSchedule).not.toHaveProperty('nextOccurrence');
    expect(nonSchedule.name).toBe('Rent updated');

    const schedule = buildUpdatePersistenceInput(
      existing,
      {
        ...baseInput,
        intervalN: 2,
      },
      baseInput.startDate,
    );
    expect(schedule.nextOccurrence).toBe(baseInput.startDate);

    const recurrenceChange = buildUpdatePersistenceInput(
      existing,
      {
        ...baseInput,
        recurrenceDay: 15,
      },
      baseInput.startDate,
    );
    expect(recurrenceChange.nextOccurrence).toBe(new Date(2026, 2, 15).getTime());
  });
});
