import { useCallback, useEffect, useRef, useState } from 'react';
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
import { preferences } from '@/src/services/preferences';
import { useOptionalWorkplace } from '@/src/contexts/WorkplaceContext';
import { AppNavigation } from '@/src/utils/navigation';
import { confirm } from '@/src/utils/alerts';

export function useEncryptionRecovery(workplaceId?: string) {
  const workplace = useOptionalWorkplace();
  const { isAppCurrentlyLocked } = useAppLock();
  const [state, setState] = useState<SetupViewState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hasGeneratedSecret, setHasGeneratedSecret] = useState(false);
  const [hasImportedSecret, setHasImportedSecret] = useState(false);
  const [hasImportedPackage, setHasImportedPackage] = useState(false);
  const generated = useRef<RecoveryCredential | null>(null);
  const importedSecret = useRef<unknown>(null);
  const importedPackage = useRef<unknown>(null);
  const alive = useRef(true);
  const operation = useRef(false);
  const intent = useRef(0);
  const clearSecrets = useCallback(() => {
    generated.current = null;
    importedSecret.current = null;
    setHasGeneratedSecret(false);
    setHasImportedSecret(false);
  }, []);
  const refresh = useCallback(async () => {
    const next = await encryptionSetup.inspect(workplaceId);
    if (alive.current) setState(next);
  }, [workplaceId]);
  useFocusEffect(
    useCallback(() => {
      alive.current = true;
      clearSecrets();
      setHasImportedPackage(false);
      setBusy(operation.current);
      void refresh().catch(() => {
        if (alive.current)
          setMessage(
            'Setup could not be read. Unlock the app and try again; existing keys have been kept.',
          );
      });
      return () => {
        alive.current = false;
        intent.current++;
        generated.current = null;
        importedSecret.current = null;
        importedPackage.current = null;
      };
    }, [refresh, clearSecrets]),
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', value => {
      if (value !== 'active') {
        intent.current++;
        clearSecrets();
      }
    });
    return () => sub.remove();
  }, [clearSecrets]);
  useEffect(
    () =>
      subscribeKeyAccessPolicy(allowed => {
        if (!allowed) {
          intent.current++;
          clearSecrets();
        }
      }),
    [clearSecrets],
  );
  const run = useCallback(
    async (work: () => Promise<void>) => {
      if (operation.current || isAppCurrentlyLocked) return;
      operation.current = true;
      setBusy(true);
      setMessage(null);
      try {
        await work();
        if (alive.current) await refresh();
      } catch {
        if (alive.current)
          setMessage(
            'This step could not finish. Check the files and try again. Existing books and keys have been kept.',
          );
      } finally {
        operation.current = false;
        if (alive.current) setBusy(false);
      }
    },
    [refresh, isAppCurrentlyLocked],
  );
  const begin = () =>
    run(async () => {
      const value =
        state?.keys?.user === 'ready' && workplaceId
          ? await encryptionSetup.beginWorkplace(workplaceId)
          : await encryptionSetup.beginUser();
      assertKeyAccessAllowed();
      if (AppState.currentState !== 'active') throw new Error('Setup is no longer foreground');
      if (alive.current) {
        generated.current = value;
        setHasGeneratedSecret(true);
      }
    });
  const exportSecret = () =>
    run(async () => {
      const value = generated.current;
      if (!value) throw new Error('Reimport the saved secret or restart the unfinished step');
      const saved = await recoveryFiles.exportSecret(value);
      if (alive.current)
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
      if (state?.keys?.user === 'ready' && workplaceId)
        await encryptionSetup.confirmWorkplace(workplaceId, value);
      else await encryptionSetup.confirmUser(value);
      clearSecrets();
    });
  const exportPackage = () =>
    run(async () => {
      if (!workplaceId) throw new Error('Select a Workplace first');
      const value = await encryptionSetup.preparePackage(workplaceId);
      await recoveryFiles.exportPackage(value);
      if (alive.current)
        setMessage(
          'Open the encrypted package you saved to verify it. Keep recovery secrets separately.',
        );
    });
  const reexportPackage = () =>
    run(async () => {
      await recoveryFiles.exportPackage(await encryptionSetup.savedPackage());
    });
  const verifyPackage = () =>
    run(async () => {
      const value = await recoveryFiles.pickPackage();
      if (value !== null) await encryptionSetup.confirmPackage(value);
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
  const pickSecret = () =>
    run(async () => {
      if (!importedPackage.current) throw new Error('Choose the encrypted package first');
      const value = await recoveryFiles.pickSecret();
      if (value !== null && alive.current) {
        assertKeyAccessAllowed();
        if (AppState.currentState !== 'active') throw new Error('Recovery is no longer foreground');
        importedSecret.current = value;
        setHasImportedSecret(true);
      }
    });
  const pickPackage = () =>
    run(async () => {
      const value = await recoveryFiles.pickPackage();
      if (value !== null && alive.current) {
        importedPackage.current = value;
        setHasImportedPackage(true);
      }
    });
  const useRetainedPackage = () =>
    run(async () => {
      const value = await encryptionSetup.savedPackage();
      if (alive.current) {
        importedPackage.current = value;
        setHasImportedPackage(true);
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
    run(async () => {
      const secret = importedSecret.current,
        pack = importedPackage.current;
      if (!secret || !pack) throw new Error('Choose both recovery files');
      const version = intent.current;
      const publication = await encryptionSetup.recover(pack, secret, () => {
        if (!alive.current || intent.current !== version || AppState.currentState !== 'active')
          throw new Error('Recovery was cancelled');
      });
      if (!alive.current || intent.current !== version || AppState.currentState !== 'active')
        return;
      clearSecrets();
      importedPackage.current = null;
      setHasImportedPackage(false);
      preferences.workplace.replace(publication.workplaceId, publication.bookPreferences);
      if (workplace) await workplace.setWorkplaceId(publication.workplaceId);
      else
        preferences.device.update({
          activeWorkplaceId: publication.workplaceId,
          deviceRegistered: true,
        });
      AppNavigation.toDashboard();
    });
  return {
    state,
    busy,
    message,
    hasGeneratedSecret,
    hasImportedSecret,
    hasImportedPackage,
    begin,
    exportSecret,
    verifySecret,
    exportPackage,
    reexportPackage,
    verifyPackage,
    discard,
    pickSecret,
    pickPackage,
    useRetainedPackage,
    forgetDevice,
    recover,
    retry: () => run(async () => undefined),
    clearSensitiveInputs: () => {
      clearSecrets();
      importedPackage.current = null;
      setHasImportedPackage(false);
    },
    disabled: busy || isAppCurrentlyLocked,
  };
}
