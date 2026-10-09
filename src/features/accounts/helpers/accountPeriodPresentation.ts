import { AppConfig, type ColorKey } from '@/src/constants';
import { AccountType } from '@/src/types/enums';
import { describePeriodRange, type DateRange, type PeriodRangeFacts } from '@/src/utils/dateUtils';
import type { ComponentVariant } from '@/src/utils/style-helpers';
import dayjs from 'dayjs';

type Sign = '+' | '−';

export interface AccountPeriodPresentationMetrics {
  totalIncrease: number;
  totalDecrease: number;
  dailyAverage: number | null;
}

export interface AccountPeriodRangePresentation {
  label: string;
  /** Omitted for all time and single days, which need no date span or countdown. */
  period?: PeriodRangeFacts;
  isCurrent: boolean;
}

export interface AccountPeriodPresentation {
  heroLabel: string;
  heroAmount: number;
  heroSign?: Sign;
  badge: { label: string; variant: ComponentVariant } | null;
  /** Payments against new liability charges; hidden in privacy mode. */
  bar: { progress: number; color: ColorKey; caption: string } | null;
  stats: { label: string; amount: number; tone: 'income' | 'expense' | 'text'; sign?: Sign }[];
  /** Net change over the comparable earlier period. */
  comparison: { label: string; amount: number; sign?: Sign } | null;
  isEmpty: boolean;
}

export function presentAccountPeriodRange(
  range: DateRange | null,
  now: number,
): AccountPeriodRangePresentation {
  if (!range) return { label: AppConfig.strings.common.allTime, isCurrent: false };

  const start = dayjs(range.startDate);
  const end = dayjs(range.endDate);
  const period = describePeriodRange(range, now);
  if (start.isSame(end, 'day')) {
    return { label: start.format('D MMM YYYY'), isCurrent: period.isCurrent };
  }

  return {
    label: range.label ?? `${start.format('MMM D')} – ${end.format('MMM D')}`,
    period,
    isCurrent: period.isCurrent,
  };
}

/**
 * The period before `range`, cut at the same day when `range` is still running,
 * so "this month so far" compares with "last month up to the same day".
 */
export function previousComparableRange(
  range: DateRange | null,
  now: number,
): (DateRange & { label: string }) | null {
  if (!range) return null;

  const start = dayjs(range.startDate);
  const end = dayjs(range.endDate);
  const { isCurrent } = describePeriodRange(range, now);
  const strings = AppConfig.strings.common.period;

  if (start.isSame(start.startOf('month')) && end.isSame(start.endOf('month'), 'second')) {
    const previousStart = start.subtract(1, 'month');
    const month = previousStart.format('MMM');
    return isCurrent
      ? {
          startDate: previousStart.valueOf(),
          endDate: Math.min(
            dayjs(now).subtract(1, 'month').endOf('day').valueOf(),
            previousStart.endOf('month').valueOf(),
          ),
          label: strings.sameDay(month),
        }
      : {
          startDate: previousStart.valueOf(),
          endDate: previousStart.endOf('month').valueOf(),
          label: strings.total(month),
        };
  }

  const length = range.endDate - range.startDate + 1;
  const startDate = range.startDate - length;
  return {
    startDate,
    endDate: isCurrent
      ? startDate + (dayjs(now).endOf('day').valueOf() - range.startDate)
      : range.startDate - 1,
    label: isCurrent ? strings.lastPeriodSamePoint : strings.lastPeriod,
  };
}

const signOf = (value: number): Sign | undefined => (value > 0 ? '+' : value < 0 ? '−' : undefined);
const minusOnly = (value: number): Sign | undefined => (value < 0 ? '−' : undefined);

export function presentAccountPeriod({
  accountType,
  metrics,
  isPrivate,
  previous = null,
}: {
  accountType: AccountType;
  metrics: AccountPeriodPresentationMetrics;
  isPrivate: boolean;
  /** Net change over the comparable earlier period, e.g. last month up to the same day. */
  previous?: { label: string; netChange: number } | null;
}): AccountPeriodPresentation {
  const increase = metrics.totalIncrease;
  const decrease = metrics.totalDecrease;
  const net = increase - decrease;
  const isEmpty = increase === 0 && decrease === 0;
  const perDay = () =>
    metrics.dailyAverage === null
      ? []
      : [{ label: 'Per day', amount: Math.abs(metrics.dailyAverage), tone: 'text' as const }];
  const comparison = (sign: (value: number) => Sign | undefined) =>
    previous
      ? {
          label: previous.label,
          amount: Math.abs(previous.netChange),
          sign: sign(previous.netChange),
        }
      : null;

  if (accountType === AccountType.LIABILITY) {
    return {
      heroLabel: 'Net change',
      heroAmount: Math.abs(net),
      heroSign: signOf(net),
      badge:
        net > 0
          ? { label: 'Balance grew', variant: 'warning' }
          : net < 0
            ? { label: 'Paid down', variant: 'success' }
            : null,
      bar:
        !isPrivate && increase > 0
          ? {
              progress: Math.min(100, (decrease / increase) * 100),
              color: 'success',
              caption: `Paid ${Math.round((decrease / increase) * 100).toLocaleString()}% of new charges`,
            }
          : null,
      stats: [
        { label: 'Charged', amount: increase, tone: 'expense' },
        { label: 'Paid', amount: decrease, tone: 'income' },
      ],
      comparison: comparison(signOf),
      isEmpty,
    };
  }

  if (accountType === AccountType.EXPENSE) {
    return {
      heroLabel: net < 0 ? 'Refunded' : 'Spent',
      heroAmount: Math.abs(net),
      badge: null,
      bar: null,
      stats: [
        ...(decrease > 0
          ? [
              { label: 'Before refunds', amount: increase, tone: 'text' as const },
              { label: 'Refunds', amount: decrease, tone: 'text' as const },
            ]
          : []),
        ...perDay(),
      ],
      comparison: comparison(minusOnly),
      isEmpty,
    };
  }

  if (accountType === AccountType.INCOME) {
    return {
      heroLabel: 'Earned',
      heroAmount: Math.abs(net),
      heroSign: minusOnly(net),
      badge: null,
      bar: null,
      stats: [
        ...(decrease > 0
          ? [
              { label: 'Before adjustments', amount: increase, tone: 'income' as const },
              { label: 'Adjustments', amount: decrease, tone: 'text' as const },
            ]
          : []),
        ...perDay(),
      ],
      comparison: comparison(minusOnly),
      isEmpty,
    };
  }

  return {
    heroLabel: 'Net change',
    heroAmount: Math.abs(net),
    heroSign: signOf(net),
    badge:
      net < 0
        ? { label: 'Drawing down', variant: 'warning' }
        : net > 0
          ? { label: 'Growing', variant: 'success' }
          : null,
    bar: null,
    stats: [
      { label: 'In', amount: increase, tone: 'income' },
      { label: 'Out', amount: decrease, tone: 'expense' },
    ],
    comparison: comparison(signOf),
    isEmpty,
  };
}
