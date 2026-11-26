import { ListGroup, ListRow, Icon, AppInput } from '@/src/components/core';
import { ModalActions } from '@/src/components/overlays/ModalActions';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { useAfterDismiss } from '@/src/components/overlays/useAfterDismiss';
import { AppConfig } from '@/src/constants';
import { formPrimitivesStrings as formCopy } from '@/src/constants/copy/domains/formPrimitivesStrings';
import { Stack } from '@/src/design-system';
import { BackupScopeSheet } from '@/src/components/overlays/BackupScopeSheet';
import { SettingsMaintenanceOverlay } from '@/src/features/settings/components/SettingsMaintenanceOverlay';
import { useDataExportViewModel } from '@/src/features/settings/hooks/useDataExportViewModel';

type DataExportSectionProps = {
  onImport: () => void;
};

export function DataExportSection({ onImport }: DataExportSectionProps) {
  const vm = useDataExportViewModel();
  const afterNamingDismiss = useAfterDismiss();
  const afterScopeDismiss = useAfterDismiss();
  const scopeLabel =
    vm.backupScope === 'active'
      ? AppConfig.strings.update.exportScopeActive
      : vm.backupScope === 'all'
        ? AppConfig.strings.update.exportScopeAll
        : AppConfig.strings.update.exportScopeSelected;

  return (
    <Stack gap="xxl">
      <ListGroup variant="plain" header={AppConfig.strings.settings.data.backupRestoreHeader}>
        <ListRow
          focusId="data-export"
          testID="data-export"
          icon={Icon.Document}
          title={AppConfig.strings.settings.data.exportBtn}
          subtitle={AppConfig.strings.settings.data.exportDesc}
          onPress={vm.onExport}
          trailing={vm.isExporting && <ListRow.Spinner />}
        />
        <ListRow
          focusId="data-import"
          testID="data-import"
          icon={Icon.Refresh}
          title={AppConfig.strings.settings.data.importBtn}
          subtitle={AppConfig.strings.settings.data.importDesc}
          onPress={onImport}
        />
      </ListGroup>

      <SettingsMaintenanceOverlay
        isVisible={vm.isPreparingExport}
        title={AppConfig.strings.settings.data.exportingTitle}
        progress={vm.exportProgress}
        progressMessage={vm.exportProgressMessage || AppConfig.strings.settings.data.exportingWait}
        hint={AppConfig.strings.settings.data.exportingHint}
      />

      <ModalSurface
        visible={vm.isNamingExport && !vm.isScopePickerVisible && !vm.isExporting}
        title={AppConfig.strings.settings.data.exportFilenameLabel}
        onClose={() => {
          afterNamingDismiss.cancel();
          vm.setIsNamingExport(false);
        }}
        onDismiss={afterNamingDismiss.onDismiss}
        position="center"
        fixedHeight={false}
        scrollable={false}
        keyboardAvoiding
        accessibilityCloseLabel="Close export filename"
        footer={
          <ModalActions
            actions={[
              {
                label: AppConfig.strings.common.cancel,
                role: 'secondary',
                onPress: () => {
                  afterNamingDismiss.cancel();
                  vm.setIsNamingExport(false);
                },
                disabled: vm.isExporting,
              },
              {
                label: AppConfig.strings.settings.data.exportBtn,
                onPress: () => {
                  afterNamingDismiss.run(() => {
                    void vm.onConfirmExport();
                  });
                  vm.setIsNamingExport(false);
                },
                loading: vm.isExporting,
                disabled: vm.isExporting || !vm.canConfirmExport,
              },
            ]}
          />
        }
      >
        <AppInput
          label={AppConfig.strings.settings.data.exportFilenameLabel}
          placeholder={AppConfig.strings.settings.data.exportFilenamePlaceholder}
          value={vm.exportFilename}
          onChangeText={vm.setExportFilename}
          width="100%"
          marginBottom="md"
          leftIcon={Icon.Document}
          autoFocus
        />
        <ListRow
          testID="data-export-scope"
          title={AppConfig.strings.update.exportScopeTitle}
          subtitle={scopeLabel}
          onPress={() => {
            afterNamingDismiss.run(() => vm.setIsScopePickerVisible(true));
            vm.setIsNamingExport(false);
          }}
          chevron
        />
      </ModalSurface>

      <BackupScopeSheet
        visible={vm.isScopePickerVisible}
        workplaces={vm.workplaces}
        activeWorkplaceId={vm.activeWorkplaceId}
        scope={vm.backupScope}
        selectedWorkplaceIds={vm.selectedWorkplaceIds}
        onScopeChange={scope => {
          vm.setBackupScope(scope);
          if (scope !== 'selected') {
            afterScopeDismiss.run(() => vm.setIsNamingExport(true));
            vm.setIsScopePickerVisible(false);
          }
        }}
        onSelectedWorkplaceIdsChange={vm.setSelectedWorkplaceIds}
        onClose={() => {
          afterScopeDismiss.run(() => vm.setIsNamingExport(true));
          vm.setIsScopePickerVisible(false);
        }}
        onDismiss={afterScopeDismiss.onDismiss}
        onConfirm={() => {
          afterScopeDismiss.run(() => vm.setIsNamingExport(true));
          vm.setIsScopePickerVisible(false);
        }}
        confirmLabel={formCopy.done}
      />
    </Stack>
  );
}
