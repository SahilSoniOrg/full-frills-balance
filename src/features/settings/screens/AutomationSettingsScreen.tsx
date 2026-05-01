import { Screen } from '@/src/components/layout';
import { AppConfig } from '@/src/constants';
import { Inset, Stack } from '@/src/design-system';
import { NotificationPreference } from '@/src/features/settings/components/NotificationPreference';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { useSettingsViewModel } from '@/src/features/settings/hooks/useSettingsViewModel';
import React from 'react';
import { Platform } from 'react-native';

export default function AutomationSettingsScreen() {
  const vm = useSettingsViewModel();

  return (
    <Screen title={AppConfig.strings.settings.sections.remindersAndAutomation} showBack scrollable>
      <Inset space="md" vertical="md">
        <Stack space="xl">
          <SettingsMenu header={AppConfig.strings.settings.notifications.title} hideSeparator>
            <SettingsMenuItem
              leftIcon="notifications"
              title={AppConfig.strings.settings.notifications.title}
              description={AppConfig.strings.settings.notifications.description}
              hasArrow={false}
            />
            <NotificationPreference />
          </SettingsMenu>

          {Platform.OS === 'android' && (
            <SettingsMenu header={AppConfig.strings.settings.personalization.smsAutomationHeader}>
              <SettingsMenuItem
                leftIcon="messageSquare"
                title={AppConfig.strings.settings.personalization.smsInboxTitle}
                description={AppConfig.strings.settings.personalization.smsInboxDesc}
                onPress={vm.onSmsInbox}
              />
              <SettingsMenuItem
                leftIcon="messageSquare"
                title={AppConfig.strings.settings.personalization.smsAutoPostTitle}
                description={AppConfig.strings.settings.personalization.smsAutoPostDesc}
                onPress={vm.onManageSmsRules}
              />
            </SettingsMenu>
          )}
        </Stack>
      </Inset>
    </Screen>
  );
}
