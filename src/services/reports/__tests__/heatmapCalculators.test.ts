import {
  calculateCalendarHeatmapFromHistory,
  calculateSpendingHeatmapFromTransactions,
} from '@/src/services/reports/heatmapCalculators';
import { AccountType, TransactionType } from '@/src/types/enums';
import { AccountId, JournalId } from '@/src/types/ids';
import dayjs from 'dayjs';

describe('heatmapCalculators', () => {
  it('maps Monday to column 0 and Sunday to column 6 for spending density', () => {
    const points = calculateSpendingHeatmapFromTransactions([
      {
        journalId: 'journal-1' as JournalId,
        accountId: 'account-1' as AccountId,
        accountType: AccountType.ASSET,
        transactionType: TransactionType.DEBIT,
        transactionDate: dayjs('2026-01-05T12:00:00').valueOf(),
        amount: 10,
      },
      {
        journalId: 'journal-2' as JournalId,
        accountId: 'account-1' as AccountId,
        accountType: AccountType.ASSET,
        transactionType: TransactionType.DEBIT,
        transactionDate: dayjs('2026-01-11T12:00:00').valueOf(),
        amount: 20,
      },
    ]);

    expect(points.find(point => point.x === 0 && point.y === 12)?.value).toBe(10);
    expect(points.find(point => point.x === 6 && point.y === 12)?.value).toBe(20);
    expect(points.find(point => point.x === 0 && point.y === 12)?.journalIds).toEqual([
      'journal-1',
    ]);
  });

  it('labels calendar heatmap rows by week offset from the first history point', () => {
    const jan = dayjs('2026-01-05T12:00:00').valueOf();
    const feb = dayjs('2026-02-02T12:00:00').valueOf();
    const points = calculateCalendarHeatmapFromHistory([
      { startDate: jan, endDate: jan + 86_399_999, expense: 40 },
      { startDate: feb, endDate: feb + 86_399_999, expense: 55 },
    ]);

    expect(points).toEqual([
      expect.objectContaining({
        x: 1,
        y: 0,
        value: 40,
        label: '5',
        timestamp: jan,
        periodEndTimestamp: jan + 86_399_999,
        monthLabel: 'Jan',
      }),
      expect.objectContaining({
        x: 1,
        y: 4,
        value: 55,
        label: '2',
        timestamp: feb,
        periodEndTimestamp: feb + 86_399_999,
        monthLabel: 'Feb',
      }),
    ]);
  });
});
