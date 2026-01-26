import { database } from '@/src/data/database/Database'
import { AccountType } from '@/src/data/models/Account'
import Transaction, { TransactionType } from '@/src/data/models/Transaction'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { journalRepository } from '@/src/data/repositories/JournalRepository'
import { IntegrityService } from '@/src/services/integrity-service'

describe('IntegrityService', () => {
    let service: IntegrityService
    let cashAccountId: string
    let equityAccountId: string

    beforeEach(async () => {
        await database.write(async () => {
            await database.unsafeResetDatabase()
        })

        service = new IntegrityService()

        const cash = await accountRepository.create({
            name: 'Cash',
            accountType: AccountType.ASSET,
            currencyCode: 'USD',
        })
        const equity = await accountRepository.create({
            name: 'Equity',
            accountType: AccountType.EQUITY,
            currencyCode: 'USD',
        })
        cashAccountId = cash.id
        equityAccountId = equity.id
    })

    describe('computeBalanceFromTransactions', () => {
        it('should compute correct debit/credit balanced sum', async () => {
            await journalRepository.createJournalWithTransactions({
                description: 'In',
                journalDate: Date.now(),
                currencyCode: 'USD',
                transactions: [
                    { accountId: cashAccountId, amount: 1000, transactionType: TransactionType.DEBIT },
                    { accountId: equityAccountId, amount: 1000, transactionType: TransactionType.CREDIT },
                ],
            })

            await journalRepository.createJournalWithTransactions({
                description: 'Out',
                journalDate: Date.now(),
                currencyCode: 'USD',
                transactions: [
                    { accountId: cashAccountId, amount: 300, transactionType: TransactionType.CREDIT },
                    { accountId: equityAccountId, amount: 300, transactionType: TransactionType.DEBIT },
                ],
            })

            const balance = await service.computeBalanceFromTransactions(cashAccountId)
            expect(balance).toBe(700)
        })
    })

    describe('verifyAccountBalance', () => {
        it('should detect when cached running balance is corrupted', async () => {
            await journalRepository.createJournalWithTransactions({
                description: 'Deposit',
                journalDate: Date.now(),
                currencyCode: 'USD',
                transactions: [
                    { accountId: cashAccountId, amount: 500, transactionType: TransactionType.DEBIT },
                    { accountId: equityAccountId, amount: 500, transactionType: TransactionType.CREDIT },
                ],
            })

            // Corrupt it
            const transactions = await database.collections.get<Transaction>('transactions').query().fetch()
            await database.write(async () => {
                await transactions[0].update(t => {
                    t.runningBalance = 9999
                })
            })

            const result = await service.verifyAccountBalance(cashAccountId)
            expect(result.matches).toBe(false)
            expect(result.computedBalance).toBe(500)
        })
    })

    describe('repairAccountBalance', () => {
        it('should fix running balance discrepancies', async () => {
            await journalRepository.createJournalWithTransactions({
                description: 'Deposit',
                journalDate: Date.now(),
                currencyCode: 'USD',
                transactions: [
                    { accountId: cashAccountId, amount: 500, transactionType: TransactionType.DEBIT },
                    { accountId: equityAccountId, amount: 500, transactionType: TransactionType.CREDIT },
                ],
            })

            // Corrupt it
            const transactions = await database.collections.get<Transaction>('transactions').query().fetch()
            await database.write(async () => {
                await transactions[0].update(t => {
                    t.runningBalance = 9999
                })
            })

            await service.repairAccountBalance(cashAccountId)

            const result = await service.verifyAccountBalance(cashAccountId)
            expect(result.matches).toBe(true)
            expect(result.computedBalance).toBe(500)
        })
    })
})
