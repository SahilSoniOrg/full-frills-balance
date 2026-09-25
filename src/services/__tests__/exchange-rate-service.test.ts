import { exchangeRateRepository } from '@/src/data/repositories/ExchangeRateRepository';
import { ExchangeRateService } from '@/src/services/exchange-rate-service';

// Mock ExchangeRateRepository
jest.mock('@/src/data/repositories/ExchangeRateRepository', () => ({
  exchangeRateRepository: {
    getCachedRate: jest.fn().mockResolvedValue(null),
    getCachedRateForDate: jest.fn().mockResolvedValue(null),
    getAllRatesForBase: jest.fn().mockResolvedValue([]),
    cacheRatesBatch: jest.fn().mockResolvedValue([]),
    cacheHistoricalRate: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('ExchangeRateService', () => {
  let service: ExchangeRateService;
  const mockFetch = jest.fn();
  global.fetch = mockFetch;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    service = new ExchangeRateService();
    // Reset defaults for each test
    (exchangeRateRepository.getCachedRate as jest.Mock).mockReset().mockResolvedValue(null);
    (exchangeRateRepository.getCachedRateForDate as jest.Mock).mockReset().mockResolvedValue(null);
    (exchangeRateRepository.getAllRatesForBase as jest.Mock).mockReset().mockResolvedValue([]);
    (exchangeRateRepository.cacheHistoricalRate as jest.Mock)
      .mockReset()
      .mockResolvedValue(undefined);
  });

  describe('getRate', () => {
    it('returns 1.0 for same currency', async () => {
      const rate = await service.getRate('USD', 'USD');
      expect(rate).toBe(1.0);
    });

    it('fetches from API if not in cache', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({
          rates: { EUR: 0.85 },
        }),
      });

      const rate = await service.getRate('USD', 'EUR');
      expect(rate).toBe(0.85);
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('USD'));
    });

    it('uses DB cache if recent', async () => {
      const recentDate = Date.now() - 1000;
      (exchangeRateRepository.getAllRatesForBase as jest.Mock).mockResolvedValue([
        {
          rate: 0.9,
          effectiveDate: recentDate,
          fromCurrency: 'USD',
          toCurrency: 'EUR',
        },
      ]);

      const rate = await service.getRate('USD', 'EUR');
      expect(rate).toBe(0.9);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('uses stale DB cache without hitting the network', async () => {
      const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
      (exchangeRateRepository.getAllRatesForBase as jest.Mock).mockResolvedValue([
        {
          rate: 0.91,
          effectiveDate: twoDaysAgo,
          fromCurrency: 'USD',
          toCurrency: 'EUR',
        },
      ]);

      const rate = await service.getRate('USD', 'EUR');
      expect(rate).toBe(0.91);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('uses the newest cached quote when records are returned out of date order', async () => {
      const olderDate = Date.now() - 2 * 24 * 60 * 60 * 1000;
      const newerDate = Date.now() - 60 * 60 * 1000;
      (exchangeRateRepository.getAllRatesForBase as jest.Mock).mockResolvedValue([
        { rate: 1.1, effectiveDate: newerDate, fromCurrency: 'EUR', toCurrency: 'USD' },
        { rate: 1.2, effectiveDate: olderDate, fromCurrency: 'EUR', toCurrency: 'USD' },
      ]);

      await expect(service.getRate('EUR', 'USD')).resolves.toBe(1.1);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('getRequiredRate', () => {
    it('preserves same-currency identity', async () => {
      await expect(service.getRequiredRate('USD', 'USD')).resolves.toBe(1);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns a fetched unlike-currency rate', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ rates: { EUR: 0.85 } }),
      });

      await expect(service.getRequiredRate('USD', 'EUR')).resolves.toBe(0.85);
    });

    it('accepts a legitimate unlike-currency parity rate', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ rates: { EUR: 1 } }),
      });

      await expect(service.getRequiredRate('USD', 'EUR')).resolves.toBe(1);
    });

    it('returns unavailable instead of accepting the read-side parity fallback', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(service.getRequiredRate('USD', 'EUR')).resolves.toBeNull();
    });

    it('returns unavailable when the requested pair is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ rates: { GBP: 0.78 } }),
      });

      await expect(service.getRequiredRate('USD', 'EUR')).resolves.toBeNull();
    });
  });

  describe('getHistoricalRate', () => {
    it('returns 1 for the same currency without reading cache or network', async () => {
      const rate = await service.getHistoricalRate(' eur ', 'EUR', Date.UTC(2024, 2, 2));

      expect(rate).toMatchObject({
        rate: 1,
        requestedDate: Date.UTC(2024, 2, 2),
        effectiveDate: Date.UTC(2024, 2, 2),
        source: 'identity',
      });
      expect(exchangeRateRepository.getCachedRateForDate).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('uses an exact-date database cache before calling a provider', async () => {
      (exchangeRateRepository.getCachedRateForDate as jest.Mock).mockResolvedValueOnce({
        rate: 1.075,
        requestedDate: Date.UTC(2024, 2, 2),
        effectiveDate: Date.UTC(2024, 2, 1),
        source: 'frankfurter/ecb:historical',
      });

      const rate = await service.getHistoricalRate('EUR', 'USD', Date.UTC(2024, 2, 2, 18));

      expect(rate).toMatchObject({
        rate: 1.075,
        requestedDate: Date.UTC(2024, 2, 2),
        effectiveDate: Date.UTC(2024, 2, 1),
        source: 'frankfurter/ecb:historical',
      });
      expect(exchangeRateRepository.getCachedRateForDate).toHaveBeenCalledWith(
        'EUR',
        'USD',
        Date.UTC(2024, 2, 2),
      );
      expect(mockFetch).not.toHaveBeenCalled();
      expect(exchangeRateRepository.cacheHistoricalRate).not.toHaveBeenCalled();
    });

    it('fetches the provider rate for the transaction date', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({
          date: '2024-03-02',
          eur: { usd: 1.08 },
        }),
      });

      const rate = await service.getHistoricalRate('EUR', 'USD', Date.UTC(2024, 2, 2, 18));

      expect(rate.rate).toBe(1.08);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@2024-03-02/v1/currencies/eur.min.json',
      );
      expect(exchangeRateRepository.cacheHistoricalRate).toHaveBeenCalledWith({
        fromCurrency: 'EUR',
        toCurrency: 'USD',
        rate: 1.08,
        requestedDate: Date.UTC(2024, 2, 2),
        effectiveDate: Date.UTC(2024, 2, 2),
        source: 'fawazahmed0/currency-api:historical',
      });
    });

    it('uses the in-memory cache on repeated requests for the same date', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ date: '2024-03-02', eur: { usd: 1.08 } }),
      });

      const firstRate = await service.getHistoricalRate('EUR', 'USD', Date.UTC(2024, 2, 2));
      const secondRate = await service.getHistoricalRate('EUR', 'USD', Date.UTC(2024, 2, 2, 23));

      expect(firstRate.rate).toBe(1.08);
      expect(secondRate.rate).toBe(1.08);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(exchangeRateRepository.getCachedRateForDate).toHaveBeenCalledTimes(1);
    });

    it('deduplicates concurrent requests for the same historical pair and date', async () => {
      let resolveFetch: (response: unknown) => void = () => undefined;
      const pendingFetch = new Promise(resolve => {
        resolveFetch = resolve;
      });
      mockFetch.mockReturnValueOnce(pendingFetch);

      const firstRequest = service.getHistoricalRate('EUR', 'USD', Date.UTC(2024, 2, 2));
      const secondRequest = service.getHistoricalRate('EUR', 'USD', Date.UTC(2024, 2, 2, 12));

      resolveFetch({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ date: '2024-03-02', eur: { usd: 1.08 } }),
      });

      await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([
        expect.objectContaining({ rate: 1.08 }),
        expect.objectContaining({ rate: 1.08 }),
      ]);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(exchangeRateRepository.getCachedRateForDate).toHaveBeenCalledTimes(1);
    });

    it('falls back to the Cloudflare mirror when jsDelivr is unavailable', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Unavailable' })
        .mockResolvedValueOnce({
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({ date: '2024-03-03', eur: { usd: 1.081 } }),
        });

      const rate = await service.getHistoricalRate('EUR', 'USD', Date.UTC(2024, 2, 3));

      expect(rate.rate).toBe(1.081);
      expect(mockFetch.mock.calls).toEqual([
        [
          'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@2024-03-03/v1/currencies/eur.min.json',
        ],
        ['https://2024-03-03.currency-api.pages.dev/v1/currencies/eur.min.json'],
      ]);
    });

    it('falls back to the ECB-backed provider for dates outside the npm dataset', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({
          date: '1999-01-04',
          base: 'EUR',
          quote: 'USD',
          rate: 1.1789,
        }),
      });

      const rate = await service.getHistoricalRate('EUR', 'USD', Date.UTC(1999, 0, 4));

      expect(rate.rate).toBe(1.1789);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.frankfurter.dev/v2/providers/ecb/rate/eur/usd?date=1999-01-04',
      );
      expect(exchangeRateRepository.cacheHistoricalRate).toHaveBeenCalledWith({
        fromCurrency: 'EUR',
        toCurrency: 'USD',
        rate: 1.1789,
        requestedDate: Date.UTC(1999, 0, 4),
        effectiveDate: Date.UTC(1999, 0, 4),
        source: 'frankfurter/ecb:historical',
      });
    });

    it('preserves the provider date separately from the requested date', async () => {
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

      const quote = await service.getHistoricalRate('EUR', 'USD', Date.UTC(2024, 2, 3));

      expect(quote).toMatchObject({
        rate: 1.0813,
        requestedDate: Date.UTC(2024, 2, 3),
        effectiveDate: Date.UTC(2024, 2, 1),
        source: 'frankfurter/ecb:historical',
      });
      expect(exchangeRateRepository.cacheHistoricalRate).toHaveBeenCalledWith({
        fromCurrency: 'EUR',
        toCurrency: 'USD',
        rate: 1.0813,
        requestedDate: Date.UTC(2024, 2, 3),
        effectiveDate: Date.UTC(2024, 2, 1),
        source: 'frankfurter/ecb:historical',
      });
    });

    it('skips the npm providers for the day before their dataset begins', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ date: '2024-03-01', base: 'EUR', quote: 'USD', rate: 1.081 }),
      });

      await expect(service.getHistoricalRate('EUR', 'USD', Date.UTC(2024, 2, 1))).resolves.toEqual(
        expect.objectContaining({ rate: 1.081 }),
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.frankfurter.dev/v2/providers/ecb/rate/eur/usd?date=2024-03-01',
      );
    });

    it('falls back to ECB when npm data is present but does not contain the requested pair', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({ date: '2024-03-02', eur: {} }),
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({ date: '2024-03-02', base: 'EUR', quote: 'USD', rate: 1.079 }),
        });

      await expect(service.getHistoricalRate('EUR', 'USD', Date.UTC(2024, 2, 2))).resolves.toEqual(
        expect.objectContaining({ rate: 1.079 }),
      );
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://api.frankfurter.dev/v2/providers/ecb/rate/eur/usd?date=2024-03-02',
      );
    });

    it('rejects when all historical providers fail', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Unavailable' })
        .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Unavailable' })
        .mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' });

      await expect(service.getHistoricalRate('EUR', 'USD', Date.UTC(2024, 2, 2))).rejects.toThrow(
        'ECB historical exchange rate API error (404): Not Found',
      );
    });

    it('rejects invalid currency codes and dates before making a request', async () => {
      await expect(service.getHistoricalRate('', 'USD', Date.UTC(2024, 2, 2))).rejects.toThrow(
        'Currency codes are required',
      );
      await expect(service.getHistoricalRate('EUR', 'USD', Number.NaN)).rejects.toThrow(
        'A valid transaction date is required',
      );

      expect(mockFetch).not.toHaveBeenCalled();
      expect(exchangeRateRepository.getCachedRateForDate).not.toHaveBeenCalled();
    });

    it('returns the rate even if persisting the historical cache fails', async () => {
      (exchangeRateRepository.cacheHistoricalRate as jest.Mock).mockRejectedValueOnce(
        new Error('database unavailable'),
      );
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ date: '2024-03-02', eur: { usd: 1.08 } }),
      });

      await expect(service.getHistoricalRate('EUR', 'USD', Date.UTC(2024, 2, 2))).resolves.toEqual(
        expect.objectContaining({ rate: 1.08 }),
      );
      await Promise.resolve();
    });
  });

  describe('request deduplication (thundering herd)', () => {
    it('only calls fetch once for concurrent requests to same base', async () => {
      let resolvePromise: (value: any) => void;
      const deferred = new Promise(resolve => {
        resolvePromise = resolve;
      });

      mockFetch.mockReturnValue(deferred);

      // Trigger multiple concurrent requests
      const p1 = service.fetchRatesForBase('USD');
      const p2 = service.fetchRatesForBase('USD');
      const p3 = service.fetchRatesForBase('USD');

      // Complete the fetch
      resolvePromise!({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ rates: { EUR: 0.85 } }),
      });

      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(r1['EUR']).toBe(0.85);
      expect(r2['EUR']).toBe(0.85);
      expect(r3['EUR']).toBe(0.85);
    });

    it('allows new fetch after previous one completed', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ rates: { EUR: 0.85 } }),
      });

      await service.fetchRatesForBase('USD');
      await service.fetchRatesForBase('USD', true);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    it('throws descriptive error if response is not JSON', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'text/html' },
        text: async () => '<html>Error Page</html>',
      });

      await expect(service.fetchRatesForBase('GBP')).rejects.toThrow(
        /Expected JSON response but got text\/html/,
      );
    });

    it('throws descriptive error on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: async () => 'Rate limit exceeded',
      });

      await expect(service.fetchRatesForBase('JPY')).rejects.toThrow(
        /Exchange rate API error \(429\): Too Many Requests/,
      );
    });
  });

  describe('fetchRatesForBase fallback', () => {
    it('uses stale DB records if API fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      (exchangeRateRepository.getAllRatesForBase as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { toCurrency: 'EUR', rate: 0.88 },
          { toCurrency: 'GBP', rate: 0.75 },
        ]);

      const rates = await service.fetchRatesForBase('CHF');
      expect(rates['EUR']).toBe(0.88);
      expect(rates['GBP']).toBe(0.75);
    });
  });
});
