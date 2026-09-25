import { TransactionType } from '@/src/types/enums';
import { AppConfig } from '@/src/constants/app-config';
import { roundToPrecision } from '@/src/utils/money';

import dayjs from 'dayjs';
import { ConvertedReportTransaction } from './reportTypes';

export interface HeatmapPoint {
  x: number; // Day of week (0-6)
  y: number; // Row index (absolute week number)
  value: number;
  label?: string; // Optional label (e.g. day of month)
  monthLabel?: string; // Optional month label (e.g. "Jan") for rows
  timestamp?: number; // Exact date/time for this point
}

export interface IncomeVsExpenseHistoryPoint {
  startDate: number;
  expense: number;
}

export function calculateSpendingHeatmapFromTransactions(
  transactions: ConvertedReportTransaction[],
  precision: number = AppConfig.constants.precision,
): HeatmapPoint[] {
  const densityMap = new Map<string, number>();

  for (const tx of transactions) {
    if (tx.transactionType !== TransactionType.DEBIT) continue;

    const dt = dayjs(tx.transactionDate);
    const key = `${dt.day()}_${dt.hour()}`;
    densityMap.set(key, roundToPrecision((densityMap.get(key) || 0) + tx.amount, precision));
  }

  const points: HeatmapPoint[] = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const value = densityMap.get(`${day}_${hour}`) || 0;
      points.push({ x: day, y: hour, value });
    }
  }
  return points;
}

export function calculateCalendarHeatmapFromHistory(
  history: IncomeVsExpenseHistoryPoint[],
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
      monthLabel,
    };
  });
}
