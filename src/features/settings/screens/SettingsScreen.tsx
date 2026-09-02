import { SettingsView } from '@/src/features/settings/components/SettingsView';
import { AppNavigation } from '@/src/utils/navigation';

export default function SettingsScreen() {
  return (
    <SettingsView
      onPreferences={AppNavigation.toPreferencesSettings}
      onProfile={AppNavigation.toPersonalizationSettings}
      onCurrentWorkplace={AppNavigation.toCurrentWorkplaceSettings}
      onDataManagement={AppNavigation.toDataManagementSettings}
      onMaintenance={AppNavigation.toMaintenanceSettings}
      onAbout={AppNavigation.toAboutSupportSettings}
    />
  );
}
