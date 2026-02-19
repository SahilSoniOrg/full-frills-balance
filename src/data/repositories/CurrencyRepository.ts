import { database } from '@/src/data/database/Database'
import Currency from '@/src/data/models/Currency'
import { Q } from '@nozbe/watermelondb'

export class CurrencyRepository {
    private get currencies() {
        return database.collections.get<Currency>('currencies')
    }

    /**
     * Finds a currency by its code (active only)
     */
    async findByCode(code: string): Promise<Currency | null> {
        const currencies = await this.currencies
            .query(
                Q.where('code', code),
                Q.where('deleted_at', Q.eq(null))
            )
            .fetch()
        return currencies[0] || null
    }

    /**
     * Gets the precision for a currency code.
     * Falls back to 2 if currency not found or default.
     */
    async getPrecision(code: string): Promise<number> {
        const currency = await this.findByCode(code)
        if (currency) return currency.precision

        // Fallback logic
        if (code === 'JPY' || code === 'KRW') return 0
        if (code === 'KWD' || code === 'BHD') return 3

        return 2 // Default decimal places
    }

    /**
     * Gets all active currencies
     */
    async findAll(): Promise<Currency[]> {
        return this.currencies.query(Q.where('deleted_at', Q.eq(null))).fetch()
    }

    /**
     * Gets ALL currencies including soft-deleted ones
     */
    async findAllIncludingDeleted(): Promise<Currency[]> {
        return this.currencies.query().fetch()
    }

    /**
     * Observe all active currencies reactively
     */
    observeAll() {
        return this.currencies.query(Q.where('deleted_at', Q.eq(null))).observe()
    }

    /**
     * Get count of active currencies
     */
    async count(): Promise<number> {
        return this.currencies.query(Q.where('deleted_at', Q.eq(null))).fetchCount()
    }

    /**
     * Create a single currency
     */
    async create(data: { code: string; symbol: string; name: string; precision: number }): Promise<Currency> {
        return database.write(async () => {
            return this.currencies.create((currency) => {
                currency.code = data.code
                currency.symbol = data.symbol
                currency.name = data.name
                currency.precision = data.precision
            })
        })
    }

    /**
     * Seed default currencies (batch operation)
     */
    async seedDefaults(currencies: { code: string; symbol: string; name: string; precision: number }[]): Promise<void> {
        await database.write(async () => {
            for (const currencyData of currencies) {
                await this.currencies.create((currency) => {
                    currency.code = currencyData.code
                    currency.symbol = currencyData.symbol
                    currency.name = currencyData.name
                    currency.precision = currencyData.precision
                })
            }
        })
    }

    /**
     * Soft delete a currency
     */
    async delete(currency: Currency): Promise<void> {
        await database.write(async () => {
            await currency.update(record => {
                record.deletedAt = new Date()
                record.updatedAt = new Date()
            })
        })
    }

    /**
     * Permanently delete a record
     */
    async permanentlyDelete(currency: Currency): Promise<void> {
        await database.write(async () => {
            await currency.destroyPermanently()
        })
    }

    /**
     * Restore a soft-deleted currency
     */
    async restore(currency: Currency): Promise<void> {
        await database.write(async () => {
            await currency.update(record => {
                record.deletedAt = undefined
                record.updatedAt = new Date()
            })
        })
    }

    /**
     * Get precisions for all active currencies (optimized raw fetch)
     */
    async getAllPrecisions(): Promise<Map<string, number>> {
        const raw = await this.currencies.query(Q.where('deleted_at', Q.eq(null))).unsafeFetchRaw() as any[];
        return new Map(raw.map(c => [c.code, c.precision]));
    }
}

export const currencyRepository = new CurrencyRepository()
