import ShortcutSmsModule from '@/modules/expo-sms-inbox/shortcut';
import { database } from '@/src/data/database/Database';
import { logger } from '@/src/services/observability/logger';
import { preferences } from '@/src/services/preferences';
import { smsSyncPipeline } from '@/src/services/sms/pipeline/smsSyncPipeline';
import type { WorkplaceId } from '@/src/types/ids';
import { Platform } from 'react-native';

const queue = Platform.OS === 'ios' ? ShortcutSmsModule : null;
const RESET_MARKER = 'shortcut-sms-reset-pending';
type ResetResult = { cleanupError: unknown } | undefined;

class ShortcutSmsIntakeService {
  private requestedWorkplaceId: WorkplaceId | undefined;
  private activeRun: Promise<void> | undefined;
  private resetRun: Promise<ResetResult> | undefined;
  private recoveryRun: Promise<void> | undefined;

  get canSetUp(): boolean {
    return queue !== null && Number.parseInt(String(Platform.Version), 10) >= 17;
  }

  async getFirstReceivedAt(): Promise<number | null> {
    return (await queue?.getStatus())?.firstReceivedAt ?? null;
  }

  process(workplaceId?: WorkplaceId): Promise<void> {
    if (!queue || this.resetRun) return Promise.resolve();
    const requestedWorkplaceId = workplaceId ?? preferences.device.activeWorkplaceId;
    if (!requestedWorkplaceId) return Promise.resolve();

    this.requestedWorkplaceId = requestedWorkplaceId;
    this.activeRun ??= Promise.resolve().then(() => this.drain(queue));
    return this.activeRun;
  }

  resetWithDatabase(operation: () => Promise<void>): Promise<ResetResult> {
    if (!queue) return operation().then(() => undefined);
    if (this.resetRun) return this.resetRun;

    this.requestedWorkplaceId = undefined;
    const nativeQueue = queue;
    this.resetRun = Promise.resolve()
      .then(async () => {
        await this.activeRun?.catch(() => undefined);
        await this.recoverStagedReset(nativeQueue);
        // The database reset erases this marker. Together with the staged
        // generation it lets startup resolve an interruption between commits.
        await database.adapter.setLocal(RESET_MARKER, '1');
        await nativeQueue.stageReset();
        try {
          await operation();
        } catch (error) {
          await nativeQueue.finishReset(false).catch(cleanupError => {
            logger.warn('[ShortcutSmsIntake] Could not clear staged reset', { cleanupError });
          });
          throw error;
        }
        try {
          await nativeQueue.finishReset(true);
          await nativeQueue.purgeRetired();
        } catch (cleanupError) {
          return { cleanupError };
        }
      })
      .finally(() => {
        this.resetRun = undefined;
      });
    return this.resetRun;
  }

  async recoverQueue(): Promise<void> {
    if (!queue || this.resetRun) return;
    await this.recoverStagedReset(queue);
    await queue.purgeRetired();
  }

  private recoverStagedReset(nativeQueue: NonNullable<typeof queue>): Promise<void> {
    this.recoveryRun ??= Promise.resolve()
      .then(async () => {
        if (!(await nativeQueue.hasStagedReset())) return;
        const resetMarker = await database.adapter.getLocal(RESET_MARKER);
        await nativeQueue.finishReset(resetMarker == null);
      })
      .finally(() => {
        this.recoveryRun = undefined;
      });
    return this.recoveryRun;
  }

  private async drain(nativeQueue: NonNullable<typeof queue>): Promise<void> {
    try {
      await this.recoverStagedReset(nativeQueue);
      while (!this.resetRun && this.requestedWorkplaceId) {
        const workplaceId = this.requestedWorkplaceId;
        this.requestedWorkplaceId = undefined;

        try {
          await this.processPass(nativeQueue, workplaceId);
        } catch (error) {
          // Leave the failed alert queued. Honor any request received during this pass.
          if (!this.requestedWorkplaceId || this.resetRun) throw error;
        }
      }
    } finally {
      this.activeRun = undefined;
    }
  }

  private async processPass(
    nativeQueue: NonNullable<typeof queue>,
    workplaceId: WorkplaceId,
  ): Promise<void> {
    const messages = await nativeQueue.getPending();
    let firstFailure: { error: unknown } | undefined;
    for (const message of messages) {
      // Already-running writes finish. Untouched alerts use the newer review context.
      if (
        this.resetRun ||
        (this.requestedWorkplaceId && this.requestedWorkplaceId !== workplaceId)
      ) {
        break;
      }
      try {
        await smsSyncPipeline.scanMessages(workplaceId, [message], undefined, {
          origin: 'shortcut',
        });
        await nativeQueue.acknowledge(message.id);
      } catch (error) {
        firstFailure ??= { error };
      }
    }
    if (firstFailure) throw firstFailure.error;
  }
}

export const shortcutSmsIntakeService = new ShortcutSmsIntakeService();
