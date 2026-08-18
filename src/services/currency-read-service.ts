import Currency from '@/src/data/models/Currency';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { PlainCurrency } from '@/src/types/domain';
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

  async getAllPrecisions(): Promise<Map<string, number>> {
    return currencyRepository.getAllPrecisions();
  }

  async findAll(): Promise<Currency[]> {
    return currencyRepository.findAll();
  }
}

export const currencyReadService = new CurrencyReadService();
