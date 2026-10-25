import { ListGroup, ListRow, Icon, AppInput } from '@/src/components/core';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { ActionButtonPair } from '@/src/components/shared/ActionButtonPair';
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
  const scopeLabel =
    vm.backupScope === 'active'
      ? AppConfig.strings.update.exportScopeActive
      : vm.backupScope === 'all'
        ? AppConfig.strings.update.exportScopeAll
        : AppConfig.strings.update.exportScopeSelected;

  return (
    <Stack space="xxl">
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
        onClose={() => vm.setIsNamingExport(false)}
        position="center"
        fixedHeight={false}
        scrollable={false}
        keyboardAvoiding
        accessibilityCloseLabel="Close export filename"
        footer={
          <ActionButtonPair
            disabled={vm.isExporting}
            primary={{
              label: AppConfig.strings.settings.data.exportBtn,
              onPress: vm.onConfirmExport,
              loading: vm.isExporting,
            }}
            secondary={{
              label: AppConfig.strings.common.cancel,
              onPress: () => vm.setIsNamingExport(false),
            }}
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
          onPress={() => vm.setIsScopePickerVisible(true)}
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
          if (scope !== 'selected') vm.setIsScopePickerVisible(false);
        }}
        onSelectedWorkplaceIdsChange={vm.setSelectedWorkplaceIds}
        onClose={() => vm.setIsScopePickerVisible(false)}
        onConfirm={() => vm.setIsScopePickerVisible(false)}
        confirmLabel={formCopy.done}
      />
    </Stack>
  );
}
