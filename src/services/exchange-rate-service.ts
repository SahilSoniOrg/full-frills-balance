/**
 * Exchange Rate Service
 * 
 * Handles currency conversion with caching and API integration.
 * Uses exchangerate-api.com free tier (1500 requests/month).
 * 
 * All database operations are delegated to ExchangeRateRepository.
 */

import { AppConfig } from '@/src/constants'
import { exchangeRateRepository } from '@/src/data/repositories/ExchangeRateRepository'
import { logger } from '@/src/utils/logger'

export interface ExchangeRateData {
    fromCurrency: string
    toCurrency: string
    rate: number
    effectiveDate: number
    source: string
}

const CACHE_DURATION_MS = 24 * 60 * 60 * 1000 // 24 hours

export class ExchangeRateService {
    private memoryCache: Map<string, { rates: Record<string, number>; timestamp: number }> = new Map()
    private inFlightRequests: Map<string, Promise<Record<string, number>>> = new Map()

    /**
     * Get exchange rate, using cache if available and recent
     */
    async getRate(fromCurrency: string, toCurrency: string): Promise<number> {
        // Same currency = rate of 1
        if (fromCurrency === toCurrency) {
            return 1.0
        }

        // Validate currency codes
        if (!fromCurrency || !toCurrency) {
            throw new Error(`Invalid currency codes: from=${fromCurrency}, to=${toCurrency}`)
        }

        // 1. Check Memory Cache
        const memCached = this.memoryCache.get(fromCurrency)
        if (memCached && Date.now() - memCached.timestamp < CACHE_DURATION_MS) {
            if (memCached.rates[toCurrency]) {
                return memCached.rates[toCurrency]
            }
        }

        // 2. Check DB Cache via repository
        const cached = await exchangeRateRepository.getCachedRate(fromCurrency, toCurrency)
        if (cached && this.isRateFresh(cached.effectiveDate)) {
            // Update memory cache for this base while we're at it
            this.updateMemoryCache(fromCurrency, toCurrency, cached.rate)
            return cached.rate
        }

        // 3. Fetch fresh rates for the entire base
        const rates = await this.fetchRatesForBase(fromCurrency)

        if (!rates[toCurrency]) {
            throw new Error(`No rate found for ${fromCurrency} to ${toCurrency}`)
        }

        // 4. Persist this specific rate to DB for offline use via repository
        await exchangeRateRepository.cacheRate({
            fromCurrency,
            toCurrency,
            rate: rates[toCurrency],
        })

        return rates[toCurrency]
    }

    private updateMemoryCache(base: string, target: string, rate: number) {
        const entry = this.memoryCache.get(base) || { rates: {}, timestamp: Date.now() }
        entry.rates[target] = rate
        this.memoryCache.set(base, entry)
    }

    /**
     * Check if cached rate is still fresh  
     */
    private isRateFresh(effectiveDate: number): boolean {
        const age = Date.now() - effectiveDate
        return age < CACHE_DURATION_MS
    }

    /**
     * Fetch all rates for a base currency and cache them
     * Prevents "thundering herd" by deduplicating concurrent requests for the same base.
     */
    async fetchRatesForBase(fromCurrency: string): Promise<Record<string, number>> {
        if (!fromCurrency) {
            throw new Error('Base currency is required for fetching rates')
        }

        // 1. Check for existing in-flight request
        const existingRequest = this.inFlightRequests.get(fromCurrency)
        if (existingRequest) {
            return existingRequest
        }

        // 2. Start new request and track it
        const requestPromise = (async () => {
            try {
                const url = `${AppConfig.api.exchangeRateBaseUrl}/${fromCurrency}`
                const response = await fetch(url)

                if (!response.ok) {
                    const errorBody = await response.text().catch(() => 'No body')
                    throw new Error(`Exchange rate API error (${response.status}): ${response.statusText}. Body: ${errorBody.substring(0, 100)}`)
                }

                // Verify content type before parsing
                const contentType = response.headers.get('content-type')
                if (!contentType || !contentType.includes('application/json')) {
                    const text = await response.text()
                    throw new Error(`Expected JSON response but got ${contentType || 'unknown'}. First 100 chars: ${text.substring(0, 100)}`)
                }

                const data = await response.json()
                const rates = data.rates as Record<string, number>

                if (!rates) {
                    throw new Error(`Malformed API response: 'rates' field missing for base ${fromCurrency}`)
                }

                // Update memory cache
                this.memoryCache.set(fromCurrency, {
                    rates,
                    timestamp: Date.now()
                })

                return rates
            } finally {
                // Clear from in-flight regardless of outcome
                this.inFlightRequests.delete(fromCurrency)
            }
        })()

        this.inFlightRequests.set(fromCurrency, requestPromise)

        try {
            return await requestPromise
        } catch (error) {
            logger.error('Failed to fetch exchange rates:', error)

            // Fallback: try to get any cached rate from DB if API fails
            const cachedRecords = await exchangeRateRepository.getAllRatesForBase(fromCurrency)

            if (cachedRecords.length > 0) {
                logger.warn(`Using stale exchange rates from DB for ${fromCurrency}`)
                const staleRates: Record<string, number> = {}
                cachedRecords.forEach(r => {
                    staleRates[r.toCurrency] = r.rate
                })
                return staleRates
            }

            throw error
        }
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
