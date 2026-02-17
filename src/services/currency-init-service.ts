/**
 * Currency Initialization Service
 * 
 * Populates the currencies table with common currencies on first launch.
 * All database operations are delegated to CurrencyRepository.
 */

import { currencyRepository } from '@/src/data/repositories/CurrencyRepository'
import { logger } from '@/src/utils/logger'

import { COMMON_CURRENCIES } from '@/src/constants/currency-definitions'

export const COMMON_CURRENCY_CODES = COMMON_CURRENCIES.map(c => c.code)

export class CurrencyInitService {
    /**
     * Initialize currencies table with defaults.
     * Adds any missing common currencies to the database.
     */
    async initialize(): Promise<void> {
        const existingCurrencies = await currencyRepository.findAll()
        const existingCodes = new Set(existingCurrencies.map(c => c.code))

        const missingCurrencies = COMMON_CURRENCIES.filter(
            c => !existingCodes.has(c.code)
        )

        if (missingCurrencies.length === 0) {
            // Already up to date
            return
        }

        logger.info(`Initializing ${missingCurrencies.length} new currencies...`)

        await currencyRepository.seedDefaults(missingCurrencies)

        logger.info(`Added ${missingCurrencies.length} currencies`)
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
