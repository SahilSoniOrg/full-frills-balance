import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { fetchMissingHistoricalRates } from '../missingExchangeRateFetch';

jest.mock('@/src/services/exchange-rate-service', () => ({
  exchangeRateService: { getHistoricalRate: jest.fn() },
}));

const getHistoricalRate = exchangeRateService.getHistoricalRate as jest.Mock;

describe('fetchMissingHistoricalRates', () => {
  const quotes = [{ fromCurrency: 'USD', toCurrency: 'INR', rateDate: Date.UTC(2026, 8, 1) }];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('counts only rates the report can use', async () => {
    getHistoricalRate.mockResolvedValue({ rate: 83 });
    await expect(fetchMissingHistoricalRates(quotes)).resolves.toEqual({
      attempted: 1,
      fetched: 1,
      failed: 0,
    });
    expect(getHistoricalRate).toHaveBeenCalledWith('USD', 'INR', Date.UTC(2026, 8, 1));
  });

  it('counts a positive 1.0 historical quote as successful', async () => {
    getHistoricalRate.mockResolvedValue({ rate: 1 });
    await expect(fetchMissingHistoricalRates(quotes)).resolves.toEqual({
      attempted: 1,
      fetched: 1,
      failed: 0,
    });
  });

  it('counts a thrown lookup as failed', async () => {
    getHistoricalRate.mockRejectedValue(new Error('offline'));
    await expect(fetchMissingHistoricalRates(quotes)).resolves.toEqual({
      attempted: 1,
      fetched: 0,
      failed: 1,
    });
  });

  it('does no work when there are no quotes', async () => {
    await expect(fetchMissingHistoricalRates([])).resolves.toEqual({
      attempted: 0,
      fetched: 0,
      failed: 0,
    });
    expect(getHistoricalRate).not.toHaveBeenCalled();
  });
});
