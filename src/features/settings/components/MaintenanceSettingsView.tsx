import { Icon } from '@/src/types/domainIcons';
import { AppConfig, Spacing } from '@/src/constants';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { SettingsMaintenanceOverlay } from '@/src/features/settings/components/SettingsMaintenanceOverlay';
import type { MaintenanceSettingsViewModel } from '@/src/features/settings/hooks/useMaintenanceSettingsViewModel';
import { AppText, PressScaleTouchable } from '@/src/components/core';
import { useTheme } from '@/src/hooks/use-theme';
import { ScrollView, StyleSheet, View } from 'react-native';

interface MaintenanceSettingsViewProps {
  vm: MaintenanceSettingsViewModel;
}

export function MaintenanceSettingsView({ vm }: MaintenanceSettingsViewProps) {
  const { theme } = useTheme();

  return (
    <SettingsLayout title={AppConfig.strings.settings.sections.maintenanceAndReset}>
      <SettingsMenu header={AppConfig.strings.settings.sections.maintenance}>
        <SettingsMenuItem
          searchId="integrity"
          leftIcon={Icon.Search}
          title={AppConfig.strings.settings.maintenance.integrityBtn}
          description={AppConfig.strings.settings.maintenance.integrityDesc}
          onPress={vm.onFixIntegrity}
          loading={vm.isMaintenanceMode}
        />
        <SettingsMenuItem
          searchId="journal-balance-audit"
          leftIcon={Icon.Scale}
          title={AppConfig.strings.settings.maintenance.balanceAuditBtn}
          description={AppConfig.strings.settings.maintenance.balanceAuditDesc}
          onPress={vm.onAuditJournalBalances}
          loading={vm.isAuditingBalances}
        />
        <SettingsMenuItem
          searchId="balance-diagnostics"
          leftIcon={Icon.Database}
          title="Balance diagnostics"
          description="Compare saved balances, live net worth, snapshots, and rebuild queue state."
          onPress={vm.onCreateBalanceDiagnostics}
          loading={vm.isLoadingBalanceDiagnostics}
        />
        {__DEV__ && (
          <SettingsMenuItem
            searchId="seed-mock-data"
            leftIcon={Icon.Database}
            title={AppConfig.strings.settings.maintenance.seedMockBtn}
            description={AppConfig.strings.settings.maintenance.seedMockDesc}
            onPress={vm.onSeedMockData}
            loading={vm.isSeeding}
          />
        )}
        <SettingsMenuItem
          searchId="cleanup"
          leftIcon={Icon.Delete}
          title={AppConfig.strings.settings.danger.cleanupBtn}
          description={AppConfig.strings.settings.danger.cleanupDesc}
          onPress={vm.onCleanup}
          loading={vm.isCleaning}
        />
      </SettingsMenu>

      {vm.balanceDiagnostics && (
        <View
          style={[
            styles.diagnosticsCard,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <AppText variant="subheading" weight="semibold">
            Balance diagnostics report
          </AppText>
          <AppText variant="caption" color="secondary">
            Read-only local data. Share only if you choose to send this report.
          </AppText>
          <ScrollView
            nestedScrollEnabled
            style={[styles.diagnosticsOutput, { backgroundColor: theme.surfaceSecondary }]}
          >
            <AppText selectable variant="caption" style={styles.diagnosticsText}>
              {vm.balanceDiagnostics}
            </AppText>
          </ScrollView>
          <View style={styles.diagnosticsActions}>
            <PressScaleTouchable onPress={vm.onShareBalanceDiagnostics}>
              <AppText color="primary" weight="semibold">
                Share report
              </AppText>
            </PressScaleTouchable>
            <PressScaleTouchable onPress={vm.onDismissBalanceDiagnostics}>
              <AppText color="secondary" weight="semibold">
                Close
              </AppText>
            </PressScaleTouchable>
          </View>
        </View>
      )}

      <SettingsMenu header={AppConfig.strings.settings.sections.dangerZone}>
        <SettingsMenuItem
          searchId="reset"
          leftIcon={Icon.Alert}
          title={AppConfig.strings.settings.danger.resetBtn}
          description={AppConfig.strings.settings.danger.resetDesc}
          onPress={vm.onFactoryReset}
          loading={vm.isResetting}
          testID="factory-reset-button"
          danger
        />
      </SettingsMenu>

      <SettingsMaintenanceOverlay
        isVisible={vm.isMaintenanceMode}
        title={AppConfig.strings.settings.maintenance.integrityTitle}
        progress={vm.integrityProgress}
        progressMessage={
          vm.integrityProgressMessage || AppConfig.strings.settings.maintenance.integrityWait
        }
        hint={AppConfig.strings.settings.maintenance.integrityHint}
        icon={Icon.Search}
      />

      <SettingsMaintenanceOverlay
        isVisible={vm.isSeeding}
        title={AppConfig.strings.settings.maintenance.seedMockTitle}
        progress={vm.seedingProgress}
        progressMessage={
          vm.seedingProgressMessage || AppConfig.strings.settings.maintenance.seedMockWait
        }
        hint={AppConfig.strings.settings.maintenance.seedMockHint}
        icon={Icon.Database}
      />
    </SettingsLayout>
  );
}

const styles = StyleSheet.create({
  diagnosticsCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  diagnosticsOutput: {
    maxHeight: 320,
    borderRadius: 8,
    padding: Spacing.sm,
  },
  diagnosticsText: {
    fontFamily: 'monospace',
  },
  diagnosticsActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: Spacing.xs,
  },
});
