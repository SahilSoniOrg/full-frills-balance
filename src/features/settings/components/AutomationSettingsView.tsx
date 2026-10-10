import { ListGroup, ListRow } from '@/src/components/core';
import { Icon } from '@/src/types/domainIcons';
import { AppConfig } from '@/src/constants';
import { Stack } from '@/src/design-system';
import { NotificationPreferenceView } from '@/src/features/settings/components/NotificationPreferenceView';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import {
  useNotificationSettingsViewModel,
  type NotificationSettingsViewModel,
} from '@/src/features/settings/hooks/useNotificationSettingsViewModel';
import { AppNavigation } from '@/src/utils/navigation';
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
          <ListGroup
            variant="plain"
            header={AppConfig.strings.settings.personalization.smsAutomationHeader}
          >
            <ListRow
              focusId="sms-settings"
              icon={Icon.MessageSquare}
              title={AppConfig.strings.settings.personalization.smsSettingsTitle}
              subtitle={AppConfig.strings.settings.personalization.smsSettingsDesc}
              onPress={onOpenSmsSettings}
              testID="settings-sms-settings"
            />
          </ListGroup>
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

export default function AutomationSettingsScreen() {
  const notifications = useNotificationSettingsViewModel();
  return (
    <AutomationSettingsView
      notifications={notifications}
      onOpenSmsSettings={AppNavigation.toSmsSettings}
    />
  );
}
