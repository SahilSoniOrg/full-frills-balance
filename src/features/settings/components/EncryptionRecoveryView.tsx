import { AppButton, AppText } from '@/src/components/core';
import { Stack } from '@/src/design-system';
import { useOptionalWorkplace } from '@/src/contexts/WorkplaceContext';
import { useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { SettingsLayout } from './SettingsLayout';
import { useEncryptionRecovery } from '../hooks/useEncryptionRecovery';

type ViewModel = ReturnType<typeof useEncryptionRecovery>;

type RecoveryContentProps = {
  vm: ViewModel;
  recoverMode: boolean;
  onRecoverMode: () => void;
  action: (
    id: string,
    label: string,
    press: () => Promise<void> | void,
    secondary?: boolean,
    disabled?: boolean,
  ) => ReactNode;
};

export function EncryptionRecoveryView({
  vm,
  recoverMode,
  onRecoverMode,
}: {
  vm: ViewModel;
  recoverMode: boolean;
  onRecoverMode: () => void;
}) {
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
      disabled={vm.disabled || disabled}
      onPress={() => {
        void press();
      }}
    >
      {label}
    </AppButton>
  );
  return (
    <SettingsLayout title="Private backup & recovery" hideFooter>
      <Stack space="lg" testID="encryption-recovery-screen">
        <AppText variant="body" color="secondary">
          {recoverMode
            ? 'Recover your same User using your saved files. Existing books stay in place; missing books are restored from the package.'
            : 'Set up private backups for this Workplace. Cloud backup is not connected yet; save your files somewhere outside this installation.'}
        </AppText>
        {vm.message ? (
          <AppText variant="body" color="secondary" testID="encryption-recovery-message">
            {vm.message}
          </AppText>
        ) : null}
        <RecoveryContent
          vm={vm}
          recoverMode={recoverMode}
          onRecoverMode={onRecoverMode}
          action={action}
        />
      </Stack>
    </SettingsLayout>
  );
}

