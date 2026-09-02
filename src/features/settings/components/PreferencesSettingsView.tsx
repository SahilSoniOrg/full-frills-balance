import { Stack } from '@/src/design-system';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { AppConfig } from '@/src/constants';
import { Platform } from 'react-native';

interface PreferencesSettingsViewProps {
  onAppearance: () => void;
  onAutomation: () => void;
  onPrivacy: () => void;
}

export function PreferencesSettingsView({
  onAppearance,
  onAutomation,
  onPrivacy,
}: PreferencesSettingsViewProps) {
  const notificationTitle =
    Platform.OS === 'android'
      ? AppConfig.strings.settings.sections.remindersAndAutomation
      : AppConfig.strings.settings.notifications.title;
  const notificationDescription =
    Platform.OS === 'android'
      ? 'Reminders, SMS inbox, and auto-post rules'
      : 'Scheduled reminders to review recent activity';

  return (
    <SettingsLayout title="Preferences">
      <Stack space="xl">
        <SettingsMenu header="Preferences">
          <SettingsMenuItem
            leftIcon="notifications"
            title={notificationTitle}
            description={notificationDescription}
            onPress={onAutomation}
            testID="settings-automation"
          />
          <SettingsMenuItem
            leftIcon="palette"
            title={AppConfig.strings.settings.sections.appearance}
            description="Theme, typography, time, and display options"
            onPress={onAppearance}
            testID="settings-appearance"
          />
          <SettingsMenuItem
            leftIcon="shieldCheck"
            title={AppConfig.strings.settings.sections.privacyAndSecurity}
            description="Hide balances, protect widgets, and lock the app"
            onPress={onPrivacy}
            testID="settings-privacy-security"
          />
        </SettingsMenu>
      </Stack>
    </SettingsLayout>
  );
}
