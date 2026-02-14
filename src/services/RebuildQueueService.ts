/**
 * Rebuild Queue Service
 * 
 * Batches running balance rebuild operations to prevent UI blocking.
 * Queues account IDs and processes them in batches with debouncing.
 */

import { accountingRebuildService } from '@/src/services/AccountingRebuildService'
import { logger } from '@/src/utils/logger'

interface RebuildQueueConfig {
    debounceMs: number
    maxBatchSize: number
    retryLimit: number
    retryDelayMs: number
}

const DEFAULT_CONFIG: RebuildQueueConfig = {
    debounceMs: process.env.NODE_ENV === 'test' ? 0 : 500,
    maxBatchSize: 10,
    retryLimit: 3,
    retryDelayMs: process.env.NODE_ENV === 'test' ? 0 : 2000,
}


class RebuildQueueService {
    private queue: Map<string, number> = new Map() // accountId -> minFromDate
    private timeoutId: ReturnType<typeof setTimeout> | null = null
    private isProcessing: boolean = false
    private currentProcessingPromise: Promise<void> | null = null
    private config: RebuildQueueConfig
    private retryCounts: Map<string, number> = new Map()

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
        const ids = Array.isArray(accountIds) ? accountIds : Array.from(accountIds);
        for (const id of ids) {
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

        // Wait for current process if any
        if (this.currentProcessingPromise) {
            await this.currentProcessingPromise
        }

        // Keep processing batches until the queue is empty
        while (this.queue.size > 0) {
            await this.processQueue()
        }
    }

    /**
     * Stop the service, clear any pending timeouts, and empty the queue.
     */
    stop(): void {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId)
            this.timeoutId = null
        }
        this.queue.clear()
        this.retryCounts.clear()
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

        // Prevent Node.js from hanging if this timer is active
        if (this.timeoutId && typeof this.timeoutId === 'object' && 'unref' in this.timeoutId) {
            (this.timeoutId as any).unref()
        }
    }

    private async processQueue(): Promise<void> {
        if (this.isProcessing || this.queue.size === 0) {
            return
        }

        this.currentProcessingPromise = (async () => {
            this.isProcessing = true
            try {
                // Take up to maxBatchSize items from the queue
                const batch: { id: string; fromDate: number }[] = []
                const entries = Array.from(this.queue.entries());
                for (const [accountId, fromDate] of entries) {
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
                    batch.map(item => accountingRebuildService.rebuildAccountBalances(item.id, item.fromDate))
                )

                // Log any failures
                const failures = results
                    .map((result, index) => ({ result, item: batch[index] }))
                    .filter(entry => entry.result.status === 'rejected')

                if (failures.length > 0) {
                    logger.warn(`[RebuildQueue] ${failures.length}/${batch.length} rebuilds failed`)

                    for (const failure of failures) {
                        const { item } = failure
                        const retryCount = (this.retryCounts.get(item.id) || 0) + 1
                        this.retryCounts.set(item.id, retryCount)

                        if (retryCount <= this.config.retryLimit) {
                            const delay = this.config.retryDelayMs * retryCount
                            setTimeout(() => {
                                this.enqueue(item.id, item.fromDate)
                            }, delay)
                        } else {
                            logger.error(`[RebuildQueue] Giving up on account ${item.id} after ${retryCount} attempts`)
                        }
                    }
                }

                // Clear retry counts for successes
                results.forEach((result, index) => {
                    if (result.status === 'fulfilled') {
                        this.retryCounts.delete(batch[index].id)
                    }
                })

                logger.debug(`[RebuildQueue] Batch complete. ${this.queue.size} remaining in queue.`)

                // If there are more items, schedule another processing
                if (this.queue.size > 0) {
                    this.scheduleProcessing()
                }
            } catch (error) {
                logger.error('[RebuildQueue] Error processing queue:', error)
            } finally {
                this.isProcessing = false
                this.currentProcessingPromise = null
            }
        })()

        return this.currentProcessingPromise
    }
}

// Singleton instance
export const rebuildQueueService = new RebuildQueueService()

// Export class for testing
export { RebuildQueueService }
