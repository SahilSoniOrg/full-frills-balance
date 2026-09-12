import { fetchHistoricalRate } from '@/src/services/currency/historicalExchangeRateProvider';

describe('historical exchange-rate provider', () => {
  const mockFetch = jest.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    global.fetch = mockFetch;
  });

  it('returns the npm snapshot rate and its published date', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ date: '2024-03-02', eur: { usd: 1.08 } }),
    });

    await expect(fetchHistoricalRate('EUR', 'USD', '2024-03-02')).resolves.toEqual({
      rate: 1.08,
      effectiveDate: Date.UTC(2024, 2, 2),
      source: 'fawazahmed0/currency-api:historical',
    });
  });

  it('preserves the ECB provider date when the requested day is not published', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' })
      .mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({
          date: '2024-03-01',
          base: 'EUR',
          quote: 'USD',
          rate: 1.0813,
        }),
      });

    await expect(fetchHistoricalRate('EUR', 'USD', '2024-03-03')).resolves.toEqual({
      rate: 1.0813,
      effectiveDate: Date.UTC(2024, 2, 1),
      source: 'frankfurter/ecb:historical',
    });
  });

  it('uses ECB when the npm snapshot does not contain the requested pair', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ date: '2024-03-02', eur: {} }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({
          date: '2024-03-02',
          base: 'EUR',
          quote: 'USD',
          rate: 1.079,
        }),
      });

    await expect(fetchHistoricalRate('EUR', 'USD', '2024-03-02')).resolves.toEqual({
      rate: 1.079,
      effectiveDate: Date.UTC(2024, 2, 2),
      source: 'frankfurter/ecb:historical',
    });
  });
});
