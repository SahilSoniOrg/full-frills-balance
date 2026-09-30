import { calculateNextOccurrence } from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { PlannedPaymentInterval } from '@/src/types/enums';
import dayjs from 'dayjs';
import { buildOnboardingIncomeRecurrence } from '../incomeRecurrence';

const selected = (date: string) => dayjs(date).valueOf();
const asDate = (value: number) => dayjs(value).format('YYYY-MM-DD');

describe('buildOnboardingIncomeRecurrence', () => {
  it.each([
    [1, '2026-10-07'],
    [2, '2026-10-14'],
  ])('anchors weekly interval %i to the selected weekday', (intervalN, nextDate) => {
    const recurrence = buildOnboardingIncomeRecurrence({
      interval: PlannedPaymentInterval.WEEKLY,
      intervalN,
      nextDate: selected('2026-09-30T18:45:00'),
    });

    expect(recurrence).toEqual({
      intervalType: PlannedPaymentInterval.WEEKLY,
      intervalN,
      recurrenceDay: 3,
      firstOccurrence: selected('2026-09-30'),
    });
    expect(asDate(calculateNextOccurrence(recurrence.firstOccurrence, recurrence))).toBe(nextDate);
  });

  it('keeps monthly end-of-month recurrence anchored to the selected day', () => {
    const recurrence = buildOnboardingIncomeRecurrence({
      interval: PlannedPaymentInterval.MONTHLY,
      intervalN: 1,
      nextDate: selected('2026-01-31'),
    });
    const february = calculateNextOccurrence(recurrence.firstOccurrence, recurrence);

    expect(recurrence.recurrenceDay).toBe(31);
    expect(asDate(recurrence.firstOccurrence)).toBe('2026-01-31');
    expect(asDate(february)).toBe('2026-02-28');
    expect(asDate(calculateNextOccurrence(february, recurrence))).toBe('2026-03-31');
  });

  it('retains the yearly month and day across leap years', () => {
    const recurrence = buildOnboardingIncomeRecurrence({
      interval: PlannedPaymentInterval.YEARLY,
      intervalN: 1,
      nextDate: selected('2024-02-29'),
    });
    const next = calculateNextOccurrence(recurrence.firstOccurrence, recurrence);
    const following = calculateNextOccurrence(next, recurrence);
    const leap = calculateNextOccurrence(
      calculateNextOccurrence(following, recurrence),
      recurrence,
    );

    expect(recurrence).toEqual({
      intervalType: PlannedPaymentInterval.YEARLY,
      intervalN: 1,
      recurrenceMonth: 2,
      recurrenceDay: 29,
      firstOccurrence: selected('2024-02-29'),
    });
    expect(asDate(next)).toBe('2025-02-28');
    expect(asDate(leap)).toBe('2028-02-29');
  });

  it('normalizes a daily first occurrence and stores no irrelevant day or month', () => {
    const recurrence = buildOnboardingIncomeRecurrence({
      interval: PlannedPaymentInterval.DAILY,
      intervalN: 1,
      nextDate: selected('2026-09-30T18:45:00'),
    });

    expect(recurrence).toEqual({
      intervalType: PlannedPaymentInterval.DAILY,
      intervalN: 1,
      firstOccurrence: selected('2026-09-30'),
    });
  });
});
