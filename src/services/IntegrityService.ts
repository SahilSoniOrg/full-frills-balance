/**
 * Integrity Service
 * 
 * Handles balance verification and crash recovery.
 * Ensures data integrity by detecting and repairing stale running balances.
 */

import { Q } from '@nozbe/watermelondb'
import { database } from '../data/database/Database'
import Account from '../data/models/Account'
import { JournalStatus } from '../data/models/Journal'
import Transaction, { TransactionType } from '../data/models/Transaction'
import { accountRepository } from '../data/repositories/AccountRepository'
import { transactionRepository } from '../data/repositories/TransactionRepository'
import { BALANCE_EPSILON } from '../domain/accounting/AccountingConstants'
import { logger } from '../utils/logger'

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

class IntegrityService {
    /**
     * Computes account balance from scratch by iterating all transactions.
     * This is the source of truth for balance verification.
     */
    async computeBalanceFromTransactions(accountId: string): Promise<number> {
        const account = await accountRepository.find(accountId)
        if (!account) {
            throw new Error(`Account ${accountId} not found`)
        }

        // Determine balance direction based on account type
        let debitMult = 0
        let creditMult = 0

        switch (account.accountType) {
            case 'ASSET':
            case 'EXPENSE':
                debitMult = 1
                creditMult = -1
                break
            case 'LIABILITY':
            case 'EQUITY':
            case 'INCOME':
                debitMult = -1
                creditMult = 1
                break
        }

        // Fetch all posted, non-deleted transactions for this account
        const transactions = await database.collections.get<Transaction>('transactions')
            .query(
                Q.where('account_id', accountId),
                Q.where('deleted_at', Q.eq(null)),
                Q.on('journals', Q.and(
                    Q.where('status', JournalStatus.POSTED),
                    Q.where('deleted_at', Q.eq(null))
                ))
            )
            .fetch()

        // Sum up all transactions
        let balance = 0
        for (const tx of transactions) {
            const amount = tx.transactionType === TransactionType.DEBIT
                ? tx.amount * debitMult
                : tx.amount * creditMult
            balance += amount
        }

        return balance
    }

    /**
     * Verifies a single account's balance against computed value.
     */
    async verifyAccountBalance(accountId: string): Promise<BalanceVerificationResult> {
        const account = await accountRepository.find(accountId)
        if (!account) {
            throw new Error(`Account ${accountId} not found`)
        }

        const cachedData = await accountRepository.getAccountBalance(accountId)
        const computedBalance = await this.computeBalanceFromTransactions(accountId)
        const discrepancy = Math.abs(cachedData.balance - computedBalance)

        return {
            accountId,
            accountName: account.name,
            cachedBalance: cachedData.balance,
            computedBalance,
            matches: discrepancy < BALANCE_EPSILON,
            discrepancy,
        }
    }

    /**
     * Verifies all account balances and returns detailed results.
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
     * Repairs a single account's running balances by forcing rebuild.
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
     * Runs startup integrity check.
     * Called on app initialization to detect and repair stale balances.
     * Non-blocking - logs results but does not throw.
     */
    async runStartupCheck(): Promise<IntegrityCheckResult> {
        logger.info('[IntegrityService] Starting integrity check...')

        const results = await this.verifyAllAccountBalances()
        const discrepancies = results.filter(r => !r.matches)

        let repairsAttempted = 0
        let repairsSuccessful = 0

        // Auto-repair discrepancies
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

        if (discrepancies.length === 0) {
            logger.info(`[IntegrityService] Integrity check passed. ${results.length} accounts verified.`)
        } else {
            logger.warn(
                `[IntegrityService] Integrity check found ${discrepancies.length} discrepancies. ` +
                `Repairs: ${repairsSuccessful}/${repairsAttempted} successful.`
            )
        }

        return summary
    }

    /**
     * Factory Reset: Deletes all data from all collections.
     * WARNING: Irreversible action.
     */
    async resetDatabase(): Promise<void> {
        logger.warn('[IntegrityService] PERFORMING FACTORY RESET...')
        await database.write(async () => {
            await database.unsafeResetDatabase()
        })
        logger.info('[IntegrityService] Factory reset complete.')
    }

    /**
     * Data Cleanup: Permanently removes all records marked as soft-deleted.
     */
    async cleanupDatabase(): Promise<{ deletedCount: number }> {
        logger.info('[IntegrityService] Starting database cleanup...')
        let totalDeleted = 0

        await database.write(async () => {
            const collections = ['journals', 'transactions', 'accounts', 'audit_logs']

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

        logger.info(`[IntegrityService] Cleanup complete. Removed ${totalDeleted} records permanently.`)
        return { deletedCount: totalDeleted }
    }
}

export const integrityService = new IntegrityService()
