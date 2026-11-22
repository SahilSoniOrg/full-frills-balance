import ShortcutSmsModule from '@/modules/expo-sms-inbox/shortcut';
import { preferences } from '@/src/services/preferences';
import { smsSyncPipeline } from '@/src/services/sms/pipeline/smsSyncPipeline';
import type { WorkplaceId } from '@/src/types/ids';
import { Platform } from 'react-native';

const queue = Platform.OS === 'ios' ? ShortcutSmsModule : null;

class ShortcutSmsIntakeService {
  private requestedWorkplaceId: WorkplaceId | undefined;
  private activeRun: Promise<void> | undefined;
  private pauseCount = 0;

  get canSetUp(): boolean {
    return queue !== null && Number.parseInt(String(Platform.Version), 10) >= 17;
  }

  async getFirstReceivedAt(): Promise<number | null> {
    return (await queue?.getStatus())?.firstReceivedAt ?? null;
  }

  process(workplaceId?: WorkplaceId): Promise<void> {
    if (!queue || this.pauseCount) return Promise.resolve();
    const requestedWorkplaceId = workplaceId ?? preferences.device.activeWorkplaceId;
    if (!requestedWorkplaceId) return Promise.resolve();

    this.requestedWorkplaceId = requestedWorkplaceId;
    this.activeRun ??= Promise.resolve().then(() => this.drain(queue));
    return this.activeRun;
  }

  async pauseDuring(operation: () => Promise<void>): Promise<void> {
    if (!queue) return operation();
    this.pauseCount += 1;
    this.requestedWorkplaceId = undefined;
    try {
      await this.activeRun?.catch(() => undefined);
      await operation();
    } finally {
      this.pauseCount -= 1;
    }
  }

  async invalidate(): Promise<void> {
    await queue?.invalidate();
  }

  async purgeRetired(): Promise<void> {
    await queue?.purgeRetired();
  }

  private async drain(nativeQueue: NonNullable<typeof queue>): Promise<void> {
    try {
      while (!this.pauseCount && this.requestedWorkplaceId) {
        const workplaceId = this.requestedWorkplaceId;
        this.requestedWorkplaceId = undefined;

        try {
          await this.processPass(nativeQueue, workplaceId);
        } catch (error) {
          // Leave the failed alert queued. Honor any request received during this pass.
          if (!this.requestedWorkplaceId || this.pauseCount) throw error;
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
        this.pauseCount ||
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
