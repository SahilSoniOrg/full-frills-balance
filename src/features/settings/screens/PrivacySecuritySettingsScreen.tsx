import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { PrivacySecuritySettingsView } from '@/src/features/settings/components/PrivacySecuritySettingsView';
import { usePrivacySettingsViewModel } from '@/src/features/settings/hooks/usePrivacySettingsViewModel';
import { AppConfig } from '@/src/constants';

export default function PrivacySecuritySettingsScreen() {
  const vm = usePrivacySettingsViewModel();

  const chrome: ScreenNavChrome = {
    screenTitle: AppConfig.strings.settings.sections.privacyAndSecurity,
    showBack: true,
    backIcon: 'back',
  };

  return <PrivacySecuritySettingsView vm={vm} chrome={chrome} />;
}