function recoveryStage(vm: ViewModel, recoverMode: boolean) {
  if (Platform.OS === 'web') return 'unsupported';
  if (recoverMode) return 'recover';
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

function RecoveryContent(props: RecoveryContentProps) {
  switch (recoveryStage(props.vm, props.recoverMode)) {
    case 'unsupported':
      return <UnsupportedRecovery />;
    case 'recover':
      return <RecoverSavedFiles {...props} />;
    case 'reading':
      return <ReadRecoverySetup {...props} />;
    case 'recovery-required':
      return <RecoverExistingKeys {...props} />;
    case 'new-user':
      return <StartRecoverySetup {...props} />;
    case 'pending-secret':
      return <SaveRecoverySecret {...props} />;
    case 'new-workplace':
      return <EnrollWorkplaceRecovery {...props} />;
    case 'ready':
      return <ReadyRecoveryBackup {...props} />;
    case 'no-workplace':
      return <OpenWorkplaceForRecovery />;
  }
}

function UnsupportedRecovery() {
  return <AppText>Recovery setup is available on Android and iOS.</AppText>;
}

function RecoverSavedFiles({ vm, action }: RecoveryContentProps) {
  return (
    <>
      <AppText weight="semibold">Choose your two saved files</AppText>
      <AppText variant="body" color="secondary">
        Choose the encrypted package first, then your User recovery secret. The Workplace emergency
        secret does not recover your User.
      </AppText>
      {action(
        'recovery-choose-package',
        vm.hasImportedPackage ? 'Encrypted package selected' : 'Choose encrypted package',
        vm.pickPackage,
        true,
      )}
      {action(
        'recovery-choose-secret',
        vm.hasImportedSecret ? 'User recovery file selected' : 'Choose User recovery file',
        vm.pickSecret,
        true,
        !vm.hasImportedPackage,
      )}
      {vm.state?.packageReady
        ? action(
            'recovery-use-retained-package',
            'Use retained encrypted package',
            vm.useRetainedPackage,
            true,
          )
        : null}
      <AppText variant="caption" color="secondary">
        The encrypted package contains the books as they were when it was created. Recovery keeps
        newer local books and settings when restoring key access; it does not transfer backup
        writing to this Device.
      </AppText>
      {action(
        'recovery-confirm',
        'Recover and restore books',
        vm.recover,
        false,
        !vm.hasImportedSecret || !vm.hasImportedPackage,
      )}
    </>
  );
}

function ReadRecoverySetup({ vm, action, onRecoverMode }: RecoveryContentProps) {
  return (
    <>
      <AppText>Reading recovery setup…</AppText>
      {action('encryption-retry', 'Try again', vm.retry, true)}
      {action('encryption-recover-unreadable', 'Recover using saved files', onRecoverMode, true)}
    </>
  );
}

function RecoverExistingKeys({ action, onRecoverMode }: RecoveryContentProps) {
  return (
    <>
      <AppText weight="semibold">Your existing keys need recovery</AppText>
      <AppText color="secondary">
        Some Device material is missing. Recover your User from the saved files; creating new keys
        would strand your encrypted books.
      </AppText>
      {action('encryption-recover-existing', 'Recover existing User', onRecoverMode)}
    </>
  );
}

function StartRecoverySetup({ vm, action, onRecoverMode }: RecoveryContentProps) {
  return (
    <>
      <AppText weight="semibold">Prepare your recovery files</AppText>
      <AppText color="secondary">
        You will save a User recovery secret, a separate Workplace emergency secret, and an
        encrypted backup package. Reopen each saved file to verify it before setup finishes.
      </AppText>
      {action('encryption-begin-user', 'Set up private recovery', vm.begin)}
      {action('encryption-existing-user', 'I already have recovery files', onRecoverMode, true)}
    </>
  );
}

function SaveRecoverySecret({ vm, action }: RecoveryContentProps) {
  const status = vm.state?.keys;
  if (!status) return null;
  const userPending = status.user === 'pending' || status.user === 'interrupted';
  return (
    <>
      <AppText weight="semibold">
        {userPending ? 'Save your User recovery file' : 'Save your Workplace emergency file'}
      </AppText>
      <AppText color="secondary">
        {userPending
          ? 'This secret recovers your User on another Device. Keep it separately from encrypted packages. Anyone holding both can open your books.'
          : 'Keep this separate emergency secret for this Workplace. It is reserved for decrypting an emergency dump; it does not grant ownership or recover your User.'}
      </AppText>
      {vm.hasGeneratedSecret ? (
        action('encryption-export-secret', 'Save recovery secret', vm.exportSecret)
      ) : (
        <AppText color="secondary">
          Setup is unfinished. Reopen the file you saved to resume. If nothing was saved, restart
          this unfinished step.
        </AppText>
      )}
      {(userPending ? status.user : status.workplace) !== 'interrupted'
        ? action(
            'encryption-verify-secret',
            'Open saved recovery file to verify',
            vm.verifySecret,
            true,
          )
        : null}
      {action('encryption-discard-unfinished', 'Restart unfinished step', vm.discard, true)}
    </>
  );
}

function EnrollWorkplaceRecovery({ vm, action }: RecoveryContentProps) {
  return (
    <>
      <AppText weight="semibold">Your User recovery is verified</AppText>
      <AppText color="secondary">
        Create this Workplace’s one encryption key and its separate emergency recovery file.
      </AppText>
      {action('encryption-begin-workplace', 'Set up this Workplace', vm.begin)}
    </>
  );
}

function ReadyRecoveryBackup({ vm, action, onRecoverMode }: RecoveryContentProps) {
  const state = vm.state;
  const status = state?.keys;
  if (!state || !status) return null;
  return (
    <>
      <AppText weight="semibold" testID="encryption-package-status">
        {state.packageSaved
          ? 'Recovery files and encrypted backup verified'
          : 'Save and verify an encrypted backup'}
      </AppText>
      <AppText color="secondary">
        This package includes the current Workplace’s encrypted books and the envelopes needed to
        recover them. It contains neither recovery secret. Save a new package when your books
        change.
      </AppText>
      {status.writerAllowed && (!state.packageReady || state.packageSaved)
        ? action(
            'encryption-save-package',
            state.packageSaved ? 'Save a new encrypted backup' : 'Save encrypted backup',
            vm.exportPackage,
          )
        : null}
      {state.packageReady && !state.packageSaved ? (
        <>
          {action(
            'encryption-reexport-package',
            'Save this encrypted package again',
            vm.reexportPackage,
            true,
          )}
          {action('encryption-verify-package', 'Open saved package to finish', vm.verifyPackage)}
          {status.writerAllowed
            ? action(
                'encryption-abandon-package',
                'Abandon unfinished backup',
                vm.abandonPackage,
                true,
              )
            : null}
        </>
      ) : null}
      {status.budgetExhausted ? (
        <AppText color="secondary">
          Creating new encrypted backups is blocked because safe remaining encryption usage cannot
          be proved. Existing backups remain readable.
        </AppText>
      ) : null}
      {status.writerAllowed === false && !status.budgetExhausted ? (
        <AppText color="secondary">
          This Device can restore and open books. Backup writer transfer is not available yet; you
          can re-export your retained package.
        </AppText>
      ) : null}
      {status.writerAllowed === false && state.packageReady
        ? action(
            'encryption-export-retained',
            'Save retained encrypted package',
            vm.reexportPackage,
            true,
          )
        : null}
      {action('encryption-recover', 'Recover from saved files', onRecoverMode, true)}
      {state.packageSaved
        ? action(
            'encryption-remove-device',
            'Remove this Device’s backup access',
            vm.forgetDevice,
            true,
          )
        : null}
    </>
  );
}

function OpenWorkplaceForRecovery() {
  return (
    <AppText color="secondary">
      Open a Workplace to prepare its private backup. User recovery remains available from your
      saved files.
    </AppText>
  );
}

export default function EncryptionRecoveryScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const [recoverMode, setRecoverMode] = useState(params.mode === 'recover');
  const workplace = useOptionalWorkplace();
  const vm = useEncryptionRecovery(workplace?.workplaceId);
  return (
    <EncryptionRecoveryView
      vm={vm}
      recoverMode={recoverMode}
      onRecoverMode={() => {
        vm.clearSensitiveInputs();
        setRecoverMode(true);
      }}
    />
  );
}
