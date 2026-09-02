import { AppToggle } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import type { PrivacySettingsViewModel } from '@/src/features/settings/hooks/usePrivacySettingsViewModel';

interface PrivacySecuritySettingsViewProps {
  vm: PrivacySettingsViewModel;
}

export function PrivacySecuritySettingsView({ vm }: PrivacySecuritySettingsViewProps) {
  return (
    <SettingsLayout title={AppConfig.strings.settings.sections.privacyAndSecurity}>
      <SettingsMenu header={AppConfig.strings.settings.sections.protectFinancialDetails}>
        <SettingsMenuItem
          searchId="privacy-security"
          leftIcon="shield"
          title={AppConfig.strings.settings.privacy.title}
          description={AppConfig.strings.settings.privacy.description}
          hasArrow={false}
          rightContent={<AppToggle value={vm.isPrivacyMode} onValueChange={vm.onTogglePrivacy} />}
        />
        <SettingsMenuItem
          searchId="widget-privacy"
          leftIcon="eyeOff"
          title={AppConfig.strings.settings.privacy.widgetPrivacyTitle}
          description={AppConfig.strings.settings.privacy.widgetPrivacyDesc}
          hasArrow={false}
          rightContent={
            <AppToggle value={vm.isWidgetPrivacyEnabled} onValueChange={vm.onToggleWidgetPrivacy} />
          }
        />
        <SettingsMenuItem
          searchId="app-lock"
          leftIcon="lock"
          title={AppConfig.strings.settings.privacy.appLockTitle}
          description={AppConfig.strings.settings.privacy.appLockDesc}
          hasArrow={false}
          rightContent={
            <AppToggle value={vm.isAppLockEnabled} onValueChange={vm.onToggleAppLock} />
          }
          testID="settings-app-lock-toggle"
        />
      </SettingsMenu>
    </SettingsLayout>
  );
}
