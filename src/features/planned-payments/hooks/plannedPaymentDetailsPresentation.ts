import { IconName } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { PlannedPaymentInterval, JournalDisplayType } from '@/src/types/enums';
import { EnrichedJournal } from '@/src/types/domainReadModels';

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

export interface PlannedPaymentHistoryPresentation {
  label: string;
  typeIcon: IconName;
  typeColor: string;
  isOverdue: boolean;
}

export function getPlannedPaymentHistoryPresentation(
  journal: EnrichedJournal,
  now: number,
): PlannedPaymentHistoryPresentation {
  const dateValue = new Date(journal.journalDate).setHours(0, 0, 0, 0);
  const today = new Date(now).setHours(0, 0, 0, 0);
  const tomorrow = new Date(now + 86400000).setHours(0, 0, 0, 0);

  const isOverdue = journal.status === 'PLANNED' && dateValue < today;
  const isDueSoon = journal.status === 'PLANNED' && (dateValue === today || dateValue === tomorrow);

  let label = 'Posted';
  if (journal.status === 'PLANNED') {
    if (dateValue === today) label = 'Due Today';
    else if (dateValue === tomorrow) label = 'Due Tomorrow';
    else label = 'Scheduled';
  } else if (journal.status === 'SKIPPED') {
    label = 'Skipped';
  } else if (journal.status === 'PAUSED') {
    label = 'Paused';
  }

  let typeColor = 'textSecondary';
  if (journal.status === 'PLANNED') {
    if (isOverdue) typeColor = 'error';
    else if (isDueSoon) typeColor = 'warning';
    else typeColor = 'textSecondary';
  } else if (journal.status === 'SKIPPED' || journal.status === 'PAUSED') {
    typeColor = 'textSecondary';
  } else {
    typeColor =
      journal.displayType === JournalDisplayType.INCOME
        ? 'income'
        : journal.displayType === JournalDisplayType.EXPENSE
          ? 'expense'
          : 'transfer';
  }

  const typeIcon: IconName =
    journal.displayType === JournalDisplayType.INCOME
      ? 'arrowUp'
      : journal.displayType === JournalDisplayType.EXPENSE
        ? 'arrowDown'
        : 'swapHorizontal';

  return {
    label,
    typeIcon,
    typeColor,
    isOverdue,
  };
}
