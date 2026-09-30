import { computeFirstOccurrence } from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { PlannedPaymentInterval } from '@/src/types/enums';
import dayjs from 'dayjs';
import type { RecurringIncome } from './draft';

export interface OnboardingIncomeRecurrence {
  readonly intervalType: PlannedPaymentInterval;
  readonly intervalN: number;
  readonly recurrenceDay?: number;
  readonly recurrenceMonth?: number;
  readonly firstOccurrence: number;
}

/** Derives the persisted recurrence and first visible date from one onboarding selection. */
export function buildOnboardingIncomeRecurrence(
  item: Pick<RecurringIncome, 'interval' | 'intervalN' | 'nextDate'>,
): OnboardingIncomeRecurrence {
  const selectedDate = dayjs(item.nextDate).startOf('day');
  const intervalType = item.interval;
  const recurrence = {
    intervalType,
    intervalN: Math.max(1, item.intervalN),
    ...(intervalType === PlannedPaymentInterval.WEEKLY
      ? { recurrenceDay: selectedDate.day() }
      : intervalType === PlannedPaymentInterval.MONTHLY
        ? { recurrenceDay: selectedDate.date() }
        : intervalType === PlannedPaymentInterval.YEARLY
          ? { recurrenceMonth: selectedDate.month() + 1, recurrenceDay: selectedDate.date() }
          : {}),
  };

  return {
    ...recurrence,
    firstOccurrence: computeFirstOccurrence(selectedDate.valueOf(), recurrence),
  };
}
