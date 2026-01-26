/**
 * Exchange Rate Service
 * 
 * Handles currency conversion with caching and API integration.
 * Uses exchangerate-api.com free tier (1500 requests/month).
 */

import { database } from '@/src/data/database/Database'
import ExchangeRate from '@/src/data/models/ExchangeRate'
import { Q } from '@nozbe/watermelondb'

export interface ExchangeRateData {
    fromCurrency: string
    toCurrency: string
    rate: number
    effectiveDate: number
    source: string
}

const API_BASE = 'https://api.exchangerate-api.com/v4/latest'
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000 // 24 hours

export class ExchangeRateService {
    private get exchangeRates() {
        return database.collections.get<ExchangeRate>('exchange_rates')
    }

    /**
     * Get exchange rate, using cache if available and recent
     */
    async getRate(fromCurrency: string, toCurrency: string): Promise<number> {
        // Same currency = rate of 1
        if (fromCurrency === toCurrency) {
            return 1.0
        }

        // Check cache first
        const cached = await this.getCachedRate(fromCurrency, toCurrency)
        if (cached && this.isRateFresh(cached)) {
            return cached.rate
        }

        // Fetch fresh rate
        const rate = await this.fetchRateFromAPI(fromCurrency, toCurrency)

        // Cache it
        await this.cacheRate(fromCurrency, toCurrency, rate)

        return rate
    }

    /**
     * Get cached rate from database
     */
    private async getCachedRate(
        fromCurrency: string,
        toCurrency: string
    ): Promise<ExchangeRate | null> {
        const rates = await this.exchangeRates
            .query(
                Q.where('from_currency', fromCurrency),
                Q.where('to_currency', toCurrency),
                Q.sortBy('effective_date', Q.desc),
                Q.take(1)
            )
            .fetch()

        return rates[0] || null
    }

    /**
     * Check if cached rate is still fresh  
     */
    private isRateFresh(rate: ExchangeRate): boolean {
        const age = Date.now() - rate.effectiveDate
        return age < CACHE_DURATION_MS
    }

    /**
     * Fetch rate from API
     */
    private async fetchRateFromAPI(
        fromCurrency: string,
        toCurrency: string
    ): Promise<number> {
        try {
            const response = await fetch(`${API_BASE}/${fromCurrency}`)

            if (!response.ok) {
                throw new Error(`Exchange rate API error: ${response.statusText}`)
            }

            const data = await response.json()

            if (!data.rates || !data.rates[toCurrency]) {
                throw new Error(`No rate found for ${fromCurrency} to ${toCurrency}`)
            }

            return data.rates[toCurrency]
        } catch (error) {
            console.error('Failed to fetch exchange rate:', error)
            // Fallback: try to get last known rate even if stale
            const cached = await this.getCachedRate(fromCurrency, toCurrency)
            if (cached) {
                console.warn('Using stale exchange rate from cache')
                return cached.rate
            }
            throw new Error(
                `Failed to get exchange rate for ${fromCurrency} to ${toCurrency}`
            )
        }
    }

    /**
     * Cache exchange rate in database
     */
    private async cacheRate(
        fromCurrency: string,
        toCurrency: string,
        rate: number
    ): Promise<void> {
        await database.write(async () => {
            await this.exchangeRates.create((record) => {
                record.fromCurrency = fromCurrency
                record.toCurrency = toCurrency
                record.rate = rate
                record.effectiveDate = Date.now()
                record.source = 'exchangerate-api.com'
            })
        })
    }

    /**
     * Convert amount between currencies
     */
    async convert(
        amount: number,
        fromCurrency: string,
        toCurrency: string
    ): Promise<{ convertedAmount: number; rate: number }> {
        const rate = await this.getRate(fromCurrency, toCurrency)
        const convertedAmount = amount * rate

        return {
            convertedAmount,
            rate,
        }
    }
}

// Export singleton instance
export const exchangeRateService = new ExchangeRateService()
