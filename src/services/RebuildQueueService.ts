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

interface RebuildQueueItem {
  id: string;
  fromDate: number;
}

interface PendingRetry {
  item: RebuildQueueItem;
  timeoutId: ReturnType<typeof setTimeout>;
  generation: number;
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
  private pendingRetries: Map<string, PendingRetry> = new Map();
  private lifecycleGeneration = 0;

  constructor(config: Partial<RebuildQueueConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (typeof window !== 'undefined') {
      this.loadQueueFromDisk();
    }
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
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const persistedQueue = new Map(this.queue);
      for (const retry of this.pendingRetries.values()) {
        const existingDate = persistedQueue.get(retry.item.id);
        if (existingDate === undefined || retry.item.fromDate < existingDate) {
          persistedQueue.set(retry.item.id, retry.item.fromDate);
        }
      }
      const entries = Array.from(persistedQueue.entries());
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
    const key = createQueueKey(accountId, workplaceId);
    const pendingRetry = this.takePendingRetry(key);
    const effectiveFromDate = Math.min(fromDate, pendingRetry?.fromDate ?? fromDate);
    const existingDate = this.queue.get(key);
    if (existingDate === undefined || effectiveFromDate < existingDate) {
      this.queue.set(key, effectiveFromDate);
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
      const key = createQueueKey(id, workplaceId);
      const pendingRetry = this.takePendingRetry(key);
      const effectiveFromDate = Math.min(fromDate, pendingRetry?.fromDate ?? fromDate);
      const existingDate = this.queue.get(key);
      if (existingDate === undefined || effectiveFromDate < existingDate) {
        this.queue.set(key, effectiveFromDate);
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
    const generation = this.lifecycleGeneration;

    while (generation === this.lifecycleGeneration) {
      this.clearProcessingTimer();
      this.promotePendingRetries(generation);

      if (this.currentProcessingPromise) {
        await this.currentProcessingPromise;
        continue;
      }

      if (this.queue.size > 0) {
        await this.processQueue();
        continue;
      }

      if (this.pendingRetries.size === 0) {
        return;
      }
    }
  }

  /**
   * Stop the service, clear any pending timeouts, and empty the queue.
   *
   * IMPORTANT: If this service ever holds observable subscriptions,
   * they MUST be unsubscribed here to prevent memory leaks.
   */
  stop(): void {
    this.lifecycleGeneration += 1;
    this.clearProcessingTimer();
    this.clearRetryTimers();
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
    return this.queue.size > 0 || this.isProcessing || this.pendingRetries.size > 0;
  }

  private scheduleProcessing(): void {
    this.clearProcessingTimer();
    const generation = this.lifecycleGeneration;
    this.timeoutId = setTimeout(() => {
      this.timeoutId = null;
      if (generation === this.lifecycleGeneration) {
        void this.processQueue();
      }
    }, this.config.debounceMs);
  }

  private clearProcessingTimer(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private clearRetryTimers(): void {
    for (const retry of this.pendingRetries.values()) {
      clearTimeout(retry.timeoutId);
    }
    this.pendingRetries.clear();
  }

  private takePendingRetry(id: string): RebuildQueueItem | null {
    const retry = this.pendingRetries.get(id);
    if (!retry) {
      return null;
    }
    clearTimeout(retry.timeoutId);
    this.pendingRetries.delete(id);
    return retry.item;
  }

  private addToQueue(item: RebuildQueueItem): void {
    const existingDate = this.queue.get(item.id);
    if (existingDate === undefined || item.fromDate < existingDate) {
      this.queue.set(item.id, item.fromDate);
    }
  }

  private scheduleRetry(item: RebuildQueueItem, retryCount: number, generation: number): void {
    if (generation !== this.lifecycleGeneration) {
      return;
    }

    const existing = this.pendingRetries.get(item.id);
    if (existing) {
      clearTimeout(existing.timeoutId);
      item = { ...item, fromDate: Math.min(item.fromDate, existing.item.fromDate) };
    }

    const delay = this.config.retryDelayMs * retryCount;
    const timeoutId = setTimeout(() => {
      const pending = this.pendingRetries.get(item.id);
      if (!pending || pending.timeoutId !== timeoutId) {
        return;
      }

      this.pendingRetries.delete(item.id);
      if (pending.generation !== this.lifecycleGeneration) {
        return;
      }

      this.addToQueue(pending.item);
      this.syncQueueToDisk();
      this.scheduleProcessing();
    }, delay);

    this.pendingRetries.set(item.id, { item, timeoutId, generation });
    this.syncQueueToDisk();
  }

  private promotePendingRetries(generation: number): void {
    let promoted = false;
    for (const [id, retry] of this.pendingRetries) {
      if (retry.generation !== generation) {
        continue;
      }
      clearTimeout(retry.timeoutId);
      this.pendingRetries.delete(id);
      this.addToQueue(retry.item);
      promoted = true;
    }
    if (promoted) {
      this.syncQueueToDisk();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.size === 0) {
      return;
    }

    const generation = this.lifecycleGeneration;
    const processingPromise = (async () => {
      const start = Date.now();
      let batch: RebuildQueueItem[] = [];
      this.isProcessing = true;
      try {
        // Take up to maxBatchSize items from the queue
        batch = [];
        const entries = Array.from(this.queue.entries());
        for (const [accountId, fromDate] of entries) {
          batch.push({ id: accountId, fromDate });
          if (batch.length >= this.config.maxBatchSize) {
            break;
          }
        }

        // Persist the in-flight marker before removing anything from the
        // in-memory/durable queue. A failed transition must leave work queued.
        storage.set(
          RebuildQueueService.PROCESSING_KEY,
          JSON.stringify(batch.map(i => [i.id, i.fromDate])),
        );
        for (const item of batch) {
          const currentFromDate = this.queue.get(item.id);
          // Preserve an earlier boundary supplied re-entrantly while the
          // processing marker was being persisted.
          if (currentFromDate !== undefined && currentFromDate >= item.fromDate) {
            this.queue.delete(item.id);
          }
        }
        this.syncQueueToDisk();

        logger.debug(`[RebuildQueue] Processing batch of ${batch.length} accounts`);

        // Process all accounts in the batch sequentially.
        // This avoids DB lock contention and long-held write locks, especially for large accounts.
        const results: { status: 'fulfilled' | 'rejected'; reason?: unknown }[] = [];
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

        if (failures.length > 0 && generation === this.lifecycleGeneration) {
          logger.warn(`[RebuildQueue] ${failures.length}/${batch.length} rebuilds failed`);

          for (const failure of failures) {
            const { item } = failure;
            const retryCount = (this.retryCounts.get(item.id) || 0) + 1;
            this.retryCounts.set(item.id, retryCount);

            if (retryCount <= this.config.retryLimit) {
              this.scheduleRetry(item, retryCount, generation);
            } else {
              this.retryCounts.delete(item.id);
              logger.error(
                `[RebuildQueue] Giving up on account ${item.id} after ${retryCount} attempts`,
              );
            }
          }
        }

        // Clear processing batch storage after completion
        if (generation === this.lifecycleGeneration) {
          storage.remove(RebuildQueueService.PROCESSING_KEY);
        }

        // Clear retry counts for successes
        if (generation === this.lifecycleGeneration) {
          results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
              this.retryCounts.delete(batch[index].id);
            }
          });
        }

        logger.debug(`[RebuildQueue] Batch complete. ${this.queue.size} remaining in queue.`);

        // If there are more items, schedule another processing
        if (generation === this.lifecycleGeneration && this.queue.size > 0) {
          this.scheduleProcessing();
        }
      } catch (error) {
        logger.error('[RebuildQueue] Error processing queue:', error);
        if (generation === this.lifecycleGeneration && batch.length > 0) {
          for (const item of batch) {
            this.addToQueue(item);
          }
          this.syncQueueToDisk();
          storage.remove(RebuildQueueService.PROCESSING_KEY);
        }
      } finally {
        this.isProcessing = false;
        if (this.queue.size > 0 && !this.timeoutId) {
          this.scheduleProcessing();
        }
        logger.info(`[Trace] RebuildQueueService.processQueue: ${Date.now() - start}ms`, {
          queueSize: this.queue.size,
        });
      }
    })();

    this.currentProcessingPromise = processingPromise;
    try {
      await processingPromise;
    } finally {
      if (this.currentProcessingPromise === processingPromise) {
        this.currentProcessingPromise = null;
      }
    }
  }
}

// Singleton instance
export const rebuildQueueService = new RebuildQueueService();

// Export class for testing
export { RebuildQueueService };
