import { PreferencesSettingsView } from '@/src/features/settings/components/PreferencesSettingsView';
import { AppNavigation } from '@/src/utils/navigation';

export default function PreferencesSettingsScreen() {
  return (
    <PreferencesSettingsView
      onAppearance={AppNavigation.toAppearanceSettings}
      onAutomation={AppNavigation.toAutomationSettings}
      onPrivacy={AppNavigation.toPrivacySecuritySettings}
    />
  );
}
