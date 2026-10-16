import { useCallback, useEffect, useReducer, useRef } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAppLock } from '@/src/contexts/app-shell/AppLockProvider';
import { encryptionSetup, type SetupViewState } from '@/src/services/backup/encryptionSetup';
import { encryptionSetupStore } from '@/src/services/backup/encryptionSetupStore';
import { recoveryFiles } from '@/src/services/backup/recoveryFiles';
import { encryptedBackupFiles } from '@/src/services/backup/encryptedBackupFiles';
import { assertKeyAccessAllowed } from '@/src/services/backup/keyAccessPolicy';
import type { RecoveryCredential } from '@/src/services/backup/keyEnvelopes';
import { cryptoProvider } from '@/src/services/backup/cryptoProvider';
import { keyHex } from '@/src/services/backup/keyEncoding';
import type { KeyAccessIdentity } from '@/src/services/backup/keyHierarchyRecords';
import type { WorkplaceId } from '@/src/types/ids';
import { useOptionalWorkplace } from '@/src/contexts/WorkplaceContext';
import { AppNavigation } from '@/src/utils/navigation';
import { alert, confirm } from '@/src/utils/alerts';
import { KeyOperationError, keyOperationErrorCode } from '@/src/utils/keyOperationError';
import { logger } from '@/src/utils/logger';
import {
  createEncryptedBackupZip,
  restoreEncryptedBackupZip,
} from '@/src/services/sync/encryptedBackupActions';
import {
  clearPendingEncryptedRestoreDeviceId,
  loadPendingEncryptedRestoreDeviceId,
  savePendingEncryptedRestoreDeviceId,
} from '@/src/services/backup/pendingEncryptedRestoreDeviceId';
import {
  completeEncryptedRestoreLaunch,
  needsEncryptedRestoreLaunchCompletion,
} from '@/src/features/setup';
import { encryptionRecoveryErrorMessage } from '../helpers/encryptionRecoveryErrors';

type UiState = {
  phase: 'idle' | 'working';
  setup: SetupViewState | null;
  message: string | null;
  inputs: { generated: boolean; secret: boolean; backup: boolean };
};

type UiEvent =
  | { type: 'start' | 'finish' }
  | { type: 'inspect'; setup: SetupViewState }
  | { type: 'message'; message: string }
  | { type: 'inputs'; inputs: UiState['inputs'] };

function uiReducer(state: UiState, event: UiEvent): UiState {
  switch (event.type) {
    case 'start':
      return { ...state, phase: 'working', message: null };
    case 'finish':
      return { ...state, phase: 'idle' };
    case 'inspect':
      return { ...state, setup: event.setup };
    case 'message':
      return { ...state, message: event.message };
    case 'inputs':
      return { ...state, inputs: event.inputs };
  }
}

