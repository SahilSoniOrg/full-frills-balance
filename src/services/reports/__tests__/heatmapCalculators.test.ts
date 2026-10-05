import {
  calculateCalendarHeatmapFromHistory,
  calculateSpendingHeatmapFromTransactions,
} from '@/src/services/reports/heatmapCalculators';
import { AccountType, TransactionType } from '@/src/types/enums';
import { AccountId } from '@/src/types/ids';
import dayjs from 'dayjs';

describe('heatmapCalculators', () => {
  it('maps Monday to column 0 and Sunday to column 6 for spending density', () => {
    const points = calculateSpendingHeatmapFromTransactions([
      {
        accountId: 'account-1' as AccountId,
        accountType: AccountType.ASSET,
        transactionType: TransactionType.DEBIT,
        transactionDate: dayjs('2026-01-05T12:00:00').valueOf(),
        amount: 10,
      },
      {
        accountId: 'account-1' as AccountId,
        accountType: AccountType.ASSET,
        transactionType: TransactionType.DEBIT,
        transactionDate: dayjs('2026-01-11T12:00:00').valueOf(),
        amount: 20,
      },
    ]);

    expect(points.find(point => point.x === 0 && point.y === 12)?.value).toBe(10);
    expect(points.find(point => point.x === 6 && point.y === 12)?.value).toBe(20);
  });

  it('labels calendar heatmap rows by week offset from the first history point', () => {
    const jan = dayjs('2026-01-05T12:00:00').valueOf();
    const feb = dayjs('2026-02-02T12:00:00').valueOf();
    const points = calculateCalendarHeatmapFromHistory([
      { startDate: jan, expense: 40 },
      { startDate: feb, expense: 55 },
    ]);

    expect(points).toEqual([
      expect.objectContaining({ x: 1, y: 0, value: 40, label: '5', monthLabel: 'Jan' }),
      expect.objectContaining({ x: 1, y: 4, value: 55, label: '2', monthLabel: 'Feb' }),
    ]);
  });
});
