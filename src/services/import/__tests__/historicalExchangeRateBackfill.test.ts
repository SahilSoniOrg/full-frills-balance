import { AppConfig } from '@/src/constants/app-config';
import type { BatchImportData } from '@/src/types/importContracts';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { backfillHistoricalExchangeRates } from '@/src/services/import/historicalExchangeRateBackfill';
import { JournalDisplayType } from '@/src/types/enums';

jest.mock('@/src/services/exchange-rate-service', () => ({
  exchangeRateService: {
    getHistoricalRate: jest.fn(),
  },
}));

const baseData: BatchImportData = {
  accounts: [],
  journals: [
    {
      id: 'journal-1',
      journalDate: Date.UTC(2020, 0, 2, 12),
      currencyCode: 'CAD',
      status: 'POSTED',
      totalAmount: 100,
      transactionCount: 2,
      displayType: JournalDisplayType.EXPENSE,
    },
  ],
  transactions: [
    {
      id: 'transaction-foreign',
      journalId: 'journal-1' as BatchImportData['transactions'][number]['journalId'],
      accountId: 'account-1' as BatchImportData['transactions'][number]['accountId'],
      amount: 100,
      transactionType: 'DEBIT',
      currencyCode: 'EUR',
      transactionDate: Date.UTC(2020, 0, 2, 12),
    },
    {
      id: 'transaction-local',
      journalId: 'journal-1' as BatchImportData['transactions'][number]['journalId'],
      accountId: 'account-2' as BatchImportData['transactions'][number]['accountId'],
      amount: 100,
      transactionType: 'CREDIT',
      currencyCode: 'CAD',
      transactionDate: Date.UTC(2020, 0, 2, 12),
    },
    {
      id: 'transaction-explicit',
      journalId: 'journal-1' as BatchImportData['transactions'][number]['journalId'],
      accountId: 'account-3' as BatchImportData['transactions'][number]['accountId'],
      amount: 100,
      transactionType: 'DEBIT',
      currencyCode: 'EUR',
      transactionDate: Date.UTC(2020, 0, 2, 12),
      exchangeRate: 1.25,
    },
  ],
};

describe('backfillHistoricalExchangeRates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fills missing foreign rates without overwriting local or explicit rates', async () => {
    (exchangeRateService.getHistoricalRate as jest.Mock).mockResolvedValue({
      rate: 1.1,
      requestedDate: Date.UTC(2020, 0, 2),
      effectiveDate: Date.UTC(2020, 0, 2),
      source: 'frankfurter/ecb:historical',
    });

    const result = await backfillHistoricalExchangeRates(baseData);

    expect(result.data.transactions.map(transaction => transaction.exchangeRate)).toEqual([
      1.1,
      undefined,
      1.25,
    ]);
    expect(exchangeRateService.getHistoricalRate).toHaveBeenCalledTimes(1);
    expect(exchangeRateService.getHistoricalRate).toHaveBeenCalledWith(
      'EUR',
      'CAD',
      Date.UTC(2020, 0, 2, 12),
    );
    expect(result.warnings).toEqual([]);
  });

  it('keeps an unresolved transaction importable and reports a warning', async () => {
    (exchangeRateService.getHistoricalRate as jest.Mock).mockRejectedValue(
      new Error('No historical exchange rate found'),
    );

    const result = await backfillHistoricalExchangeRates(baseData);

    expect(result.data.transactions[0].exchangeRate).toBeUndefined();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toEqual(expect.stringContaining('transaction-foreign'));
    expect(result.warnings[0]).toEqual(expect.stringContaining('EUR -> CAD'));
  });

  it('limits concurrent historical lookups during large imports', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    (exchangeRateService.getHistoricalRate as jest.Mock).mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => setTimeout(resolve, 0));
      inFlight -= 1;
      return { rate: 1.1 };
    });

    const transactions = Array.from({ length: 12 }, (_, index) => ({
      ...baseData.transactions[0],
      id: `transaction-${index}`,
      transactionDate: Date.UTC(2020, 0, 2 + index),
    }));

    const result = await backfillHistoricalExchangeRates({ ...baseData, transactions });

    expect(result.warnings).toEqual([]);
    expect(result.data.transactions).toHaveLength(transactions.length);
    expect(maxInFlight).toBeLessThanOrEqual(AppConfig.performance.maxConcurrentOperations);
  });

  it('reports invalid dates instead of throwing while formatting a warning', async () => {
    (exchangeRateService.getHistoricalRate as jest.Mock).mockRejectedValue(
      new Error('A valid transaction date is required'),
    );

    const invalidData = {
      ...baseData,
      journals: baseData.journals.map(journal => ({ ...journal, journalDate: Number.NaN })),
      transactions: [{ ...baseData.transactions[0], transactionDate: Number.NaN }],
    };

    const result = await backfillHistoricalExchangeRates(invalidData);

    expect(result.data.transactions[0].exchangeRate).toBeUndefined();
    expect(result.warnings).toEqual([expect.stringContaining('transaction-foreign')]);
  });
});
