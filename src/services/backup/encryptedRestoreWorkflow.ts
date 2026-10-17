import { SerialQueue } from '@/src/utils/serialQueue';
import { KeyOperationError } from '@/src/utils/keyOperationError';
import { restoreEncryptedBackupZip } from '@/src/services/sync/encryptedBackupActions';
import type {
  RestoreBackupAccess,
  RestoreBackupPreview,
  RestoreBackupResult,
} from '@/src/services/sync/restoreBackup';
import { cryptoProvider } from './cryptoProvider';
import { keyHex } from './keyEncoding';
import type { KeyAccessIdentity } from './keyHierarchyRecords';
import { localKeyHierarchy, type KeyHierarchy } from './localKeyHierarchy';
import { encryptionSetupStore, type EncryptionSetupStore } from './encryptionSetupStore';
import {
  loadPendingEncryptedRestoreDeviceId,
  savePendingEncryptedRestoreDeviceId,
  clearPendingEncryptedRestoreDeviceId,
} from './pendingEncryptedRestoreDeviceId';

interface RestoreDependencies {
  pending: {
    load(): Promise<string | null>;
    save(deviceId: string): Promise<void>;
    clear(): Promise<void>;
  };
  session: EncryptionSetupStore;
  hierarchy: Pick<KeyHierarchy, 'describeSetup'>;
  freshDeviceId(): string;
  restore: typeof restoreEncryptedBackupZip;
}

type SelectedBackup = Readonly<{
  archive: Uint8Array;
  credential?: unknown;
  existingIdentity?: KeyAccessIdentity;
  signal?: AbortSignal;
  onBeforePublish?: (preview: RestoreBackupPreview) => Promise<boolean>;
}>;

function assertCurrent(signal?: AbortSignal): void {
  if (signal?.aborted) throw new KeyOperationError('FFB_KEY_CANCELLED');
}

/** Durable recovery ordering shared by all screen consumers, without owning UI lifetimes. */
export class EncryptedRestoreWorkflow {
  private readonly queue = new SerialQueue();

  constructor(private readonly dependencies: RestoreDependencies) {}

  private async recoveryDeviceId(): Promise<string> {
    const pending = await this.dependencies.pending.load();
    if (pending) return pending;
    const deviceId = this.dependencies.freshDeviceId();
    await this.dependencies.pending.save(deviceId);
    return deviceId;
  }

  prepareRecoveryAttempt(signal?: AbortSignal): Promise<string> {
    return this.queue.run(async () => {
      assertCurrent(signal);
      return this.recoveryDeviceId();
    });
  }

  private async savedIdentity(): Promise<KeyAccessIdentity | undefined> {
    const session = await this.dependencies.session.loadSession();
    if (!session) return undefined;
    const keys = await this.dependencies.hierarchy.describeSetup(session.userId, session.deviceId);
    if (keys.user !== 'ready' || !keys.identity) return undefined;
    if (
      session.userKeyFingerprint &&
      session.userKeyFingerprint !== keys.identity.userKeyFingerprint
    )
      throw new KeyOperationError('FFB_KEY_IDENTITY_MISMATCH');
    return keys.identity;
  }

  restoreSelectedBackup(input: SelectedBackup): Promise<RestoreBackupResult> {
    return this.queue.run(async () => {
      assertCurrent(input.signal);
      if (!input.archive) throw new Error('Choose the backup ZIP and User recovery file');
      // A preceding queued restore may have completed since the caller inspected setup.
      // Re-verify its saved Device before allocating another recovery identity.
      const identity = input.existingIdentity ?? (await this.savedIdentity());
      if (!identity && !input.credential)
        throw new Error('Choose the backup ZIP and User recovery file');
      assertCurrent(input.signal);
      let access: RestoreBackupAccess;
      if (identity) {
        access = { mode: 'existing', identity };
      } else {
        const deviceId = await this.recoveryDeviceId();
        access = {
          mode: 'recovery',
          credential: input.credential,
          deviceId,
          draftId: deviceId,
        };
      }
      assertCurrent(input.signal);
      let previewDiscarded = false;
      const previewHandler = input.onBeforePublish;
      const onBeforePublish = previewHandler
        ? async (preview: RestoreBackupPreview) => {
            previewDiscarded = !(await previewHandler(preview));
            return !previewDiscarded;
          }
        : undefined;
      let result: RestoreBackupResult;
      try {
        result = await this.dependencies.restore(input.archive, access, onBeforePublish);
      } catch (error) {
        // The restore service first discards the staged key and its checkpoints. Clear its
        // retry ID only after that explicit discard; failures before confirmation stay resumable.
        if (
          previewDiscarded &&
          access.mode === 'recovery' &&
          error instanceof KeyOperationError &&
          error.code === 'FFB_KEY_CANCELLED'
        ) {
          try {
            await this.dependencies.pending.clear();
          } catch {
            // A leftover ID is harmless once the vault draft was removed.
          }
        }
        throw error;
      }
      // Cancellation cannot undo publication. Finish these public checkpoints even if
      // the originating screen has disappeared; only the hook gates visible effects.
      await this.dependencies.session.saveSession({
        formatVersion: 1,
        intent: 'recover-user',
        userId: result.identity.userId,
        deviceId: result.identity.registeredDeviceId,
        userKeyFingerprint: result.identity.userKeyFingerprint,
        enrolledWorkplaces: [result.workplace.id],
      });
      await this.dependencies.pending.clear();
      return result;
    });
  }

  // Releasing file selections deliberately has no durable cleanup operation. The
  // pending ID alone cannot prove that recovery has not already persisted keys.
}

function freshDeviceId(): string {
  const bytes = cryptoProvider.randomBytes(16);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = keyHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// The sole production composition point: every consumer shares the entire workflow queue.
export const encryptedRestoreWorkflow = new EncryptedRestoreWorkflow({
  pending: {
    load: loadPendingEncryptedRestoreDeviceId,
    save: savePendingEncryptedRestoreDeviceId,
    clear: clearPendingEncryptedRestoreDeviceId,
  },
  session: encryptionSetupStore,
  hierarchy: localKeyHierarchy,
  freshDeviceId,
  restore: restoreEncryptedBackupZip,
});
