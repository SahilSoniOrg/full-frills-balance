/**
 * Rebuild Queue Service
 *
 * Batches running balance rebuild operations to prevent UI blocking.
 * Queues account IDs and processes them in batches with debouncing.
 */

import { AppConfig } from '@/src/constants';
import { accountingRebuildService } from '@/src/services/AccountingRebuildService';
import { AccountId, WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { safeParseJSON } from '@/src/utils/serialization';
import { storage } from '@/src/utils/storage';

interface RebuildQueueConfig {
  debounceMs: number;
  maxBatchSize: number;
  retryLimit: number;
  retryDelayMs: number;
}

const DEFAULT_CONFIG: RebuildQueueConfig = {
  debounceMs: process.env.NODE_ENV === 'test' ? 0 : AppConfig.performance.rebuild.queue.debounceMs,
  maxBatchSize: AppConfig.performance.rebuild.queue.maxBatchSize,
  retryLimit: AppConfig.performance.rebuild.queue.retryLimit,
  retryDelayMs:
    process.env.NODE_ENV === 'test' ? 0 : AppConfig.performance.rebuild.queue.retryDelayMs,
};

function createQueueKey(accountId: AccountId, workplaceId: WorkplaceId): string {
  return `${workplaceId}__${accountId}`;
}
function parseQueueKey(key: string): [WorkplaceId, AccountId] {
  const [workplaceId, accountId] = key.split('__');
  return [workplaceId as WorkplaceId, accountId as AccountId];
}
class RebuildQueueService {
  private static readonly STORAGE_KEY = 'rebuild_queue_v1';
  private static readonly PROCESSING_KEY = 'rebuild_processing_batch_v1';
  private queue: Map<string, number> = new Map(); // key -> minFromDate
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private isProcessing: boolean = false;
  private currentProcessingPromise: Promise<void> | null = null;
  private config: RebuildQueueConfig;
  private retryCounts: Map<string, number> = new Map();

  constructor(config: Partial<RebuildQueueConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadQueueFromDisk();
  }

  private loadQueueFromDisk(): void {
    try {
      const stored = storage.getString(RebuildQueueService.STORAGE_KEY);
      if (stored) {
        const entries = safeParseJSON<[string, number][]>(stored, []);
        if (Array.isArray(entries)) {
          this.queue = new Map(entries);
          logger.info(`[RebuildQueue] Loaded ${this.queue.size} items from disk`);
          if (this.queue.size > 0) {
            this.scheduleProcessing();
          }
        }
      }
    } catch (error) {
      logger.error('[RebuildQueue] Failed to load queue from disk', error);
      this.queue = new Map();
    }

    // Recover from crashes: items that were out for processing but never finished
    try {
      const processing = storage.getString(RebuildQueueService.PROCESSING_KEY);
      if (processing) {
        const entries = safeParseJSON<[string, number][]>(processing, []);
        if (Array.isArray(entries) && entries.length > 0) {
          logger.warn(`[RebuildQueue] Recovering ${entries.length} items from interrupted batch`);
          for (const [id, date] of entries) {
            if (!id.includes('__')) {
              continue;
            }
            const [workplaceId, accountId] = parseQueueKey(id);
            this.enqueue(accountId, date, workplaceId as WorkplaceId);
          }
          storage.remove(RebuildQueueService.PROCESSING_KEY);
        }
      }
    } catch (error) {
      logger.error('[RebuildQueue] Failed to recover processing batch', error);
    }
  }

  private syncQueueToDisk(): void {
    try {
      const entries = Array.from(this.queue.entries());
      storage.set(RebuildQueueService.STORAGE_KEY, JSON.stringify(entries));
    } catch (error) {
      logger.error('[RebuildQueue] Failed to sync queue to disk', error);
    }
  }

  /**
   * Queue an account for running balance rebuild.
   * @param accountId Account ID
   * @param fromDate Optional earliest date of change. Defaults to current time.
   */
  enqueue(accountId: AccountId, fromDate: number = Date.now(), workplaceId: WorkplaceId): void {
    const existingDate = this.queue.get(createQueueKey(accountId, workplaceId));
    if (existingDate === undefined || fromDate < existingDate) {
      this.queue.set(createQueueKey(accountId, workplaceId), fromDate);
      this.syncQueueToDisk();
    }
    this.scheduleProcessing();
  }

  /**
   * Queue multiple accounts for rebuild.
   * @param accountIds List of account IDs
   * @param fromDate Optional earliest date of change for all accounts.
   */
  enqueueMany(
    accountIds: AccountId[] | Set<AccountId>,
    fromDate: number = Date.now(),
    workplaceId: WorkplaceId,
  ): void {
    const ids = Array.isArray(accountIds) ? accountIds : Array.from(accountIds);
    let changed = false;
    for (const id of ids) {
      const existingDate = this.queue.get(createQueueKey(id, workplaceId));
      if (existingDate === undefined || fromDate < existingDate) {
        this.queue.set(createQueueKey(id, workplaceId), fromDate);
        changed = true;
      }
    }
    if (changed) {
      this.syncQueueToDisk();
      this.scheduleProcessing();
    }
  }

  /**
   * Force immediate processing of the queue.
   * Useful for critical operations where we need balances ASAP.
   */
  async flush(): Promise<void> {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    // Wait for current process if any
    if (this.currentProcessingPromise) {
      await this.currentProcessingPromise;
    }

    // Keep processing batches until the queue is empty
    while (this.queue.size > 0) {
      await this.processQueue();
    }
  }

  /**
   * Stop the service, clear any pending timeouts, and empty the queue.
   *
   * IMPORTANT: If this service ever holds observable subscriptions,
   * they MUST be unsubscribed here to prevent memory leaks.
   */
  stop(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.queue.clear();
    this.retryCounts.clear();
    this.syncQueueToDisk();
  }

  /**
   * Get the current queue size for debugging/monitoring.
   */
  get pendingCount(): number {
    return this.queue.size;
  }

  /**
   * Check if there are pending rebuilds.
   */
  get hasPending(): boolean {
    return this.queue.size > 0 || this.isProcessing;
  }

  private scheduleProcessing(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    this.timeoutId = setTimeout(() => {
      this.processQueue();
    }, this.config.debounceMs);
    // Note: React Native handles timeout lifecycle automatically
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.size === 0) {
      return;
    }

    this.currentProcessingPromise = (async () => {
      const start = Date.now();
      this.isProcessing = true;
      try {
        // Take up to maxBatchSize items from the queue
        const batch: { id: string; fromDate: number }[] = [];
        const entries = Array.from(this.queue.entries());
        for (const [accountId, fromDate] of entries) {
          batch.push({ id: accountId, fromDate });
          if (batch.length >= this.config.maxBatchSize) {
            break;
          }
        }

        // Move processed items from queue to processing batch storage
        for (const item of batch) {
          this.queue.delete(item.id);
        }
        this.syncQueueToDisk();
        storage.set(
          RebuildQueueService.PROCESSING_KEY,
          JSON.stringify(batch.map(i => [i.id, i.fromDate])),
        );

        logger.debug(`[RebuildQueue] Processing batch of ${batch.length} accounts`);

        // Process all accounts in the batch sequentially.
        // This avoids DB lock contention and long-held write locks, especially for large accounts.
        const results: { status: 'fulfilled' | 'rejected'; reason?: any }[] = [];
        for (const item of batch) {
          try {
            const [workplaceId, accountId] = parseQueueKey(item.id);
            await accountingRebuildService.rebuildAccountBalances(
              workplaceId as WorkplaceId,
              accountId,
              item.fromDate,
            );
            results.push({ status: 'fulfilled' });
          } catch (error) {
            results.push({ status: 'rejected', reason: error });
          }
        }

        // Log any failures
        const failures = results
          .map((result, index) => ({ result, item: batch[index] }))
          .filter(entry => entry.result.status === 'rejected');

        if (failures.length > 0) {
          logger.warn(`[RebuildQueue] ${failures.length}/${batch.length} rebuilds failed`);

          for (const failure of failures) {
            const { item } = failure;
            const retryCount = (this.retryCounts.get(item.id) || 0) + 1;
            this.retryCounts.set(item.id, retryCount);

            if (retryCount <= this.config.retryLimit) {
              const delay = this.config.retryDelayMs * retryCount;
              setTimeout(() => {
                const [workplaceId, accountId] = parseQueueKey(item.id);
                this.enqueue(accountId, item.fromDate, workplaceId as WorkplaceId);
              }, delay);
            } else {
              logger.error(
                `[RebuildQueue] Giving up on account ${item.id} after ${retryCount} attempts`,
              );
            }
          }
        }

        // Clear processing batch storage after completion
        storage.remove(RebuildQueueService.PROCESSING_KEY);

        // Clear retry counts for successes
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            this.retryCounts.delete(batch[index].id);
          }
        });

        logger.debug(`[RebuildQueue] Batch complete. ${this.queue.size} remaining in queue.`);

        // If there are more items, schedule another processing
        if (this.queue.size > 0) {
          this.scheduleProcessing();
        }
      } catch (error) {
        logger.error('[RebuildQueue] Error processing queue:', error);
      } finally {
        this.isProcessing = false;
        this.currentProcessingPromise = null;
        logger.info(`[Trace] RebuildQueueService.processQueue: ${Date.now() - start}ms`, {
          queueSize: this.queue.size,
        });
      }
    })();

    return this.currentProcessingPromise;
  }
}

// Singleton instance
export const rebuildQueueService = new RebuildQueueService();

// Export class for testing
export { RebuildQueueService };
