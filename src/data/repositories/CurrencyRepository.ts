import { database } from '@/src/data/database/Database';
import Currency from '@/src/data/models/Currency';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { Q } from '@nozbe/watermelondb';

export interface CurrencyInput {
  code: string;
  symbol: string;
  name: string;
  precision: number;
}

export class CurrencyRepository {
  private get currencies() {
    return database.collections.get<Currency>('currencies');
  }

  /**
   * Finds a currency by its code (active only)
   */
  async findByCode(code: string): Promise<Currency | null> {
    const currencies = await this.currencies
      .query(Q.where('code', code), Q.where('deleted_at', Q.eq(null)))
      .fetch();
    return currencies[0] || null;
  }

  /**
   * Gets the precision for a currency code.
   * Falls back to 2 if currency not found or default.
   */
  async getPrecision(code: string): Promise<number> {
    const currency = await this.findByCode(code);
    if (currency) return currency.precision;

    return CurrencyFormatter.getPrecisionFallback(code);
  }

  /**
   * Gets ALL currencies including soft-deleted ones
   */
  async findAllIncludingDeleted(): Promise<Currency[]> {
    return this.currencies.query().fetch();
  }

  /**
   * Observe all active currencies reactively
   */
  observeAll() {
    return this.currencies.query(Q.where('deleted_at', Q.eq(null))).observe();
  }

  /**
   * Seed default currencies (batch operation)
   */
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

  /**
   * Permanently delete a record
   */
  async permanentlyDelete(currency: Currency): Promise<void> {
    await database.write(async () => {
      await currency.destroyPermanently();
    });
  }

  /**
   * Restore a soft-deleted currency
   */
  async restore(currency: Currency): Promise<void> {
    await database.write(async () => {
      await currency.update(record => {
        record.deletedAt = undefined;
        record.updatedAt = new Date();
      });
    });
  }

  /**
   * Get precisions for all active currencies (optimized raw fetch)
   */
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
