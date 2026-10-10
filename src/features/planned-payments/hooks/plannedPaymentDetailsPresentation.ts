import { Icon, IconName } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/types/enums';
import { EnrichedJournal } from '@/src/types/domainReadModels';
import { PlannedPaymentObligation } from '@/src/services/planned-payment/plannedPaymentReadService';
import { ComponentVariant } from '@/src/utils/style-helpers';
import { formatRecurrence } from '@/src/utils/recurrenceLabels';
import dayjs from 'dayjs';
import { getCurrencyPrecision } from '@/src/utils/currencyPrecision';
import { accountEntryLeg } from '@/src/services/journal/journalTimelinePresentation';
import { asAccountId } from '@/src/types/ids';
import type { JournalEntryLeg } from '@/src/types/journalEntryCard';

/** A schedule account as a transaction-flow leg, or a placeholder leg when the account is missing. */
export function plannedAccountLeg(
  account: Parameters<typeof accountEntryLeg>[0] | null | undefined,
  role: JournalEntryLeg['role'],
  placeholder: string,
): JournalEntryLeg {
  return account
    ? accountEntryLeg(account, role, `${account.id}:${role}`)
    : {
        id: role,
        accountId: asAccountId(''),
        name: placeholder,
        role,
        fallbackIcon: Icon.Wallet,
        variant: 'default',
      };
}

export function daysUntilPlannedOccurrence(occurrenceDate: number, now: number): number {
  return dayjs(occurrenceDate).startOf('day').diff(dayjs(now).startOf('day'), 'day');
}

function detailScheduleLabel(days: number): string {
  const copy = AppConfig.strings.plannedDetailRedesign;
  if (days < 0) return copy.daysLate(Math.abs(days));
  if (days === 0) return copy.dueToday;
  if (days === 1) return copy.dueTomorrow;
  return copy.dueInDays(days);
}

function detailUrgencyLabel(days: number): string {
  const copy = AppConfig.strings.plannedDetailRedesign;
  if (days < 0) return copy.daysLate(Math.abs(days));
  if (days === 0) return copy.dueToday;
  if (days === 1) return copy.dueTomorrow;
  if (days <= 3) return copy.dueInDays(days);
  return copy.inDays(days);
}

export function presentPlannedListOccurrenceTiming(occurrenceDate: number, now: number) {
  const days = daysUntilPlannedOccurrence(occurrenceDate, now);
  const strings = AppConfig.strings.plannedListRedesign;
  const isOverdue = days < 0;
  const isDueSoon = !isOverdue && days <= 3;
  return {
    isOverdue,
    isDueSoon,
    daysLateLabel: isOverdue ? strings.daysLate(Math.abs(days)) : undefined,
  };
}

export function presentPlannedPaymentDetailsUrgency(
  occurrenceDate: number | undefined,
  now: number,
  fallbackLabel: string,
): string {
  if (occurrenceDate == null) return fallbackLabel;
  return detailUrgencyLabel(daysUntilPlannedOccurrence(occurrenceDate, now));
}

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
  const days = daysUntilPlannedOccurrence(item.nextDueOccurrence, now);
  return {
    label: detailScheduleLabel(days),
    color: days < 0 ? 'error' : days <= 3 ? 'warning' : 'secondary',
    days,
  };
}

export function presentPlannedPaymentDetailsHeader(input: {
  status: PlannedPaymentStatus;
  showcasedDate?: number;
  pausedSinceDate?: number;
  isPaused: boolean;
  isEndedWithoutOutstanding: boolean;
  lastRecordedJournalDate?: number;
  now: number;
}) {
  const copy = AppConfig.strings.plannedDetailRedesign;
  const scheduleDue = presentPlannedPaymentDue(
    { status: input.status, nextDueOccurrence: input.showcasedDate },
    input.now,
  );
  const daysUntil =
    input.showcasedDate == null
      ? undefined
      : daysUntilPlannedOccurrence(input.showcasedDate, input.now);
  const eyebrow = input.isPaused
    ? input.pausedSinceDate == null
      ? copy.paused
      : copy.pausedSince(dayjs(input.pausedSinceDate).format('MMM D'))
    : input.isEndedWithoutOutstanding
      ? input.lastRecordedJournalDate != null
        ? copy.lastPayment(dayjs(input.lastRecordedJournalDate).format('MMM YYYY'))
        : copy.ended
      : daysUntil != null && daysUntil < 0
        ? copy.missedPayment
        : copy.nextPayment;
  const urgency = input.isPaused
    ? copy.paused
    : input.isEndedWithoutOutstanding
      ? copy.ended
      : presentPlannedPaymentDetailsUrgency(input.showcasedDate, input.now, scheduleDue.label);
  return { eyebrow, urgency, daysUntil, scheduleDue };
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
  /** Scheduled but not posted yet (planned or paused); no money has moved. */
  isPending: boolean;
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
  const statusCopy = isSkipped
    ? { label: copy.skipped, subtitle: copy.skipped }
    : isReversed
      ? { label: copy.reversed, subtitle: copy.reversed }
      : isWaiting
        ? { label: copy.waiting, subtitle: copy.waiting }
        : {
            label: copy.paid,
            subtitle: sameCurrency
              ? copy.paidAsPlanned
              : copy.paidDifferentCurrency(journal.currencyCode),
          };
  return {
    label: statusCopy.label,
    subtitle: statusCopy.subtitle,
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
    isPending: isWaiting,
    differenceAmount:
      !isSkipped && !isReversed && !isWaiting && amountDiffers
        ? Math.abs(journal.totalAmount - plannedAmount)
        : undefined,
    differenceCurrencyCode:
      !isSkipped && !isReversed && !isWaiting && amountDiffers ? plannedCurrencyCode : undefined,
    differenceDirection:
      !isSkipped && !isReversed && !isWaiting && amountDiffers
        ? journal.totalAmount >= plannedAmount
          ? 'more'
          : 'less'
        : undefined,
    expectedAmount:
      !isSkipped && !isReversed && !isWaiting && !sameCurrency ? plannedAmount : undefined,
    expectedCurrencyCode:
      !isSkipped && !isReversed && !isWaiting && !sameCurrency ? plannedCurrencyCode : undefined,
  };
}
