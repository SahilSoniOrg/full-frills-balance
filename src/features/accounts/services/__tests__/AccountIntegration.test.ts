/**
 * Integration tests for AccountRepository
 * Tests account creation, balance calculations, and precision handling
 */

import { database } from '@/src/data/database/Database'
import { AccountSubcategory, AccountType } from '@/src/data/models/Account'
import { TransactionType } from '@/src/data/models/Transaction'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { journalRepository } from '@/src/data/repositories/JournalRepository'
import { balanceService } from '@/src/services/BalanceService'
import { accountService } from '../AccountService'

describe('AccountRepository', () => {
    beforeEach(async () => {
        await database.write(async () => {
            await database.unsafeResetDatabase()
        })
    })

    describe('create', () => {
        it('should create a simple account', async () => {
            const account = await accountRepository.create({
                name: 'Checking',
                accountType: AccountType.ASSET,
                currencyCode: 'USD',
            })

            expect(account.id).toBeDefined()
            expect(account.name).toBe('Checking')
            expect(account.accountType).toBe(AccountType.ASSET)
        })

        it('should default subcategory based on account type when missing', async () => {
            const account = await accountRepository.create({
                name: 'Emergency Fund',
                accountType: AccountType.ASSET,
                currencyCode: 'USD',
            })

            expect(account.accountSubcategory).toBe(AccountSubcategory.CASH)
        })

        it('should create account with initial balance', async () => {
            const account = await accountService.createAccount({
                name: 'Savings',
                accountType: AccountType.ASSET,
                currencyCode: 'USD',
                initialBalance: 1000,
            })

            const balance = await balanceService.getAccountBalance(account.id)
            expect(balance.balance).toBe(1000)
        })

        it('should reject invalid subcategory for account type', async () => {
            await expect(accountRepository.create({
                name: 'Invalid Asset',
                accountType: AccountType.ASSET,
                accountSubcategory: AccountSubcategory.CREDIT_CARD,
                currencyCode: 'USD',
            })).rejects.toThrow('Subcategory CREDIT_CARD is not valid for account type ASSET')
        })
    })

    describe('update', () => {
        it('should re-default subcategory when account type changes and current subcategory is incompatible', async () => {
            const account = await accountRepository.create({
                name: 'Starter Asset',
                accountType: AccountType.ASSET,
                accountSubcategory: AccountSubcategory.CASH,
                currencyCode: 'USD',
            })

            const updated = await accountRepository.update(account, {
                accountType: AccountType.EQUITY,
            })

            expect(updated.accountType).toBe(AccountType.EQUITY)
            expect(updated.accountSubcategory).toBe(AccountSubcategory.OPENING_BALANCE)
        })
    })

    describe('getAccountBalance', () => {
        it('should return zero for accounts with no transactions', async () => {
            const account = await accountRepository.create({
                name: 'Empty',
                accountType: AccountType.ASSET,
                currencyCode: 'USD',
            })

            const balance = await balanceService.getAccountBalance(account.id)
            expect(balance.balance).toBe(0)
            expect(balance.transactionCount).toBe(0)
        })

        it('should calculate correct balance after multiple transactions', async () => {
            const asset = await accountRepository.create({
                name: 'Cash',
                accountType: AccountType.ASSET,
                currencyCode: 'USD',
            })
            const equity = await accountRepository.create({
                name: 'Equity',
                accountType: AccountType.EQUITY,
                currencyCode: 'USD',
            })

            // Deposit 1000
            await journalRepository.createJournalWithTransactions({
                description: 'Initial',
                journalDate: Date.now() - 2000,
                currencyCode: 'USD',
                totalAmount: 1000,
                displayType: 'INCOME',
                transactions: [
                    { accountId: asset.id, amount: 1000, transactionType: TransactionType.DEBIT },
                    { accountId: equity.id, amount: 1000, transactionType: TransactionType.CREDIT },
                ],
                calculatedBalances: new Map([[asset.id, 1000], [equity.id, 1000]])
            })

            // Withdraw 300
            await journalRepository.createJournalWithTransactions({
                description: 'Withdrawal',
                journalDate: Date.now() - 1000,
                currencyCode: 'USD',
                totalAmount: 300,
                displayType: 'EXPENSE',
                transactions: [
                    { accountId: asset.id, amount: 300, transactionType: TransactionType.CREDIT },
                    { accountId: equity.id, amount: 300, transactionType: TransactionType.DEBIT },
                ],
                calculatedBalances: new Map([[asset.id, 700], [equity.id, 700]])
            })

            const balance = await balanceService.getAccountBalance(asset.id)
            expect(balance.balance).toBe(700)
            expect(balance.transactionCount).toBe(2)
        })

        it('should calculate point-in-time balances correctly', async () => {
            const asset = await accountRepository.create({
                name: 'Cash',
                accountType: AccountType.ASSET,
                currencyCode: 'USD',
            })
            const equity = await accountRepository.create({
                name: 'Equity',
                accountType: AccountType.EQUITY,
                currencyCode: 'USD',
            })

            const earlierTime = Date.now() - 5000
            const laterTime = Date.now()

            await journalRepository.createJournalWithTransactions({
                description: 'Earlier',
                journalDate: earlierTime,
                currencyCode: 'USD',
                totalAmount: 500,
                displayType: 'INCOME',
                transactions: [
                    { accountId: asset.id, amount: 500, transactionType: TransactionType.DEBIT },
                    { accountId: equity.id, amount: 500, transactionType: TransactionType.CREDIT },
                ],
                calculatedBalances: new Map([[asset.id, 500], [equity.id, 500]])
            })

            await journalRepository.createJournalWithTransactions({
                description: 'Later',
                journalDate: laterTime,
                currencyCode: 'USD',
                totalAmount: 200,
                displayType: 'INCOME',
                transactions: [
                    { accountId: asset.id, amount: 200, transactionType: TransactionType.DEBIT },
                    { accountId: equity.id, amount: 200, transactionType: TransactionType.CREDIT },
                ],
                calculatedBalances: new Map([[asset.id, 700], [equity.id, 700]])
            })

            // Balance at earlier point
            const earlierBalance = await balanceService.getAccountBalance(asset.id, earlierTime + 1)
            expect(earlierBalance.balance).toBe(500)

            // Current balance
            const currentBalance = await balanceService.getAccountBalance(asset.id)
            expect(currentBalance.balance).toBe(700)
        })
    })

    describe('findByType', () => {
        it('should filter accounts by type', async () => {
            await accountRepository.create({ name: 'Cash', accountType: AccountType.ASSET, currencyCode: 'USD' })
            await accountRepository.create({ name: 'Card', accountType: AccountType.LIABILITY, currencyCode: 'USD' })
            await accountRepository.create({ name: 'Bank', accountType: AccountType.ASSET, currencyCode: 'USD' })

            const assets = await accountRepository.findByType(AccountType.ASSET)
            expect(assets.length).toBe(2)
            expect(assets.every(a => a.accountType === AccountType.ASSET)).toBe(true)
        })
    })
})
