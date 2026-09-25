import { AppConfig } from '@/src/constants/app-config';
import { getCurrencyPrecision } from '@/src/utils/currencyPrecision';
import { AccountType } from '@/src/types/enums';

import { IncomeVsExpense } from '@/src/services/reports/reportSnapshot';
import { ReportingDeltaInput } from '@/src/services/reports/reportTypes';
import { roundToPrecision } from '@/src/utils/money';
import dayjs from 'dayjs';

export function getHistoryConfig(startDate: number, endDate: number) {
  const start = dayjs(startDate);
  const end = dayjs(endDate);
  const diffDays = end.diff(start, 'day');
  const monthlyThreshold = AppConfig.defaults.reportMonthlyBucketThresholdDays;
  const bucketUnit: 'day' | 'month' = diffDays > monthlyThreshold ? 'month' : 'day';
  const format = diffDays > monthlyThreshold ? 'MMM YYYY' : 'DD MMM';
  return { bucketUnit, format };
}

export function initializeHistoryMap(
  startDate: number,
  endDate: number,
): Map<number, IncomeVsExpense> {
  const historyMap = new Map<number, IncomeVsExpense>();
  const start = dayjs(startDate);
  const end = dayjs(endDate);
  const { bucketUnit, format } = getHistoryConfig(startDate, endDate);

  let current = start.startOf(bucketUnit);
  while (current.isBefore(end) || current.isSame(end, bucketUnit)) {
    const bucketStart = current.startOf(bucketUnit).valueOf();
    const bucketEnd = current.endOf(bucketUnit).valueOf();
    historyMap.set(bucketStart, {
      period: current.format(format),
      startDate: Math.max(bucketStart, startDate),
      endDate: Math.min(bucketEnd, endDate),
      income: 0,
      expense: 0,
    });
    current = current.add(1, bucketUnit);
  }
  return historyMap;
}

export function calculateHistoryFromDeltas(
  deltas: ReportingDeltaInput[],
  startDate: number,
  endDate: number,
  currency: string,
): IncomeVsExpense[] {
  const historyMap = initializeHistoryMap(startDate, endDate);
  const { bucketUnit } = getHistoryConfig(startDate, endDate);
  const precision = getCurrencyPrecision(currency);

  for (const d of deltas) {
    if (!d.dayStart) continue;
    const bucketKey = dayjs(d.dayStart).startOf(bucketUnit).valueOf();
    const bucket = historyMap.get(bucketKey);
    if (!bucket) continue;

    if (d.accountType === AccountType.INCOME) {
      bucket.income = roundToPrecision(bucket.income + d.delta, precision);
    } else if (d.accountType === AccountType.EXPENSE) {
      bucket.expense = roundToPrecision(bucket.expense + d.delta, precision);
    }
  }

  return Array.from(historyMap.values()).sort((a, b) => a.startDate - b.startDate);
}
