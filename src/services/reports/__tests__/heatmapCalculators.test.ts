import { calculateSpendingHeatmapFromTransactions } from '@/src/services/reports/heatmapCalculators';
import { AccountType, TransactionType } from '@/src/types/enums';
import { AccountId } from '@/src/types/ids';
import dayjs from 'dayjs';

describe('calculateSpendingHeatmapFromTransactions', () => {
  it('maps Monday to column 0 and Sunday to column 6', () => {
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
});
