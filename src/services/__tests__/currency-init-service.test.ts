/**
 * Integration tests for CurrencyInitService
 */

import { database } from '@/src/data/database/Database'
import { CurrencyInitService } from '@/src/services/currency-init-service'

describe('CurrencyInitService', () => {
    let service: CurrencyInitService

    beforeEach(async () => {
        await database.write(async () => {
            await database.unsafeResetDatabase()
        })
        service = new CurrencyInitService()
    })

    describe('initialize', () => {
        it('should populate currencies if table is empty', async () => {
            const countBefore = await service.getAllCurrencies()
            expect(countBefore.length).toBe(0)

            await service.initialize()

            const countAfter = await service.getAllCurrencies()
            expect(countAfter.length).toBeGreaterThan(0)

            const usd = await service.getCurrencyByCode('USD')
            expect(usd).toBeDefined()
            expect(usd?.name).toBe('US Dollar')
        })


        it('should do nothing if all currencies are present', async () => {
            // Initialize once
            await service.initialize()
            const countInitial = (await service.getAllCurrencies()).length

            // Initialize again
            await service.initialize()
            const countFinal = (await service.getAllCurrencies()).length

            expect(countFinal).toBe(countInitial)
        })

        it('should add missing currencies if new ones are introduced', async () => {
            await service.initialize()
            const allCurrencies = await service.getAllCurrencies()
            const initialCount = allCurrencies.length

            // Simulate a "missing" currency by deleting one
            const currencyToDelete = allCurrencies[0]
            await database.write(async () => {
                await currencyToDelete.markAsDeleted()
                await currencyToDelete.destroyPermanently()
            })

            const countAfterDelete = (await service.getAllCurrencies()).length
            expect(countAfterDelete).toBe(initialCount - 1)

            // Re-initialize should restore it
            await service.initialize()

            const countFinal = (await service.getAllCurrencies()).length
            expect(countFinal).toBe(initialCount)
        })
    })

    describe('getCurrencyByCode', () => {
        it('should return correct currency', async () => {
            await service.initialize()

            const eur = await service.getCurrencyByCode('EUR')
            expect(eur).toBeDefined()
            expect(eur?.symbol).toBe('€')
        })

        it('should return null for non-existent currency', async () => {
            await service.initialize()

            const invalid = await service.getCurrencyByCode('XYZ')
            expect(invalid).toBeNull()
        })
    })
})
