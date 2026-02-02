/**
 * Integrity Service
 * 
 * Handles balance verification and crash recovery.
 * Ensures data integrity by detecting and repairing stale running balances.
 * This service is responsible for checking if the account balances match the transaction history.
 */

import { database } from '@/src/data/database/Database'
import Account, { AccountType } from '@/src/data/models/Account'
import { JournalStatus } from '@/src/data/models/Journal'
import Transaction from '@/src/data/models/Transaction'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository'
import { transactionRepository } from '@/src/data/repositories/TransactionRepository'
import { accountingService } from '@/src/services/AccountingService'
import { logger } from '@/src/utils/logger'
import { amountsAreEqual, roundToPrecision } from '@/src/utils/money'
import { Q } from '@nozbe/watermelondb'

export interface BalanceVerificationResult {
    accountId: string
    accountName: string
    cachedBalance: number
    computedBalance: number
    matches: boolean
    discrepancy: number
}

export interface IntegrityCheckResult {
    totalAccounts: number
    accountsChecked: number
    discrepanciesFound: number
    repairsAttempted: number
    repairsSuccessful: number
    results: BalanceVerificationResult[]
}

const DEFAULT_EXPENSE_CATEGORIES = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Health', 'Housing', 'Other Expense'];
const DEFAULT_INCOME_CATEGORIES = ['Salary', 'Gifts', 'Interest', 'Other Income'];
const DEFAULT_ASSET_ACCOUNTS = ['Wallet'];

export class IntegrityService {
    /**
     * Computes account balance from scratch by iterating all transactions.
     */
    async computeBalanceFromTransactions(accountId: string, cutoffDate?: number): Promise<number> {
        const account = await accountRepository.find(accountId)
        if (!account) {
            throw new Error(`Account ${accountId} not found`)
        }

        let query = database.collections.get<Transaction>('transactions')
            .query(
                Q.where('account_id', accountId),
                Q.where('deleted_at', Q.eq(null)),
                Q.on('journals', Q.and(
                    Q.where('status', JournalStatus.POSTED),
                    Q.where('deleted_at', Q.eq(null))
                ))
            )

        if (cutoffDate !== undefined) {
            query = query.extend(Q.where('transaction_date', Q.lte(cutoffDate)))
        }

        const transactions = await query.fetch()
        const precision = await currencyRepository.getPrecision(account.currencyCode)

        let balance = 0
        for (const tx of transactions) {
            const multiplier = accountingService.getImpactMultiplier(account.accountType as any, tx.transactionType)
            balance = roundToPrecision(balance + (tx.amount * multiplier), precision)
        }

        return balance
    }

    /**
     * Verifies a single account's balance.
     */
    async verifyAccountBalance(accountId: string, cutoffDate: number = Date.now()): Promise<BalanceVerificationResult> {
        const account = await accountRepository.find(accountId)
        if (!account) {
            throw new Error(`Account ${accountId} not found`)
        }

        const cachedData = await accountRepository.getAccountBalance(accountId, cutoffDate)
        const computedBalance = await this.computeBalanceFromTransactions(accountId, cutoffDate)
        const precision = await currencyRepository.getPrecision(account.currencyCode)
        const discrepancy = Math.abs(cachedData.balance - computedBalance)

        return {
            accountId,
            accountName: account.name,
            cachedBalance: cachedData.balance,
            computedBalance,
            matches: amountsAreEqual(cachedData.balance, computedBalance, precision),
            discrepancy,
        }
    }

    /**
     * Verifies all account balances.
     */
    async verifyAllAccountBalances(): Promise<BalanceVerificationResult[]> {
        const accounts = await database.collections.get<Account>('accounts')
            .query(Q.where('deleted_at', Q.eq(null)))
            .fetch()

        const results: BalanceVerificationResult[] = []

        for (const account of accounts) {
            try {
                const result = await this.verifyAccountBalance(account.id)
                results.push(result)
            } catch (error) {
                logger.error(`[IntegrityService] Failed to verify account ${account.id}`, error)
            }
        }

        return results
    }

