import { AppToggle } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { Stack } from '@/src/design-system';
import { NotificationPreferenceView } from '@/src/features/settings/components/NotificationPreferenceView';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import type { NotificationSettingsViewModel } from '@/src/features/settings/hooks/useNotificationSettingsViewModel';
import { Platform } from 'react-native';

interface AutomationSettingsViewProps {
  vm: NotificationSettingsViewModel;
}

export function AutomationSettingsView({ vm }: AutomationSettingsViewProps) {
  return (
    <SettingsLayout title={AppConfig.strings.settings.sections.remindersAndAutomation}>
      <Stack space="xl">
        <SettingsMenu header={AppConfig.strings.settings.notifications.title} hideSeparator>
          <SettingsMenuItem
            leftIcon="notifications"
            title={AppConfig.strings.settings.notifications.title}
            description={AppConfig.strings.settings.notifications.description}
            hasArrow={false}
          />
          <NotificationPreferenceView
            cadence={vm.notificationCadence}
            hour={vm.notificationHour}
            minute={vm.notificationMinute}
            weekday={vm.notificationWeekday}
            onUpdateCadence={vm.onUpdateNotificationCadence}
            onUpdateTime={vm.onUpdateNotificationTime}
            onSendTest={vm.onSendTestNotification}
          />
        </SettingsMenu>

        {Platform.OS === 'android' && (
          <SettingsMenu header={AppConfig.strings.settings.personalization.smsAutomationHeader}>
            <SettingsMenuItem
              leftIcon="zap"
              title={AppConfig.strings.settings.personalization.smsImportTitle}
              description="Automatically scan for transaction messages"
              hasArrow={false}
              rightContent={
                <AppToggle value={vm.isSmsImportEnabled} onValueChange={vm.setIsSmsImportEnabled} />
              }
            />
            <SettingsMenuItem
              leftIcon="messageSquare"
              title={AppConfig.strings.settings.personalization.smsInboxTitle}
              description={AppConfig.strings.settings.personalization.smsInboxDesc}
              onPress={vm.onOpenInbox}
              testID="settings-sms-inbox"
            />
            {vm.isSmsImportEnabled && (
              <>
                <SettingsMenuItem
                  leftIcon="terminal"
                  title={AppConfig.strings.settings.personalization.smsAutoPostTitle}
                  description={AppConfig.strings.settings.personalization.smsAutoPostDesc}
                  onPress={vm.onOpenSmsRules}
                />
              </>
            )}
          </SettingsMenu>
        )}
      </Stack>
    </SettingsLayout>
  );
}
