import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import {
  convertReportTransactions,
  normalizeDeltas,
} from '@/src/services/reports/reportingDeltaEngine';
import { ReportingDeltaInput } from '@/src/services/reports/reportTypes';
import { AccountId } from '@/src/types/domain';

jest.mock('@/src/services/exchange-rate-service', () => ({
  exchangeRateService: {
    getRate: jest.fn(),
    fetchRatesForBase: jest.fn().mockResolvedValue({}),
  },
}));

const getRate = exchangeRateService.getRate as jest.Mock;

describe('reportingDeltaEngine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getRate.mockResolvedValue(1.25);
  });

  describe('convertReportTransactions', () => {
    it('uses stored exchange rate in historical mode without calling getRate', async () => {
      const accounts = [
        {
          id: 'exp-1' as AccountId,
          name: 'Travel',
          accountType: AccountType.EXPENSE,
          currencyCode: 'USD',
        },
      ];
      const transactions = [
        {
          accountId: 'exp-1' as AccountId,
          amount: 100,
          transactionType: TransactionType.DEBIT,
          currencyCode: 'EUR',
          exchangeRate: 1.1,
          transactionDate: Date.now(),
        },
      ] as any[];

      const result = await convertReportTransactions(transactions, 'USD', accounts);

      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(110);
      expect(getRate).not.toHaveBeenCalled();
    });

    it('omits transactions when FX is unavailable', async () => {
      getRate.mockResolvedValue(1.0);
      const accounts = [
        {
          id: 'exp-1' as AccountId,
          name: 'Travel',
          accountType: AccountType.EXPENSE,
          currencyCode: 'USD',
        },
      ];
      const transactions = [
        {
          accountId: 'exp-1' as AccountId,
          amount: 50,
          transactionType: TransactionType.DEBIT,
          currencyCode: 'EUR',
          transactionDate: Date.now(),
        },
      ] as any[];

      const result = await convertReportTransactions(transactions, 'USD', accounts);

      expect(result).toHaveLength(0);
      expect(getRate).toHaveBeenCalledWith('EUR', 'USD');
    });
  });

  describe('normalizeDeltas', () => {
    it('converts deltas with per-row stored exchange rate', async () => {
      const deltas: ReportingDeltaInput[] = [
        {
          accountId: 'exp-1' as AccountId,
          currencyCode: 'GBP',
          delta: 40,
          exchangeRate: 1.25,
        },
      ];

      const result = await normalizeDeltas(deltas, 'USD');

      expect(result).toHaveLength(1);
      expect(result[0].delta).toBe(50);
      expect(result[0].currencyCode).toBe('USD');
      expect(getRate).not.toHaveBeenCalled();
    });
  });
});
