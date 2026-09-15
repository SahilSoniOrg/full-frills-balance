import { Icon, AppButton, AppIcon, AppInput, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Size, Spacing } from '@/src/constants';
import { withOpacity } from '@/src/utils/color-math';
import { Stack } from '@/src/design-system';
import { SettingsMaintenanceOverlay } from '@/src/features/settings/components/SettingsMaintenanceOverlay';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { useDataExportViewModel } from '@/src/features/settings/hooks/useDataExportViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import type { BackupScope } from '@/src/services/export';

type DataExportSectionProps = {
  onImport: () => void;
};

export function DataExportSection({ onImport }: DataExportSectionProps) {
  const vm = useDataExportViewModel();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const scopeLabel =
    vm.backupScope === 'active'
      ? AppConfig.strings.update.exportScopeActive
      : vm.backupScope === 'all'
        ? AppConfig.strings.update.exportScopeAll
        : AppConfig.strings.update.exportScopeSelected;

  return (
    <Stack space="xxl">
      <SettingsMenu header={AppConfig.strings.settings.data.backupRestoreHeader}>
        <SettingsMenuItem
          searchId="data-export"
          testID="data-export"
          leftIcon={Icon.Document}
          title={AppConfig.strings.settings.data.exportBtn}
          description={AppConfig.strings.settings.data.exportDesc}
          onPress={vm.onExport}
          loading={vm.isExporting}
        />
        <SettingsMenuItem
          searchId="data-import"
          testID="data-import"
          leftIcon={Icon.Refresh}
          title={AppConfig.strings.settings.data.importBtn}
          description={AppConfig.strings.settings.data.importDesc}
          onPress={onImport}
        />
      </SettingsMenu>

      <SettingsMaintenanceOverlay
        isVisible={vm.isExporting}
        title={AppConfig.strings.settings.data.exportingTitle}
        progress={vm.exportProgress}
        progressMessage={vm.exportProgressMessage || AppConfig.strings.settings.data.exportingWait}
        hint={AppConfig.strings.settings.data.exportingHint}
      />

      <Modal
        visible={vm.isNamingExport && !vm.isExporting && !vm.isScopePickerVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
            <View style={styles.modalIconRow}>
              <AppIcon name={Icon.Document} size={40} color={theme.primary} />
            </View>

            <AppText variant="subheading" style={styles.modalTitle}>
              {AppConfig.strings.settings.data.exportFilenameLabel}
            </AppText>

            <AppInput
              label={AppConfig.strings.settings.data.exportFilenameLabel}
              placeholder={AppConfig.strings.settings.data.exportFilenamePlaceholder}
              value={vm.exportFilename}
              onChangeText={vm.setExportFilename}
              containerStyle={{ width: '100%', marginBottom: Spacing.xl }}
              leftIcon={Icon.Document}
              autoFocus
            />

            <TouchableOpacity
              style={[styles.scopeRow, { borderColor: theme.border }]}
              onPress={() => vm.setIsScopePickerVisible(true)}
              testID="data-export-scope"
            >
              <View style={styles.scopeCopy}>
                <AppText variant="caption" color="secondary">
                  {AppConfig.strings.update.exportScopeTitle}
                </AppText>
                <AppText weight="semibold">{scopeLabel}</AppText>
              </View>
              <AppIcon name={Icon.ChevronRight} size={Size.iconSm} color={theme.textSecondary} />
            </TouchableOpacity>

            <View style={styles.modalActionRow}>
              <AppButton
                variant="outline"
                onPress={() => vm.setIsNamingExport(false)}
                style={{ flex: 1, marginRight: Spacing.sm }}
              >
                {AppConfig.strings.common.cancel}
              </AppButton>
              <AppButton
                variant="primary"
                onPress={vm.onConfirmExport}
                loading={vm.isExporting}
                style={{ flex: 2 }}
              >
                {AppConfig.strings.settings.data.exportBtn}
              </AppButton>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={vm.isScopePickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => vm.setIsScopePickerVisible(false)}
      >
        <View style={[styles.scopeOverlay, { backgroundColor: theme.overlay }]}>
          <View
            style={[
              styles.scopeCard,
              { backgroundColor: theme.surface, paddingBottom: insets.bottom + Spacing.xxxl },
            ]}
          >
            <View style={styles.scopeHeader}>
              <AppText variant="subheading" weight="bold">
                {AppConfig.strings.update.exportScopeTitle}
              </AppText>
              <TouchableOpacity onPress={() => vm.setIsScopePickerVisible(false)}>
                <AppIcon name={Icon.Close} size={Size.iconMd} color={theme.text} />
              </TouchableOpacity>
            </View>
            {(['active', 'all', 'selected'] as BackupScope[]).map(scope => {
              const selected = vm.backupScope === scope;
              const label =
                scope === 'active'
                  ? AppConfig.strings.update.exportScopeActive
                  : scope === 'all'
                    ? AppConfig.strings.update.exportScopeAll
                    : AppConfig.strings.update.exportScopeSelected;
              const description =
                scope === 'active'
                  ? vm.workplaces.find(item => item.id === vm.activeWorkplaceId)?.name
                  : scope === 'all'
                    ? `${vm.workplaces.length} workplaces`
                    : AppConfig.strings.update.exportScopeSelectedCount(
                        vm.selectedWorkplaceIds.length,
                      );
              return (
                <TouchableOpacity
                  key={scope}
                  style={[styles.scopeOption, { borderBottomColor: theme.border }]}
                  onPress={() => {
                    vm.setBackupScope(scope);
                    if (scope !== 'selected') vm.setIsScopePickerVisible(false);
                  }}
                >
                  <View style={styles.scopeCopy}>
                    <AppText weight={selected ? 'bold' : 'medium'}>{label}</AppText>
                    <AppText variant="caption" color="secondary">
                      {description}
                    </AppText>
                  </View>
                  {selected && (
                    <AppIcon name={Icon.CheckCircle} size={Size.iconSm} color={theme.primary} />
                  )}
                </TouchableOpacity>
              );
            })}
            {vm.backupScope === 'selected' && (
              <>
                {vm.workplaces.map(workplace => {
                  const selected = vm.selectedWorkplaceIds.includes(workplace.id);
                  return (
                    <TouchableOpacity
                      key={workplace.id}
                      style={[styles.scopeOption, { borderBottomColor: theme.border }]}
                      onPress={() =>
                        vm.setSelectedWorkplaceIds(
                          selected
                            ? vm.selectedWorkplaceIds.filter(id => id !== workplace.id)
                            : [...vm.selectedWorkplaceIds, workplace.id],
                        )
                      }
                    >
                      <AppText>{workplace.name}</AppText>
                      {selected && (
                        <AppIcon name={Icon.Check} size={Size.iconSm} color={theme.primary} />
                      )}
                    </TouchableOpacity>
                  );
                })}
                <AppButton
                  onPress={() => vm.setIsScopePickerVisible(false)}
                  disabled={vm.selectedWorkplaceIds.length === 0}
                  style={styles.scopeDone}
                >
                  Done
                </AppButton>
              </>
            )}
          </View>
        </View>
      </Modal>
    </Stack>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: withOpacity('#000000', Opacity.heavy),
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  modalCard: {
    width: '100%',
    borderRadius: 16,
    padding: Spacing.xl,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: Opacity.muted,
    shadowRadius: 8,
  },
  modalIconRow: {
    marginBottom: Spacing.md,
  },
  modalTitle: {
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  modalActionRow: {
    flexDirection: 'row',
    width: '100%',
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  scopeRow: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  scopeCopy: { flex: 1, gap: Spacing.xs },
  scopeOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scopeCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  scopeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  scopeOption: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  scopeDone: { marginTop: Spacing.lg },
});
