import Currency from '@/src/data/models/Currency';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';

export class CurrencyReadService {
  getPrecision(code: string): Promise<number> {
    return currencyRepository.getPrecision(code);
  }

  observeAll() {
    return currencyRepository.observeAll();
  }

  async getAllPrecisions(): Promise<Map<string, number>> {
    return currencyRepository.getAllPrecisions();
  }

  async findAll(): Promise<Currency[]> {
    return currencyRepository.findAll();
  }
}

export const currencyReadService = new CurrencyReadService();
