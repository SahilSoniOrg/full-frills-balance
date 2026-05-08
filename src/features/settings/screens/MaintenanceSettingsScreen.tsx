import { ProgressBar } from '@/src/components/common/ProgressBar';
import { AppIcon, AppText } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig, Opacity, Spacing, withOpacity } from '@/src/constants';
import { Inset, Stack } from '@/src/design-system';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { useSettingsViewModel } from '@/src/features/settings/hooks/useSettingsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { Modal, StyleSheet, View } from 'react-native';

export default function MaintenanceSettingsScreen() {
  const vm = useSettingsViewModel();
  const { theme } = useTheme();

  return (
    <Screen title={AppConfig.strings.settings.sections.maintenanceAndReset} showBack scrollable>
      <Inset space="md" vertical="md">
        <Stack space="xl">
          <SettingsMenu header={AppConfig.strings.settings.sections.maintenance}>
            <SettingsMenuItem
              leftIcon="search"
              title={AppConfig.strings.settings.maintenance.integrityBtn}
              description={AppConfig.strings.settings.maintenance.integrityDesc}
              onPress={vm.onFixIntegrity}
              loading={vm.isMaintenanceMode}
            />
            <SettingsMenuItem
              leftIcon="delete"
              title={AppConfig.strings.settings.danger.cleanupBtn}
              description={AppConfig.strings.settings.danger.cleanupDesc}
              onPress={vm.onCleanup}
              loading={vm.isCleaning}
            />
          </SettingsMenu>

          <SettingsMenu header={AppConfig.strings.settings.sections.dangerZone}>
            <SettingsMenuItem
              leftIcon="alert"
              title={AppConfig.strings.settings.danger.resetBtn}
              description={AppConfig.strings.settings.danger.resetDesc}
              onPress={vm.onFactoryReset}
              loading={vm.isResetting}
              danger
            />
          </SettingsMenu>
        </Stack>
      </Inset>

      <Modal visible={vm.isMaintenanceMode} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
            <View style={styles.modalIconRow}>
              <AppIcon name="search" size={40} color={theme.primary} />
            </View>

            <AppText variant="subheading" style={styles.modalTitle}>
              {AppConfig.strings.settings.maintenance.integrityTitle}
            </AppText>

            <ProgressBar
              progress={vm.integrityProgress}
              label={
                vm.integrityProgressMessage || AppConfig.strings.settings.maintenance.integrityWait
              }
            />

            <AppText variant="caption" color="secondary" style={styles.modalHint}>
              {AppConfig.strings.settings.maintenance.integrityHint}
            </AppText>
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
});
