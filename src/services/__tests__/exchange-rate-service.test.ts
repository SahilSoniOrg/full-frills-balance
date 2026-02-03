// Mock ExchangeRateRepository
jest.mock('@/src/data/repositories/ExchangeRateRepository', () => ({
    exchangeRateRepository: {
        getCachedRate: jest.fn().mockResolvedValue(null),
        getAllRatesForBase: jest.fn().mockResolvedValue([]),
        cacheRate: jest.fn().mockResolvedValue({}),
    }
}));

import { exchangeRateRepository } from '@/src/data/repositories/ExchangeRateRepository';
import { ExchangeRateService } from '@/src/services/exchange-rate-service';

describe('ExchangeRateService', () => {
    let service: ExchangeRateService;
    const mockFetch = jest.fn();
    global.fetch = mockFetch;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new ExchangeRateService();
        // Reset defaults for each test
        (exchangeRateRepository.getCachedRate as jest.Mock).mockResolvedValue(null);
        (exchangeRateRepository.getAllRatesForBase as jest.Mock).mockResolvedValue([]);
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
                    rates: { 'EUR': 0.85 }
                })
            });

            const rate = await service.getRate('USD', 'EUR');
            expect(rate).toBe(0.85);
            expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('USD'));
            // Verify it was cached in DB
            expect(exchangeRateRepository.cacheRate).toHaveBeenCalled();
        });

        it('uses DB cache if recent', async () => {
            const recentDate = Date.now() - 1000;
            (exchangeRateRepository.getCachedRate as jest.Mock).mockResolvedValue({
                rate: 0.9,
                effectiveDate: recentDate,
                fromCurrency: 'USD',
                toCurrency: 'EUR'
            });

            const rate = await service.getRate('USD', 'EUR');
            expect(rate).toBe(0.9);
            expect(mockFetch).not.toHaveBeenCalled();
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
                json: async () => ({ rates: { 'EUR': 0.85 } })
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
                json: async () => ({ rates: { 'EUR': 0.85 } })
            });

            await service.fetchRatesForBase('USD');
            await service.fetchRatesForBase('USD');

            expect(mockFetch).toHaveBeenCalledTimes(2);
        });
    });

    describe('error handling', () => {
        it('throws descriptive error if response is not JSON', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                headers: { get: () => 'text/html' },
                text: async () => '<html>Error Page</html>'
            });

            await expect(service.fetchRatesForBase('GBP'))
                .rejects.toThrow(/Expected JSON response but got text\/html/);
        });

        it('throws descriptive error on non-ok response', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 429,
                statusText: 'Too Many Requests',
                text: async () => 'Rate limit exceeded'
            });

            await expect(service.fetchRatesForBase('JPY'))
                .rejects.toThrow(/Exchange rate API error \(429\): Too Many Requests/);
        });
    });

    describe('convert', () => {
        it('converts amount correctly', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                headers: { get: () => 'application/json' },
                json: async () => ({
                    rates: { 'EUR': 0.85 }
                })
            });

            const result = await service.convert(100, 'USD', 'EUR');
            expect(result.convertedAmount).toBe(85);
            expect(result.rate).toBe(0.85);
        });
    });

    describe('fetchRatesForBase fallback', () => {
        it('uses stale DB records if API fails', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            (exchangeRateRepository.getAllRatesForBase as jest.Mock).mockResolvedValue([
                { toCurrency: 'EUR', rate: 0.88 },
                { toCurrency: 'GBP', rate: 0.75 }
            ]);

            const rates = await service.fetchRatesForBase('CHF');
            expect(rates['EUR']).toBe(0.88);
            expect(rates['GBP']).toBe(0.75);
        });
    });
});
