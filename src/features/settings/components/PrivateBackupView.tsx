import { AppButton, AppText } from '@/src/components/core';
import { Stack } from '@/src/design-system';
import { useOptionalWorkplace } from '@/src/contexts/WorkplaceContext';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { probeWebKeyCryptoCapability } from '@/src/services/backup/webKeyCryptoCapability';
import { SettingsLayout } from './SettingsLayout';
import { usePrivateBackup } from '../hooks/usePrivateBackup';

type ViewModel = ReturnType<typeof usePrivateBackup>;

export function PrivateBackupView({
  vm,
  restoreMode,
  onRestoreMode,
}: {
  vm: ViewModel;
  restoreMode: boolean;
  onRestoreMode: () => void;
}) {
  const [webCrypto, setWebCrypto] = useState<'checking' | 'ready' | 'unavailable' | 'native'>(
    Platform.OS === 'web' ? 'checking' : 'native',
  );

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    void probeWebKeyCryptoCapability().then(capability =>
      setWebCrypto(capability === 'unavailable' ? 'unavailable' : 'ready'),
    );
  }, []);

  const webBlocked = webCrypto === 'unavailable';
  const action = (
    id: string,
    label: string,
    press: () => Promise<void> | void,
    secondary = false,
    disabled = false,
  ) => (
    <AppButton
      testID={id}
      variant={secondary ? 'secondary' : 'primary'}
      disabled={vm.disabled || disabled || webBlocked}
      onPress={() => {
        void press();
      }}
    >
      {label}
    </AppButton>
  );

  return (
    <SettingsLayout title="Encrypted backup" hideFooter>
      <Stack space="lg" testID="encrypted-backup-screen">
        {Platform.OS === 'web' ? (
          <AppText variant="caption" color="secondary">
            {webCrypto === 'unavailable'
              ? 'Browser encryption is not available until the WebAssembly key module is built and checked in. Native apps are unaffected.'
              : 'Clearing browser data removes this Device. Keep your User recovery file offline; you need it with the encrypted backup ZIP to get back in.'}
          </AppText>
        ) : null}
        <AppText variant="body" color="secondary">
          {restoreMode
            ? vm.canRestoreWithDevice
              ? 'Choose your encrypted backup ZIP. This Device already has verified User keys, so a recovery file is optional.'
              : 'Choose your encrypted backup ZIP and User recovery file. This is separate from plaintext import restore.'
            : 'Set up encryption, then save a ZIP backup. The recovery file and backup are stored separately.'}
        </AppText>
        {vm.message ? (
          <AppText variant="body" color="secondary" testID="encrypted-backup-message">
            {vm.message}
          </AppText>
        ) : null}
        <BackupContent
          vm={vm}
          restoreMode={restoreMode}
          onRestoreMode={onRestoreMode}
          action={action}
        />
      </Stack>
    </SettingsLayout>
  );
}

function stage(vm: ViewModel, restoreMode: boolean): string {
  if (restoreMode) return 'restore';
  if (!vm.state) return 'reading';
  const status = vm.state.keys;
  if (status?.user === 'recovery-required' || status?.workplace === 'recovery-required')
    return 'recovery-required';
  if (!status || status.user === 'not-started') return 'new-user';
  if (
    status.user === 'pending' ||
    status.user === 'interrupted' ||
    status.workplace === 'pending' ||
    status.workplace === 'interrupted'
  )
    return 'pending-secret';
  if (status.user === 'ready' && status.workplace === 'missing') return 'new-workplace';
  if (status.user === 'ready' && status.workplace === 'ready') return 'ready';
  return 'no-workplace';
}

function BackupContent({
  vm,
  restoreMode,
  onRestoreMode,
  action,
}: {
  vm: ViewModel;
  restoreMode: boolean;
  onRestoreMode: () => void;
  action: (
    id: string,
    label: string,
    press: () => Promise<void> | void,
    secondary?: boolean,
    disabled?: boolean,
  ) => ReactNode;
}) {
  switch (stage(vm, restoreMode)) {
    case 'restore':
      return (
        <>
          {action('encrypted-backup-pick-zip', 'Choose encrypted backup ZIP', vm.pickBackup)}
          {action(
            'encrypted-backup-pick-recovery',
            'Choose User recovery file',
            vm.pickRecoverySecret,
            true,
            !vm.hasImportedBackup,
          )}
          {action(
            'encrypted-backup-restore',
            'Restore encrypted backup',
            vm.restoreFromFiles,
            false,
            !vm.hasImportedBackup || (!vm.hasImportedSecret && !vm.canRestoreWithDevice),
          )}
          {action('encrypted-backup-clear-restore', 'Clear choices', vm.clearRestoreInputs, true)}
        </>
      );
    case 'reading':
      return (
        <>
          <AppText>Reading encryption setup…</AppText>
          {action('encrypted-backup-retry', 'Try again', vm.retry, true)}
          {action(
            'encrypted-backup-restore-entry',
            'Restore encrypted backup',
            onRestoreMode,
            true,
          )}
        </>
      );
    case 'recovery-required':
      return (
        <>
          <AppText weight="semibold">Device keys need recovery</AppText>
          <AppText color="secondary">
            Use your saved User recovery file and encrypted backup ZIP.
          </AppText>
          {action('encrypted-backup-restore-existing', 'Restore encrypted backup', onRestoreMode)}
        </>
      );
    case 'new-user':
      return (
        <>
          <AppText weight="semibold">Set up encryption</AppText>
          {action('encrypted-backup-begin-user', 'Create User encryption', vm.begin)}
          {action(
            'encrypted-backup-restore-entry',
            'I already have backup files',
            onRestoreMode,
            true,
          )}
        </>
      );
    case 'pending-secret':
      return (
        <>
          <AppText weight="semibold">Save and verify your recovery file</AppText>
          {vm.hasGeneratedSecret ? (
            action('encrypted-backup-export-secret', 'Save recovery file', vm.exportSecret)
          ) : (
            <AppText color="secondary">
              Setup is unfinished. Reopen the file you saved, or restart this step.
            </AppText>
          )}
          {action(
            'encrypted-backup-verify-secret',
            'Open saved recovery file',
            vm.verifySecret,
            true,
          )}
          {action('encrypted-backup-discard', 'Restart unfinished step', vm.discard, true)}
        </>
      );
    case 'new-workplace':
      return (
        <>
          <AppText weight="semibold">User recovery verified</AppText>
          {action('encrypted-backup-begin-workplace', 'Set up this Workplace', vm.begin)}
        </>
      );
    case 'ready':
      return (
        <>
          <AppText weight="semibold">Encryption ready</AppText>
          {action('encrypted-backup-create', 'Create encrypted backup', vm.createBackup)}
          {action(
            'encrypted-backup-restore-entry',
            'Restore from backup files',
            onRestoreMode,
            true,
          )}
        </>
      );
    case 'no-workplace':
      return (
        <AppText color="secondary">
          Open a Workplace to create its encrypted backup. User recovery remains available from your
          saved files.
        </AppText>
      );
    default:
      return null;
  }
}

export default function PrivateBackupScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const [restoreMode, setRestoreMode] = useState(params.mode === 'restore');
  const workplace = useOptionalWorkplace();
  const vm = usePrivateBackup(workplace?.workplaceId);
  return (
    <PrivateBackupView
      vm={vm}
      restoreMode={restoreMode}
      onRestoreMode={() => {
        vm.clearRestoreInputs();
        setRestoreMode(true);
      }}
    />
  );
}
