/**
 * End-to-End Workflow Tests
 * Tests complete user workflows across multiple repositories
 */

import { database } from '@/src/data/database/Database'
import { AccountType } from '@/src/data/models/Account'
import { TransactionType } from '@/src/data/models/Transaction'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { journalRepository } from '@/src/data/repositories/JournalRepository'
import { transactionRepository } from '@/src/data/repositories/TransactionRepository'
import { accountService } from '@/src/features/accounts'
import { balanceService } from '@/src/services/BalanceService'
import { IntegrityService } from '@/src/services/integrity-service'
import { journalService } from '@/src/features/journal'
import { rebuildQueueService } from '@/src/services/RebuildQueueService'

describe('E2E Workflows', () => {
    let integrityService: IntegrityService

    beforeEach(async () => {
        await database.write(async () => {
            await database.unsafeResetDatabase()
        })
        integrityService = new IntegrityService()
    }, 30000)

    afterAll(() => {
        rebuildQueueService.stop()
    })

    describe('Daily expense tracking workflow', () => {
        it('should track a full day of expenses with correct balances', async () => {
            // Setup: Create accounts
            const wallet = await accountService.createAccount({
                name: 'Wallet',
                accountType: AccountType.ASSET,
                currencyCode: 'USD',
                initialBalance: 200,
            })
            // Flush the initial balance journal creation
            await rebuildQueueService.flush()

            const food = await accountRepository.create({
                name: 'Food',
                accountType: AccountType.EXPENSE,
                currencyCode: 'USD',
            })
            const transport = await accountRepository.create({
                name: 'Transport',
                accountType: AccountType.EXPENSE,
                currencyCode: 'USD',
            })

            // Morning: Coffee
            await journalService.createJournal({
                description: 'Morning Coffee',
                journalDate: Date.now() + 1000,
                currencyCode: 'USD',
                transactions: [
                    { accountId: wallet.id, amount: 5.50, transactionType: TransactionType.CREDIT },
                    { accountId: food.id, amount: 5.50, transactionType: TransactionType.DEBIT },
                ],
            })

            // Lunch
            await journalService.createJournal({
                description: 'Lunch',
                journalDate: Date.now() + 2000,
                currencyCode: 'USD',
                transactions: [
                    { accountId: wallet.id, amount: 15.00, transactionType: TransactionType.CREDIT },
                    { accountId: food.id, amount: 15.00, transactionType: TransactionType.DEBIT },
                ],
            })

            // Bus ride
            await journalService.createJournal({
                description: 'Bus',
                journalDate: Date.now() + 3000,
                currencyCode: 'USD',
                transactions: [
                    { accountId: wallet.id, amount: 2.50, transactionType: TransactionType.CREDIT },
                    { accountId: transport.id, amount: 2.50, transactionType: TransactionType.DEBIT },
                ],
            })

            // Ensure all rebuilds complete
            await rebuildQueueService.flush()

            // Verify balances
            const walletBalance = await balanceService.getAccountBalance(wallet.id, Date.now() + 5000)
            const foodBalance = await balanceService.getAccountBalance(food.id, Date.now() + 5000)
            const transportBalance = await balanceService.getAccountBalance(transport.id, Date.now() + 5000)

            // 200 - 5.50 - 15.00 - 2.50 = 177.00
            expect(walletBalance.balance).toBe(177)
            expect(foodBalance.balance).toBe(20.5)
            expect(transportBalance.balance).toBe(2.5)

            // Verify integrity
            const walletIntegrity = await integrityService.verifyAccountBalance(wallet.id, Date.now() + 5000)
            expect(walletIntegrity.matches).toBe(true)
        }, 15000)
    })

    describe('Journal reversal workflow', () => {
        // TODO: Fix rebuild queue singleton timing issue in test environment
        it('should correctly reverse a journal and restore balances', async () => {
            const FIXED_DATE = 1706700000000 // Fixed date for test
            const cash = await accountService.createAccount({
                name: 'Cash',
                accountType: AccountType.ASSET,
                currencyCode: 'USD',
                initialBalance: 500,
            })
            // Reset the date of the initial balance to be in the past
            const [initialJournal] = await journalRepository.findAll()
            await database.write(async () => {
                await initialJournal.update(j => {
                    j.journalDate = FIXED_DATE
                })
                const journalTransactions = await transactionRepository.findByJournal(initialJournal.id)
                for (const tx of journalTransactions) {
                    await tx.update((t: any) => {
                        t.transactionDate = FIXED_DATE
                    })
                }
            })

            // Flush the initial balance journal creation
            await rebuildQueueService.flush()

            const expense = await accountRepository.create({
                name: 'Shopping',
                accountType: AccountType.EXPENSE,
                currencyCode: 'USD',
            })

            // Make a purchase
            const journal = await journalService.createJournal({
                description: 'Accidental purchase',
                journalDate: FIXED_DATE + 10000,
                currencyCode: 'USD',
                transactions: [
                    { accountId: cash.id, amount: 100, transactionType: TransactionType.CREDIT },
                    { accountId: expense.id, amount: 100, transactionType: TransactionType.DEBIT },
                ],
            })

            // Verify balance after purchase
            await rebuildQueueService.flush()
            let cashBalance = await balanceService.getAccountBalance(cash.id)
            expect(cashBalance.balance).toBe(400)

            // Reverse the journal
            await journalService.createReversalJournal(journal.id, 'Refund')

            // Ensure rebuilds complete
            await rebuildQueueService.flush()

            // Verify balance is restored
            cashBalance = await balanceService.getAccountBalance(cash.id)
            expect(cashBalance.balance).toBe(500)
        }, 20000)
    })

    describe('Multi-currency workflow', () => {
        // TODO: Fix rebuild queue singleton timing issue in test environment
        it('should handle transactions with exchange rates', async () => {
            const usdCash = await accountRepository.create({
                name: 'USD Cash',
                accountType: AccountType.ASSET,
                currencyCode: 'USD',
            })
            const eurExpense = await accountRepository.create({
                name: 'EUR Expense',
                accountType: AccountType.EXPENSE,
                currencyCode: 'EUR',
            })

            // Spend 100 EUR at 1.10 USD/EUR rate (= 110 USD in journal currency)
            await journalService.createJournal({
                description: 'Purchase in EUR',
                journalDate: Date.now(),
                currencyCode: 'USD',
                transactions: [
                    { accountId: usdCash.id, amount: 110, transactionType: TransactionType.CREDIT },
                    { accountId: eurExpense.id, amount: 100, transactionType: TransactionType.DEBIT, exchangeRate: 1.10 },
                ],
            })

            // Ensure rebuilds complete
            await rebuildQueueService.flush()

            const usdBalance = await balanceService.getAccountBalance(usdCash.id)
            const eurBalance = await balanceService.getAccountBalance(eurExpense.id)

            expect(usdBalance.balance).toBe(-110)
            expect(eurBalance.balance).toBe(100)
        }, 20000)
    })
})
