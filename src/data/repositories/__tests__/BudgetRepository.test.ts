import { database } from '@/src/data/database/Database'
import { AccountType } from '@/src/data/models/Account'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { budgetRepository } from '@/src/data/repositories/BudgetRepository'

describe('BudgetRepository', () => {
    let accountId1: string
    let accountId2: string

    beforeEach(async () => {
        await database.write(async () => {
            await database.unsafeResetDatabase()
        })
        const a1 = await accountRepository.create({
            name: 'Groceries',
            accountType: AccountType.EXPENSE,
            currencyCode: 'USD'
        })
        accountId1 = a1.id

        const a2 = await accountRepository.create({
            name: 'Dining Out',
            accountType: AccountType.EXPENSE,
            currencyCode: 'USD'
        })
        accountId2 = a2.id
    })

    describe('CRUD operations', () => {
        it('should create a budget with scopes', async () => {
            const budget = await budgetRepository.create({
                name: 'Food',
                amount: 500,
                currencyCode: 'USD',
                startMonth: '2023-10'
            }, [accountId1, accountId2])

            expect(budget.id).toBeTruthy()
            expect(budget.name).toBe('Food')
            expect(budget.amount).toBe(500)

            const scopes = await budgetRepository.getScopes(budget.id)
            expect(scopes).toHaveLength(2)
            const scopeIds = scopes.map(s => s.account.id)
            expect(scopeIds).toContain(accountId1)
            expect(scopeIds).toContain(accountId2)
        })

        it('should update a budget and its scopes', async () => {
            const budget = await budgetRepository.create({
                name: 'Monthly Gas',
                amount: 500,
                startMonth: '2023-10',
                currencyCode: 'USD'
            }, [accountId1])

            await budgetRepository.update(budget, { amount: 600 }, [accountId2])

            const updated = await budgetRepository.find(budget.id)
            expect(updated?.amount).toBe(600)

            const scopes = await budgetRepository.getScopes(budget.id)
            expect(scopes).toHaveLength(1)
            expect(scopes[0].account.id).toBe(accountId2)
        })

        it('should delete a budget and its scopes', async () => {
            const budget = await budgetRepository.create({
                name: 'Food',
                amount: 500,
                currencyCode: 'USD',
                startMonth: '2023-10'
            }, [accountId1])

            await budgetRepository.delete(budget)

            const deleted = await budgetRepository.find(budget.id)
            expect(deleted).toBeNull()

            const scopes = await budgetRepository.getScopes(budget.id)
            expect(scopes).toHaveLength(0)
        })
    })
})
