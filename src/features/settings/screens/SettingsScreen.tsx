import { SettingsView } from '@/src/features/settings/components/SettingsView';
import { AppNavigation } from '@/src/utils/navigation';

export default function SettingsScreen() {
  return (
    <SettingsView
      onProfile={AppNavigation.toPersonalizationSettings}
      onAppearance={AppNavigation.toAppearanceSettings}
      onAutomation={AppNavigation.toAutomationSettings}
      onPrivacy={AppNavigation.toPrivacySecuritySettings}
      onCurrentWorkplace={AppNavigation.toCurrentWorkplaceSettings}
      onDataManagement={AppNavigation.toDataManagementSettings}
      onMaintenance={AppNavigation.toMaintenanceSettings}
      onAbout={AppNavigation.toAboutSupportSettings}
      onDeviceSettings={AppNavigation.toDeviceSettings}
    />
  );
}
