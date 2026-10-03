import { Icon, IconName } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { PlannedPaymentInterval } from '@/src/types/enums';
import { EnrichedJournal } from '@/src/types/domainReadModels';
import { PlannedPaymentObligation } from '@/src/services/planned-payment/plannedPaymentReadService';
import { ComponentVariant } from '@/src/utils/style-helpers';
import { formatRecurrence } from '@/src/utils/recurrenceLabels';
import dayjs from 'dayjs';
import { getCurrencyPrecision } from '@/src/utils/currencyPrecision';

export function presentPlannedPaymentDue(
  item: Pick<PlannedPaymentObligation, 'status' | 'nextDueOccurrence'>,
  now: number,
): { label: string; color: ComponentVariant; helpText?: string; days?: number } {
  if (item.status === 'PAUSED') {
    return {
      label: AppConfig.strings.plannedDetailRedesign.paused,
      color: 'secondary',
      helpText: AppConfig.strings.plannedDetailRedesign.pausedExplanation,
    };
  }
  if (item.nextDueOccurrence === undefined) {
    return {
      label:
        item.status === 'COMPLETED'
          ? AppConfig.strings.plannedDetailRedesign.ended
          : AppConfig.strings.plannedPayments.noUpcomingOccurrence,
      color: 'secondary',
      helpText:
        item.status === 'COMPLETED'
          ? AppConfig.strings.plannedDetailRedesign.completedHelp
          : undefined,
    };
  }
  const days = dayjs(item.nextDueOccurrence).startOf('day').diff(dayjs(now).startOf('day'), 'day');
  return {
    label:
      days < 0
        ? AppConfig.strings.plannedDetailRedesign.daysLate(Math.abs(days))
        : days === 0
          ? AppConfig.strings.plannedDetailRedesign.dueToday
          : days === 1
            ? AppConfig.strings.plannedDetailRedesign.dueTomorrow
            : AppConfig.strings.plannedDetailRedesign.dueInDays(days),
    color: days < 0 ? 'error' : days <= 3 ? 'warning' : 'secondary',
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

export function plannedMoneyDiffers(
  amount: number,
  currencyCode: string,
  plannedAmount: number,
  plannedCurrencyCode: string,
): boolean {
  if (currencyCode !== plannedCurrencyCode) return true;
  const precision = getCurrencyPrecision(currencyCode);
  return Math.round(amount * 10 ** precision) !== Math.round(plannedAmount * 10 ** precision);
}

export interface PlannedPaymentHistoryPresentation {
  label: string;
  subtitle: string;
  color: ComponentVariant;
  dotIcon: IconName;
  isSkipped: boolean;
  differenceAmount?: number;
  differenceCurrencyCode?: string;
  differenceDirection?: 'more' | 'less';
  expectedAmount?: number;
  expectedCurrencyCode?: string;
}

export function getPlannedPaymentHistoryPresentation(
  journal: EnrichedJournal,
  plannedAmount = journal.totalAmount,
  plannedCurrencyCode = journal.currencyCode,
  isReversalJournal = false,
): PlannedPaymentHistoryPresentation {
  const isSkipped = journal.status === 'SKIPPED';
  const isReversed = journal.status === 'REVERSED' || isReversalJournal;
  const isWaiting = journal.status === 'PLANNED' || journal.status === 'PAUSED';
  const sameCurrency = journal.currencyCode === plannedCurrencyCode;
  const amountDiffers =
    sameCurrency &&
    plannedMoneyDiffers(
      journal.totalAmount,
      journal.currencyCode,
      plannedAmount,
      plannedCurrencyCode,
    );
  const copy = AppConfig.strings.plannedDetailRedesign;
  const subtitle = isSkipped
    ? copy.skipped
    : isReversed
      ? copy.reversed
      : isWaiting
        ? copy.waiting
        : sameCurrency
          ? copy.paidAsPlanned
          : copy.paidDifferentCurrency(journal.currencyCode);
  return {
    label: isSkipped
      ? copy.skipped
      : isReversed
        ? copy.reversed
        : isWaiting
          ? copy.waiting
          : copy.paid,
    subtitle,
    color:
      !isSkipped && !isReversed && !isWaiting && (!sameCurrency || amountDiffers)
        ? 'warning'
        : 'secondary',
    dotIcon: isSkipped
      ? Icon.MinusSquare
      : isReversed
        ? Icon.Refresh
        : isWaiting
          ? Icon.Clock
          : Icon.Check,
    isSkipped,
    differenceAmount:
      !isSkipped && !isReversed && !isWaiting && amountDiffers
        ? Math.abs(journal.totalAmount - plannedAmount)
        : undefined,
    differenceCurrencyCode:
      !isSkipped && !isReversed && !isWaiting && amountDiffers ? plannedCurrencyCode : undefined,
    differenceDirection: journal.totalAmount >= plannedAmount ? 'more' : 'less',
    expectedAmount:
      !isSkipped && !isReversed && !isWaiting && !sameCurrency ? plannedAmount : undefined,
    expectedCurrencyCode:
      !isSkipped && !isReversed && !isWaiting && !sameCurrency ? plannedCurrencyCode : undefined,
  };
}
