/**
 * Exchange Rate Service
 *
 * Handles currency conversion with caching and API integration.
 * Uses exchangerate-api.com free tier (1500 requests/month).
 *
 * All database operations are delegated to ExchangeRateRepository.
 */

import { AppConfig } from '@/src/constants/app-config';
import { exchangeRateRepository } from '@/src/data/repositories/ExchangeRateRepository';
import {
  fetchHistoricalRate,
  type HistoricalRate,
} from '@/src/services/currency/historicalExchangeRateProvider';
import { logger } from '@/src/utils/logger';
import { Subject, type Observable } from 'rxjs';

const CACHE_DURATION_MS = AppConfig.time.msPerDay; // 24 hours

type InFlightRateRequest = {
  promise: Promise<Record<string, number>>;
  forceRefresh: boolean;
};

function isUsableRequiredRate(rate: number | undefined): rate is number {
  return rate !== undefined && Number.isFinite(rate) && rate > 0;
}

export class ExchangeRateService {
  private memoryCache: Map<string, { rates: Record<string, number>; timestamp: number }> =
    new Map();
  private inFlightRequests: Map<string, InFlightRateRequest> = new Map();
  private historicalMemoryCache: Map<string, HistoricalRate> = new Map();
  private historicalInFlightRequests: Map<string, Promise<HistoricalRate>> = new Map();
  /** Bases whose current memory table came from the network, not a partial local cache. */
  private readonly networkFetchedBases = new Set<string>();
  /** Bases that already got one automatic refresh after a missing quote. */
  private readonly quoteRefreshAttempted = new Set<string>();
  private readonly missingQuoteRefreshes = new Map<string, Promise<Record<string, number>>>();
  private readonly spotRateUpdates = new Subject<string>();

  observeSpotRateUpdates(): Observable<string> {
    return this.spotRateUpdates.asObservable();
  }

  /**
   * Get exchange rate, using cache if available and recent
   */
  async getRate(
    fromCurrency: string,
    toCurrency: string,
    forceRefresh: boolean = false,
  ): Promise<number> {
    // Same currency = rate of 1
    if (fromCurrency === toCurrency) {
      return 1.0;
    }

    // Validate currency codes
    if (!fromCurrency || !toCurrency) {
      logger.warn(
        `Invalid currency codes: from=${fromCurrency}, to=${toCurrency}. Defaulting to 1.0`,
      );
      return 1.0;
    }

    try {
      const rate = await this.lookupRate(fromCurrency, toCurrency, forceRefresh);
      if (rate == null) {
        logger.warn(`No rate found for ${fromCurrency} to ${toCurrency}. Defaulting to 1.0`);
        return 1.0;
      }
      return rate;
    } catch (error) {
      logger.error(`Exchange rate failure (${fromCurrency} -> ${toCurrency}):`, error);
      return 1.0; // Graceful fallback
    }
  }

  /**
   * Resolves a rate for journal creation without allowing the read-side parity fallback.
   * Same-currency conversion remains an explicit identity rate.
   */
  async getRequiredRate(
    fromCurrency: string,
    toCurrency: string,
    forceRefresh: boolean = false,
  ): Promise<number | null> {
    if (fromCurrency === toCurrency) return 1;
    if (!fromCurrency || !toCurrency) return null;

    try {
      return await this.lookupRate(fromCurrency, toCurrency, forceRefresh);
    } catch (error) {
      logger.warn(
        `[ExchangeRateService] Required rate unavailable (${fromCurrency} -> ${toCurrency})`,
        {
          error,
        },
      );
      return null;
    }
  }

  /**
   * Read a pair from cache, then from the network once when that quote is absent.
   * A partial local table (one historical pair, or another quote) must not count
   * as a complete rate sheet for a different currency.
   */
  private async lookupRate(
    fromCurrency: string,
    toCurrency: string,
    forceRefresh: boolean,
  ): Promise<number | null> {
    const rates = await this.fetchRatesForBase(fromCurrency, forceRefresh);
    const direct = rates[toCurrency];
    if (isUsableRequiredRate(direct)) return direct;

    let pending = this.missingQuoteRefreshes.get(fromCurrency);
    if (
      !pending &&
      !forceRefresh &&
      !this.networkFetchedBases.has(fromCurrency) &&
      !this.quoteRefreshAttempted.has(fromCurrency)
    ) {
      this.quoteRefreshAttempted.add(fromCurrency);
      pending = this.fetchRatesForBase(fromCurrency, true).finally(() => {
        this.missingQuoteRefreshes.delete(fromCurrency);
      });
      this.missingQuoteRefreshes.set(fromCurrency, pending);
    }

    if (!pending) return null;

    try {
      const refreshed = await pending;
      const rate = refreshed[toCurrency];
      return isUsableRequiredRate(rate) ? rate : null;
    } catch {
      return null;
    }
  }

