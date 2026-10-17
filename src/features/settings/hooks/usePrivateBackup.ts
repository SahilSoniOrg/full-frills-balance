import { useCallback, useEffect, useReducer, useRef } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAppLock } from '@/src/contexts/app-shell/AppLockProvider';
import { encryptionSetup, type SetupViewState } from '@/src/services/backup/encryptionSetup';
import { encryptedRestoreWorkflow } from '@/src/services/backup/encryptedRestoreWorkflow';
import { recoveryFiles } from '@/src/services/backup/recoveryFiles';
import { encryptedBackupFiles } from '@/src/services/backup/encryptedBackupFiles';
import { assertKeyAccessAllowed } from '@/src/services/backup/keyAccessPolicy';
import type { RecoveryCredential } from '@/src/services/backup/keyEnvelopes';
import type { KeyAccessIdentity } from '@/src/services/backup/keyHierarchyRecords';
import type { WorkplaceId } from '@/src/types/ids';
import { useOptionalWorkplace } from '@/src/contexts/WorkplaceContext';
import { AppNavigation } from '@/src/utils/navigation';
import { alert, confirm } from '@/src/utils/alerts';
import { KeyOperationError, keyOperationErrorCode } from '@/src/utils/keyOperationError';
import { logger } from '@/src/utils/logger';
import { createEncryptedBackupZip } from '@/src/services/sync/encryptedBackupActions';
import {
  completeEncryptedRestoreLaunch,
  needsEncryptedRestoreLaunchCompletion,
} from '@/src/features/setup';
import { encryptionRecoveryErrorMessage } from '../helpers/encryptionRecoveryErrors';
import type { RestoreBackupPreview } from '@/src/services/sync/restoreBackup';

type UiState = {
  phase: 'idle' | 'working' | 'preview';
  setup: SetupViewState | null;
  message: string | null;
  inputs: { generated: boolean; secret: boolean; backup: boolean };
  restorePreview: RestoreBackupPreview | null;
};

type UiEvent =
  | { type: 'start' | 'finish' }
  | { type: 'inspect'; setup: SetupViewState }
  | { type: 'message'; message: string }
  | { type: 'inputs'; inputs: UiState['inputs'] }
  | { type: 'preview'; preview: RestoreBackupPreview }
  | { type: 'resume' };

function uiReducer(state: UiState, event: UiEvent): UiState {
  switch (event.type) {
    case 'start':
      return { ...state, phase: 'working', message: null };
    case 'finish':
      return { ...state, phase: 'idle', restorePreview: null };
    case 'inspect':
      return { ...state, setup: event.setup };
    case 'message':
      return { ...state, message: event.message };
    case 'inputs':
      return { ...state, inputs: event.inputs };
    case 'preview':
      return { ...state, phase: 'preview', restorePreview: event.preview };
    case 'resume':
      return { ...state, phase: 'working', restorePreview: null };
  }
}

