import { SettingsView } from '@/src/features/settings/components/SettingsView';
import { AppNavigation } from '@/src/utils/navigation';

export default function SettingsScreen() {
  return (
    <SettingsView
      onPersonalization={AppNavigation.toPersonalizationSettings}
      onWorkplace={AppNavigation.toWorkplaceSettings}
      onAppearance={AppNavigation.toAppearanceSettings}
      onAutomation={AppNavigation.toAutomationSettings}
      onPrivacy={AppNavigation.toPrivacySecuritySettings}
      onDataManagement={AppNavigation.toDataManagementSettings}
      onMaintenance={AppNavigation.toMaintenanceSettings}
      onAbout={AppNavigation.toAboutSupportSettings}
    />
  );
}
