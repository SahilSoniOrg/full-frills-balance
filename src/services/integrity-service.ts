/**
 * Integrity Service
 * 
 * Handles balance verification and crash recovery.
 * Ensures data integrity by detecting and repairing stale running balances.
 * This service is responsible for checking if the account balances match the transaction history.
 * 
 * All database writes are delegated to repositories.
 */

import { AppConfig } from '@/src/constants/app-config'
import { database } from '@/src/data/database/Database'
import { schema } from '@/src/data/database/schema'
import Account from '@/src/data/models/Account'
import BalanceSnapshot from '@/src/data/models/BalanceSnapshot'
import { TransactionType } from '@/src/data/models/Transaction'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { balanceSnapshotRepository, SnapshotData } from '@/src/data/repositories/BalanceSnapshotRepository'
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository'
import { databaseRepository } from '@/src/data/repositories/DatabaseRepository'
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository'
import { transactionRepository } from '@/src/data/repositories/TransactionRepository'
import { accountingRebuildService } from '@/src/services/AccountingRebuildService'
import { smsService } from '@/src/services/sms-service'
import { accountingService } from '@/src/utils/accountingService'
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus'
import { logger } from '@/src/utils/logger'
import { amountsAreEqual } from '@/src/utils/money'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getRawAdapter } from '../data/database/DatabaseUtils'

export interface BalanceVerificationResult {
    accountId: string
    accountName: string
    cachedBalance: number
    computedBalance: number
    matches: boolean
    discrepancy: number
    /** True when a snapshot's stored absoluteBalance didn't match a recomputation at that point */
    snapshotCorrupted?: boolean
}

export interface IntegrityCheckResult {
    totalAccounts: number
    accountsChecked: number
    discrepanciesFound: number
    repairsAttempted: number
    repairsSuccessful: number
    results: BalanceVerificationResult[]
}

// Default constants removed as they are handled by onboardingService

// Default accounts are handled by onboardingService

export class IntegrityService {
    /**
     * Computes account balance from scratch.
     * 
     * Optimized: Uses a raw SQL aggregate (SUM) if available on the adapter, 
     * otherwise falls back to the ORM-based iteration.
     */
    async computeBalanceFromTransactions(accountId: string, cutoffDate?: number): Promise<number> {
        const account = await accountRepository.find(accountId)
        if (!account) throw new Error(`Account ${accountId} not found`)

        const effectiveCutoff = cutoffDate ?? Date.now()
        const precision = await currencyRepository.getPrecision(account.currencyCode)

        // Try to find the latest snapshot as a checkpoint
        const snapshot = await balanceSnapshotRepository.findLatestForAccount(accountId, effectiveCutoff)

        const startBalance = snapshot?.absoluteBalance || 0;
        const startDate = snapshot?.transactionDate || 0;

        // Attempt raw SQL optimization first (O(1) memory, O(N) DB scan)
        const rawResult = await this.computeBalanceRaw(account, effectiveCutoff, snapshot)
        if (rawResult !== null) {
            return startBalance + rawResult
        }

        // --- Fallback Path (ORM-based, O(N) memory) ---
        logger.debug(`[IntegrityService] Falling back to ORM balance computation for ${account.name}`)

        // Only iterate delta transactions after the snapshot checkpoint
        let transactions = await transactionRepository.findByAccount(accountId, undefined, {
            startDate: startDate,
            endDate: effectiveCutoff,
        })

        // findByAccount returns desc order; we need asc for sequential balance calculation
        let sortedAsc = transactions.slice().sort(
            (a, b) => a.transactionDate - b.transactionDate || a.createdAt.getTime() - b.createdAt.getTime()
        )

        // Precise Anchor: Skip transactions already included in the snapshot
        if (snapshot) {
            const snapshotIdx = sortedAsc.findIndex(tx => tx.id === snapshot.transactionId);
            if (snapshotIdx !== -1) {
                sortedAsc = sortedAsc.slice(snapshotIdx + 1);
            } else {
                sortedAsc = sortedAsc.filter(tx => tx.transactionDate > startDate);
            }
        }

        let balance = startBalance
        for (const tx of sortedAsc) {
            balance = accountingService.calculateNewBalance(
                balance,
                tx.amount,
                account.accountType,
                tx.transactionType,
                precision
            )
        }

        return balance
    }

