import { Platform } from 'react-native';
import { assertE2eHarnessEnabled } from './e2eRuntimeGate';
import { readE2eLaunchConfig } from './e2eLaunchArgs';
import { localKeyHierarchy } from '@/src/services/backup/localKeyHierarchy';
import { keyCiphertextStateStore } from '@/src/services/backup/keyCiphertextStateStore';
import {
  parseLocalUser,
  parseWorkplaceKeys,
  userScope,
  workplaceScope,
} from '@/src/services/backup/keyHierarchyRecords';
import { encryptionSetupStore } from '@/src/services/backup/encryptionSetupStore';
import { loadPendingEncryptedRestoreDeviceId } from '@/src/services/backup/pendingEncryptedRestoreDeviceId';
import { encryptedRestoreWorkflow } from '@/src/services/backup/encryptedRestoreWorkflow';
import { importRepository } from '@/src/data/repositories/ImportRepository';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { rowSource } from '@/src/services/sync/rowSource';
import { TABLE_COLUMNS } from '@/src/services/sync/rowPreparation';
import { database } from '@/src/data/database/Database';
import Transaction from '@/src/data/models/Transaction';
import { Q } from '@nozbe/watermelondb';
import { storage } from '@/src/utils/storage';
import { preferences } from '@/src/services/preferences';
import { loadSetupDraft } from '@/src/services/setup/SetupDraftStore';
import type { WorkplaceId } from '@/src/types/ids';

export type RestoreBoundary = 'recovered' | 'published' | 'session' | 'cleanup' | 'launch';
export type RestoreFaultMode = 'pause' | 'throw';
export interface RestoreObservationRequest {
  userId: string;
  deviceId: string;
  workplaceId: WorkplaceId;
}

/** Authenticated E2E-only owner wrappers. No keys, file contents or vault access escape. */
export function installRestoreVerification(): void {
  assertE2eHarnessEnabled();
  if (Platform.OS !== 'web' || !readE2eLaunchConfig()?.restoreVerification) return;
  if (window.__restoreVerification) return;
  let fault: { boundary: RestoreBoundary; mode: RestoreFaultMode } | undefined;
  const reached: RestoreBoundary[] = [];
  const checkpoint = async (boundary: RestoreBoundary): Promise<void> => {
    if (fault?.boundary !== boundary) return;
    const mode = fault.mode;
    fault = undefined; // Consume before acknowledging; retries cannot re-arm it.
    reached.push(boundary);
    if (mode === 'throw') throw new Error(`__FFB_E2E_RESTORE_VERIFICATION__:${boundary}`);
    await new Promise<void>(() => {}); // Only discarding this page ends the paused attempt.
  };
  const recover = localKeyHierarchy.recoverUserDevice.bind(localKeyHierarchy);
  localKeyHierarchy.recoverUserDevice = async (...args) => {
    const identity = await recover(...args);
    await checkpoint('recovered');
    return identity;
  };
  const publish = importRepository.batchInsertRowRestore.bind(importRepository);
  importRepository.batchInsertRowRestore = async (...args) => {
    const workplace = await publish(...args);
    await checkpoint('published');
    return workplace;
  };
  const save = encryptionSetupStore.saveSession.bind(encryptionSetupStore);
  encryptionSetupStore.saveSession = async session => {
    await checkpoint('session');
    await save(session);
    // Pause before synchronous removal without changing the storage contract.
    if (fault?.boundary === 'cleanup' && fault.mode === 'pause') await checkpoint('cleanup');
  };
  const remove = storage.remove.bind(storage);
  storage.remove = key => {
    if (key === 'ffb-pending-encrypted-restore-device-v1' && fault?.boundary === 'cleanup') {
      fault = undefined;
      reached.push('cleanup');
      throw new Error('__FFB_E2E_RESTORE_VERIFICATION__:cleanup');
    }
    return remove(key);
  };
  const restore = encryptedRestoreWorkflow.restoreSelectedBackup.bind(encryptedRestoreWorkflow);
  encryptedRestoreWorkflow.restoreSelectedBackup = async input => {
    const result = await restore(input);
    await checkpoint('launch');
    return result;
  };
  window.__restoreVerification = {
    arm(boundary, mode) {
      assertE2eHarnessEnabled();
      if (fault || reached.length) throw new Error('Only one fault per page is allowed');
      fault = { boundary, mode };
    },
    status: () => ({ reached: [...reached], armed: Boolean(fault) }),
    async observe({ userId, deviceId, workplaceId }: RestoreObservationRequest) {
      assertE2eHarnessEnabled();
      const userValue = await keyCiphertextStateStore.read(userScope(userId, deviceId));
      const keyValue = await keyCiphertextStateStore.read(workplaceScope(userId, workplaceId));
      const user = userValue === null ? null : parseLocalUser(userValue);
      const keys = keyValue === null ? null : parseWorkplaceKeys(keyValue);
      const workplace = await workplaceRepository.find(workplaceId);
      const rows = workplace ? await rowSource.readWorkplaceRows(workplaceId) : [];
      const transactions = await database
        .get<Transaction>('transactions')
        .query(Q.where('workplace_id', workplaceId))
        .fetch();
      return {
        user: user && {
          userId: user.userId,
          deviceId: user.deviceId,
          fingerprint: user.userKeyFingerprint,
          publicIdentity: user.publicIdentity,
          deviceKeyId: user.deviceKeyId,
        },
        workplaceKey: keys?.keyId ?? null,
        pending: await loadPendingEncryptedRestoreDeviceId(),
        session: await encryptionSetupStore.loadSession(),
        receipt: workplace?.rowRestoreManifestHash ?? null,
        counts: Object.fromEntries(
          await Promise.all(
            Object.keys(TABLE_COLUMNS).map(async table => [
              table,
              await database.get(table).query(Q.where('workplace_id', workplaceId)).fetchCount(),
            ]),
          ),
        ),
        rows: [...rows].sort((a, b) =>
          `${a.table}/${a.rowId}`.localeCompare(`${b.table}/${b.rowId}`),
        ),
        balances: transactions
          .map(t => ({ id: t.id, balance: t.runningBalance ?? null }))
          .sort((a, b) => a.id.localeCompare(b.id)),
        launch: {
          registered: preferences.device.deviceRegistered,
          activeWorkplaceId: preferences.device.activeWorkplaceId,
          draft: loadSetupDraft(),
        },
      };
    },
  };
}

export type RestoreVerification = {
  arm(boundary: RestoreBoundary, mode: RestoreFaultMode): void;
  status(): { reached: RestoreBoundary[]; armed: boolean };
  observe(request: RestoreObservationRequest): Promise<{
    user: null | {
      userId: string;
      deviceId: string;
      fingerprint: string;
      publicIdentity: unknown;
      deviceKeyId: string;
    };
    workplaceKey: string | null;
    pending: string | null;
    session: Awaited<ReturnType<typeof encryptionSetupStore.loadSession>>;
    receipt: string | null;
    counts: Record<string, number>;
    rows: Awaited<ReturnType<typeof rowSource.readWorkplaceRows>>;
    balances: { id: string; balance: number | null }[];
    launch: {
      registered: boolean;
      activeWorkplaceId: string | undefined;
      draft: ReturnType<typeof loadSetupDraft>;
    };
  }>;
};
declare global {
  interface Window {
    __restoreVerification?: RestoreVerification;
  }
}
