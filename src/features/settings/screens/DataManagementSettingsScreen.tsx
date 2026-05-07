import { ProgressBar } from '@/src/components/common/ProgressBar';
import { AppButton, AppIcon, AppInput, AppText } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig, Opacity, Spacing, withOpacity } from '@/src/constants';
import { Inset, Stack } from '@/src/design-system';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { ShareFormatPreference } from '@/src/features/settings/components/ShareFormatPreference';
import { useSettingsViewModel } from '@/src/features/settings/hooks/useSettingsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { Modal, StyleSheet, View } from 'react-native';

export default function DataManagementSettingsScreen() {
  const vm = useSettingsViewModel();
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
  } = vm;

  return (
    <Screen title={AppConfig.strings.settings.sections.dataManagement} showBack={true} scrollable>
      <Inset space="md" vertical="md">
        <Stack space="xl">
          <SettingsMenu header={AppConfig.strings.settings.data.backupRestoreHeader}>
            <SettingsMenuItem
              leftIcon="document"
              title={AppConfig.strings.settings.data.exportBtn}
              description={AppConfig.strings.settings.data.exportDesc}
              onPress={onExport}
              loading={isExporting}
            />
            <ShareFormatPreference />
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
        </Stack>
      </Inset>

      {/* Exporting Data Loader */}
      <Modal visible={isExporting} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
            <View style={styles.modalIconRow}>
              <AppIcon name="document" size={40} color={theme.primary} />
            </View>
            <AppText variant="subheading" style={styles.modalTitle}>
              {AppConfig.strings.settings.data.exportingTitle}
            </AppText>
            <View style={styles.spinnerContainer}>
              <ProgressBar
                progress={exportProgress}
                label={exportProgressMessage || AppConfig.strings.settings.data.exportingWait}
                style={styles.progressBar}
              />
            </View>
            <AppText variant="caption" color="secondary" style={styles.modalHint}>
              {AppConfig.strings.settings.data.exportingHint}
            </AppText>
          </View>
        </View>
      </Modal>

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
    </Screen>
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
  modalStatus: {
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  modalHint: {
    textAlign: 'center',
    opacity: Opacity.medium,
    marginTop: Spacing.md,
  },
  modalActionRow: {
    flexDirection: 'row',
    width: '100%',
    alignItems: 'center',
  },
  spinnerContainer: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
    width: '100%',
  },
  progressBar: {
    width: '100%',
  },
});
