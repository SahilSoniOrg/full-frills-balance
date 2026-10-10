import { ListGroup, ListRow } from '@/src/components/core';
import { Icon } from '@/src/types/domainIcons';
import { AppConfig } from '@/src/constants';
import { Stack } from '@/src/design-system';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';

interface SmsSettingsViewProps {
  isAutomaticSmsImportEnabled: boolean;
  isSmsAutoPostEnabled: boolean;
  areSmsReviewNotificationsEnabled: boolean;
  showSmsNotificationDetails: boolean;
  notificationsBlocked: boolean;
  onToggleSmsNotificationDetails: (enabled: boolean) => void;
  onToggleSmsImport: (enabled: boolean) => void;
  onToggleSmsAutoPost: (enabled: boolean) => void;
  onToggleSmsReviewNotifications: (enabled: boolean) => void;
  onOpenInbox: () => void;
  onOpenSmsRules: () => void;
}

export function SmsSettingsView({
  isAutomaticSmsImportEnabled,
  isSmsAutoPostEnabled,
  areSmsReviewNotificationsEnabled,
  showSmsNotificationDetails,
  notificationsBlocked,
  onToggleSmsNotificationDetails,
  onToggleSmsImport,
  onToggleSmsAutoPost,
  onToggleSmsReviewNotifications,
  onOpenInbox,
  onOpenSmsRules,
}: SmsSettingsViewProps) {
  const strings = AppConfig.strings.settings.personalization;

  return (
    <SettingsLayout title={strings.smsSettingsTitle}>
      <Stack space="xl">
        <ListGroup variant="plain" header={strings.smsAutomationHeader}>
          <ListRow
            focusId="sms-automation-import"
            icon={Icon.Zap}
            title={strings.smsImportTitle}
            subtitle="Scan transaction messages on this device at app start and when each SMS arrives."
            testID="automation-sms-import-toggle"
            trailing={
              <ListRow.Toggle
                value={isAutomaticSmsImportEnabled}
                onValueChange={onToggleSmsImport}
              />
            }
          />
          <ListRow
            focusId="sms-review-notifications"
            icon={Icon.Notifications}
            title={strings.smsReviewNotificationsTitle}
            subtitle={
              notificationsBlocked
                ? 'Blocked by system settings. Enable app notifications and the SMS to review channel.'
                : strings.smsReviewNotificationsDesc
            }
            testID="automation-sms-review-notifications-toggle"
            trailing={
              <ListRow.Toggle
                value={areSmsReviewNotificationsEnabled}
                onValueChange={onToggleSmsReviewNotifications}
              />
            }
          />
          <ListRow
            icon={Icon.Notifications}
            focusId="sms-notification-details"
            title={AppConfig.strings.settings.hub.smsNotificationDetailsTitle}
            subtitle="Show amounts and transaction details in notifications. Hidden while Privacy Mode or app lock is enabled."
            disabled={!areSmsReviewNotificationsEnabled}
            testID="sms-notification-details-toggle"
            trailing={
              <ListRow.Toggle
                value={showSmsNotificationDetails}
                onValueChange={onToggleSmsNotificationDetails}
              />
            }
          />
          <ListRow
            focusId="sms-auto-post-enabled"
            icon={Icon.Terminal}
            title={strings.smsAutoPostEnabledTitle}
            subtitle={strings.smsAutoPostEnabledDesc}
            testID="automation-sms-auto-post-toggle"
            trailing={
              <ListRow.Toggle value={isSmsAutoPostEnabled} onValueChange={onToggleSmsAutoPost} />
            }
          />
        </ListGroup>

        <ListGroup variant="plain" header={strings.smsManagementHeader}>
          <ListRow
            focusId="sms-inbox"
            icon={Icon.MessageSquare}
            title={strings.smsInboxTitle}
            subtitle={strings.smsInboxDesc}
            onPress={onOpenInbox}
            testID="settings-sms-inbox"
          />
          <ListRow
            focusId="sms-rules"
            icon={Icon.Terminal}
            title={strings.smsAutoPostTitle}
            subtitle={strings.smsAutoPostDesc}
            onPress={onOpenSmsRules}
          />
        </ListGroup>
      </Stack>
    </SettingsLayout>
  );
}
