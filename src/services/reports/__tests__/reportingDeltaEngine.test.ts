import { AccountType, TransactionType } from '@/src/types/enums';
import { AccountId, asWorkplaceId } from '@/src/types/ids';

import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { convertReportTransactions } from '@/src/services/reports/reportingDeltaEngine';

jest.mock('@/src/services/exchange-rate-service', () => ({
  exchangeRateService: {
    getRate: jest.fn(),
    getHistoricalRate: jest.fn(),
    fetchRatesForBase: jest.fn().mockResolvedValue({}),
  },
}));
jest.mock('@/src/data/repositories/journal/journalQueryRepository', () => ({
  journalQueryRepository: { findByIds: jest.fn() },
}));

const getRate = exchangeRateService.getRate as jest.Mock;
const getHistoricalRate = exchangeRateService.getHistoricalRate as jest.Mock;
const findJournals = journalQueryRepository.findByIds as jest.Mock;
const workplaceId = asWorkplaceId('workplace-1');
const journalDate = Date.UTC(2024, 2, 2);

describe('reportingDeltaEngine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getRate.mockResolvedValue(1.25);
    findJournals.mockResolvedValue([{ id: 'journal-1', currencyCode: 'USD', journalDate }]);
  });

  describe('convertReportTransactions', () => {
    it('converts a journal line through the journal currency using its stored rate', async () => {
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
          journalId: 'journal-1',
          transactionDate: journalDate,
        },
      ] as any[];

      const result = await convertReportTransactions(transactions, 'USD', accounts, workplaceId);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].amount).toBe(110);
      expect(getRate).not.toHaveBeenCalled();
    });

    it('omits transactions when the line-to-journal historical quote is unavailable', async () => {
      getHistoricalRate.mockRejectedValue(new Error('No historical quote'));
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
          journalId: 'journal-1',
          transactionDate: journalDate,
        },
      ] as any[];

      const result = await convertReportTransactions(transactions, 'USD', accounts, workplaceId);

      expect(result.transactions).toHaveLength(0);
      expect(getHistoricalRate).toHaveBeenCalledWith('EUR', 'USD', journalDate);
      expect(getRate).not.toHaveBeenCalled();
    });
  });
});
