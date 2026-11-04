import { database } from '@/src/data/database/Database';
import ExchangeRate from '@/src/data/models/ExchangeRate';
import { exchangeRateRepository } from '@/src/data/repositories/ExchangeRateRepository';
import { map } from 'rxjs/operators';
import { observeAfterInitial } from '@/src/testing/observeAfterInitial';
import { resetDatabase } from '@/src/testing/resetDatabase';
import type { WorkplaceId } from '@/src/types/ids';

describe('ExchangeRateRepository historical rates', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('reads by requested date and upserts the historical record', async () => {
    const requestedDate = Date.UTC(2024, 2, 3);
    const firstEffectiveDate = Date.UTC(2024, 2, 1);
    const secondEffectiveDate = Date.UTC(2024, 2, 2);

    await exchangeRateRepository.cacheHistoricalRate({
      fromCurrency: 'EUR',
      toCurrency: 'USD',
      rate: 1.0813,
      requestedDate,
      effectiveDate: firstEffectiveDate,
      source: 'frankfurter/ecb:historical',
    });
    await exchangeRateRepository.cacheHistoricalRate({
      fromCurrency: 'EUR',
      toCurrency: 'USD',
      rate: 1.082,
      requestedDate,
      effectiveDate: secondEffectiveDate,
      source: 'fawazahmed0/currency-api:historical',
    });

    const cached = await exchangeRateRepository.getCachedRateForDate('EUR', 'USD', requestedDate);
    const records = await database.collections.get<ExchangeRate>('exchange_rates').query().fetch();

    expect(records).toHaveLength(1);
    expect(cached).toMatchObject({
      fromCurrency: 'EUR',
      toCurrency: 'USD',
      rate: 1.082,
      requestedDate,
      effectiveDate: secondEffectiveDate,
      source: 'fawazahmed0/currency-api:historical',
    });
  });

  it('replaces the previous provider sheet instead of appending another copy', async () => {
    const requestedDate = Date.UTC(2024, 2, 3);
    await exchangeRateRepository.cacheHistoricalRate({
      fromCurrency: 'EUR',
      toCurrency: 'USD',
      rate: 1.08,
      requestedDate,
      effectiveDate: requestedDate,
      source: 'exchangerate-api.com',
    });
    await exchangeRateRepository.cacheManualRates(
      'workplace-1' as WorkplaceId,
      [{ fromCurrency: 'EUR', toCurrency: 'GBP', rate: 0.8 }],
      'correlation-1',
    );
    await exchangeRateRepository.cacheRatesBatch('USD', [{ toCurrency: 'EUR', rate: 0.9 }]);
    await exchangeRateRepository.cacheRatesBatch(
      'EUR',
      [{ toCurrency: 'USD', rate: 1.1 }],
      'other',
    );

    await exchangeRateRepository.cacheRatesBatch('EUR', [
      { toCurrency: 'USD', rate: 1.2 },
      { toCurrency: 'JPY', rate: 160 },
    ]);
    await exchangeRateRepository.cacheRatesBatch('EUR', [
      { toCurrency: 'USD', rate: 1.3 },
      { toCurrency: 'JPY', rate: 161 },
    ]);

    const rows = await database.collections.get<ExchangeRate>('exchange_rates').query().fetch();
    const summary = rows
      .map(row => `${row.fromCurrency}>${row.toCurrency}:${row.rate}:${row.source}`)
      .sort();
    expect(summary).toEqual([
      'EUR>GBP:0.8:manual',
      'EUR>JPY:161:exchangerate-api.com',
      'EUR>USD:1.08:exchangerate-api.com',
      'EUR>USD:1.1:other',
      'EUR>USD:1.3:exchangerate-api.com',
      'USD>EUR:0.9:exchangerate-api.com',
    ]);
  });

  it('re-emits rate observers when an existing historical rate is corrected', async () => {
    const requestedDate = Date.UTC(2024, 2, 3);
    const input = {
      fromCurrency: 'EUR',
      toCurrency: 'USD',
      requestedDate,
      effectiveDate: Date.UTC(2024, 2, 2),
      source: 'historical-test',
    };
    await exchangeRateRepository.cacheHistoricalRate({ ...input, rate: 1.08 });

    const revisions = observeAfterInitial(exchangeRateRepository.observeRevision());
    const latestRates = observeAfterInitial(
      exchangeRateRepository
        .observeLatestRates('EUR')
        .pipe(map(rates => rates.find(rate => rate.toCurrency === 'USD')?.rate)),
    );
    await Promise.all([revisions.initial, latestRates.initial]);

    await exchangeRateRepository.cacheHistoricalRate({ ...input, rate: 1.09 });

    await expect(Promise.all([revisions.nextValue, latestRates.nextValue])).resolves.toEqual([
      1, 1.09,
    ]);
  });
});
