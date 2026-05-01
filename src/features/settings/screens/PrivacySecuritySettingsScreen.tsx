import { AppToggle } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig } from '@/src/constants';
import { Inset } from '@/src/design-system';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { useSettingsViewModel } from '@/src/features/settings/hooks/useSettingsViewModel';
import React from 'react';

export default function PrivacySecuritySettingsScreen() {
  const vm = useSettingsViewModel();

  return (
    <Screen title={AppConfig.strings.settings.sections.privacyAndSecurity} showBack scrollable>
      <Inset space="md" vertical="md">
        <SettingsMenu header={AppConfig.strings.settings.sections.protectFinancialDetails}>
          <SettingsMenuItem
            leftIcon="shield"
            title={AppConfig.strings.settings.privacy.title}
            description={AppConfig.strings.settings.privacy.description}
            hasArrow={false}
            rightContent={<AppToggle value={vm.isPrivacyMode} onValueChange={vm.onTogglePrivacy} />}
          />
          <SettingsMenuItem
            leftIcon="eyeOff"
            title={AppConfig.strings.settings.privacy.widgetPrivacyTitle}
            description={AppConfig.strings.settings.privacy.widgetPrivacyDesc}
            hasArrow={false}
            rightContent={
              <AppToggle
                value={vm.isWidgetPrivacyEnabled}
                onValueChange={vm.onToggleWidgetPrivacy}
              />
            }
          />
          <SettingsMenuItem
            leftIcon="lock"
            title={AppConfig.strings.settings.privacy.appLockTitle}
            description={AppConfig.strings.settings.privacy.appLockDesc}
            hasArrow={false}
            rightContent={
              <AppToggle value={vm.isAppLockEnabled} onValueChange={vm.onToggleAppLock} />
            }
          />
        </SettingsMenu>
      </Inset>
    </Screen>
  );
}
