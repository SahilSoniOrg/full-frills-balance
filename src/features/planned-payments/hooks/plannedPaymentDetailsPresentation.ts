import { AppConfig } from '@/src/constants';
import { PlannedPaymentInterval } from '@/src/data/models/PlannedPayment';

interface PlannedPaymentRecurrence {
  intervalN: number;
  intervalType: PlannedPaymentInterval;
  recurrenceDay?: number;
  recurrenceMonth?: number;
}

export function formatPlannedPaymentInterval({
  intervalN,
  intervalType,
  recurrenceDay,
  recurrenceMonth,
}: PlannedPaymentRecurrence): string {
  let baseLabel = '';
  if (intervalN === 1) {
    switch (intervalType) {
      case PlannedPaymentInterval.DAILY:
        baseLabel = AppConfig.strings.plannedPayments.everyDay;
        break;
      case PlannedPaymentInterval.WEEKLY:
        baseLabel = AppConfig.strings.plannedPayments.everyWeek;
        break;
      case PlannedPaymentInterval.MONTHLY:
        baseLabel = AppConfig.strings.plannedPayments.everyMonth;
        break;
      case PlannedPaymentInterval.YEARLY:
        baseLabel = AppConfig.strings.plannedPayments.everyYear;
        break;
    }
  } else {
    baseLabel = AppConfig.strings.plannedPayments.everyN(intervalN, intervalType.toLowerCase());
  }

  let detailLabel = '';
  if (intervalType === PlannedPaymentInterval.WEEKLY && recurrenceDay != null) {
    detailLabel = ` on ${AppConfig.strings.plannedPayments.dayNames[recurrenceDay]}`;
  } else if (intervalType === PlannedPaymentInterval.MONTHLY && recurrenceDay != null) {
    detailLabel = ` on day ${recurrenceDay}`;
  } else if (intervalType === PlannedPaymentInterval.YEARLY) {
    const month = recurrenceMonth
      ? AppConfig.strings.plannedPayments.monthNames[recurrenceMonth - 1]
      : '';
    const day = recurrenceDay ? ` day ${recurrenceDay}` : '';
    if (month || day) detailLabel = ` on ${month}${day}`;
  }

  return `${baseLabel}${detailLabel}`;
}
