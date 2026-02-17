/**
 * Currency Initialization Service
 * 
 * Populates the currencies table with common currencies on first launch.
 * All database operations are delegated to CurrencyRepository.
 */

import Currency from '@/src/data/models/Currency';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { logger } from '@/src/utils/logger';

import { COMMON_CURRENCIES } from '@/src/constants/currency-definitions';

export const COMMON_CURRENCY_CODES = COMMON_CURRENCIES.map(c => c.code)

export class CurrencyInitService {
    private initPromise: Promise<void> | null = null;

    /**
     * Initialize currencies table with defaults.
     * Adds any missing common currencies to the database.
     */
    async initialize(): Promise<void> {
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = (async () => {
            const existingCurrencies = await currencyRepository.findAll()

            // Cleanup duplicates if they exist
            const seenCodes = new Set<string>()
            const duplicates: Currency[] = []

            for (const currency of existingCurrencies) {
                if (seenCodes.has(currency.code)) {
                    duplicates.push(currency)
                } else {
                    seenCodes.add(currency.code)
                }
            }

            if (duplicates.length > 0) {
                logger.info(`Cleaning up ${duplicates.length} duplicate currencies...`)
                for (const dupe of duplicates) {
                    await currencyRepository.delete(dupe)
                }
            }

            const existingCodes = seenCodes;
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
        })();

        return this.initPromise;
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
