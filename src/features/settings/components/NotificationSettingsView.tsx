import { AppConfig } from '@/src/constants';
import { NotificationPreferenceView } from '@/src/features/settings/components/NotificationPreferenceView';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { useNotificationSettingsViewModel } from '@/src/features/settings/hooks/useNotificationSettingsViewModel';

export function NotificationSettingsView() {
  const notifications = useNotificationSettingsViewModel();

  return (
    <SettingsLayout title={AppConfig.strings.settings.notifications.pageTitle}>
      <NotificationPreferenceView
        cadence={notifications.notificationCadence}
        hour={notifications.notificationHour}
        minute={notifications.notificationMinute}
        weekday={notifications.notificationWeekday}
        onUpdateCadence={notifications.onUpdateNotificationCadence}
        onUpdateTime={notifications.onUpdateNotificationTime}
        onSendTest={notifications.onSendTestNotification}
      />
    </SettingsLayout>
  );
}

export default NotificationSettingsView;
