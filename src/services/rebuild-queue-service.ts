/**
 * Rebuild Queue Service
 * 
 * Batches running balance rebuild operations to prevent UI blocking.
 * Queues account IDs and processes them in batches with debouncing.
 */

import { transactionRepository } from '../data/repositories/TransactionRepository'
import { logger } from '../utils/logger'

interface RebuildQueueConfig {
    debounceMs: number
    maxBatchSize: number
}

const DEFAULT_CONFIG: RebuildQueueConfig = {
    debounceMs: process.env.NODE_ENV === 'test' ? 0 : 500,
    maxBatchSize: 10,
}


class RebuildQueueService {
    private queue: Map<string, number> = new Map() // accountId -> minFromDate
    private timeoutId: ReturnType<typeof setTimeout> | null = null
    private isProcessing: boolean = false
    private config: RebuildQueueConfig

    constructor(config: Partial<RebuildQueueConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config }
    }

    /**
     * Queue an account for running balance rebuild.
     * @param accountId Account ID
     * @param fromDate Optional earliest date of change. Defaults to current time.
     */
    enqueue(accountId: string, fromDate: number = Date.now()): void {
        const existingDate = this.queue.get(accountId)
        if (existingDate === undefined || fromDate < existingDate) {
            this.queue.set(accountId, fromDate)
        }
        this.scheduleProcessing()
    }

    /**
     * Queue multiple accounts for rebuild.
     * @param accountIds List of account IDs
     * @param fromDate Optional earliest date of change for all accounts.
     */
    enqueueMany(accountIds: string[] | Set<string>, fromDate: number = Date.now()): void {
        for (const id of accountIds) {
            this.enqueue(id, fromDate)
        }
    }

    /**
     * Force immediate processing of the queue.
     * Useful for critical operations where we need balances ASAP.
     */
    async flush(): Promise<void> {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId)
            this.timeoutId = null
        }
        await this.processQueue()
    }

    /**
     * Get the current queue size for debugging/monitoring.
     */
    get pendingCount(): number {
        return this.queue.size
    }

    /**
     * Check if there are pending rebuilds.
     */
    get hasPending(): boolean {
        return this.queue.size > 0 || this.isProcessing
    }

    private scheduleProcessing(): void {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId)
        }
        this.timeoutId = setTimeout(() => {
            this.processQueue()
        }, this.config.debounceMs)
    }

    private async processQueue(): Promise<void> {
        if (this.isProcessing || this.queue.size === 0) {
            return
        }

        this.isProcessing = true
        try {
            // Take up to maxBatchSize items from the queue
            const batch:  { id: string; fromDate: number }[]  = []
            for (const [accountId, fromDate] of this.queue.entries()) {
                batch.push({ id: accountId, fromDate })
                if (batch.length >= this.config.maxBatchSize) {
                    break
                }
            }

            // Remove processed items from queue
            for (const item of batch) {
                this.queue.delete(item.id)
            }

            logger.debug(`[RebuildQueue] Processing batch of ${batch.length} accounts`)

            // Process all accounts in the batch
            const results = await Promise.allSettled(
                batch.map(item => transactionRepository.rebuildRunningBalances(item.id, item.fromDate))
            )

            // Log any failures
            const failures = results.filter(r => r.status === 'rejected')
            if (failures.length > 0) {
                logger.warn(`[RebuildQueue] ${failures.length}/${batch.length} rebuilds failed`)
            }

            logger.debug(`[RebuildQueue] Batch complete. ${this.queue.size} remaining in queue.`)

            // If there are more items, schedule another processing
            if (this.queue.size > 0) {
                this.scheduleProcessing()
            }
        } catch (error) {
            logger.error('[RebuildQueue] Error processing queue:', error)
        } finally {
            this.isProcessing = false
        }
    }
}

// Singleton instance
export const rebuildQueueService = new RebuildQueueService()

// Export class for testing
export { RebuildQueueService }