export function usePrivateBackup(workplaceId?: string) {
  const workplace = useOptionalWorkplace();
  const { isAppCurrentlyLocked } = useAppLock();
  const [ui, dispatch] = useReducer(uiReducer, {
    phase: 'idle',
    setup: null,
    message: null,
    inputs: { generated: false, secret: false, backup: false },
    restorePreview: null,
  });
  const lifetime = useRef<{
    focused: boolean;
    active: AbortController | null;
    generated: RecoveryCredential | null;
    secret: unknown;
    backup: Uint8Array | null;
    resolvePreview: ((accepted: boolean) => void) | null;
  }>({
    focused: true,
    active: null,
    generated: null,
    secret: null,
    backup: null,
    resolvePreview: null,
  });

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

  const waitForForeground = useCallback(
    (signal: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        let subscription: ReturnType<typeof AppState.addEventListener> | undefined;
        const cleanup = () => {
          subscription?.remove();
          signal.removeEventListener('abort', onAbort);
        };
        const onAbort = () => {
          cleanup();
          reject(new KeyOperationError('FFB_KEY_CANCELLED'));
        };
        const resume = (nextState = AppState.currentState) => {
          if (signal.aborted || !lifetime.current.focused) {
            onAbort();
            return;
          }
          if (nextState !== 'active') return;
          try {
            assertKeyAccessAllowed();
            cleanup();
            resolve();
          } catch (error) {
            cleanup();
            reject(error);
          }
        };
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
        subscription = AppState.addEventListener('change', resume);
        resume();
      }),
    [],
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
    const resolvePreview = lifetime.current.resolvePreview;
    lifetime.current.resolvePreview = null;
    if (resolvePreview) {
      dispatch({ type: 'resume' });
      resolvePreview(false);
    }
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
          if (
            canResume(controller.signal) &&
            !(error instanceof KeyOperationError && error.code === 'FFB_KEY_CANCELLED')
          )
            reportError(error);
        })
        .finally(() => {
          if (lifetime.current.active === controller) {
            lifetime.current.active = null;
            // A native document picker can resolve while React Native still reports
            // the app as backgrounded. Clear the UI busy state while this screen is
            // focused; otherwise its actions stay disabled after the picker returns.
            if (lifetime.current.focused) dispatch({ type: 'finish' });
          }
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
    run(async signal => {
      const value = await recoveryFiles.pickSecret();
      if (value === null) return;
      await waitForForeground(signal);
      assertForeground(signal);
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
    run(async signal => {
      const value = await encryptedBackupFiles.pickEncryptedBackupZip();
      if (value !== null) {
        await waitForForeground(signal);
        lifetime.current.backup = value;
        projectInputs();
      }
    });

  const pickRecoverySecret = () =>
    run(async signal => {
      if (!lifetime.current.backup) throw new Error('Choose the encrypted backup ZIP first');
      const value = await recoveryFiles.pickSecret();
      if (value !== null) {
        await waitForForeground(signal);
        lifetime.current.secret = value;
        await encryptedRestoreWorkflow.prepareRecoveryAttempt(signal);
        assertForeground(signal);
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
      const result = await encryptedRestoreWorkflow.restoreSelectedBackup({
        archive: zip,
        credential,
        existingIdentity,
        signal,
        onBeforePublish: preview =>
          new Promise<boolean>(resolve => {
            lifetime.current.resolvePreview = resolve;
            dispatch({ type: 'preview', preview });
          }),
      });
      if (lifetime.current.backup === zip && lifetime.current.secret === credential) {
        clearSecrets();
        lifetime.current.backup = null;
        projectInputs();
      }
      if (!canResume(signal)) return;
      if (needsEncryptedRestoreLaunchCompletion()) {
        completeEncryptedRestoreLaunch(result.workplace.id);
      } else {
        await workplace?.setWorkplaceId(result.workplace.id);
      }
      if (canResume(signal)) {
        AppNavigation.toDashboard();
        if (result.warnings.length > 0) {
          const messages = result.warnings.map(warning =>
            warning === 'Post-restore running-balance rebuild failed'
              ? 'Some running balances could not be rebuilt. Review balances in Settings → Maintenance & reset before relying on them.'
              : 'The restored encryption setup needs another review before you create a new backup.',
          );
          alert.show({
            title: 'Backup restored — review needed',
            message: messages.join('\n\n'),
            type: 'warning',
          });
        }
      }
    });

  const clearRestoreInputs = useCallback(() => {
    lifetime.current.active?.abort();
    clearSecrets();
    lifetime.current.backup = null;
    // Deselecting files does not abandon recovery keys or their durable retry ID.
    projectInputs();
  }, [clearSecrets, projectInputs]);

  const resolveRestorePreview = useCallback((accepted: boolean) => {
    const resolvePreview = lifetime.current.resolvePreview;
    if (!resolvePreview) return;
    lifetime.current.resolvePreview = null;
    dispatch({ type: 'resume' });
    resolvePreview(accepted);
  }, []);

  const discardRestorePreview = useCallback(() => {
    resolveRestorePreview(false);
    lifetime.current.backup = null;
    clearSecrets();
  }, [clearSecrets, resolveRestorePreview]);

  return {
    state,
    busy,
    message: ui.message,
    restorePreview: ui.restorePreview,
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
    confirmRestorePreview: () => resolveRestorePreview(true),
    discardRestorePreview,
    retry: () => run(async () => undefined),
    clearRestoreInputs,
    disabled: busy || isAppCurrentlyLocked,
  };
}
