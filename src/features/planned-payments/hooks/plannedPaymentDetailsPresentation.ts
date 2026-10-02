import { Icon, IconName } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { PlannedPaymentInterval, JournalDisplayType } from '@/src/types/enums';
import { EnrichedJournal } from '@/src/types/domainReadModels';
import { PlannedPaymentObligation } from '@/src/services/planned-payment/plannedPaymentReadService';
import { ComponentVariant } from '@/src/utils/style-helpers';
import { formatRecurrence } from '@/src/utils/recurrenceLabels';
import dayjs from 'dayjs';

export function presentPlannedPaymentDue(
  item: Pick<PlannedPaymentObligation, 'status' | 'nextDueOccurrence'>,
  now: number,
): { label: string; color: ComponentVariant; helpText?: string; days?: number } {
  if (item.status === 'PAUSED') {
    return {
      label: 'Paused',
      color: 'secondary',
      helpText: 'Resume the schedule to record or skip an occurrence.',
    };
  }
  if (item.nextDueOccurrence === undefined) {
    return {
      label: item.status === 'COMPLETED' ? 'Completed' : 'No upcoming occurrence',
      color: 'secondary',
      helpText:
        item.status === 'COMPLETED'
          ? 'This schedule has ended. Edit its dates to plan more occurrences.'
          : undefined,
    };
  }
  const days = dayjs(item.nextDueOccurrence).startOf('day').diff(dayjs(now).startOf('day'), 'day');
  return {
    label:
      days < 0
        ? `${Math.abs(days)} ${days === -1 ? 'day' : 'days'} overdue`
        : days === 0
          ? 'Due today'
          : days === 1
            ? 'Due tomorrow'
            : `Due in ${days} days`,
    color: days < 0 ? 'error' : days <= 1 ? 'warning' : 'secondary',
    days,
  };
}

export function groupPlannedPaymentEntries(history: EnrichedJournal[]) {
  return {
    scheduled: history
      .filter(entry => entry.status === 'PLANNED' || entry.status === 'PAUSED')
      .sort((a, b) => a.journalDate - b.journalDate),
    recorded: history
      .filter(entry => entry.status !== 'PLANNED' && entry.status !== 'PAUSED')
      .sort((a, b) => b.journalDate - a.journalDate),
  };
}

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
  const baseLabel = formatRecurrence({ intervalN, intervalType });

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
  typeColor: ComponentVariant;
  isOverdue: boolean;
}

export function getPlannedPaymentHistoryPresentation(
  journal: EnrichedJournal,
  now: number,
): PlannedPaymentHistoryPresentation {
  const dateValue = dayjs(journal.journalDate).startOf('day').valueOf();
  const today = dayjs(now).startOf('day').valueOf();
  const tomorrow = dayjs(now).add(1, 'day').startOf('day').valueOf();

  const isOverdue = journal.status === 'PLANNED' && dateValue < today;
  const isDueSoon = journal.status === 'PLANNED' && (dateValue === today || dateValue === tomorrow);

  let label = 'Posted';
  if (journal.status === 'PLANNED') {
    if (isOverdue) label = 'Overdue';
    else if (dateValue === today) label = 'Due Today';
    else if (dateValue === tomorrow) label = 'Due Tomorrow';
    else label = 'Scheduled';
  } else if (journal.status === 'SKIPPED') {
    label = 'Skipped';
  } else if (journal.status === 'PAUSED') {
    label = 'Paused';
  } else if (journal.status === 'REVERSED') {
    label = 'Reversed';
  }

  let typeColor: ComponentVariant = 'secondary';
  if (journal.status === 'PLANNED') {
    if (isOverdue) typeColor = 'error';
    else if (isDueSoon) typeColor = 'warning';
    else typeColor = 'secondary';
  } else if (
    journal.status === 'SKIPPED' ||
    journal.status === 'PAUSED' ||
    journal.status === 'REVERSED'
  ) {
    typeColor = 'secondary';
  } else {
    typeColor =
      journal.displayType === JournalDisplayType.INCOME
        ? 'income'
        : journal.displayType === JournalDisplayType.EXPENSE
          ? 'expense'
          : 'secondary';
  }

  const typeIcon: IconName =
    journal.displayType === JournalDisplayType.INCOME
      ? Icon.ArrowUp
      : journal.displayType === JournalDisplayType.EXPENSE
        ? Icon.ArrowDown
        : Icon.SwapHorizontal;

  return {
    label,
    typeIcon,
    typeColor,
    isOverdue,
  };
}
