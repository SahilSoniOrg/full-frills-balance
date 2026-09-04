import { AppButton, AppIcon, AppInput, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Size, Spacing, withOpacity } from '@/src/constants';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { SettingsFocusTarget } from '@/src/features/settings/components/SettingsFocusTarget';
import { ShareFormatPreferenceView } from '@/src/features/settings/components/ShareFormatPreferenceView';
import { SettingsMaintenanceOverlay } from '@/src/features/settings/components/SettingsMaintenanceOverlay';
import type { DataManagementViewModel } from '@/src/features/settings/hooks/useDataManagementViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import type { BackupScope } from '@/src/services/export';

interface DataManagementSettingsViewProps {
  vm: DataManagementViewModel;
}

export function DataManagementSettingsView({ vm }: DataManagementSettingsViewProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    isExporting,
    onExport,
    onConfirmExport,
    onImport,
    onAuditLog,
    isNamingExport,
    setIsNamingExport,
    exportFilename,
    setExportFilename,
    exportProgress,
    exportProgressMessage,
    defaultShareFormat,
    setDefaultShareFormat,
    workplaces,
    activeWorkplaceId,
    backupScope,
    selectedWorkplaceIds,
    setBackupScope,
    setSelectedWorkplaceIds,
    isScopePickerVisible,
    setIsScopePickerVisible,
  } = vm;
  const scopeLabel =
    backupScope === 'active'
      ? AppConfig.strings.update.exportScopeActive
      : backupScope === 'all'
        ? AppConfig.strings.update.exportScopeAll
        : AppConfig.strings.update.exportScopeSelected;

  return (
    <SettingsLayout title={AppConfig.strings.settings.sections.dataManagement}>
      <SettingsMenu header={AppConfig.strings.settings.data.backupRestoreHeader}>
        <SettingsMenuItem
          searchId="data-export"
          testID="data-export"
          leftIcon="document"
          title={AppConfig.strings.settings.data.exportBtn}
          description={AppConfig.strings.settings.data.exportDesc}
          onPress={onExport}
          loading={isExporting}
        />
        <SettingsFocusTarget targetId="share-format">
          <ShareFormatPreferenceView value={defaultShareFormat} onChange={setDefaultShareFormat} />
        </SettingsFocusTarget>
        <SettingsFocusTarget targetId="data-import">
          <SettingsMenuItem
            searchId="data-import"
            testID="data-import"
            leftIcon="refresh"
            title={AppConfig.strings.settings.data.importBtn}
            description={AppConfig.strings.settings.data.importDesc}
            onPress={onImport}
          />
        </SettingsFocusTarget>
      </SettingsMenu>

      <SettingsMenu header={AppConfig.strings.settings.data.sharingReviewHeader}>
        <SettingsMenuItem
          searchId="audit-log"
          leftIcon="history"
          title={AppConfig.strings.settings.data.auditBtn}
          description={AppConfig.strings.settings.data.auditDesc}
          onPress={onAuditLog}
        />
      </SettingsMenu>

      <SettingsMaintenanceOverlay
        isVisible={isExporting}
        title={AppConfig.strings.settings.data.exportingTitle}
        progress={exportProgress}
        progressMessage={exportProgressMessage || AppConfig.strings.settings.data.exportingWait}
        hint={AppConfig.strings.settings.data.exportingHint}
      />

      {/* Export Naming Modal */}
      <Modal
        visible={isNamingExport && !isExporting && !isScopePickerVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
            <View style={styles.modalIconRow}>
              <AppIcon name="document" size={40} color={theme.primary} />
            </View>

            <AppText variant="subheading" style={styles.modalTitle}>
              {AppConfig.strings.settings.data.exportFilenameLabel}
            </AppText>

            <AppInput
              label={AppConfig.strings.settings.data.exportFilenameLabel}
              placeholder={AppConfig.strings.settings.data.exportFilenamePlaceholder}
              value={exportFilename}
              onChangeText={setExportFilename}
              containerStyle={{ width: '100%', marginBottom: Spacing.xl }}
              leftIcon="document"
              autoFocus
            />

            <TouchableOpacity
              style={[styles.scopeRow, { borderColor: theme.border }]}
              onPress={() => setIsScopePickerVisible(true)}
              testID="data-export-scope"
            >
              <View style={styles.scopeCopy}>
                <AppText variant="caption" color="secondary">
                  {AppConfig.strings.update.exportScopeTitle}
                </AppText>
                <AppText weight="semibold">{scopeLabel}</AppText>
              </View>
              <AppIcon name="chevronRight" size={Size.iconSm} color={theme.textSecondary} />
            </TouchableOpacity>

            <View style={styles.modalActionRow}>
              <AppButton
                variant="outline"
                onPress={() => setIsNamingExport(false)}
                style={{ flex: 1, marginRight: Spacing.sm }}
              >
                {AppConfig.strings.common.cancel}
              </AppButton>
              <AppButton
                variant="primary"
                onPress={onConfirmExport}
                loading={isExporting}
                style={{ flex: 2 }}
              >
                {AppConfig.strings.settings.data.exportBtn}
              </AppButton>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isScopePickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsScopePickerVisible(false)}
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
              <TouchableOpacity onPress={() => setIsScopePickerVisible(false)}>
                <AppIcon name="close" size={Size.iconMd} color={theme.text} />
              </TouchableOpacity>
            </View>
            {(['active', 'all', 'selected'] as BackupScope[]).map(scope => {
              const selected = backupScope === scope;
              const label =
                scope === 'active'
                  ? AppConfig.strings.update.exportScopeActive
                  : scope === 'all'
                    ? AppConfig.strings.update.exportScopeAll
                    : AppConfig.strings.update.exportScopeSelected;
              const description =
                scope === 'active'
                  ? workplaces.find(item => item.id === activeWorkplaceId)?.name
                  : scope === 'all'
                    ? `${workplaces.length} workplaces`
                    : AppConfig.strings.update.exportScopeSelectedCount(
                        selectedWorkplaceIds.length,
                      );
              return (
                <TouchableOpacity
                  key={scope}
                  style={[styles.scopeOption, { borderBottomColor: theme.border }]}
                  onPress={() => {
                    setBackupScope(scope);
                    if (scope !== 'selected') setIsScopePickerVisible(false);
                  }}
                >
                  <View style={styles.scopeCopy}>
                    <AppText weight={selected ? 'bold' : 'medium'}>{label}</AppText>
                    <AppText variant="caption" color="secondary">
                      {description}
                    </AppText>
                  </View>
                  {selected && (
                    <AppIcon name="checkCircle" size={Size.iconSm} color={theme.primary} />
                  )}
                </TouchableOpacity>
              );
            })}
            {backupScope === 'selected' && (
              <>
                {workplaces.map(workplace => {
                  const selected = selectedWorkplaceIds.includes(workplace.id);
                  return (
                    <TouchableOpacity
                      key={workplace.id}
                      style={[styles.scopeOption, { borderBottomColor: theme.border }]}
                      onPress={() =>
                        setSelectedWorkplaceIds(
                          selected
                            ? selectedWorkplaceIds.filter(id => id !== workplace.id)
                            : [...selectedWorkplaceIds, workplace.id],
                        )
                      }
                    >
                      <AppText>{workplace.name}</AppText>
                      {selected && (
                        <AppIcon name="check" size={Size.iconSm} color={theme.primary} />
                      )}
                    </TouchableOpacity>
                  );
                })}
                <AppButton
                  onPress={() => setIsScopePickerVisible(false)}
                  disabled={selectedWorkplaceIds.length === 0}
                  style={styles.scopeDone}
                >
                  Done
                </AppButton>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SettingsLayout>
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