    /**
     * Repairs a single account's running balances.
     */
    async repairAccountBalance(accountId: string): Promise<boolean> {
        try {
            await transactionRepository.rebuildRunningBalances(accountId)
            logger.info(`[IntegrityService] Repaired running balances for account ${accountId}`)
            return true
        } catch (error) {
            logger.error(`[IntegrityService] Failed to repair account ${accountId}`, error)
            return false
        }
    }

    /**
     * Runs startup integrity check and seeds defaults if database is empty.
     */
    async runStartupCheck(): Promise<IntegrityCheckResult> {
        logger.info('[IntegrityService] Starting startup integrity check...')

        const existingAccountsCount = await database.collections.get<Account>('accounts')
            .query(Q.where('deleted_at', Q.eq(null)))
            .fetchCount()

        if (existingAccountsCount === 0) {
            logger.info('[IntegrityService] No accounts found. Seeding default accounts/categories...')
            await this.seedDefaultAccounts()
        }

        const results = await this.verifyAllAccountBalances()
        const discrepancies = results.filter(r => !r.matches)

        let repairsAttempted = 0
        let repairsSuccessful = 0

        for (const discrepancy of discrepancies) {
            logger.warn(
                `[IntegrityService] Balance discrepancy for ${discrepancy.accountName}: ` +
                `cached=${discrepancy.cachedBalance}, computed=${discrepancy.computedBalance}`
            )

            repairsAttempted++
            const success = await this.repairAccountBalance(discrepancy.accountId)
            if (success) {
                repairsSuccessful++
            }
        }

        const summary: IntegrityCheckResult = {
            totalAccounts: results.length,
            accountsChecked: results.length,
            discrepanciesFound: discrepancies.length,
            repairsAttempted,
            repairsSuccessful,
            results,
        }

        return summary
    }

    /**
     * Factory Reset.
     */
    async resetDatabase(): Promise<void> {
        logger.warn('[IntegrityService] STARTING FACTORY RESET...')
        try {
            await database.write(async () => {
                await database.unsafeResetDatabase()
            })
            logger.info('[IntegrityService] Database reset successful. Seeding defaults...')
            await this.seedDefaultAccounts()
        } catch (error) {
            logger.error('[IntegrityService] CRITICAL: Factory reset failed:', error)
            throw error
        }
    }

    /**
     * Seeds default accounts and categories.
     */
    async seedDefaultAccounts(): Promise<void> {
        const defaultCurrency = 'USD';

        await database.write(async () => {
            const accountsCollection = database.collections.get<Account>('accounts');

            // Create Expense Categories
            for (const name of DEFAULT_EXPENSE_CATEGORIES) {
                await accountsCollection.create((account) => {
                    account.name = name;
                    account.accountType = AccountType.EXPENSE;
                    account.currencyCode = defaultCurrency;
                });
            }

            // Create Income Categories
            for (const name of DEFAULT_INCOME_CATEGORIES) {
                await accountsCollection.create((account) => {
                    account.name = name;
                    account.accountType = AccountType.INCOME;
                    account.currencyCode = defaultCurrency;
                });
            }

            // Create Default Asset Accounts
            for (const name of DEFAULT_ASSET_ACCOUNTS) {
                await accountsCollection.create((account) => {
                    account.name = name;
                    account.accountType = AccountType.ASSET;
                    account.currencyCode = defaultCurrency;
                });
            }
        });

        logger.info(`[IntegrityService] Seeded default accounts and categories.`);
    }

    /**
     * Data Cleanup.
     */
    async cleanupDatabase(): Promise<{ deletedCount: number }> {
        logger.info('[IntegrityService] Starting database cleanup...')
        let totalDeleted = 0
        const collections = ['journals', 'transactions', 'accounts']

        try {
            await database.write(async () => {
                for (const table of collections) {
                    const deletedRecords = await database.collections.get(table)
                        .query(Q.where('deleted_at', Q.notEq(null)))
                        .fetch()

                    totalDeleted += deletedRecords.length
                    for (const record of deletedRecords) {
                        await record.destroyPermanently()
                    }
                }
            })
            logger.info(`[IntegrityService] Cleanup complete. Removed ${totalDeleted} records.`)
        } catch (error) {
            logger.error('[IntegrityService] Cleanup failed:', error)
            throw error
        }

        return { deletedCount: totalDeleted }
    }
}

export const integrityService = new IntegrityService()
