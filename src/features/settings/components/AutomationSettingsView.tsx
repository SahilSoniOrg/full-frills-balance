import { AppConfig } from '@/src/constants';
import { Stack } from '@/src/design-system';
import { NotificationPreferenceView } from '@/src/features/settings/components/NotificationPreferenceView';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import type { NotificationSettingsViewModel } from '@/src/features/settings/hooks/useNotificationSettingsViewModel';
import { AppNavigation } from '@/src/utils/navigation';
import React from 'react';
import { Platform, Switch } from 'react-native';

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
              leftIcon="messageSquare"
              title={AppConfig.strings.settings.personalization.smsInboxTitle}
              description="Import transactions from SMS messages"
              hasArrow={false}
              rightContent={
                <Switch value={vm.isSmsImportEnabled} onValueChange={vm.setIsSmsImportEnabled} />
              }
            />
            {vm.isSmsImportEnabled && (
              <>
                <SettingsMenuItem
                  leftIcon="inbox"
                  title={AppConfig.strings.settings.personalization.smsInboxTitle}
                  description={AppConfig.strings.settings.personalization.smsInboxDesc}
                  onPress={AppNavigation.toSmsInbox}
                />
                <SettingsMenuItem
                  leftIcon="terminal"
                  title={AppConfig.strings.settings.personalization.smsAutoPostTitle}
                  description={AppConfig.strings.settings.personalization.smsAutoPostDesc}
                  onPress={AppNavigation.toSmsRules}
                />
              </>
            )}
          </SettingsMenu>
        )}
      </Stack>
    </SettingsLayout>
  );
}
