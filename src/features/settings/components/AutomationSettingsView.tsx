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
  isSmsImportEnabled: boolean;
  onOpenInbox: () => void;
  onOpenSmsRules: () => void;
}

export function AutomationSettingsView({
  notifications,
  isSmsImportEnabled,
  onOpenInbox,
  onOpenSmsRules,
}: AutomationSettingsViewProps) {
  const title =
    Platform.OS === 'android'
      ? AppConfig.strings.settings.notifications.automationTitle
      : AppConfig.strings.settings.notifications.title;

  return (
    <SettingsLayout title={title}>
      <Stack space="xl">
        <NotificationPreferenceView
          cadence={notifications.notificationCadence}
          hour={notifications.notificationHour}
          minute={notifications.notificationMinute}
          weekday={notifications.notificationWeekday}
          onUpdateCadence={notifications.onUpdateNotificationCadence}
          onUpdateTime={notifications.onUpdateNotificationTime}
          onSendTest={notifications.onSendTestNotification}
        />

        {Platform.OS === 'android' && (
          <SettingsMenu header={AppConfig.strings.settings.personalization.smsAutomationHeader}>
            <SettingsMenuItem
              searchId="sms-inbox"
              leftIcon="messageSquare"
              title={AppConfig.strings.settings.personalization.smsInboxTitle}
              description={AppConfig.strings.settings.personalization.smsInboxDesc}
              onPress={onOpenInbox}
              testID="settings-sms-inbox"
            />
            {isSmsImportEnabled && (
              <>
                <SettingsMenuItem
                  searchId="sms-rules"
                  leftIcon="terminal"
                  title={AppConfig.strings.settings.personalization.smsAutoPostTitle}
                  description={AppConfig.strings.settings.personalization.smsAutoPostDesc}
                  onPress={onOpenSmsRules}
                />
              </>
            )}
          </SettingsMenu>
        )}
      </Stack>
    </SettingsLayout>
  );
}
