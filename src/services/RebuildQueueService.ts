import { AppConfig } from '@/src/constants';
import {
  balanceRebuildIntentRepository,
  type BalanceRebuildRequest,
} from '@/src/data/repositories/BalanceRebuildIntentRepository';
import { storage } from '@/src/data/storage/storage';
import { accountingRebuildService } from '@/src/services/AccountingRebuildService';
import { logger } from '@/src/services/observability/logger';
import { asAccountId, asWorkplaceId } from '@/src/types/ids';
import { safeParseJSON } from '@/src/utils/serialization';

const { debounceMs, maxRetryDelayMs, retryDelayMs } = AppConfig.performance.rebuild.queue;
const LEGACY_KEYS = ['rebuild_queue_v1', 'rebuild_processing_batch_v1'];

async function importLegacyIntents(): Promise<void> {
  const requests: BalanceRebuildRequest[] = [];
  const importedKeys: string[] = [];
  for (const key of LEGACY_KEYS) {
    const json = storage.getString(key);
    if (json === undefined || json === null) continue;
    importedKeys.push(key);
    const entries = safeParseJSON(json);
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (
        !Array.isArray(entry) ||
        typeof entry[0] !== 'string' ||
        typeof entry[1] !== 'number' ||
        !Number.isFinite(entry[1])
      )
        continue;
      const [workplaceId, accountId] = entry[0].split('__');
      if (workplaceId && accountId)
        requests.push({
          workplaceId: asWorkplaceId(workplaceId),
          accountId: asAccountId(accountId),
          fromDate: entry[1],
        });
    }
  }
  await balanceRebuildIntentRepository.importPending(requests);
  for (const key of importedKeys) storage.remove(key);
}

/** The timer only schedules reads of pending database intents. */
export class RebuildQueueService {
  private timer?: ReturnType<typeof setTimeout>;
  private active?: Promise<boolean>;
  private controller?: AbortController;
  private changed = false;
  private nextRetryDelay = retryDelayMs;

  start(): () => void {
    const subscription = balanceRebuildIntentRepository.changes().subscribe(() => {
      this.changed = true;
      this.nextRetryDelay = retryDelayMs;
      if (!this.active) this.schedule(debounceMs);
    });
    return () => {
      subscription.unsubscribe();
      this.stop();
    };
  }

  private schedule(delay: number): void {
    if (this.timer !== undefined) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.process().catch(error =>
        logger.warn('[RebuildQueue] Could not drain intents', { error }),
      );
    }, delay);
  }

  async flush(): Promise<void> {
    this.nextRetryDelay = retryDelayMs;
    await this.process();
  }

  private async process(): Promise<void> {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.active) {
      const stopped = this.controller?.signal.aborted;
      await this.active;
      if (stopped) await this.process();
      return;
    }

    const controller = new AbortController();
    this.controller = controller;
    const run = this.drain(controller.signal);
    this.active = run;
    let needsRetry = false;
    try {
      needsRetry = await run;
    } catch (error) {
      needsRetry = true;
      throw error;
    } finally {
      this.active = undefined;
      this.controller = undefined;
      if (this.changed) {
        this.schedule(debounceMs);
      } else if (needsRetry && !controller.signal.aborted) {
        this.schedule(this.nextRetryDelay);
        this.nextRetryDelay = Math.min(this.nextRetryDelay * 2, maxRetryDelayMs);
      } else {
        this.nextRetryDelay = retryDelayMs;
      }
    }
  }

  stop(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.changed = false;
    this.controller?.abort();
  }

  private async drain(signal: AbortSignal): Promise<boolean> {
    let legacyImportFailed = false;
    try {
      await importLegacyIntents();
    } catch (error) {
      legacyImportFailed = true;
      logger.warn('[RebuildQueue] Legacy rebuild import remains pending', { error });
    }
    let needsRetry = false;
    do {
      needsRetry = false;
      this.changed = false;
      const pending = await balanceRebuildIntentRepository.listPending();
      for (const claim of pending) {
        if (signal.aborted) return false;
        try {
          const result = await accountingRebuildService.rebuildIntent(claim, () => !signal.aborted);
          if (result === 'superseded') this.changed = true;
          if (result === 'deferred') needsRetry = true;
        } catch (error) {
          needsRetry = true;
          logger.warn('[RebuildQueue] Balance rebuild remains pending', { error });
        }
      }
    } while (this.changed && !signal.aborted);
    return needsRetry || legacyImportFailed;
  }
}

export const rebuildQueueService = new RebuildQueueService();
