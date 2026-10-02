import { Icon } from '@/src/types/domainIcons';
import { AppConfig } from '@/src/constants';
import { Stack } from '@/src/design-system';
import { NotificationPreferenceView } from '@/src/features/settings/components/NotificationPreferenceView';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import type { NotificationSettingsViewModel } from '@/src/features/settings/hooks/useNotificationSettingsViewModel';
import { Platform } from 'react-native';

interface AutomationSettingsViewProps {
  notifications: NotificationSettingsViewModel;
  onOpenSmsSettings: () => void;
}

export function AutomationSettingsView({
  notifications,
  onOpenSmsSettings,
}: AutomationSettingsViewProps) {
  const title =
    Platform.OS === 'android'
      ? AppConfig.strings.settings.notifications.automationTitle
      : AppConfig.strings.settings.notifications.title;

  return (
    <SettingsLayout title={title}>
      <Stack space="xl">
        {Platform.OS === 'android' && (
          <SettingsMenu header={AppConfig.strings.settings.personalization.smsAutomationHeader}>
            <SettingsMenuItem
              searchId="sms-settings"
              leftIcon={Icon.MessageSquare}
              title={AppConfig.strings.settings.personalization.smsSettingsTitle}
              description={AppConfig.strings.settings.personalization.smsSettingsDesc}
              onPress={onOpenSmsSettings}
              testID="settings-sms-settings"
            />
          </SettingsMenu>
        )}

        <NotificationPreferenceView
          cadence={notifications.notificationCadence}
          hour={notifications.notificationHour}
          minute={notifications.notificationMinute}
          weekday={notifications.notificationWeekday}
          onUpdateCadence={notifications.onUpdateNotificationCadence}
          onUpdateTime={notifications.onUpdateNotificationTime}
          onSendTest={notifications.onSendTestNotification}
        />
      </Stack>
    </SettingsLayout>
  );
}
