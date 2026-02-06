/**
 * Currency Initialization Service
 * 
 * Populates the currencies table with common currencies on first launch.
 * All database operations are delegated to CurrencyRepository.
 */

import { currencyRepository } from '@/src/data/repositories/CurrencyRepository'
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

export const COMMON_CURRENCY_CODES = COMMON_CURRENCIES.map(c => c.code)

export class CurrencyInitService {
    /**
     * Initialize currencies table if empty
     */
    async initialize(): Promise<void> {
        const existingCount = await currencyRepository.count()

        if (existingCount > 0) {
            // Already initialized
            return
        }

        logger.info('Initializing currencies table with common currencies...')

        await currencyRepository.seedDefaults(COMMON_CURRENCIES)

        logger.info(`Initialized ${COMMON_CURRENCIES.length} currencies`)
    }

    /**
     * Get all currencies
     */
    async getAllCurrencies() {
        return currencyRepository.findAll()
    }

    /**
     * Get currency by code
     */
    async getCurrencyByCode(code: string) {
        return currencyRepository.findByCode(code)
    }
}

// Export singleton instance
export const currencyInitService = new CurrencyInitService()
