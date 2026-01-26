/**
 * Integration tests for AccountRepository
 * Tests account creation, balance calculations, and precision handling
 */

import { database } from '@/src/data/database/Database'
import { AccountType } from '@/src/data/models/Account'
import { TransactionType } from '@/src/data/models/Transaction'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { journalRepository } from '@/src/data/repositories/JournalRepository'

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

        it('should create account with initial balance', async () => {
            const account = await accountRepository.create({
                name: 'Savings',
                accountType: AccountType.ASSET,
                currencyCode: 'USD',
                initialBalance: 1000,
            })

            const balance = await accountRepository.getAccountBalance(account.id)
            expect(balance.balance).toBe(1000)
        })
    })

    describe('getAccountBalance', () => {
        it('should return zero for accounts with no transactions', async () => {
            const account = await accountRepository.create({
                name: 'Empty',
                accountType: AccountType.ASSET,
                currencyCode: 'USD',
            })

            const balance = await accountRepository.getAccountBalance(account.id)
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
                transactions: [
                    { accountId: asset.id, amount: 1000, transactionType: TransactionType.DEBIT },
                    { accountId: equity.id, amount: 1000, transactionType: TransactionType.CREDIT },
                ],
            })

            // Withdraw 300
            await journalRepository.createJournalWithTransactions({
                description: 'Withdrawal',
                journalDate: Date.now() - 1000,
                currencyCode: 'USD',
                transactions: [
                    { accountId: asset.id, amount: 300, transactionType: TransactionType.CREDIT },
                    { accountId: equity.id, amount: 300, transactionType: TransactionType.DEBIT },
                ],
            })

            const balance = await accountRepository.getAccountBalance(asset.id)
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
                transactions: [
                    { accountId: asset.id, amount: 500, transactionType: TransactionType.DEBIT },
                    { accountId: equity.id, amount: 500, transactionType: TransactionType.CREDIT },
                ],
            })

            await journalRepository.createJournalWithTransactions({
                description: 'Later',
                journalDate: laterTime,
                currencyCode: 'USD',
                transactions: [
                    { accountId: asset.id, amount: 200, transactionType: TransactionType.DEBIT },
                    { accountId: equity.id, amount: 200, transactionType: TransactionType.CREDIT },
                ],
            })

            // Balance at earlier point
            const earlierBalance = await accountRepository.getAccountBalance(asset.id, earlierTime + 1)
            expect(earlierBalance.balance).toBe(500)

            // Current balance
            const currentBalance = await accountRepository.getAccountBalance(asset.id)
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
