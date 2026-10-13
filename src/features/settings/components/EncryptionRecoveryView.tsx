import { AppButton, AppText } from '@/src/components/core';
import { Stack } from '@/src/design-system';
import { useOptionalWorkplace } from '@/src/contexts/WorkplaceContext';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform } from 'react-native';
import { SettingsLayout } from './SettingsLayout';
import { useEncryptionRecovery } from '../hooks/useEncryptionRecovery';

type ViewModel = ReturnType<typeof useEncryptionRecovery>;
export function EncryptionRecoveryView({
  vm,
  recoverMode,
  onRecoverMode,
}: {
  vm: ViewModel;
  recoverMode: boolean;
  onRecoverMode: () => void;
}) {
  const status = vm.state?.keys;
  const userPending = status?.user === 'pending' || status?.user === 'interrupted';
  const workplacePending = status?.workplace === 'pending' || status?.workplace === 'interrupted';
  const ready = status?.user === 'ready' && status?.workplace === 'ready';
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
            ? 'Recover your same User and restore a Workplace from your saved files. Existing different books will not be overwritten.'
            : 'Set up private backups for this Workplace. Cloud backup is not connected yet; save your files somewhere outside this installation.'}
        </AppText>
        {vm.message ? (
          <AppText variant="body" color="secondary" testID="encryption-recovery-message">
            {vm.message}
          </AppText>
        ) : null}
        {Platform.OS === 'web' ? (
          <AppText>Recovery setup is available on Android and iOS.</AppText>
        ) : recoverMode ? (
          <>
            <AppText weight="semibold">Choose your two saved files</AppText>
            <AppText variant="body" color="secondary">
              Choose the encrypted package first, then your User recovery secret. The Workplace
              emergency secret does not recover your User.
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
              The encrypted package contains the books as they were when it was created. Recovery
              keeps the same identity and records; it does not transfer backup writing to this
              Device.
            </AppText>
            {action(
              'recovery-confirm',
              'Recover and restore books',
              vm.recover,
              false,
              !vm.hasImportedSecret || !vm.hasImportedPackage,
            )}
          </>
        ) : !vm.state ? (
          <>
            <AppText>Reading recovery setup…</AppText>
            {action('encryption-retry', 'Try again', vm.retry, true)}
            {action(
              'encryption-recover-unreadable',
              'Recover using saved files',
              onRecoverMode,
              true,
            )}
          </>
        ) : status?.user === 'recovery-required' || status?.workplace === 'recovery-required' ? (
          <>
            <AppText weight="semibold">Your existing keys need recovery</AppText>
            <AppText color="secondary">
              Some Device material is missing. Recover your User from the saved files; creating new
              keys would strand your encrypted books.
            </AppText>
            {action('encryption-recover-existing', 'Recover existing User', onRecoverMode)}
          </>
        ) : !status || status.user === 'not-started' ? (
          <>
            <AppText weight="semibold">Prepare your recovery files</AppText>
            <AppText color="secondary">
              You will save a User recovery secret, a separate Workplace emergency secret, and an
              encrypted backup package. Reopen each saved file to verify it before setup finishes.
            </AppText>
            {action('encryption-begin-user', 'Set up private recovery', vm.begin)}
            {action(
              'encryption-existing-user',
              'I already have recovery files',
              onRecoverMode,
              true,
            )}
          </>
        ) : userPending || workplacePending ? (
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
                Setup is unfinished. Reopen the file you saved to resume. If nothing was saved,
                restart this unfinished step.
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
        ) : status.user === 'ready' && status.workplace === 'missing' ? (
          <>
            <AppText weight="semibold">Your User recovery is verified</AppText>
            <AppText color="secondary">
              Create this Workplace’s one encryption key and its separate emergency recovery file.
            </AppText>
            {action('encryption-begin-workplace', 'Set up this Workplace', vm.begin)}
          </>
        ) : ready ? (
          <>
            <AppText weight="semibold" testID="encryption-package-status">
              {vm.state.packageSaved
                ? 'Recovery files and encrypted backup verified'
                : 'Save and verify an encrypted backup'}
            </AppText>
            <AppText color="secondary">
              This package includes the current Workplace’s encrypted books and the envelopes needed
              to recover them. It contains neither recovery secret. Save a new package when your
              books change.
            </AppText>
            {status.writerAllowed && (!vm.state.packageReady || vm.state.packageSaved)
              ? action(
                  'encryption-save-package',
                  vm.state.packageSaved ? 'Save a new encrypted backup' : 'Save encrypted backup',
                  vm.exportPackage,
                )
              : null}
            {vm.state.packageReady && !vm.state.packageSaved ? (
              <>
                {action(
                  'encryption-reexport-package',
                  'Save this encrypted package again',
                  vm.reexportPackage,
                  true,
                )}
                {action(
                  'encryption-verify-package',
                  'Open saved package to finish',
                  vm.verifyPackage,
                )}
              </>
            ) : null}
            {status.budgetExhausted ? (
              <AppText color="secondary">
                Creating new encrypted backups is blocked because safe remaining encryption usage
                cannot be proved. Existing backups remain readable.
              </AppText>
            ) : null}
            {status.writerAllowed === false && !status.budgetExhausted ? (
              <AppText color="secondary">
                This Device can restore and open books. Backup writer transfer is not available yet;
                you can re-export your retained package.
              </AppText>
            ) : null}
            {status.writerAllowed === false && vm.state.packageReady
              ? action(
                  'encryption-export-retained',
                  'Save retained encrypted package',
                  vm.reexportPackage,
                  true,
                )
              : null}
            {action('encryption-recover', 'Recover from saved files', onRecoverMode, true)}
            {vm.state.packageSaved
              ? action(
                  'encryption-remove-device',
                  'Remove this Device’s backup access',
                  vm.forgetDevice,
                  true,
                )
              : null}
          </>
        ) : (
          <AppText color="secondary">
            Open a Workplace to prepare its private backup. User recovery remains available from
            your saved files.
          </AppText>
        )}
      </Stack>
    </SettingsLayout>
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
