import { database } from '@/src/data/database/Database';
import Currency from '@/src/data/models/Currency';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { Q } from '@nozbe/watermelondb';

interface CurrencyInput {
  code: string;
  symbol: string;
  name: string;
  precision: number;
}

export class CurrencyRepository {
  private get currencies() {
    return database.collections.get<Currency>('currencies');
  }

  async findByCode(code: string): Promise<Currency | null> {
    const currencies = await this.currencies
      .query(Q.where('code', code), Q.where('deleted_at', Q.eq(null)))
      .fetch();
    return currencies[0] || null;
  }

  async getPrecision(code: string): Promise<number> {
    const currency = await this.findByCode(code);
    if (currency) return currency.precision;

    return CurrencyFormatter.getPrecisionFallback(code);
  }

  async findAllIncludingDeleted(): Promise<Currency[]> {
    return this.currencies.query().fetch();
  }

  observeAll() {
    return this.currencies.query(Q.where('deleted_at', Q.eq(null))).observe();
  }

  async seedDefaults(currencies: readonly CurrencyInput[]): Promise<void> {
    await database.write(async () => {
      for (const currencyData of currencies) {
        await this.currencies.create(currency => {
          currency.code = currencyData.code;
          currency.symbol = currencyData.symbol;
          currency.name = currencyData.name;
          currency.precision = currencyData.precision;
        });
      }
    });
  }

  async permanentlyDelete(currency: Currency): Promise<void> {
    await database.write(async () => {
      await currency.destroyPermanently();
    });
  }

  async restore(currency: Currency): Promise<void> {
    await database.write(async () => {
      await currency.update(record => {
        record.deletedAt = undefined;
        record.updatedAt = new Date();
      });
    });
  }

  async getAllPrecisions(): Promise<Map<string, number>> {
    const raw = (await this.currencies
      .query(Q.where('deleted_at', Q.eq(null)))
      .unsafeFetchRaw()) as unknown as {
      code: string;
      precision: number;
    }[];
    return new Map(raw.map(c => [c.code, Number(c.precision ?? 2)]));
  }
}

export const currencyRepository = new CurrencyRepository();
