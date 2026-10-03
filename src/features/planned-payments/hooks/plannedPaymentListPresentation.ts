import {
  projectPlannedPaymentListOccurrences,
  type PlannedPaymentListData,
  type PlannedPaymentListOccurrence,
  type PlannedPaymentObligation,
} from '@/src/services/planned-payment/plannedPaymentReadService';
import { PlannedPaymentStatus } from '@/src/types/enums';
import { getCurrencyPrecision } from '@/src/utils/currencyPrecision';
import { safeAdd } from '@/src/utils/money';
import dayjs from 'dayjs';

export interface PlannedPaymentCurrencyTotal {
  currencyCode: string;
  amount: number;
  count: number;
}

export interface PlannedPaymentListTotals {
  perCurrency: PlannedPaymentCurrencyTotal[];
  mainCurrency: PlannedPaymentCurrencyTotal;
  count: number;
  /** Number of occurrences, not distinct currencies; no implicit conversion. */
  otherCurrencyCount: number;
}

export type PlannedPaymentListGroupKey =
  'overdue' | 'next7Days' | 'laterThisMonth' | 'nextMonth' | 'later' | 'pausedEnded';

export type PlannedPaymentListRow =
  | ({ kind: 'occurrence' } & PlannedPaymentListOccurrence)
  | {
      kind: 'schedule';
      payment: PlannedPaymentObligation;
      pendingOccurrences: PlannedPaymentListOccurrence[];
    };

export interface PlannedPaymentListGroup {
  key: PlannedPaymentListGroupKey;
  rows: PlannedPaymentListRow[];
  outgoing: PlannedPaymentListTotals;
}

export interface PlannedPaymentMonthDay {
  date: number;
  day: number;
  isPast: boolean;
  isToday: boolean;
  /** Raw main-currency amounts; consumers must use privacy-aware money rendering. */
  outgoingAmount: number;
  incomingAmount: number;
  outgoing: PlannedPaymentListTotals;
  incoming: PlannedPaymentListTotals;
}

/** Transfers are outgoing commitments; unknown account directions are excluded. */
function isOutgoing(item: PlannedPaymentListOccurrence) {
  return item.payment.flowDirection === 'outflow' || item.payment.flowDirection === 'transfer';
}

function totalOccurrences(
  occurrences: PlannedPaymentListOccurrence[],
  mainCurrencyCode: string,
): PlannedPaymentListTotals {
  const totals = new Map<string, PlannedPaymentCurrencyTotal>();
  for (const item of occurrences) {
    const total = totals.get(item.currencyCode) ?? {
      currencyCode: item.currencyCode,
      amount: 0,
      count: 0,
    };
    total.amount = safeAdd(total.amount, item.amount, getCurrencyPrecision(item.currencyCode));
    total.count++;
    totals.set(item.currencyCode, total);
  }
  const mainCurrency = totals.get(mainCurrencyCode) ?? {
    currencyCode: mainCurrencyCode,
    amount: 0,
    count: 0,
  };
  return {
    perCurrency: [...totals.values()].sort((a, b) => a.currencyCode.localeCompare(b.currencyCode)),
    mainCurrency,
    count: occurrences.length,
    otherCurrencyCount: occurrences.length - mainCurrency.count,
  };
}

/** Calendar boundaries use local days, including today and the following six days. */
export function buildPlannedPaymentListPresentation(
  data: PlannedPaymentListData,
  mainCurrencyCode: string,
  now: number,
) {
  const today = dayjs(now).startOf('day');
  const monthStart = today.startOf('month');
  const nextMonthStart = monthStart.add(1, 'month');
  const laterStart = nextMonthStart.add(1, 'month');
  const next7End = today.add(7, 'day');
  const occurrences = projectPlannedPaymentListOccurrences(data, laterStart.valueOf() - 1);
  const actionable = occurrences.filter(item => item.canRecord);
  const remaining = actionable.filter(item => item.date < nextMonthStart.valueOf());
  const outgoing = totalOccurrences(remaining.filter(isOutgoing), mainCurrencyCode);
  const incoming = totalOccurrences(
    remaining.filter(item => item.payment.flowDirection === 'inflow'),
    mainCurrencyCode,
  );

  const groups: PlannedPaymentListGroup[] = (
    ['overdue', 'next7Days', 'laterThisMonth', 'nextMonth', 'later', 'pausedEnded'] as const
  ).map(key => ({ key, rows: [], outgoing: totalOccurrences([], mainCurrencyCode) }));
  const groupsByKey = new Map(groups.map(group => [group.key, group]));
  const actionablePlanIds = new Set(actionable.map(item => item.payment.id));
  for (const occurrence of actionable) {
    const date = dayjs(occurrence.date).startOf('day').valueOf();
    const key: PlannedPaymentListGroupKey =
      date < today.valueOf()
        ? 'overdue'
        : date < next7End.valueOf()
          ? 'next7Days'
          : date < nextMonthStart.valueOf()
            ? 'laterThisMonth'
            : date < laterStart.valueOf()
              ? 'nextMonth'
              : 'later';
    groupsByKey.get(key)!.rows.push({ kind: 'occurrence', ...occurrence });
  }
  const inactive = data.items
    .filter(item => item.status === PlannedPaymentStatus.PAUSED || !actionablePlanIds.has(item.id))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const pendingByPlan = new Map<string, PlannedPaymentListOccurrence[]>();
  for (const occurrence of occurrences) {
    const pending = pendingByPlan.get(occurrence.payment.id) ?? [];
    pending.push(occurrence);
    pendingByPlan.set(occurrence.payment.id, pending);
  }
  groupsByKey.get('pausedEnded')!.rows = inactive.map(payment => ({
    kind: 'schedule',
    payment,
    pendingOccurrences: pendingByPlan.get(payment.id) ?? [],
  }));
  for (const group of groups) {
    group.outgoing = totalOccurrences(
      group.rows.flatMap(row => (row.kind === 'occurrence' && isOutgoing(row) ? [row] : [])),
      mainCurrencyCode,
    );
  }

  const monthByDay = new Map<number, PlannedPaymentListOccurrence[]>();
  for (const occurrence of actionable) {
    const date = dayjs(occurrence.date).startOf('day').valueOf();
    if (date < monthStart.valueOf() || date >= nextMonthStart.valueOf()) continue;
    const day = monthByDay.get(date) ?? [];
    day.push(occurrence);
    monthByDay.set(date, day);
  }
  const monthStrip: PlannedPaymentMonthDay[] = Array.from(
    { length: today.daysInMonth() },
    (_, index) => {
      const date = monthStart.add(index, 'day').valueOf();
      const entries = monthByDay.get(date) ?? [];
      const dayOutgoing = totalOccurrences(entries.filter(isOutgoing), mainCurrencyCode);
      const dayIncoming = totalOccurrences(
        entries.filter(item => item.payment.flowDirection === 'inflow'),
        mainCurrencyCode,
      );
      return {
        date,
        day: index + 1,
        isPast: date < today.valueOf(),
        isToday: date === today.valueOf(),
        outgoingAmount: dayOutgoing.mainCurrency.amount,
        incomingAmount: dayIncoming.mainCurrency.amount,
        outgoing: dayOutgoing,
        incoming: dayIncoming,
      };
    },
  );
  return {
    today: today.valueOf(),
    monthStart: monthStart.valueOf(),
    nextMonthStart: nextMonthStart.valueOf(),
    summary: {
      outgoing,
      incoming,
      unknownCount: remaining.filter(item => item.payment.flowDirection === 'unknown').length,
    },
    groups,
    monthStrip,
  };
}
