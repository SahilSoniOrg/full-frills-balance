import { AppConfig } from '@/src/constants';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { SettingsMaintenanceOverlay } from '@/src/features/settings/components/SettingsMaintenanceOverlay';
import type { MaintenanceSettingsViewModel } from '@/src/features/settings/hooks/useMaintenanceSettingsViewModel';

interface MaintenanceSettingsViewProps {
  vm: MaintenanceSettingsViewModel;
}

export function MaintenanceSettingsView({ vm }: MaintenanceSettingsViewProps) {
  return (
    <SettingsLayout title={AppConfig.strings.settings.sections.maintenanceAndReset}>
      <SettingsMenu header={AppConfig.strings.settings.sections.maintenance}>
        <SettingsMenuItem
          searchId="integrity"
          leftIcon="search"
          title={AppConfig.strings.settings.maintenance.integrityBtn}
          description={AppConfig.strings.settings.maintenance.integrityDesc}
          onPress={vm.onFixIntegrity}
          loading={vm.isMaintenanceMode}
        />
        {__DEV__ && (
          <SettingsMenuItem
            searchId="seed-mock-data"
            leftIcon="database"
            title={AppConfig.strings.settings.maintenance.seedMockBtn}
            description={AppConfig.strings.settings.maintenance.seedMockDesc}
            onPress={vm.onSeedMockData}
            loading={vm.isSeeding}
          />
        )}
        <SettingsMenuItem
          searchId="cleanup"
          leftIcon="delete"
          title={AppConfig.strings.settings.danger.cleanupBtn}
          description={AppConfig.strings.settings.danger.cleanupDesc}
          onPress={vm.onCleanup}
          loading={vm.isCleaning}
        />
      </SettingsMenu>

      <SettingsMenu header={AppConfig.strings.settings.sections.dangerZone}>
        <SettingsMenuItem
          searchId="reset"
          leftIcon="alert"
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
        icon="search"
      />

      <SettingsMaintenanceOverlay
        isVisible={vm.isSeeding}
        title={AppConfig.strings.settings.maintenance.seedMockTitle}
        progress={vm.seedingProgress}
        progressMessage={
          vm.seedingProgressMessage || AppConfig.strings.settings.maintenance.seedMockWait
        }
        hint={AppConfig.strings.settings.maintenance.seedMockHint}
        icon="database"
      />
    </SettingsLayout>
  );
}
