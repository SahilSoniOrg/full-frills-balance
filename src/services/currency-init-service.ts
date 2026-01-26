/**
 * Currency Initialization Service
 * 
 * Populates the currencies table with common currencies on first launch.
 */

import { database } from '@/src/data/database/Database'
import Currency from '@/src/data/models/Currency'
import { logger } from '@/src/utils/logger'

interface CurrencyData {
    code: string
    symbol: string
    name: string
    precision: number
}

const COMMON_CURRENCIES: CurrencyData[] = [
    { code: 'USD', symbol: '$', name: 'US Dollar', precision: 2 },
    { code: 'EUR', symbol: '€', name: 'Euro', precision: 2 },
    { code: 'GBP', symbol: '£', name: 'British Pound', precision: 2 },
    { code: 'JPY', symbol: '¥', name: 'Japanese Yen', precision: 0 },
    { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', precision: 2 },
    { code: 'INR', symbol: '₹', name: 'Indian Rupee', precision: 2 },
    { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', precision: 2 },
    { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', precision: 2 },
    { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc', precision: 2 },
    { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar', precision: 2 },
    { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', precision: 2 },
    { code: 'SEK', symbol: 'kr', name: 'Swedish Krona', precision: 2 },
    { code: 'KRW', symbol: '₩', name: 'South Korean Won', precision: 0 },
    { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone', precision: 2 },
    { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar', precision: 2 },
    { code: 'MXN', symbol: '$', name: 'Mexican Peso', precision: 2 },
    { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', precision: 2 },
    { code: 'ZAR', symbol: 'R', name: 'South African Rand', precision: 2 },
]

export class CurrencyInitService {
    private get currencies() {
        return database.collections.get<Currency>('currencies')
    }

    /**
     * Initialize currencies table if empty
     */
    async initialize(): Promise<void> {
        const existingCount = await this.currencies.query().fetchCount()

        if (existingCount > 0) {
            // Already initialized
            return
        }

        logger.info('Initializing currencies table with common currencies...')

        await database.write(async () => {
            for (const currencyData of COMMON_CURRENCIES) {
                await this.currencies.create((currency) => {
                    currency.code = currencyData.code
                    currency.symbol = currencyData.symbol
                    currency.name = currencyData.name
                    currency.precision = currencyData.precision
                })
            }
        })

        logger.info(`Initialized ${COMMON_CURRENCIES.length} currencies`)
    }

    /**
     * Get all currencies
     */
    async getAllCurrencies(): Promise<Currency[]> {
        return this.currencies.query().fetch()
    }

    /**
     * Get currency by code
     */
    async getCurrencyByCode(code: string): Promise<Currency | null> {
        const currencies = await this.currencies
            .query()
            .fetch()

        return currencies.find(c => c.code === code) || null
    }
}

// Export singleton instance
export const currencyInitService = new CurrencyInitService()
