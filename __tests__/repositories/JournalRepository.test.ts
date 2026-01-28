/**
 * Integration tests for JournalRepository
 * Tests double-entry accounting, precision handling, and balance integrity
 */

import { database } from '@/src/data/database/Database'
import { AccountType } from '@/src/data/models/Account'
import { TransactionType } from '@/src/data/models/Transaction'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { journalRepository } from '@/src/data/repositories/JournalRepository'
import { rebuildQueueService } from '@/src/data/repositories/RebuildQueue'

describe('JournalRepository', () => {
    let cashAccountId: string
    let expenseAccountId: string
    let incomeAccountId: string

    beforeEach(async () => {
        await database.write(async () => {
            await database.unsafeResetDatabase()
        })

        // Create test accounts
        const cash = await accountRepository.create({
            name: 'Cash',
            accountType: AccountType.ASSET,
            currencyCode: 'USD',
        })
        const expense = await accountRepository.create({
            name: 'Food',
            accountType: AccountType.EXPENSE,
            currencyCode: 'USD',
        })
        const income = await accountRepository.create({
            name: 'Salary',
            accountType: AccountType.INCOME,
            currencyCode: 'USD',
        })

        cashAccountId = cash.id
        expenseAccountId = expense.id
        incomeAccountId = income.id
    }, 10000)


    describe('createJournalWithTransactions', () => {
        it('should create a balanced journal successfully', async () => {
            const journal = await journalRepository.createJournalWithTransactions({
                description: 'Lunch expense',
                journalDate: Date.now(),
                currencyCode: 'USD',
                transactions: [
                    { accountId: cashAccountId, amount: 25, transactionType: TransactionType.CREDIT },
                    { accountId: expenseAccountId, amount: 25, transactionType: TransactionType.DEBIT },
                ],
            })

            expect(journal).toBeDefined()
            expect(journal.id).toBeDefined()
            expect(journal.totalAmount).toBe(25)
            expect(journal.transactionCount).toBe(2)
        })

        it('should reject unbalanced journals', async () => {
            await expect(
                journalRepository.createJournalWithTransactions({
                    description: 'Unbalanced',
                    journalDate: Date.now(),
                    currencyCode: 'USD',
                    transactions: [
                        { accountId: cashAccountId, amount: 100, transactionType: TransactionType.CREDIT },
                        { accountId: expenseAccountId, amount: 50, transactionType: TransactionType.DEBIT },
                    ],
                })
            ).rejects.toThrow(/Double-entry violation/)
        })

        it('should handle multi-leg journals', async () => {
            // Receive salary and immediately pay some expense
            const journal = await journalRepository.createJournalWithTransactions({
                description: 'Salary with immediate expense',
                journalDate: Date.now(),
                currencyCode: 'USD',
                transactions: [
                    { accountId: cashAccountId, amount: 900, transactionType: TransactionType.DEBIT },
                    { accountId: incomeAccountId, amount: 1000, transactionType: TransactionType.CREDIT },
                    { accountId: expenseAccountId, amount: 100, transactionType: TransactionType.DEBIT },
                ],
            })

            expect(journal.transactionCount).toBe(3)
            expect(journal.totalAmount).toBe(1000)
        })

        it('should update account balances correctly', async () => {
            await journalRepository.createJournalWithTransactions({
                description: 'Deposit',
                journalDate: Date.now(),
                currencyCode: 'USD',
                transactions: [
                    { accountId: cashAccountId, amount: 500, transactionType: TransactionType.DEBIT },
                    { accountId: incomeAccountId, amount: 500, transactionType: TransactionType.CREDIT },
                ],
            })

            // Ensure rebuilds complete
            await rebuildQueueService.flush()

            const cashBalance = await accountRepository.getAccountBalance(cashAccountId)
            expect(cashBalance.balance).toBe(500)

            const incomeBalance = await accountRepository.getAccountBalance(incomeAccountId)
            expect(incomeBalance.balance).toBe(500)
        })
    })

    describe('updateJournalWithTransactions', () => {
        it('should update journal and recalculate balances', async () => {
            const journal = await journalRepository.createJournalWithTransactions({
                description: 'Original',
                journalDate: Date.now(),
                currencyCode: 'USD',
                transactions: [
                    { accountId: cashAccountId, amount: 100, transactionType: TransactionType.CREDIT },
                    { accountId: expenseAccountId, amount: 100, transactionType: TransactionType.DEBIT },
                ],
            })

            await journalRepository.updateJournalWithTransactions(journal.id, {
                description: 'Updated',
                journalDate: Date.now(),
                currencyCode: 'USD',
                transactions: [
                    { accountId: cashAccountId, amount: 200, transactionType: TransactionType.CREDIT },
                    { accountId: expenseAccountId, amount: 200, transactionType: TransactionType.DEBIT },
                ],
            })

            // Re-fetch from database to get updated values
            const updatedJournal = await journalRepository.find(journal.id)
            expect(updatedJournal).toBeDefined()
            expect(updatedJournal!.totalAmount).toBe(200)
            expect(updatedJournal!.description).toBe('Updated')
        }, 10000)
    })


    describe('duplicateJournal', () => {
        it('should duplicate a journal and its transactions', async () => {
            const originalJournal = await journalRepository.createJournalWithTransactions({
                description: 'Original Transaction',
                journalDate: Date.now() - 86400000, // Yesterday
                currencyCode: 'USD',
                transactions: [
                    { accountId: cashAccountId, amount: 123.45, transactionType: TransactionType.CREDIT },
                    { accountId: expenseAccountId, amount: 123.45, transactionType: TransactionType.DEBIT },
                ],
            })

            const duplicatedJournal = await journalRepository.duplicateJournal(originalJournal.id)

            expect(duplicatedJournal).toBeDefined()
            expect(duplicatedJournal.id).not.toBe(originalJournal.id)
            expect(duplicatedJournal.description).toBe(`Copy of ${originalJournal.description}`)
            expect(duplicatedJournal.totalAmount).toBe(originalJournal.totalAmount)
            expect(duplicatedJournal.transactionCount).toBe(originalJournal.transactionCount)

            // Transactions should be duplicated faithfully
            const duplicatedTransactions = await journalRepository.findEnrichedTransactionsByJournal(duplicatedJournal.id)
            expect(duplicatedTransactions).toHaveLength(2)

            const cashTx = duplicatedTransactions.find(t => t.accountId === cashAccountId)
            const expenseTx = duplicatedTransactions.find(t => t.accountId === expenseAccountId)

            expect(cashTx?.amount).toBe(123.45)
            expect(cashTx?.transactionType).toBe(TransactionType.CREDIT)
            expect(expenseTx?.amount).toBe(123.45)
            expect(expenseTx?.transactionType).toBe(TransactionType.DEBIT)
        })
    })

    describe('deleteJournal', () => {
        // TODO: Fix rebuild queue singleton timing issue in test environment
        it.skip('should soft-delete journal and its transactions', async () => {
            const journal = await journalRepository.createJournalWithTransactions({
                description: 'To be deleted',
                journalDate: Date.now(),
                currencyCode: 'USD',
                transactions: [
                    { accountId: cashAccountId, amount: 50, transactionType: TransactionType.CREDIT },
                    { accountId: expenseAccountId, amount: 50, transactionType: TransactionType.DEBIT },
                ],
            })

            await journalRepository.deleteJournal(journal.id)

            // Don't wait for rebuild queue - this test only verifies soft-delete
            const deletedJournal = await journalRepository.find(journal.id)
            expect(deletedJournal?.deletedAt).toBeDefined()
        })
    })



})
