import type { ScreenNavChrome } from '@/src/components/layout';
import { AppButton, AppIcon, AppInput, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Spacing, withOpacity } from '@/src/constants';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { ShareFormatPreferenceView } from '@/src/features/settings/components/ShareFormatPreferenceView';
import { SettingsMaintenanceOverlay } from '@/src/features/settings/components/SettingsMaintenanceOverlay';
import type { DataManagementViewModel } from '@/src/features/settings/hooks/useDataManagementViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { Modal, StyleSheet, View } from 'react-native';

interface DataManagementSettingsViewProps {
  chrome: ScreenNavChrome;
  vm: DataManagementViewModel;
}

export function DataManagementSettingsView({ vm, chrome }: DataManagementSettingsViewProps) {
  const { theme } = useTheme();
  const {
    isExporting,
    isImporting,
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
  } = vm;

  return (
    <SettingsLayout chrome={chrome}>
      <SettingsMenu header={AppConfig.strings.settings.data.backupRestoreHeader}>
        <SettingsMenuItem
          leftIcon="document"
          title={AppConfig.strings.settings.data.exportBtn}
          description={AppConfig.strings.settings.data.exportDesc}
          onPress={onExport}
          loading={isExporting}
        />
        <ShareFormatPreferenceView value={defaultShareFormat} onChange={setDefaultShareFormat} />
        <SettingsMenuItem
          leftIcon="refresh"
          title={AppConfig.strings.settings.data.importBtn}
          description={AppConfig.strings.settings.data.importDesc}
          onPress={onImport}
          loading={isImporting}
        />
      </SettingsMenu>

      <SettingsMenu header={AppConfig.strings.settings.data.sharingReviewHeader}>
        <SettingsMenuItem
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
        visible={isNamingExport && !isExporting}
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
  },
});
