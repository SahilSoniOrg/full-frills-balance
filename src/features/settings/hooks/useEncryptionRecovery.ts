import { useCallback, useEffect, useReducer, useRef } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAppLock } from '@/src/contexts/app-shell/AppLockProvider';
import { encryptionSetup, type SetupViewState } from '@/src/services/backup/encryptionSetup';
import { recoveryFiles } from '@/src/services/backup/recoveryFiles';
import {
  assertKeyAccessAllowed,
  subscribeKeyAccessPolicy,
} from '@/src/services/backup/keyAccessPolicy';
import type { RecoveryCredential } from '@/src/services/backup/keyEnvelopes';
import { useOptionalWorkplace } from '@/src/contexts/WorkplaceContext';
import { AppNavigation } from '@/src/utils/navigation';
import { confirm } from '@/src/utils/alerts';
import { KeyOperationError, keyOperationErrorCode } from '@/src/utils/keyOperationError';
import { logger } from '@/src/utils/logger';
import { encryptionRecoveryErrorMessage } from '../helpers/encryptionRecoveryErrors';

type RecoveryUiState = {
  phase: 'idle' | 'working';
  setup: SetupViewState | null;
  message: string | null;
  inputs: { generated: boolean; secret: boolean; package: boolean };
};
type RecoveryUiEvent =
  | { type: 'start' | 'finish' }
  | { type: 'inspect'; setup: SetupViewState }
  | { type: 'message'; message: string }
  | { type: 'inputs'; inputs: RecoveryUiState['inputs'] };
