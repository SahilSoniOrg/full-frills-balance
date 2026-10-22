import { AppConfig } from '@/src/constants';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { restoreCompletionRepository } from '@/src/data/repositories/RestoreCompletionRepository';
import { rebuildAllAccountBalancesAfterImport } from '@/src/services/import/importAccountBalanceRebuild';
import { preferences } from '@/src/services/preferences';
import type { WorkplaceId } from '@/src/types/ids';
import { SerialQueue } from '@/src/utils/serialQueue';
import { logger } from '@/src/utils/logger';
import { assertKeyAccessAllowed } from './keyAccessPolicy';
import { localKeyHierarchy } from './localKeyHierarchy';
import { encryptionSetupStore } from './encryptionSetupStore';
import {
  clearPendingEncryptedRestoreDeviceId,
  loadPendingEncryptedRestoreDeviceId,
} from './pendingEncryptedRestoreDeviceId';
import { parseRestoreCompletionState } from './restoreCompletionState';

const productionDependencies = {
  repository: restoreCompletionRepository,
  hierarchy: localKeyHierarchy,
  session: encryptionSetupStore,
  assertAccess: assertKeyAccessAllowed,
  updatePreferences: (id: WorkplaceId, safeToSpendDays: 30 | 60 | 90) =>
    preferences.workplace.update(id, { safeToSpendDays }),
  rebuildBalances: async (id: WorkplaceId) => {
    const accounts = await accountQueryRepository.findAll(id);
    await rebuildAllAccountBalancesAfterImport(
      id,
      accounts,
      AppConfig.performance.import.postImportAccountRebuildConcurrency,
    );
  },
  pendingDevice: {
    load: loadPendingEncryptedRestoreDeviceId,
    clear: clearPendingEncryptedRestoreDeviceId,
  },
};

type CompletionDependencies = Omit<typeof productionDependencies, 'repository' | 'hierarchy'> & {
  repository: Pick<
    typeof restoreCompletionRepository,
    'observePending' | 'readPending' | 'confirmPublication' | 'clear'
  >;
  hierarchy: Pick<
    typeof localKeyHierarchy,
    'preflightWorkplaceRestore' | 'installWorkplaceKeys' | 'commitRestoreDraft'
  >;
};

/** Completes only already-published rows. No ZIP, recovery credential or screen is required. */
export class EncryptedRestoreCompletion {
  private readonly queue = new SerialQueue();

  constructor(private readonly dependencies: CompletionDependencies) {}

  observePending() {
    return this.dependencies.repository.observePending();
  }

  /** Best-effort housekeeping after readiness. The stable Device ID is also the workflow's draft ID. */
  retryCleanup(): Promise<void> {
    return this.queue.run(async () => {
      const d = this.dependencies;
      try {
        d.assertAccess();
        if ((await d.repository.readPending()).length) return;
        const deviceId = await d.pendingDevice.load();
        if (!deviceId) return;
        const session = await d.session.loadSession();
        if (!session || session.deviceId !== deviceId) return;
        await d.hierarchy.commitRestoreDraft(session.userId, deviceId, deviceId);
        await d.pendingDevice.clear();
      } catch {
        logger.warn('[RestoreCompletion] Temporary recovery checkpoint cleanup will retry later');
      }
    });
  }

  resume(
    onReady: (workplaceId: WorkplaceId, recoveredCopy?: boolean) => void | Promise<void>,
  ): Promise<void> {
    return this.queue.run(async () => {
      const d = this.dependencies;
      d.assertAccess();
      await d.repository.confirmPublication();
      for (const pending of await d.repository.readPending()) {
        const state = parseRestoreCompletionState(
          pending.json,
          pending.workplaceId,
          pending.manifestHash,
        );
        const { identity, workplaceKeys } = state;
        d.assertAccess();
        const keyState = await d.hierarchy.preflightWorkplaceRestore(identity, workplaceKeys);
        if (keyState === 'installable')
          await d.hierarchy.installWorkplaceKeys(identity, workplaceKeys);
        d.assertAccess();
        d.updatePreferences(pending.workplaceId, state.safeToSpendDays);
        // A failure keeps the gate closed: restored balances must be ready before the dashboard opens.
        await d.rebuildBalances(pending.workplaceId);
        d.assertAccess();
        const saved = await d.session.loadSession();
        if (
          saved &&
          (saved.userId !== identity.userId ||
            (saved.deviceId !== identity.registeredDeviceId && !state.recoveryDraftId) ||
            (saved.userKeyFingerprint && saved.userKeyFingerprint !== identity.userKeyFingerprint))
        )
          throw new Error('Restore completion conflicts with the established encryption session');
        await d.session.saveSession({
          ...saved,
          formatVersion: 1,
          intent: saved?.intent ?? 'recover-user',
          userId: identity.userId,
          deviceId: identity.registeredDeviceId,
          userKeyFingerprint: identity.userKeyFingerprint,
          enrolledWorkplaces: [
            ...new Set([...(saved?.enrolledWorkplaces ?? []), pending.workplaceId]),
          ],
        });
        d.assertAccess();
        // Feature-owned launch effects are replayable too. A crash before clearing the handoff
        // repeats them; publication itself is never repeated.
        if (state.recoveredCopy) await onReady(pending.workplaceId, true);
        else await onReady(pending.workplaceId);
        d.assertAccess();
        try {
          if (state.recoveryDraftId)
            await d.hierarchy.commitRestoreDraft(
              identity.userId,
              identity.registeredDeviceId,
              state.recoveryDraftId,
            );
          // Retain the stable ID if draft cleanup fails so housekeeping can retry after readiness.
          if ((await d.pendingDevice.load()) === identity.registeredDeviceId)
            await d.pendingDevice.clear();
        } catch {
          logger.warn('[RestoreCompletion] Temporary recovery checkpoint cleanup will retry later');
        }
        await d.repository.clear(pending);
      }
    });
  }
}

export const encryptedRestoreCompletion = new EncryptedRestoreCompletion(productionDependencies);
