import { AppButton, AppCard, AppText } from '@/src/components/core';
import { Stack } from '@/src/design-system';
import { useOptionalWorkplace } from '@/src/contexts/WorkplaceContext';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { probeWebKeyCryptoCapability } from '@/src/services/backup/webKeyCryptoCapability';
import { AppNavigation } from '@/src/utils/navigation';
import { SettingsLayout } from './SettingsLayout';
import { usePrivateBackup } from '../hooks/usePrivateBackup';

type ViewModel = ReturnType<typeof usePrivateBackup>;
type RestoreStep = 'archive' | 'recovery';

export function PrivateBackupView({
  vm,
  restoreMode,
  restoreStep,
  onRestoreMode,
  onCancelRestore,
  onRestoreStepChange,
}: {
  vm: ViewModel;
  restoreMode: boolean;
  restoreStep: RestoreStep;
  onRestoreMode: () => void;
  onCancelRestore: () => void;
  onRestoreStepChange: (step: RestoreStep) => void;
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
    <SettingsLayout
      title={restoreMode ? 'Restore encrypted backup' : 'Encrypted backup'}
      hideFooter
    >
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
            ? vm.workplaceRecovery
              ? 'The source files are verified. Set up the destination User and save its new recovery files before importing this separate copy.'
              : vm.recoveryRoute === 'workplace'
                ? 'Use a Workplace recovery file to create a separate recovered copy. This does not restore the original Workplace or its access.'
                : vm.canRestoreWithDevice
                  ? 'This Device has verified User keys. You can use them or select your User recovery file.'
                  : 'Restore your User identity and this Workplace using the encrypted ZIP and its User recovery file.'
            : 'The encrypted ZIP contains this Workplace’s data. User and Workplace recovery files provide different ways to unlock a restore. Store each file separately from the ZIP.'}
        </AppText>
        {vm.message ? (
          <AppText variant="body" color="secondary" testID="encrypted-backup-message">
            {vm.message}
          </AppText>
        ) : null}
        {vm.workplaceRecovery ? (
          <Stack space="sm" testID="encrypted-backup-copy-setup">
            <AppText weight="semibold">
              Creating a recovered copy of {vm.workplaceRecovery.preview.workplace.name}
            </AppText>
            <AppText color="secondary">
              {vm.state?.keys?.user === 'ready'
                ? 'Use this Device’s verified User. The recovered Workplace gets fresh keys and a new recovery file.'
                : 'Create and verify a User for this Device. The original User recovery file is not needed.'}
            </AppText>
            {action(
              'encrypted-backup-back-to-restore',
              'Choose a different backup',
              () => {
                vm.clearRestoreInputs();
                onRestoreStepChange('archive');
              },
              true,
            )}
          </Stack>
        ) : null}
        {restoreMode
          ? action('encrypted-backup-cancel-restore', 'Cancel restore', onCancelRestore, true)
          : null}
        {vm.restorePreview ? (
          <EncryptedRestorePreview
            preview={vm.restorePreview}
            onConfirm={vm.confirmRestorePreview}
            onDiscard={vm.discardRestorePreview}
          />
        ) : (
          <BackupContent
            vm={vm}
            restoreMode={restoreMode}
            restoreStep={restoreStep}
            onRestoreStepChange={onRestoreStepChange}
            onRestoreMode={onRestoreMode}
            action={action}
          />
        )}
      </Stack>
    </SettingsLayout>
  );
}

function EncryptedRestorePreview({
  preview,
  onConfirm,
  onDiscard,
}: {
  preview: NonNullable<ViewModel['restorePreview']>;
  onConfirm: () => void;
  onDiscard: () => void;
}) {
  const rows = [
    ['Accounts', preview.accounts],
    ['Categories', preview.categories],
    ['Journal entries', preview.journals],
    ['Transactions', preview.transactions],
    ['Budgets', preview.budgets],
    ['Planned payments', preview.plannedPayments],
  ] as const;

  return (
    <Stack space="md" testID="encrypted-backup-restore-preview">
      <AppText variant="heading">Review backup contents</AppText>
      <AppText variant="body" color="secondary">
        {preview.recoveryCopy
          ? 'Creates a recovered copy with fresh identities and keys. Original Workplace access is not restored. Next, protect the destination before importing.'
          : 'This will import the following Workplace and records to this device. Nothing is restored until you confirm.'}
      </AppText>
      <AppCard variant="outline" paddingSize="md">
        <Stack space="sm">
          <AppText weight="semibold">{preview.workplace.name}</AppText>
          <AppText variant="caption" color="secondary">
            Base currency: {preview.workplace.currency}
          </AppText>
          {preview.capturedAt !== undefined ? (
            <AppText variant="caption" color="secondary">
              Backup captured: {new Date(preview.capturedAt).toLocaleString()}. This does not prove
              it is the newest backup.
            </AppText>
          ) : null}
          {rows.map(([label, count]) => (
            <AppText key={label} variant="body">
              {label}: {count}
            </AppText>
          ))}
        </Stack>
      </AppCard>
      <AppButton variant="primary" testID="encrypted-backup-restore-confirm" onPress={onConfirm}>
        {preview.recoveryCopy ? 'Continue with recovered copy' : 'Restore these records'}
      </AppButton>
      <AppButton variant="outline" testID="encrypted-backup-restore-discard" onPress={onDiscard}>
        Discard restore
      </AppButton>
    </Stack>
  );
}

