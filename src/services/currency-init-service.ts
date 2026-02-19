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
            try {
                // Find ALL currencies including soft-deleted ones for duplicate cleanup and restore
                const allCurrencies = await currencyRepository.findAllIncludingDeleted()

                // Cleanup duplicates and identify existing codes
                const seenCodes = new Set<string>()
                const duplicates: Currency[] = []
                const activeCodes = new Set<string>()
                const deletedRecords = new Map<string, Currency>()

                for (const currency of allCurrencies) {
                    if (seenCodes.has(currency.code)) {
                        duplicates.push(currency)
                    } else {
                        seenCodes.add(currency.code)
                        if (currency.deletedAt) {
                            deletedRecords.set(currency.code, currency)
                        } else {
                            activeCodes.add(currency.code)
                        }
                    }
                }

                if (duplicates.length > 0) {
                    logger.info(`Cleaning up ${duplicates.length} duplicate currencies...`)
                    for (const dupe of duplicates) {
                        await currencyRepository.permanentlyDelete(dupe)
                    }
                }

                // identify truly missing (not even deleted) and records to restore
                const missingCurrencies = COMMON_CURRENCIES.filter(
                    c => !seenCodes.has(c.code)
                )

                const currenciesToRestore = COMMON_CURRENCIES.filter(
                    c => deletedRecords.has(c.code)
                ).map(c => deletedRecords.get(c.code)!)

                if (missingCurrencies.length === 0 && currenciesToRestore.length === 0) {
                    return
                }

                if (currenciesToRestore.length > 0) {
                    logger.info(`Restoring ${currenciesToRestore.length} soft-deleted currencies...`)
                    for (const currency of currenciesToRestore) {
                        await currencyRepository.restore(currency)
                    }
                }

                if (missingCurrencies.length > 0) {
                    logger.info(`Initializing ${missingCurrencies.length} new currencies...`)
                    await currencyRepository.seedDefaults(missingCurrencies)
                }
            } finally {
                this.initPromise = null;
            }
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

    /**
     * Reset internal state for testing purposes only.
     * @internal
     */
    resetForTesting() {
        this.initPromise = null;
    }
}

// Export singleton instance
export const currencyInitService = new CurrencyInitService()
