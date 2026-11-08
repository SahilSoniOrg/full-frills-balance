import { Badge, ListGroup, ListRow } from '@/src/components/core';
import { Icon } from '@/src/types/domainIcons';
import { AppConfig } from '@/src/constants';
import { Stack } from '@/src/design-system';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';

interface SmsSettingsViewProps {
  isAutomaticSmsImportEnabled: boolean;
  areSmsReviewNotificationsEnabled: boolean;
  showSmsNotificationDetails: boolean;
  notificationsBlocked: boolean;
  onToggleSmsNotificationDetails: (enabled: boolean) => void;
  onToggleSmsImport: (enabled: boolean) => void;
  onToggleSmsReviewNotifications: (enabled: boolean) => void;
  onOpenInbox: () => void;
}

export function SmsSettingsView({
  isAutomaticSmsImportEnabled,
  areSmsReviewNotificationsEnabled,
  showSmsNotificationDetails,
  notificationsBlocked,
  onToggleSmsNotificationDetails,
  onToggleSmsImport,
  onToggleSmsReviewNotifications,
  onOpenInbox,
}: SmsSettingsViewProps) {
  const strings = AppConfig.strings.settings.personalization;

  return (
    <SettingsLayout title={strings.smsSettingsTitle}>
      <Stack space="lg">
        <ListGroup
          variant="card"
          header={strings.smsAutomationHeader}
          headerAccessory={
            <Badge
              variant={isAutomaticSmsImportEnabled ? 'success' : 'default'}
              size="sm"
              icon={isAutomaticSmsImportEnabled ? Icon.Check : undefined}
            >
              {isAutomaticSmsImportEnabled ? 'On' : 'Off'}
            </Badge>
          }
          footer="Device SMS listening is separate from this Workplace’s automatic capture setting."
        >
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
        </ListGroup>

        <ListGroup
          variant="card"
          header="Review alerts"
          headerAccessory={
            notificationsBlocked ? (
              <Badge variant="warning" size="sm" icon={Icon.Alert}>
                Blocked
              </Badge>
            ) : null
          }
        >
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
        </ListGroup>

        <ListGroup variant="card" header={strings.smsManagementHeader}>
          <ListRow
            focusId="sms-inbox"
            icon={Icon.MessageSquare}
            title={strings.transactionInboxTitle}
            subtitle={strings.transactionInboxDesc}
            onPress={onOpenInbox}
            testID="settings-sms-inbox"
          />
        </ListGroup>
      </Stack>
    </SettingsLayout>
  );
}