    /**
     * Uses raw SQL to compute the SUM of transaction impacts.
     * Returns null if raw SQL is not supported.
     */
    private async computeBalanceRaw(account: Account, cutoffDate: number, snapshot: SnapshotData | BalanceSnapshot | null): Promise<number | null> {
        const sqlAdapter = getRawAdapter(database)
        if (!sqlAdapter || typeof sqlAdapter.queryRaw !== 'function') return null

        // SQL math logic mirroring getBalanceImpactMultiplier
        // Asset/Expense: Debit=+1, Credit=-1
        // Liability/Equity/Income: Debit=-1, Credit=+1
        const isNormalDebit = ['ASSET', 'EXPENSE'].includes(account.accountType)

        const activeStatusesStr = ACTIVE_JOURNAL_STATUSES.map(s => `'${s}'`).join(',');

        let sql = `
                SELECT SUM(
                    CASE 
                        WHEN t.transaction_type = '${TransactionType.DEBIT}' THEN (CASE WHEN ? = 1 THEN t.amount ELSE -t.amount END)
                        WHEN t.transaction_type = '${TransactionType.CREDIT}' THEN (CASE WHEN ? = 1 THEN -t.amount ELSE t.amount END)
                        ELSE 0
                    END
                ) as delta
                FROM transactions t
                JOIN journals j ON t.journal_id = j.id
                WHERE t.account_id = ?
                  AND t.deleted_at IS NULL
                  AND j.deleted_at IS NULL
                  AND j.status IN (${activeStatusesStr})
                  AND t.transaction_date <= ?
        `

        // Parameters: isNormalDebit(1/0), isNormalDebit(1/0), accountId, cutoffDate
        const args: (string | number)[] = [
            isNormalDebit ? 1 : 0,
            isNormalDebit ? 1 : 0,
            account.id,
            cutoffDate,
        ]

        if (snapshot?.transactionId) {
            // Strictly include only rows after the checkpoint transaction, not after snapshot-row creation.
            sql += `
              AND (
                  t.transaction_date > (SELECT transaction_date FROM transactions WHERE id = ?)
                  OR (
                      t.transaction_date = (SELECT transaction_date FROM transactions WHERE id = ?)
                      AND (
                          t.created_at > (SELECT created_at FROM transactions WHERE id = ?)
                          OR (t.created_at = (SELECT created_at FROM transactions WHERE id = ?) AND t.id > ?)
                      )
                  )
              )
            `
            args.push(
                snapshot.transactionId,
                snapshot.transactionId,
                snapshot.transactionId,
                snapshot.transactionId,
                snapshot.transactionId
            )
        }

        try {
            const rows = await transactionRawRepository.queryRaw<{ delta: number }>(sql, args)
            return rows[0]?.delta || 0
        } catch (error) {
            logger.error(`[IntegrityService] Failed to compute raw balance for account ${account.id}`, error)
            return null
        }
    }

    /**
     * Verifies a single account's balance.
     * 
     * Also cross-checks the most recent snapshot's `absoluteBalance` against
     * a fresh recomputation up to that snapshot's date, to detect corrupted checkpoints.
     */
    async verifyAccountBalance(accountId: string, cutoffDate: number = Date.now()): Promise<BalanceVerificationResult> {
        const account = await accountRepository.find(accountId)
        if (!account) {
            throw new Error(`Account ${accountId} not found`)
        }

        const precision = await currencyRepository.getPrecision(account.currencyCode)

        // 1. Get the "Cached" balance (the actual running_balance column of the latest transaction)
        const latestBalances = await transactionRawRepository.getLatestBalancesRaw([accountId], cutoffDate);
        const cachedBalance = latestBalances.get(accountId) || 0;

        // 2. Compute the "Real" balance using the snapshot-optimized path
        const computedBalance = await this.computeBalanceFromTransactions(accountId, cutoffDate)
        const matches = amountsAreEqual(cachedBalance, computedBalance, precision)
        const discrepancy = matches ? 0 : Math.abs(cachedBalance - computedBalance)

        // 3. Check if the snapshot itself is corrupt (cross-check)
        let snapshotCorrupted: boolean | undefined = undefined
        const snapshot = await balanceSnapshotRepository.findLatestForAccount(accountId, cutoffDate)
        if (snapshot) {
            // Recompute from scratch (no snapshot) up to the snapshot's exact transaction
            const snapshotRecomputed = await this.computeBalanceFromScratch(accountId, snapshot.transactionDate, snapshot.transactionId)
            snapshotCorrupted = !amountsAreEqual(snapshot.absoluteBalance, snapshotRecomputed, precision)

            if (snapshotCorrupted) {
                logger.warn(
                    `[IntegrityService] Snapshot corruption detected for account ${accountId}: ` +
                    `snapshot.absoluteBalance=${snapshot.absoluteBalance}, recomputed=${snapshotRecomputed}`
                )
            }
        }

        return {
            accountId,
            accountName: account.name,
            cachedBalance,
            computedBalance,
            matches,
            discrepancy,
            snapshotCorrupted,
        }
    }