function stage(vm: ViewModel, restoreMode: boolean): string {
  if (restoreMode && !vm.workplaceRecovery) return 'restore';
  if (!vm.state) return 'reading';
  const status = vm.state.keys;
  if (status?.user === 'recovery-required' || status?.workplace === 'recovery-required')
    return 'recovery-required';
  if (!status || status.user === 'not-started') return 'new-user';
  if (vm.workplaceRecovery && status.user === 'ready' && !vm.workplaceRecovery.workplaceId)
    return 'reading';
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
  restoreStep,
  onRestoreStepChange,
  onRestoreMode,
  action,
}: {
  vm: ViewModel;
  restoreMode: boolean;
  restoreStep: RestoreStep;
  onRestoreStepChange: (step: RestoreStep) => void;
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
          <AppText weight="semibold">
            {restoreStep === 'archive'
              ? 'Step 1 of 2 · Choose a backup'
              : 'Step 2 of 2 · Choose how to recover'}
          </AppText>
          {restoreStep === 'archive' ? (
            <>
              <AppText color="secondary">
                Choose the encrypted ZIP that contains the Workplace data you want to restore.
              </AppText>
              {action('encrypted-backup-pick-zip', 'Choose encrypted backup ZIP', vm.pickBackup)}
              {vm.hasImportedBackup ? (
                <AppText color="secondary" testID="encrypted-backup-archive-selected">
                  Backup ZIP selected.
                </AppText>
              ) : null}
              {action(
                'encrypted-backup-next-recovery',
                'Continue',
                () => onRestoreStepChange('recovery'),
                false,
                !vm.hasImportedBackup,
              )}
            </>
          ) : (
            <>
              <AppText color="secondary">
                Choose what you want to recover. The required recovery file depends on this choice.
              </AppText>
              {action(
                'encrypted-backup-route-user',
                vm.recoveryRoute === 'user' ? 'Selected · Restore my User' : 'Restore my User',
                () => vm.selectRecoveryRoute('user'),
                vm.recoveryRoute !== 'user',
              )}
              <AppText color="secondary">
                {vm.canRestoreWithDevice
                  ? 'Restore User access with this Device’s verified keys or your User recovery file, then unlock this Workplace’s data.'
                  : 'Restore User access with your User recovery file, then unlock this Workplace’s data.'}
              </AppText>
              {action(
                'encrypted-backup-route-workplace',
                vm.recoveryRoute === 'workplace'
                  ? 'Selected · Make a recovered Workplace copy'
                  : 'Make a recovered Workplace copy',
                () => vm.selectRecoveryRoute('workplace'),
                vm.recoveryRoute !== 'workplace',
              )}
              <AppText color="secondary">
                Creates a separate Workplace with fresh keys. It does not restore access to the
                original.
              </AppText>
              {vm.recoveryRoute === 'user' && vm.canRestoreWithDevice ? (
                <AppText color="secondary">
                  This Device has verified User keys, so the User recovery file is optional.
                </AppText>
              ) : null}
              {action(
                'encrypted-backup-pick-recovery',
                vm.recoveryRoute === 'workplace'
                  ? 'Choose Workplace recovery file'
                  : 'Choose User recovery file',
                vm.pickRecoverySecret,
                true,
                !vm.hasImportedBackup,
              )}
              {vm.hasImportedSecret ? (
                <AppText color="secondary" testID="encrypted-backup-recovery-selected">
                  {vm.recoveryRoute === 'workplace'
                    ? 'Workplace recovery file selected.'
                    : 'User recovery file selected.'}
                </AppText>
              ) : null}
              {action(
                'encrypted-backup-restore',
                vm.recoveryRoute === 'workplace' ? 'Review recovered copy' : 'Review backup',
                vm.restoreFromFiles,
                false,
                !vm.hasImportedBackup ||
                  (!vm.hasImportedSecret &&
                    (vm.recoveryRoute === 'workplace' || !vm.canRestoreWithDevice)),
              )}
              {action(
                'encrypted-backup-back-to-archive',
                'Back to backup file',
                () => onRestoreStepChange('archive'),
                true,
              )}
              {action(
                'encrypted-backup-clear-restore',
                'Clear selected files',
                () => {
                  vm.clearRestoreInputs();
                  onRestoreStepChange('archive');
                },
                true,
              )}
            </>
          )}
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
          <AppText weight="semibold">
            Save and verify your {vm.state?.keys?.user === 'ready' ? 'Workplace' : 'User'} recovery
            file
          </AppText>
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
          {action(
            'encrypted-backup-begin-workplace',
            vm.workplaceRecovery ? 'Protect recovered Workplace' : 'Set up this Workplace',
            vm.begin,
          )}
        </>
      );
    case 'ready':
      return (
        <>
          <AppText weight="semibold">Encryption ready</AppText>
          {vm.workplaceRecovery
            ? action(
                'encrypted-backup-publish-copy',
                'Import recovered copy',
                vm.finishWorkplaceRecovery,
              )
            : action('encrypted-backup-create', 'Create encrypted backup', vm.createBackup)}
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
  return <PrivateBackupFlow restoreMode={false} />;
}

export function EncryptedBackupRestoreScreen() {
  return <PrivateBackupFlow restoreMode />;
}

function PrivateBackupFlow({ restoreMode }: { restoreMode: boolean }) {
  const [restoreStep, setRestoreStep] = useState<RestoreStep>('archive');
  const workplace = useOptionalWorkplace();
  const vm = usePrivateBackup(workplace?.workplaceId);
  const cancelRestore = () => {
    if (vm.restorePreview) vm.discardRestorePreview();
    vm.clearRestoreInputs();
    AppNavigation.back();
  };
  return (
    <PrivateBackupView
      vm={vm}
      restoreMode={restoreMode}
      restoreStep={restoreStep}
      onRestoreMode={() => AppNavigation.toEncryptedBackup('restore')}
      onCancelRestore={cancelRestore}
      onRestoreStepChange={setRestoreStep}
    />
  );
}