function recoveryUiReducer(state: RecoveryUiState, event: RecoveryUiEvent): RecoveryUiState {
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

export function useEncryptionRecovery(workplaceId?: string) {
  const workplace = useOptionalWorkplace();
  const { isAppCurrentlyLocked } = useAppLock();
  const [ui, dispatch] = useReducer(recoveryUiReducer, {
    phase: 'idle',
    setup: null,
    message: null,
    inputs: { generated: false, secret: false, package: false },
  });
  // Transient native handles are cleared synchronously. React stores only their presence.
  const lifetime = useRef<{
    focused: boolean;
    active: AbortController | null;
    generated: RecoveryCredential | null;
    secret: unknown;
    package: unknown;
  }>({ focused: true, active: null, generated: null, secret: null, package: null });
  const state = ui.setup;
  const busy = ui.phase === 'working';
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
        package: inputs.package !== null,
      },
    });
  }, []);
  const reportError = useCallback(
    (error: unknown) => {
      const code = keyOperationErrorCode(error);
      logger.warn('Private backup operation failed', { code });
      if (lifetime.current.focused) setMessage(encryptionRecoveryErrorMessage(code));
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
      lifetime.current.package = null;
      clearSecrets();
      void refresh().catch(reportError);
      return () => {
        lifetime.current.focused = false;
        lifetime.current.package = null;
        cancel();
      };
    }, [refresh, clearSecrets, cancel, reportError]),
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', value => {
      if (value !== 'active') cancel();
    });
    return () => sub.remove();
  }, [cancel]);
  useEffect(
    () =>
      subscribeKeyAccessPolicy(allowed => {
        if (!allowed) cancel();
      }),
    [cancel],
  );
  const run = useCallback(
    async (work?: (signal: AbortSignal) => Promise<void>) => {
      if (lifetime.current.active || !lifetime.current.focused || isAppCurrentlyLocked) return;
      const controller = new AbortController();
      lifetime.current.active = controller;
      dispatch({ type: 'start' });
      try {
        assertForeground();
        if (work) await work(controller.signal);
        // With no work, this is an explicit inspection retry with the same busy/error handling.
        if (canResume()) await refresh();
      } catch (error) {
        clearSecrets();
        reportError(error);
      } finally {
        lifetime.current.active = null;
        // Completion updates even on blur, so refocus never needs to reconstruct busy state.
        dispatch({ type: 'finish' });
      }
    },
    [refresh, isAppCurrentlyLocked, reportError, assertForeground, canResume, clearSecrets],
  );
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
      if (!value) throw new Error('Reimport the saved secret or restart the unfinished step');
      const saved = await recoveryFiles.exportSecret(value);
      if (lifetime.current.focused)
        setMessage(
          saved
            ? 'Open the recovery file you saved to verify it.'
            : 'Save was cancelled. You can restart this unfinished step if no recovery file was saved.',
        );
    });
  const verifySecret = () =>
    run(async () => {
      const value = await recoveryFiles.pickSecret();
      if (value === null) return;
      await awaitForeground();
      if (state?.keys?.user === 'ready' && workplaceId)
        await encryptionSetup.confirmWorkplace(workplaceId, value);
      else await encryptionSetup.confirmUser(value);
      clearSecrets();
    });
  const exportPackage = () =>
    run(async () => {
      if (!workplaceId) throw new Error('Select a Workplace first');
      const value = await encryptionSetup.preparePackage(workplaceId);
      const saved = await recoveryFiles.exportPackage(value);
      if (lifetime.current.focused)
        setMessage(
          saved
            ? 'Open the encrypted package you saved to verify it. Keep recovery secrets separately.'
            : 'Save was cancelled. Your encrypted package is ready to export again.',
        );
    });
  const reexportPackage = () =>
    run(async () => {
      const saved = await recoveryFiles.exportPackage(await encryptionSetup.savedPackage());
      if (lifetime.current.focused)
        setMessage(
          saved
            ? 'Open the encrypted package you saved to verify it.'
            : 'Save was cancelled. Your encrypted package is ready to export again.',
        );
    });
  const abandonPackage = () =>
    confirm.show({
      title: 'Abandon this unfinished backup?',
      message:
        'Your books and keys stay in place. This backup attempt remains counted. You can prepare a new encrypted package afterward.',
      confirmText: 'Abandon unfinished backup',
      destructive: true,
      onConfirm: () => {
        void run(async () => {
          if (!workplaceId) throw new Error('Select a Workplace first');
          await encryptionSetup.abandonPendingPackage(workplaceId);
        });
      },
    });
  const verifyPackage = () =>
    run(async () => {
      const value = await recoveryFiles.pickPackage();
      if (value !== null) {
        await awaitForeground();
        await encryptionSetup.confirmPackage(value);
      }
    });
  const discard = () =>
    confirm.show({
      title: 'Restart unfinished recovery setup?',
      message:
        'This discards only the unfinished key step. Saved files from that unfinished step will no longer work. Your existing books and established keys are kept.',
      confirmText: 'Restart this step',
      destructive: true,
      onConfirm: () => {
        void run(async () => {
          await encryptionSetup.discardUnfinished(workplaceId);
          clearSecrets();
        });
      },
    });
  const awaitForeground = async () => {
    if (canResume()) {
      assertForeground();
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: KeyOperationError) => {
        clearTimeout(timer);
        subscription.remove();
        unsubscribe();
        if (error) reject(error);
        else resolve();
      };
      const subscription = AppState.addEventListener('change', value => {
        if (value === 'active') finish();
      });
      const unsubscribe = subscribeKeyAccessPolicy(allowed => {
        if (!allowed) finish(new KeyOperationError('FFB_KEY_LOCKED'));
      });
      const timer = setTimeout(() => finish(new KeyOperationError('FFB_KEY_CANCELLED')), 10000);
    });
    assertForeground();
  };
  const pickSecret = () =>
    run(async () => {
      if (!lifetime.current.package) throw new Error('Choose the encrypted package first');
      const value = await recoveryFiles.pickSecret();
      if (value !== null && lifetime.current.focused) {
        // Activity result delivery can precede the foreground event.
        await awaitForeground();
        lifetime.current.secret = value;
        projectInputs();
      } else if (value !== null) await recoveryFiles.cleanupTemporarySecrets();
    });
  const pickPackage = () =>
    run(async () => {
      const value = await recoveryFiles.pickPackage();
      if (value !== null && lifetime.current.focused) {
        lifetime.current.package = value;
        projectInputs();
      }
    });
  const useRetainedPackage = () =>
    run(async () => {
      const value = await encryptionSetup.savedPackage();
      if (lifetime.current.focused) {
        lifetime.current.package = value;
        projectInputs();
      }
    });
  const forgetDevice = () =>
    confirm.show({
      title: 'Remove this Device’s private-backup access?',
      message:
        'You will need your saved User recovery secret and encrypted package to restore access. This removes the Device key; existing local books stay on this Device.',
      confirmText: 'Remove backup access',
      destructive: true,
      onConfirm: () => {
        void run(async () => {
          await encryptionSetup.forgetDevice();
          clearSecrets();
        });
      },
    });
  const recover = () =>
    run(async signal => {
      const secret = lifetime.current.secret,
        pack = lifetime.current.package;
      if (!secret || !pack) throw new Error('Choose both recovery files');
      const publication = await encryptionSetup.recover(pack, secret, signal);
      // Completion of committed publication is independent of screen cancellation.
      await encryptionSetup.finishRecoveryCompletion();
      clearSecrets();
      lifetime.current.package = null;
      projectInputs();
      if (!canResume(signal)) return;
      if (workplace) await workplace.setWorkplaceId(publication.workplaceId);
      if (canResume(signal)) AppNavigation.toDashboard();
    });
  return {
    state,
    busy,
    message: ui.message,
    hasGeneratedSecret: ui.inputs.generated,
    hasImportedSecret: ui.inputs.secret,
    hasImportedPackage: ui.inputs.package,
    begin,
    exportSecret,
    verifySecret,
    exportPackage,
    reexportPackage,
    abandonPackage,
    verifyPackage,
    discard,
    pickSecret,
    pickPackage,
    useRetainedPackage,
    forgetDevice,
    recover,
    retry: () => run(),
    clearSensitiveInputs: () => {
      clearSecrets();
      lifetime.current.package = null;
      projectInputs();
    },
    disabled: busy || isAppCurrentlyLocked,
  };
}
