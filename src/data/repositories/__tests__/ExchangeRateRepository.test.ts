import { database } from '@/src/data/database/Database';
import ExchangeRate from '@/src/data/models/ExchangeRate';
import { exchangeRateRepository } from '@/src/data/repositories/ExchangeRateRepository';
import { map } from 'rxjs/operators';
import { observeAfterInitial } from '@/src/testing/observeAfterInitial';

describe('ExchangeRateRepository historical rates', () => {
  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
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

    const allRates = observeAfterInitial(
      exchangeRateRepository.observeAll().pipe(map(rates => rates[0]?.rate)),
    );
    const latestRates = observeAfterInitial(
      exchangeRateRepository
        .observeLatestRates('EUR')
        .pipe(map(rates => rates.find(rate => rate.toCurrency === 'USD')?.rate)),
    );
    await Promise.all([allRates.initial, latestRates.initial]);

    await exchangeRateRepository.cacheHistoricalRate({ ...input, rate: 1.09 });

    await expect(Promise.all([allRates.nextValue, latestRates.nextValue])).resolves.toEqual([
      1.09, 1.09,
    ]);
  });
});
