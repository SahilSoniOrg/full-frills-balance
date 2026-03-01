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
import { schema } from '@/src/data/database/schema'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { balanceSnapshotRepository } from '@/src/data/repositories/BalanceSnapshotRepository'
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository'
import { databaseRepository } from '@/src/data/repositories/DatabaseRepository'
import { transactionRepository } from '@/src/data/repositories/TransactionRepository'
import { accountingRebuildService } from '@/src/services/AccountingRebuildService'
import { accountingService } from '@/src/utils/accountingService'
import { logger } from '@/src/utils/logger'
import { amountsAreEqual } from '@/src/utils/money'
import AsyncStorage from '@react-native-async-storage/async-storage'

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
     * Computes account balance from scratch by iterating all transactions.
     * 
     * Optimized: if a balance snapshot exists before cutoffDate, we use it as
     * the starting point (absoluteBalance) and only iterate subsequent transactions.
     * This reduces the scan from O(N_total) to O(N_since_last_checkpoint).
     */
    async computeBalanceFromTransactions(accountId: string, cutoffDate?: number): Promise<number> {
        const account = await accountRepository.find(accountId)
        if (!account) {
            throw new Error(`Account ${accountId} not found`)
        }

        const effectiveCutoff = cutoffDate ?? Date.now()
        const precision = await currencyRepository.getPrecision(account.currencyCode)

        // Try to find the latest snapshot before the cutoff as a checkpoint
        const snapshot = await balanceSnapshotRepository.findLatestForAccount(accountId, effectiveCutoff)

        let balance = 0
        let startDate = 0

        if (snapshot) {
            // Start from the snapshot's known-good balance
            balance = snapshot.absoluteBalance
            startDate = snapshot.transactionDate
            logger.debug(
                `[IntegrityService] Using snapshot at ${startDate} as base ` +
                `(balance=${balance}) for account ${accountId}`
            )
        }

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
                // Fallback for edge cases where snapshot transaction is missing
                sortedAsc = sortedAsc.filter(tx => tx.transactionDate > startDate);
            }
        }

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

        // 1. Get the "Cached" balance (the running_balance of the latest transaction)
        const latestTx = await transactionRepository.findLatestForAccount(accountId, cutoffDate)
        const cachedBalance = latestTx?.runningBalance || 0

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

    // ─── Crash-flag helpers (H-6) ────────────────────────────────────────────────
    private static readonly CRASH_FLAG_KEY = '@integrity_crash_flag'
    private static readonly SCHEMA_VERSION_KEY = '@integrity_schema_version'

    /**
     * Returns true if the full balance-verification scan should run.
     * Criteria:
     *  - A crash flag exists (written by the global error handler before a crash).
     *  - OR the stored schema version differs from the current one (migration happened).
     */
    private async shouldRunIntegrityCheck(): Promise<boolean> {
        const [crashFlag, storedVersion] = await Promise.all([
            AsyncStorage.getItem(IntegrityService.CRASH_FLAG_KEY),
            AsyncStorage.getItem(IntegrityService.SCHEMA_VERSION_KEY),
        ]);

        const currentVersion = String(schema.version);

        if (crashFlag !== null) {
            logger.warn('[IntegrityService] Crash flag detected — running full integrity check.');
            return true;
        }
        if (storedVersion !== currentVersion) {
            logger.info(`[IntegrityService] Schema changed (${storedVersion} → ${currentVersion}) — running full integrity check.`);
            // Update stored version proactively so a crash during check doesn't loop forever.
            await AsyncStorage.setItem(IntegrityService.SCHEMA_VERSION_KEY, currentVersion);
            return true;
        }
        return false;
    }

    /**
     * Clears the crash flag after a successful integrity check.
     */
    private async clearCrashFlag(): Promise<void> {
        await AsyncStorage.removeItem(IntegrityService.CRASH_FLAG_KEY);
    }

    /**
     * Writes a crash flag. Call this from the global error handler / ErrorBoundary.
     */
    async writeCrashFlag(): Promise<void> {
        await AsyncStorage.setItem(IntegrityService.CRASH_FLAG_KEY, Date.now().toString());
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

        // Clear the crash flag now that we have successfully verified.
        await this.clearCrashFlag()

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
