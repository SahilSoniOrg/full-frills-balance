import { database } from '@/src/data/database/Database'
import { AccountType } from '@/src/data/models/Account'
import { TransactionType } from '@/src/data/models/Transaction'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { journalService } from '../JournalService'
import { transactionService } from '../TransactionService'

describe('TransactionService', () => {
    let accountId: string
    let equityAccountId: string
    let expenseAccountId: string

    beforeEach(async () => {
        await database.write(async () => {
            await database.unsafeResetDatabase()
        })
        const account = await accountRepository.create({
            name: 'Test Account',
            accountType: AccountType.ASSET,
            currencyCode: 'USD'
        })
        accountId = account.id

        const equity = await accountRepository.create({
            name: 'Equity',
            accountType: AccountType.EQUITY,
            currencyCode: 'USD'
        })
        equityAccountId = equity.id

        const expense = await accountRepository.create({
            name: 'Expense',
            accountType: AccountType.EXPENSE,
            currencyCode: 'USD'
        })
        expenseAccountId = expense.id
    })

    describe('getTransactionsWithAccountInfo', () => {
        it('should return transactions with joined account info', async () => {
            const journal = await journalService.createJournal({
                description: 'Test Journal',
                journalDate: Date.now(),
                currencyCode: 'USD',
                transactions: [
                    { accountId, amount: 100, transactionType: TransactionType.DEBIT },
                    { accountId: equityAccountId, amount: 100, transactionType: TransactionType.CREDIT }
                ]
            })

            const transactions = await transactionService.getTransactionsWithAccountInfo(journal.id)

            expect(transactions).toHaveLength(2)

            // Check first transaction (Debit Asset)
            const tx1 = transactions.find(t => t.accountId === accountId)
            expect(tx1).toBeDefined()
            expect(tx1?.accountName).toBe('Test Account')
            expect(tx1?.accountType).toBe(AccountType.ASSET)
            expect(tx1?.balanceImpact).toBe('INCREASE') // Debit Asset = Increase

            // Check second transaction (Credit Equity)
            const tx2 = transactions.find(t => t.accountId === equityAccountId)
            expect(tx2).toBeDefined()
            expect(tx2?.accountName).toBe('Equity')
            expect(tx2?.accountType).toBe(AccountType.EQUITY)
            expect(tx2?.balanceImpact).toBe('INCREASE') // Credit Equity = Increase
        })
    })

    describe('getEnrichedByJournal', () => {
        it('does not assign a single counter account for multi-line journals', async () => {
            const journal = await journalService.createJournal({
                description: 'Split Transaction',
                journalDate: Date.now(),
                currencyCode: 'USD',
                transactions: [
                    { accountId, amount: 100, transactionType: TransactionType.DEBIT },
                    { accountId: equityAccountId, amount: 60, transactionType: TransactionType.CREDIT },
                    { accountId: expenseAccountId, amount: 40, transactionType: TransactionType.CREDIT }
                ]
            })

            const enriched = await transactionService.getEnrichedByJournal(journal.id)

            expect(enriched).toHaveLength(3)
            enriched.forEach((tx) => {
                expect(tx.counterAccountName).toBeUndefined()
                expect(tx.counterAccountType).toBeUndefined()
            })
        })
    })
})