function freshDeviceId(): string {
  const bytes = cryptoProvider.randomBytes(16);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = keyHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function resolveRecoveryDeviceId(): Promise<string> {
  const pending = await loadPendingEncryptedRestoreDeviceId();
  if (pending) return pending;
  const deviceId = freshDeviceId();
  await savePendingEncryptedRestoreDeviceId(deviceId);
  return deviceId;
}

export function usePrivateBackup(workplaceId?: string) {
  const workplace = useOptionalWorkplace();
  const { isAppCurrentlyLocked } = useAppLock();
  const [ui, dispatch] = useReducer(uiReducer, {
    phase: 'idle',
    setup: null,
    message: null,
    inputs: { generated: false, secret: false, backup: false },
  });
  const lifetime = useRef<{
    focused: boolean;
    active: AbortController | null;
    generated: RecoveryCredential | null;
    secret: unknown;
    backup: Uint8Array | null;
  }>({ focused: true, active: null, generated: null, secret: null, backup: null });

  const busy = ui.phase === 'working';
  const state = ui.setup;

  const canResume = useCallback(
    (signal?: AbortSignal) =>
      lifetime.current.focused && AppState.currentState === 'active' && !signal?.aborted,
    [],
  );

  const assertForeground = useCallback(
    (signal?: AbortSignal) => {
      assertKeyAccessAllowed();
      if (!canResume(signal)) throw new KeyOperationError('FFB_KEY_CANCELLED');
    },
    [canResume],
  );

  const setMessage = useCallback((message: string) => dispatch({ type: 'message', message }), []);

  const projectInputs = useCallback(() => {
    const inputs = lifetime.current;
    dispatch({
      type: 'inputs',
      inputs: {
        generated: inputs.generated !== null,
        secret: inputs.secret !== null,
        backup: inputs.backup !== null,
      },
    });
  }, []);

  const reportError = useCallback(
    (error: unknown) => {
      const code = keyOperationErrorCode(error);
      logger.warn('Private backup operation failed', { code });
      if (lifetime.current.focused) {
        const message =
          code === 'FFB_KEY_OPERATION_FAILED' && error instanceof Error && error.message
            ? error.message
            : encryptionRecoveryErrorMessage(code);
        setMessage(message);
      }
    },
    [setMessage],
  );

  const clearSecrets = useCallback(() => {
    lifetime.current.generated = null;
    lifetime.current.secret = null;
    projectInputs();
    void recoveryFiles.cleanupTemporarySecrets().catch(reportError);
  }, [projectInputs, reportError]);

  const cancel = useCallback(() => {
    lifetime.current.active?.abort();
    clearSecrets();
  }, [clearSecrets]);

  const refresh = useCallback(async () => {
    const next = await encryptionSetup.inspect(workplaceId);
    if (canResume()) dispatch({ type: 'inspect', setup: next });
  }, [workplaceId, canResume]);

  useFocusEffect(
    useCallback(() => {
      lifetime.current.focused = true;
      clearSecrets();
      void refresh().catch(reportError);
      return () => {
        lifetime.current.focused = false;
        lifetime.current.backup = null;
        cancel();
      };
    }, [refresh, clearSecrets, cancel, reportError]),
  );

  useEffect(() => {
    if (isAppCurrentlyLocked) cancel();
  }, [isAppCurrentlyLocked, cancel]);

  const run = useCallback(
    (operation: (signal: AbortSignal) => Promise<void>) => {
      lifetime.current.active?.abort();
      const controller = new AbortController();
      lifetime.current.active = controller;
      dispatch({ type: 'start' });
      return operation(controller.signal)
        .then(async () => {
          if (canResume(controller.signal)) await refresh();
        })
        .catch(error => {
          if (!(error instanceof KeyOperationError && error.code === 'FFB_KEY_CANCELLED'))
            reportError(error);
        })
        .finally(() => {
          if (lifetime.current.active === controller) lifetime.current.active = null;
          if (canResume()) dispatch({ type: 'finish' });
        });
    },
    [canResume, refresh, reportError],
  );

  const readyIdentity = useCallback(async (): Promise<KeyAccessIdentity> => {
    const keys = state?.keys;
    if (!keys?.identity || keys.user !== 'ready')
      throw new Error('Verify your User recovery file before creating a backup');
    if (workplaceId && keys.workplace !== 'ready')
      throw new Error('Finish Workplace encryption setup before creating a backup');
    return keys.identity;
  }, [state, workplaceId]);

  const begin = () =>
    run(async signal => {
      const value =
        state?.keys?.user === 'ready' && workplaceId
          ? await encryptionSetup.beginWorkplace(workplaceId)
          : await encryptionSetup.beginUser();
      assertForeground(signal);
      lifetime.current.generated = value;
      projectInputs();
    });

  const exportSecret = () =>
    run(async () => {
      const value = lifetime.current.generated;
      if (!value) throw new Error('Restart the unfinished setup step');
      const saved = await recoveryFiles.exportSecret(value);
      if (lifetime.current.focused)
        setMessage(
          saved
            ? 'Open the recovery file you saved to verify it.'
            : 'Save was cancelled. Restart the unfinished step if no file was saved.',
        );
    });

  const verifySecret = () =>
    run(async () => {
      const value = await recoveryFiles.pickSecret();
      if (value === null) return;
      assertForeground();
      if (state?.keys?.user === 'ready' && workplaceId)
        await encryptionSetup.confirmWorkplace(workplaceId, value);
      else await encryptionSetup.confirmUser(value);
      clearSecrets();
    });

  const discard = () =>
    confirm.show({
      title: 'Restart unfinished encryption setup?',
      message:
        'This discards only the unfinished key step. Saved files from that step will no longer work.',
      confirmText: 'Restart this step',
      destructive: true,
      onConfirm: () => {
        void run(async () => {
          await encryptionSetup.discardUnfinished(workplaceId);
          clearSecrets();
        });
      },
    });

  const createBackup = () =>
    run(async () => {
      if (!workplaceId) throw new Error('Open a Workplace first');
      const identity = await readyIdentity();
      const archive = await createEncryptedBackupZip(identity, workplaceId as WorkplaceId);
      const saved = await encryptedBackupFiles.exportEncryptedBackupZip(archive);
      if (lifetime.current.focused)
        setMessage(
          saved
            ? 'Encrypted backup saved. Keep your User recovery file separately.'
            : 'Backup export was cancelled.',
        );
    });

  const pickBackup = () =>
    run(async () => {
      const value = await encryptedBackupFiles.pickEncryptedBackupZip();
      if (value !== null && lifetime.current.focused) {
        lifetime.current.backup = value;
        projectInputs();
      }
    });

  const pickRecoverySecret = () =>
    run(async () => {
      if (!lifetime.current.backup) throw new Error('Choose the encrypted backup ZIP first');
      const value = await recoveryFiles.pickSecret();
      if (value !== null && lifetime.current.focused) {
        lifetime.current.secret = value;
        await resolveRecoveryDeviceId();
        projectInputs();
      } else if (value !== null) await recoveryFiles.cleanupTemporarySecrets();
    });

  const restoreFromFiles = () =>
    run(async signal => {
      const zip = lifetime.current.backup;
      const credential = lifetime.current.secret;
      const keys = state?.keys;
      const existingIdentity = keys?.user === 'ready' ? keys.identity : undefined;
      if (!zip || (!credential && !existingIdentity))
        throw new Error('Choose the backup ZIP and User recovery file');
      assertForeground(signal);
      const access = existingIdentity
        ? { mode: 'existing' as const, identity: existingIdentity }
        : { mode: 'recovery' as const, credential, deviceId: await resolveRecoveryDeviceId() };
      const result = await restoreEncryptedBackupZip(zip, access);
      await encryptionSetupStore.saveSession({
        formatVersion: 1,
        intent: 'recover-user',
        userId: result.identity.userId,
        deviceId: result.identity.registeredDeviceId,
        userKeyFingerprint: result.identity.userKeyFingerprint,
        enrolledWorkplaces: [result.workplace.id],
      });
      await clearPendingEncryptedRestoreDeviceId();
      clearSecrets();
      lifetime.current.backup = null;
      projectInputs();
      if (!canResume(signal)) return;
      if (needsEncryptedRestoreLaunchCompletion()) {
        completeEncryptedRestoreLaunch(result.workplace.id);
      } else {
        await workplace?.setWorkplaceId(result.workplace.id);
      }
      if (canResume(signal)) {
        AppNavigation.toDashboard();
        if (result.warnings.length > 0) {
          alert.show({
            title: 'Backup restored — check balances',
            message:
              'Your financial records were restored, but some running balances could not be rebuilt. Review balances in Settings → Maintenance & reset before relying on them.',
            type: 'warning',
          });
        }
      }
    });

  const clearRestoreInputs = useCallback(() => {
    clearSecrets();
    lifetime.current.backup = null;
    void clearPendingEncryptedRestoreDeviceId();
    projectInputs();
  }, [clearSecrets, projectInputs]);

  return {
    state,
    busy,
    message: ui.message,
    hasGeneratedSecret: ui.inputs.generated,
    hasImportedSecret: ui.inputs.secret,
    hasImportedBackup: ui.inputs.backup,
    canRestoreWithDevice: state?.keys?.user === 'ready' && !!state.keys.identity,
    begin,
    exportSecret,
    verifySecret,
    discard,
    createBackup,
    pickBackup,
    pickRecoverySecret,
    restoreFromFiles,
    retry: () => run(async () => undefined),
    clearRestoreInputs,
    disabled: busy || isAppCurrentlyLocked,
  };
}
