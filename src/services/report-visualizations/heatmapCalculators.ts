import { AppConfig } from '@/src/constants/app-config';
import { roundToPrecision } from '@/src/utils/money';
import dayjs from 'dayjs';
import type { JournalId } from '@/src/types/ids';
import { TransactionType } from '@/src/types/enums';
import type {
  HeatmapPoint,
  IncomeVsExpenseHistoryPoint,
  SpendingHeatmapTransaction,
} from './types';

export function calculateSpendingHeatmapFromTransactions(
  transactions: readonly SpendingHeatmapTransaction[],
  precision: number = AppConfig.constants.precision,
): HeatmapPoint[] {
  const densityMap = new Map<string, number>();
  const journalMap = new Map<string, Set<JournalId>>();

  for (const tx of transactions) {
    if (tx.transactionType !== TransactionType.DEBIT) continue;

    const dt = dayjs(tx.transactionDate);
    const mondayFirstDay = (dt.day() + 6) % 7;
    const key = `${mondayFirstDay}_${dt.hour()}`;
    densityMap.set(key, roundToPrecision((densityMap.get(key) || 0) + tx.amount, precision));
    const journalIds = journalMap.get(key) ?? new Set<JournalId>();
    journalIds.add(tx.journalId);
    journalMap.set(key, journalIds);
  }

  const points: HeatmapPoint[] = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const value = densityMap.get(`${day}_${hour}`) || 0;
      const journalIds = journalMap.get(`${day}_${hour}`);
      points.push({
        x: day,
        y: hour,
        value,
        ...(journalIds ? { journalIds: [...journalIds] } : {}),
      });
    }
  }
  return points;
}

export function calculateCalendarHeatmapFromHistory(
  history: readonly IncomeVsExpenseHistoryPoint[],
): HeatmapPoint[] {
  if (history.length === 0) return [];
  const startWeek = dayjs(history[0].startDate).startOf('week').valueOf();

  let lastMonth = -1;

  return history.map(h => {
    const date = dayjs(h.startDate);
    const currentMonth = date.month();
    let monthLabel: string | undefined;

    if (currentMonth !== lastMonth) {
      monthLabel = date.format('MMM');
      lastMonth = currentMonth;
    }

    return {
      x: date.day(),
      y: Math.floor(dayjs(h.startDate).diff(startWeek, 'week')),
      value: h.expense,
      label: date.format('D'),
      timestamp: h.startDate,
      ...(h.endDate !== undefined ? { periodEndTimestamp: h.endDate } : {}),
      monthLabel,
    };
  });
}
