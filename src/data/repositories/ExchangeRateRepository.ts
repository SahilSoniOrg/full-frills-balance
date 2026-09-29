/**
 * ExchangeRateRepository
 *
 * Handles all database operations for exchange rates.
 * This repository is the single point of truth for exchange rate persistence.
 */

import { database } from '@/src/data/database/Database';
import ExchangeRate from '@/src/data/models/ExchangeRate';
import { observeQueryWithModelChanges } from '@/src/data/repositories/observeQueryWithModelChanges';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { AuditAction } from '@/src/types/enums';
import type { WorkplaceId } from '@/src/types/ids';
import type { Model } from '@nozbe/watermelondb';
import { Q } from '@nozbe/watermelondb';

export interface ExchangeRateCacheInput {
  toCurrency: string;
  rate: number;
}

export interface HistoricalExchangeRateInput {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  requestedDate: number;
  effectiveDate: number;
  source: string;
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

  /** Get a cached rate recorded for an exact UTC calendar day. */
  async getCachedRateForDate(
    fromCurrency: string,
    toCurrency: string,
    requestedDate: number,
  ): Promise<ExchangeRate | null> {
    const requestedRates = await this.collection
      .query(
        Q.where('from_currency', fromCurrency),
        Q.where('to_currency', toCurrency),
        Q.where('requested_date', requestedDate),
        Q.take(1),
      )
      .fetch();

    if (requestedRates[0]) return requestedRates[0];

    // Historical rows written before requested_date existed used the requested
    // day as effective_date. Keep those rows readable after the migration.
    const legacyRates = await this.collection
      .query(
        Q.where('from_currency', fromCurrency),
        Q.where('to_currency', toCurrency),
        Q.where('effective_date', requestedDate),
        Q.where('requested_date', null),
        Q.take(1),
      )
      .fetch();

    return legacyRates[0] || null;
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
    return observeQueryWithModelChanges(this.collection.query());
  }

  /**
   * Observe the latest rates for a base currency
   */
  observeLatestRates(fromCurrency: string) {
    return observeQueryWithModelChanges(
      this.collection.query(
        Q.where('from_currency', fromCurrency),
        Q.sortBy('effective_date', 'desc'),
        Q.sortBy('created_at', 'desc'),
      ),
    );
  }

  /**
   * Batch cache multiple exchange rates for a single base currency.
   * Significantly reduces IO overhead by performing all writes in a single transaction.
   */
  async cacheRatesBatch(
    fromCurrency: string,
    rates: readonly ExchangeRateCacheInput[],
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

      await database.batch(operations);
    });
  }

  /** Persist user-entered current rates and their audit records atomically. */
  async cacheManualRates(
    workplaceId: WorkplaceId,
    rates: { fromCurrency: string; toCurrency: string; rate: number }[],
    correlationId: string,
  ): Promise<void> {
    if (rates.length === 0) return;

    const normalizedRates = rates.map(rate => ({
      fromCurrency: rate.fromCurrency.trim().toUpperCase(),
      toCurrency: rate.toCurrency.trim().toUpperCase(),
      rate: rate.rate,
    }));
    const pairKeys = new Set<string>();
    for (const rate of normalizedRates) {
      const pairKey = `${rate.fromCurrency}->${rate.toCurrency}`;
      if (
        !rate.fromCurrency ||
        !rate.toCurrency ||
        rate.fromCurrency === rate.toCurrency ||
        !Number.isFinite(rate.rate) ||
        rate.rate <= 0 ||
        pairKeys.has(pairKey)
      ) {
        throw new Error('Manual exchange rates must contain unique, valid currency pairs');
      }
      pairKeys.add(pairKey);
    }

    await database.write(async () => {
      const timestamp = Date.now();
      const operations: Model[] = [];
      for (const rate of normalizedRates) {
        const existing = await this.getCachedRate(rate.fromCurrency, rate.toCurrency);
        if (existing?.source === 'manual' && existing.rate === rate.rate) continue;

        operations.push(
          this.collection.prepareCreate(record => {
            record.fromCurrency = rate.fromCurrency;
            record.toCurrency = rate.toCurrency;
            record.rate = rate.rate;
            record.effectiveDate = timestamp;
            record.source = 'manual';
          }),
          auditRepository.prepareLog(
            {
              entityType: 'exchange_rate',
              entityId: `${rate.fromCurrency}->${rate.toCurrency}`,
              displayName: `${rate.fromCurrency} → ${rate.toCurrency}`,
              eventType: 'exchange_rate.manual_set',
              action: AuditAction.UPDATE,
              source: 'app',
              correlationId,
              undoable: false,
              changes: {
                before: {
                  rate: existing?.rate ?? null,
                  rateSource: existing?.source ?? null,
                },
                after: { rate: rate.rate, rateSource: 'manual' },
              },
            },
            workplaceId,
          ),
        );
      }

      if (operations.length > 0) await database.batch(operations);
    });
  }

  /** Persist one historical rate keyed by the requested day. */
  async cacheHistoricalRate(input: HistoricalExchangeRateInput): Promise<void> {
    await database.write(async () => {
      const existing = await this.getCachedRateForDate(
        input.fromCurrency,
        input.toCurrency,
        input.requestedDate,
      );

      if (existing) {
        await existing.update(record => {
          record.rate = input.rate;
          record.requestedDate = input.requestedDate;
          record.effectiveDate = input.effectiveDate;
          record.source = input.source;
        });
        return;
      }

      const operation = this.collection.prepareCreate(record => {
        record.fromCurrency = input.fromCurrency;
        record.toCurrency = input.toCurrency;
        record.rate = input.rate;
        record.requestedDate = input.requestedDate;
        record.effectiveDate = input.effectiveDate;
        record.source = input.source;
      });
      await database.batch([operation]);
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
