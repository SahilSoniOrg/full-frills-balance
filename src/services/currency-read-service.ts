import Currency from '@/src/data/models/Currency';
import { toPlainExchangeRate } from '@/src/data/models/ExchangeRate';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { exchangeRateRepository } from '@/src/data/repositories/ExchangeRateRepository';
import { PlainCurrency } from '@/src/types/plainDtos';
import { map } from 'rxjs';

export function toPlainCurrency(currency: Currency): PlainCurrency {
  return {
    id: currency.id,
    code: currency.code,
    symbol: currency.symbol,
    name: currency.name,
    precision: currency.precision,
  };
}

export class CurrencyReadService {
  getPrecision(code: string): Promise<number> {
    return currencyRepository.getPrecision(code);
  }

  observeAll() {
    return currencyRepository.observeAll().pipe(map(currencies => currencies.map(toPlainCurrency)));
  }

  observeLatestRates(fromCurrency: string) {
    return exchangeRateRepository
      .observeLatestRates(fromCurrency)
      .pipe(map(rates => rates.map(toPlainExchangeRate)));
  }

  async getAllPrecisions(): Promise<Map<string, number>> {
    return currencyRepository.getAllPrecisions();
  }

  async findAll(): Promise<Currency[]> {
    return currencyRepository.findAll();
  }
}

export const currencyReadService = new CurrencyReadService();