  /** Save an explicitly user-entered rate for current spot conversions only. */
  async setManualSpotRate(fromCurrency: string, toCurrency: string, rate: number): Promise<void> {
    const from = fromCurrency.trim().toUpperCase();
    const to = toCurrency.trim().toUpperCase();
    if (!from || !to || from === to || !isUsableRequiredRate(rate)) {
      throw new Error('A valid cross-currency rate is required');
    }

    await exchangeRateRepository.cacheRatesBatch(from, [{ toCurrency: to, rate }], 'manual');

    const cached = this.memoryCache.get(from);
    this.memoryCache.set(from, {
      rates: { ...(cached?.rates ?? {}), [to]: rate },
      timestamp: Date.now(),
    });
    this.spotRateUpdates.next(from);
  }

  /**
   * Get the exchange rate for an exact UTC calendar day.
   * Historical requests are deliberately separate from latest-rate requests so a
   * current spot rate can never silently become a historical valuation.
   */
  async getHistoricalRate(
    fromCurrency: string,
    toCurrency: string,
    transactionDate: number,
  ): Promise<HistoricalRate> {
    const from = fromCurrency.trim().toUpperCase();
    const to = toCurrency.trim().toUpperCase();

    if (!from || !to) {
      throw new Error('Currency codes are required for historical exchange rates');
    }
    if (!Number.isFinite(transactionDate)) {
      throw new Error('A valid transaction date is required for historical exchange rates');
    }

    const date = new Date(transactionDate);
    if (Number.isNaN(date.getTime())) {
      throw new Error('A valid transaction date is required for historical exchange rates');
    }

    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const effectiveDate = Date.UTC(year, month - 1, day);
    const isoDate = `${year.toString().padStart(4, '0')}-${month
      .toString()
      .padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    const cacheKey = `${from}:${to}:${isoDate}`;

    const memoryCached = this.historicalMemoryCache.get(cacheKey);
    if (memoryCached !== undefined) return memoryCached;

    if (from === to) {
      const quote = {
        rate: 1,
        requestedDate: effectiveDate,
        effectiveDate,
        source: 'identity',
      } satisfies HistoricalRate;
      this.historicalMemoryCache.set(cacheKey, quote);
      return quote;
    }

    const existingRequest = this.historicalInFlightRequests.get(cacheKey);
    if (existingRequest) return existingRequest;

    const requestPromise = (async () => {
      const databaseCached = await exchangeRateRepository.getCachedRateForDate(
        from,
        to,
        effectiveDate,
      );
      if (databaseCached && Number.isFinite(databaseCached.rate) && databaseCached.rate > 0) {
        const quote = {
          rate: databaseCached.rate,
          requestedDate: databaseCached.requestedDate ?? effectiveDate,
          effectiveDate: databaseCached.effectiveDate,
          source: databaseCached.source,
        } satisfies HistoricalRate;
        this.historicalMemoryCache.set(cacheKey, quote);
        return quote;
      }

      const quote = await fetchHistoricalRate(from, to, isoDate);
      const result = { ...quote, requestedDate: effectiveDate } satisfies HistoricalRate;
      this.historicalMemoryCache.set(cacheKey, result);
      try {
        await exchangeRateRepository.cacheHistoricalRate({
          fromCurrency: from,
          toCurrency: to,
          rate: result.rate,
          requestedDate: effectiveDate,
          effectiveDate: result.effectiveDate,
          source: result.source,
        });
      } catch (error) {
        logger.warn('[ExchangeRateService] Historical rate cache failed', { error });
      }

      return result;
    })().finally(() => {
      this.historicalInFlightRequests.delete(cacheKey);
    });

    this.historicalInFlightRequests.set(cacheKey, requestPromise);
    return requestPromise;
  }

  /**
   * Check if cached rate is still fresh
   */
  private isRateFresh(effectiveDate: number): boolean {
    const age = Date.now() - effectiveDate;
    return age < CACHE_DURATION_MS;
  }

  private hydrateMemoryFromRecords(
    fromCurrency: string,
    records: { toCurrency: string; rate: number; effectiveDate?: number }[],
  ): Record<string, number> {
    const rates: Record<string, number> = {};
    const effectiveDateByCurrency = new Map<string, number>();
    let latestTimestamp = 0;
    records.forEach(r => {
      const effectiveDate = r.effectiveDate || 0;
      if (effectiveDate >= (effectiveDateByCurrency.get(r.toCurrency) ?? 0)) {
        rates[r.toCurrency] = r.rate;
        effectiveDateByCurrency.set(r.toCurrency, effectiveDate);
      }
      if (effectiveDate > latestTimestamp) latestTimestamp = effectiveDate;
    });
    this.memoryCache.set(fromCurrency, {
      rates,
      timestamp: latestTimestamp || Date.now(),
    });
    return rates;
  }

  /**
   * Fetch all rates for a base currency and cache them
   * Prevents "thundering herd" by deduplicating concurrent requests for the same base.
   *
   * Any local rate (even stale) wins over the network so first paint / STS never
   * block on exchangerate-api.com. Freshness is repaired by syncTodayRates.
   */
  async fetchRatesForBase(
    fromCurrency: string,
    forceRefresh: boolean = false,
  ): Promise<Record<string, number>> {
    if (!fromCurrency) {
      throw new Error('Base currency is required for fetching rates');
    }

    if (!forceRefresh) {
      const memCached = this.memoryCache.get(fromCurrency);
      if (memCached) {
        return memCached.rates;
      }
    }

    const existingRequest = this.inFlightRequests.get(fromCurrency);
    if (existingRequest) {
      if (!forceRefresh || existingRequest.forceRefresh) return existingRequest.promise;

      await existingRequest.promise.catch(() => undefined);
      const nextRequest = this.inFlightRequests.get(fromCurrency);
      if (nextRequest) return nextRequest.promise;
      return this.fetchRatesForBase(fromCurrency, true);
    }

    let requestPromise!: Promise<Record<string, number>>;
    requestPromise = (async () => {
      try {
        if (!forceRefresh) {
          const cachedRecords = await exchangeRateRepository.getAllRatesForBase(fromCurrency);
          if (cachedRecords.length > 0) {
            return this.hydrateMemoryFromRecords(fromCurrency, cachedRecords);
          }

          // Detox waits for in-flight fetch(); E2E first-load must not hit the API.
          if (process.env.EXPO_PUBLIC_E2E === '1') {
            return {};
          }
        }

        const url = `${AppConfig.api.exchangeRateBaseUrl}/${fromCurrency}`;
        const fetchStart = Date.now();
        const response = await fetch(url);
        const fetchDuration = Date.now() - fetchStart;

        if (!response.ok) {
          const statusText = response.statusText ? `: ${response.statusText}` : '';
          throw new Error(`Exchange rate API error (${response.status})${statusText}`);
        }

        const contentType = response.headers?.get?.('content-type') || '';
        if (contentType && !contentType.includes('application/json')) {
          throw new Error(`Expected JSON response but got ${contentType}`);
        }

        const data = await response.json();
        const providerRates = data.rates as Record<string, number>;

        if (!providerRates) throw new Error('Missing rates in response');

        const rates = { ...providerRates };
        const cachedRecords = await exchangeRateRepository.getAllRatesForBase(fromCurrency);
        for (const record of cachedRecords) {
          if (
            record.source === 'manual' &&
            !isUsableRequiredRate(rates[record.toCurrency]) &&
            isUsableRequiredRate(record.rate)
          ) {
            rates[record.toCurrency] = record.rate;
          }
        }

        logger.metric('ExchangeRateService.fetchNetwork', fetchDuration, { base: fromCurrency });

        this.memoryCache.set(fromCurrency, {
          rates,
          timestamp: Date.now(),
        });
        this.networkFetchedBases.add(fromCurrency);

        const rateArray = Object.entries(providerRates).map(([to, rate]) => ({
          toCurrency: to,
          rate,
        }));

        const persistPromise = exchangeRateRepository.cacheRatesBatch(fromCurrency, rateArray);
        if (forceRefresh) {
          try {
            await persistPromise;
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            logger.error(
              `[ExchangeRateService] DB batch persist failed: ${errMsg}`,
              err || new Error('Batch persist failed'),
            );
          }
        } else {
          persistPromise.catch(err => {
            const errMsg = err instanceof Error ? err.message : String(err);
            logger.error(
              `[ExchangeRateService] Background DB batch persist failed: ${errMsg}`,
              err || new Error('Batch persist failed'),
            );
          });
        }
        if (forceRefresh) this.spotRateUpdates.next(fromCurrency);

        return rates;
      } catch (error) {
        logger.warn(`[Trace] ExchangeRateService.fetchRatesForBase failed for ${fromCurrency}:`, {
          error,
        });

        const staleRecords = await exchangeRateRepository.getAllRatesForBase(fromCurrency);
        if (staleRecords.length > 0) {
          return this.hydrateMemoryFromRecords(fromCurrency, staleRecords);
        }

        throw error || new Error(`Failed to fetch rates for ${fromCurrency}`);
      } finally {
        if (this.inFlightRequests.get(fromCurrency)?.promise === requestPromise) {
          this.inFlightRequests.delete(fromCurrency);
        }
      }
    })();

    this.inFlightRequests.set(fromCurrency, { promise: requestPromise, forceRefresh });
    return requestPromise;
  }

  /**
   * Synchronizes today's rates for a specific base currency.
   * If rates are missing or stale, it performs a network fetch and persists to DB.
   */
  async syncTodayRates(baseCurrency: string): Promise<void> {
    if (!baseCurrency || typeof baseCurrency !== 'string') {
      logger.warn('[ExchangeRateService] syncTodayRates called with invalid baseCurrency:', {
        baseCurrency,
      });
      return;
    }

    const currencyCode = baseCurrency.toUpperCase();

    try {
      const memCached = this.memoryCache.get(currencyCode);
      if (memCached && this.isRateFresh(memCached.timestamp)) {
        return; // Already fresh
      }

      await this.fetchRatesForBase(currencyCode, true);
      logger.info(`[ExchangeRateService] Synchronized rates for ${currencyCode}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        `[ExchangeRateService] Failed to sync rates for ${currencyCode}: ${errorMessage}`,
        error || new Error('Sync failed'),
      );
    }
  }

  /**
   * Pre-warms the memory cache by fetching all recent rates from the database.
   * Prevents sequential "per-pair" async database lookups during initial load.
   */
  async preWarmCache(baseCurrency?: string): Promise<void> {
    try {
      const start = Date.now();
      // Optimization: Load ALL most recent rates from DB to populate memory cache instantly.
      // We don't filter by CACHE_DURATION_MS here because any rate is better than 1.0
      // for the very first frame. Freshness is handled by background fetches.
      const recentRates = await exchangeRateRepository.getAllRecentRates(0);
      const duration = Date.now() - start;

      if (recentRates.length > 0) {
        const ratesByBase = new Map<string, typeof recentRates>();
        for (const rate of recentRates) {
          const records = ratesByBase.get(rate.fromCurrency) ?? [];
          records.push(rate);
          ratesByBase.set(rate.fromCurrency, records);
        }
        ratesByBase.forEach((records, currency) =>
          this.hydrateMemoryFromRecords(currency, records),
        );
      }

      logger.info(
        `[Trace] ExchangeRateService.preWarmCache: ${duration}ms (rates: ${recentRates.length})`,
      );

      // Network refresh is Detox-tracked and can dwarf first-load. E2E builds
      // stay on the imported/DB rates; production still repairs staleness.
      if (baseCurrency && process.env.EXPO_PUBLIC_E2E !== '1') {
        void this.syncTodayRates(baseCurrency);
      }
    } catch (error) {
      logger.error('[ExchangeRateService] Failed to pre-warm cache:', error);
    }
  }
}

// Export singleton instance
export const exchangeRateService = new ExchangeRateService();