    /**
     * Computes account balance by iterating ALL transactions from the beginning,
     * ignoring any snapshots. Used strictly for snapshot cross-checking.
     */
    private async computeBalanceFromScratch(accountId: string, cutoffDate: number, limitTransactionId?: string): Promise<number> {
        const account = await accountRepository.find(accountId)
        if (!account) throw new Error(`Account ${accountId} not found`)

        const precision = await currencyRepository.getPrecision(account.currencyCode)
        const transactions = await transactionRepository.findForAccountUpToDate(accountId, cutoffDate)

        let sortedAsc = transactions.slice().sort(
            (a, b) => a.transactionDate - b.transactionDate || a.createdAt.getTime() - b.createdAt.getTime()
        )

        // Precise boundary: if we have a limit transaction, stop there
        if (limitTransactionId) {
            const limitIdx = sortedAsc.findIndex(tx => tx.id === limitTransactionId);
            if (limitIdx !== -1) {
                sortedAsc = sortedAsc.slice(0, limitIdx + 1);
            }
        }

        let balance = 0
        for (const tx of sortedAsc) {
            balance = accountingService.calculateNewBalance(
                balance,
                tx.amount,
                account.accountType,
                tx.transactionType,
                precision
            )
        }

        return balance
    }

    /**
     * Verifies all account balances.
     */
    async verifyAllAccountBalances(): Promise<BalanceVerificationResult[]> {
        const accounts = await accountRepository.findAll()

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
            await accountingRebuildService.rebuildAccountBalances(accountId)
            logger.info(`[IntegrityService] Repaired running balances for account ${accountId}`)
            return true
        } catch (error) {
            logger.error(`[IntegrityService] Failed to repair account ${accountId}`, error)
            return false
        }
    }

    // ─── Schema-version guard ────────────────────────────────────────────────────
    private static readonly SCHEMA_VERSION_KEY = '@integrity_schema_version'

    /**
     * Returns true if the full balance-verification scan should run.
     * Runs when the stored schema version differs from the current one (i.e. after a migration).
     */
    private async shouldRunIntegrityCheck(): Promise<boolean> {
        const storedVersion = await AsyncStorage.getItem(IntegrityService.SCHEMA_VERSION_KEY);
        const currentVersion = String(schema.version);

        if (storedVersion !== currentVersion) {
            logger.info(`[IntegrityService] Schema changed (${storedVersion} → ${currentVersion}) — running full integrity check.`);
            await AsyncStorage.setItem(IntegrityService.SCHEMA_VERSION_KEY, currentVersion);
            return true;
        }
        return false;
    }


    /**
     * Forces a full balance verification and repair, regardless of crash flag or schema version.
     * Use this for **manual** invocations (e.g. the Settings "Fix Integrity Issues" button).
     * Unlike runStartupCheck(), this always scans every account.
     */
    async forceRunCheck(onProgress?: (message: string, progress: number) => void): Promise<IntegrityCheckResult> {
        logger.info('[IntegrityService] Force-running full balance verification (manual trigger)...')

        const accounts = await accountRepository.findAll()
        const total = accounts.length
        const results: BalanceVerificationResult[] = []

        for (let i = 0; i < accounts.length; i++) {
            const account = accounts[i]
            try {
                const result = await this.verifyAccountBalance(account.id)
                results.push(result)
            } catch (error) {
                logger.error(`[IntegrityService] Failed to verify account ${account.id}`, error)
            }
            const verifyProgress = total > 0 ? ((i + 1) / total) * 0.7 : 0.7
            onProgress?.(`Checking ${account.name}...`, verifyProgress)
        }

        const discrepancies = results.filter(r => !r.matches || r.snapshotCorrupted)

        let repairsAttempted = 0
        let repairsSuccessful = 0

        for (let i = 0; i < discrepancies.length; i++) {
            const discrepancy = discrepancies[i]
            logger.warn(
                `[IntegrityService] Balance discrepancy for ${discrepancy.accountName}: ` +
                `cached=${discrepancy.cachedBalance}, computed=${discrepancy.computedBalance}` +
                (discrepancy.snapshotCorrupted ? ' [snapshot corrupted]' : '')
            )
            repairsAttempted++
            const repairProgress = 0.7 + ((i + 1) / Math.max(discrepancies.length, 1)) * 0.2
            onProgress?.(`Repairing ${discrepancy.accountName}...`, repairProgress)
            const success = await this.repairAccountBalance(discrepancy.accountId)
            if (success) {
                repairsSuccessful++
            }
        }

        onProgress?.('Finalizing...', 1)

        return {
            totalAccounts: results.length,
            accountsChecked: results.length,
            discrepanciesFound: discrepancies.length,
            repairsAttempted,
            repairsSuccessful,
            results,
        }
    }

    /**
     * Runs startup integrity check and seeds defaults if database is empty.
     *
     * H-6 fix: The full balance verification is expensive (O(accounts × transactions)).
     * We only run it when truly necessary:
     *  - On first launch (no stored schema version → could be corrupted fresh install).
     *  - When a crash flag was written by the previous session.
     * Normal warm starts skip it entirely.
     */
    async runStartupCheck(): Promise<IntegrityCheckResult> {
        logger.info('[IntegrityService] Starting startup integrity check...')

        const accountsExist = await accountRepository.exists()
        if (!accountsExist) {
            logger.info('[IntegrityService] No accounts found. Skipping default seeding (onboarding handles data creation).')
        }

        const shouldRun = await this.shouldRunIntegrityCheck()
        if (!shouldRun) {
            logger.info('[IntegrityService] Skipping balance verification (no crash flag, schema unchanged).')
            return {
                totalAccounts: 0,
                accountsChecked: 0,
                discrepanciesFound: 0,
                repairsAttempted: 0,
                repairsSuccessful: 0,
                results: [],
            }
        }

        logger.info('[IntegrityService] Running full balance verification...')
        const results = await this.verifyAllAccountBalances()
        const discrepancies = results.filter(r => !r.matches || r.snapshotCorrupted)

        let repairsAttempted = 0
        let repairsSuccessful = 0

        for (const discrepancy of discrepancies) {
            logger.warn(
                `[IntegrityService] Balance discrepancy for ${discrepancy.accountName}: ` +
                `cached=${discrepancy.cachedBalance}, computed=${discrepancy.computedBalance}` +
                (discrepancy.snapshotCorrupted ? ' [snapshot corrupted]' : '')
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
            await databaseRepository.resetDatabase()
            await smsService.clearProcessedMessages()
            logger.info('[IntegrityService] Database reset successful.')
        } catch (error) {
            logger.error('[IntegrityService] CRITICAL: Factory reset failed:', error)
            throw error
        }
    }

    /**
     * Data Cleanup.
     */
    async cleanupDatabase(): Promise<{ deletedCount: number }> {
        logger.info('[IntegrityService] Starting database cleanup...')
        try {
            const totalDeleted = await databaseRepository.cleanupDeletedRecords([...AppConfig.strings.audit.tables])
            logger.info(`[IntegrityService] Cleanup complete. Removed ${totalDeleted} records.`)
            return { deletedCount: totalDeleted }
        } catch (error) {
            logger.error('[IntegrityService] Cleanup failed:', error)
            throw error
        }
    }
}

export const integrityService = new IntegrityService()
