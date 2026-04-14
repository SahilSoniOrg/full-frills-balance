/**
 * ExchangeRateRepository
 *
 * Handles all database operations for exchange rates.
 * This repository is the single point of truth for exchange rate persistence.
 */

import { database } from '@/src/data/database/Database';
import ExchangeRate from '@/src/data/models/ExchangeRate';
import { Q } from '@nozbe/watermelondb';

export interface ExchangeRateCacheData {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  source?: string;
}

class ExchangeRateRepository {
  private get collection() {
    return database.collections.get<ExchangeRate>('exchange_rates');
  }

  /**
   * Get the most recent cached rate for a currency pair
   */
  async getCachedRate(fromCurrency: string, toCurrency: string): Promise<ExchangeRate | null> {
    const rates = await this.collection
      .query(
        Q.where('from_currency', fromCurrency),
        Q.where('to_currency', toCurrency),
        Q.sortBy('effective_date', Q.desc),
        Q.take(1),
      )
      .fetch();

    return rates[0] || null;
  }

  /**
   * Get all cached rates for a base currency
   */
  async getAllRatesForBase(fromCurrency: string): Promise<ExchangeRate[]> {
    return this.collection.query(Q.where('from_currency', fromCurrency)).fetch();
  }

  /**
   * Get all rates newer than a specific timestamp
   */
  async getAllRecentRates(cutoff: number): Promise<ExchangeRate[]> {
    return this.collection.query(Q.where('effective_date', Q.gte(cutoff))).fetch();
  }

  /**
   * Observe all exchange rate changes
   */
  observeAll() {
    return this.collection.query().observe();
  }

  /**
   * Observe the latest rates for a base currency
   */
  observeLatestRates(fromCurrency: string) {
    return this.collection
      .query(
        Q.where('from_currency', fromCurrency),
        Q.sortBy('effective_date', 'desc'),
        Q.sortBy('created_at', 'desc'),
      )
      .observe();
  }

  /**
   * Cache an exchange rate in the database (deprecated - use cacheRatesBatch)
   */
  async cacheRate(data: ExchangeRateCacheData): Promise<ExchangeRate> {
    return database.write(async () => {
      return this.collection.create(record => {
        record.fromCurrency = data.fromCurrency;
        record.toCurrency = data.toCurrency;
        record.rate = data.rate;
        record.effectiveDate = Date.now();
        record.source = data.source || 'exchangerate-api.com';
      });
    });
  }

  /**
   * Batch cache multiple exchange rates for a single base currency.
   * Significantly reduces IO overhead by performing all writes in a single transaction.
   */
  async cacheRatesBatch(
    fromCurrency: string,
    rates: { toCurrency: string; rate: number }[],
    source: string = 'exchangerate-api.com',
  ): Promise<void> {
    if (rates.length === 0) return;

    await database.write(async () => {
      const now = Date.now();
      const operations = rates.map(r =>
        this.collection.prepareCreate(record => {
          record.fromCurrency = fromCurrency;
          record.toCurrency = r.toCurrency;
          record.rate = r.rate;
          record.effectiveDate = now;
          record.source = source;
        }),
      );

      await database.batch(...operations);
    });
  }

  /**
   * Delete exchange rates older than the specified timestamp
   */
  async deleteOldRates(olderThan: number): Promise<number> {
    const oldRates = await this.collection
      .query(Q.where('effective_date', Q.lt(olderThan)))
      .fetch();

    if (oldRates.length === 0) return 0;

    await database.write(async () => {
      for (const rate of oldRates) {
        await rate.destroyPermanently();
      }
    });

    return oldRates.length;
  }

  /**
   * Delete all exchange rates (for testing/reset)
   */
  async deleteAll(): Promise<number> {
    const allRates = await this.collection.query().fetch();

    if (allRates.length === 0) return 0;

    await database.write(async () => {
      for (const rate of allRates) {
        await rate.destroyPermanently();
      }
    });

    return allRates.length;
  }
}

export const exchangeRateRepository = new ExchangeRateRepository();
