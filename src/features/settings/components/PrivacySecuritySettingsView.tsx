import { AppConfig } from '@/src/constants';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsToggleItem } from '@/src/features/settings/components/SettingsToggleItem';
import type { PrivacySettingsViewModel } from '@/src/features/settings/hooks/usePrivacySettingsViewModel';

interface PrivacySecuritySettingsViewProps {
  vm: PrivacySettingsViewModel;
}

export function PrivacySecuritySettingsView({ vm }: PrivacySecuritySettingsViewProps) {
  return (
    <SettingsLayout title={AppConfig.strings.settings.sections.privacyAndSecurity}>
      <SettingsMenu header={AppConfig.strings.settings.sections.protectFinancialDetails}>
        <SettingsToggleItem
          searchId="privacy-security"
          leftIcon="shield"
          title={AppConfig.strings.settings.privacy.title}
          description={AppConfig.strings.settings.privacy.description}
          value={vm.isPrivacyMode}
          onValueChange={vm.onTogglePrivacy}
        />
        <SettingsToggleItem
          searchId="widget-privacy"
          leftIcon="eyeOff"
          title={AppConfig.strings.settings.privacy.widgetPrivacyTitle}
          description={AppConfig.strings.settings.privacy.widgetPrivacyDesc}
          value={vm.isWidgetPrivacyEnabled}
          onValueChange={vm.onToggleWidgetPrivacy}
        />
        <SettingsToggleItem
          searchId="app-lock"
          leftIcon="lock"
          title={AppConfig.strings.settings.privacy.appLockTitle}
          description={AppConfig.strings.settings.privacy.appLockDesc}
          value={vm.isAppLockEnabled}
          onValueChange={vm.onToggleAppLock}
          testID="settings-app-lock-toggle"
        />
      </SettingsMenu>
    </SettingsLayout>
  );
}
