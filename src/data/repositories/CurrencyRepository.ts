import { database } from '@/src/data/database/Database'
import Currency from '@/src/data/models/Currency'
import { Q } from '@nozbe/watermelondb'

export class CurrencyRepository {
    private get currencies() {
        return database.collections.get<Currency>('currencies')
    }

    /**
     * Finds a currency by its code
     */
    async findByCode(code: string): Promise<Currency | null> {
        const currencies = await this.currencies
            .query(Q.where('code', code))
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
     * Gets all available currencies
     */
    async findAll(): Promise<Currency[]> {
        return this.currencies.query().fetch()
    }

    /**
     * Observe all currencies reactively
     */
    observeAll() {
        return this.currencies.query().observe()
    }

    /**
     * Get count of currencies
     */
    async count(): Promise<number> {
        return this.currencies.query().fetchCount()
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
     * Delete a currency (soft delete)
     */
    async delete(currency: Currency): Promise<void> {
        await database.write(async () => {
            await currency.update(record => {
                record.deletedAt = new Date()
                record.updatedAt = new Date()
            })
        })
    }
}

export const currencyRepository = new CurrencyRepository()
