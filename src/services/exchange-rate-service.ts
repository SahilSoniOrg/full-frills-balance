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
import { logger } from '@/src/utils/logger';

const CACHE_DURATION_MS = AppConfig.time.msPerDay; // 24 hours

export class ExchangeRateService {
  private memoryCache: Map<string, { rates: Record<string, number>; timestamp: number }> =
    new Map();
  private inFlightRequests: Map<string, Promise<Record<string, number>>> = new Map();

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
      // Use the unified fetcher which handles memory, DB, and network layers sequentially.
      const rates = await this.fetchRatesForBase(fromCurrency, forceRefresh);

      if (!rates[toCurrency]) {
        logger.warn(`No rate found for ${fromCurrency} to ${toCurrency}. Defaulting to 1.0`);
        return 1.0;
      }

      return rates[toCurrency];
    } catch (error) {
      logger.error(`Exchange rate failure (${fromCurrency} -> ${toCurrency}):`, error);
      return 1.0; // Graceful fallback
    }
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
    let latestTimestamp = 0;
    records.forEach(r => {
      rates[r.toCurrency] = r.rate;
      if ((r.effectiveDate || 0) > latestTimestamp) latestTimestamp = r.effectiveDate || 0;
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
      return existingRequest;
    }

    const requestPromise = (async () => {
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
        const rates = data.rates as Record<string, number>;

        if (!rates) throw new Error('Missing rates in response');

        logger.metric('ExchangeRateService.fetchNetwork', fetchDuration, { base: fromCurrency });

        this.memoryCache.set(fromCurrency, {
          rates,
          timestamp: Date.now(),
        });

        const rateArray = Object.entries(rates).map(([to, rate]) => ({
          toCurrency: to,
          rate,
        }));

        exchangeRateRepository.cacheRatesBatch(fromCurrency, rateArray).catch(err => {
          const errMsg = err instanceof Error ? err.message : String(err);
          logger.error(
            `[ExchangeRateService] Background DB batch persist failed: ${errMsg}`,
            err || new Error('Batch persist failed'),
          );
        });

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
        this.inFlightRequests.delete(fromCurrency);
      }
    })();

    this.inFlightRequests.set(fromCurrency, requestPromise);
    return requestPromise;
  }

  /**
   * Convert amount between currencies
   */
  async convert(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
  ): Promise<{ convertedAmount: number; rate: number }> {
    const rate = await this.getRate(fromCurrency, toCurrency);
    const convertedAmount = amount * rate;

    return {
      convertedAmount,
      rate,
    };
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
        // Group by base currency
        recentRates.forEach(r => {
          const entry = this.memoryCache.get(r.fromCurrency) || { rates: {}, timestamp: 0 };
          // Only keep the newest rate for each pair if DB has duplicates
          if (r.effectiveDate >= entry.timestamp) {
            entry.rates[r.toCurrency] = r.rate;
            entry.timestamp = r.effectiveDate;
          }
          this.memoryCache.set(r.fromCurrency, entry);
        });
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
