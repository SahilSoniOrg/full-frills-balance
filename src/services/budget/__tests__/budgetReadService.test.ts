import { database } from '@/src/data/database/Database'
import { AccountType } from '@/src/data/models/Account'
import { TransactionType } from '@/src/data/models/Transaction'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { budgetRepository } from '@/src/data/repositories/BudgetRepository'
import { journalRepository } from '@/src/data/repositories/JournalRepository'
import { budgetReadService } from '@/src/services/budget/budgetReadService'
import dayjs from 'dayjs'

describe('budgetReadService', () => {
    let expenseParentId: string
    let expenseChildId: string
    let assetId: string

    beforeEach(async () => {
        await database.write(async () => {
            await database.unsafeResetDatabase()
        })
        const asset = await accountRepository.create({
            name: 'Checking',
            accountType: AccountType.ASSET,
            currencyCode: 'USD'
        })
        assetId = asset.id

        const parent = await accountRepository.create({
            name: 'Food',
            accountType: AccountType.EXPENSE,
            currencyCode: 'USD'
        })
        expenseParentId = parent.id

        const child = await accountRepository.create({
            name: 'Groceries',
            accountType: AccountType.EXPENSE,
            currencyCode: 'USD',
            parentAccountId: parent.id
        })
        expenseChildId = child.id
    })

    it('should compute budget usage recursively and apply refunds correctly', async () => {
        const month = '2023-10'
        const middleOfMonth = dayjs('2023-10-15').valueOf()

        const budget = await budgetRepository.create({
            name: 'Food Budget',
            amount: 500, // $500
            currencyCode: 'USD',
            startMonth: month
        }, [expenseParentId])

        // 1. Add an expense to the child account. It should roll up.
        await journalRepository.createJournalWithTransactions({
            description: 'Grocery Trip',
            journalDate: middleOfMonth,
            currencyCode: 'USD',
            transactions: [
                { accountId: expenseChildId, amount: 150, transactionType: TransactionType.DEBIT },
                { accountId: assetId, amount: 150, transactionType: TransactionType.CREDIT }
            ]
        })

        // 2. Refund on child account
        await journalRepository.createJournalWithTransactions({
            description: 'Grocery Refund',
            journalDate: middleOfMonth,
            currencyCode: 'USD',
            transactions: [
                { accountId: expenseChildId, amount: 50, transactionType: TransactionType.CREDIT }, // refund
                { accountId: assetId, amount: 50, transactionType: TransactionType.DEBIT }
            ]
        })

        // 3. Out of bounds expense
        await journalRepository.createJournalWithTransactions({
            description: 'Old Grocery',
            journalDate: dayjs('2023-09-15').valueOf(),
            currencyCode: 'USD',
            transactions: [
                { accountId: expenseChildId, amount: 100, transactionType: TransactionType.DEBIT },
                { accountId: assetId, amount: 100, transactionType: TransactionType.CREDIT }
            ]
        })

        // Wait briefly for DB indexing if needed
        await new Promise(r => setTimeout(r, 50))

        let lastUsage: any
        const sub = budgetReadService.observeBudgetUsage(budget).subscribe(u => {
            // We want the most recent emission.
            // It will emit several times initially as observables resolve.
            if (u && u.budgetAmount === 500) {
                lastUsage = u
            }
        })

        await new Promise(r => setTimeout(r, 200)) // give RxJS some ticks to evaluate
        sub.unsubscribe()

        expect(lastUsage).toBeDefined()
        // Net spent mapped to period: 150 - 50 = 100
        expect(lastUsage.spent).toBe(100)
        expect(lastUsage.remaining).toBe(400)
        expect(lastUsage.usagePercent).toBe(0.2)
    })
})
