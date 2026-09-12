import { database } from '@/src/data/database/Database';
import ExchangeRate from '@/src/data/models/ExchangeRate';
import { exchangeRateRepository } from '@/src/data/repositories/ExchangeRateRepository';

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
});
