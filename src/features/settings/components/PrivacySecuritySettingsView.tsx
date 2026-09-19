import { AppText } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { Box, Stack } from '@/src/design-system';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsToggleItem } from '@/src/features/settings/components/SettingsToggleItem';
import type { PrivacySettingsViewModel } from '@/src/features/settings/hooks/usePrivacySettingsViewModel';
import { Icon } from '@/src/types/domainIcons';

interface PrivacySecuritySettingsViewProps {
  vm: PrivacySettingsViewModel;
}

export function PrivacySecuritySettingsView({ vm }: PrivacySecuritySettingsViewProps) {
  return (
    <SettingsLayout title={AppConfig.strings.settings.sections.privacyAndSecurity}>
      <SettingsMenu header={AppConfig.strings.settings.sections.protectFinancialDetails}>
        <SettingsToggleItem
          searchId="privacy-security"
          leftIcon={Icon.Shield}
          title={AppConfig.strings.settings.privacy.title}
          description={AppConfig.strings.settings.privacy.description}
          value={vm.isPrivacyMode}
          onValueChange={vm.onTogglePrivacy}
        />
        <SettingsToggleItem
          searchId="widget-privacy"
          leftIcon={Icon.EyeOff}
          title={AppConfig.strings.settings.privacy.widgetPrivacyTitle}
          description={AppConfig.strings.settings.privacy.widgetPrivacyDesc}
          value={vm.isWidgetPrivacyEnabled}
          onValueChange={vm.onToggleWidgetPrivacy}
        />
        <SettingsToggleItem
          searchId="app-lock"
          leftIcon={Icon.Lock}
          title={AppConfig.strings.settings.privacy.appLockTitle}
          description={AppConfig.strings.settings.privacy.appLockDesc}
          value={vm.isAppLockEnabled}
          onValueChange={vm.onToggleAppLock}
          testID="settings-app-lock-toggle"
        />
      </SettingsMenu>
      <SettingsMenu header="AI Providers" focusId="typesafe-ai">
        <Box padding="md">
          <Stack space="sm">
            <AppText variant="body" weight="semibold">
              TypeSafe · Server-managed
            </AppText>
            <AppText variant="caption" color="secondary">
              TypeSafe transaction parsing is managed by the app backend. No API key is stored in or
              sent from this device.
            </AppText>
            <AppText variant="caption" color="error">
              Requests include the transcript and candidate account/category names. Use only a
              backend you control and configure its TypeSafe key as a server secret.
            </AppText>
          </Stack>
        </Box>
      </SettingsMenu>
    </SettingsLayout>
  );
}
