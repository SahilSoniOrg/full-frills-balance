import { Icon } from '@/src/types/domainIcons';
import { AppConfig } from '@/src/constants';
import { Stack } from '@/src/design-system';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { SettingsToggleItem } from '@/src/features/settings/components/SettingsToggleItem';

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
        <SettingsMenu header={strings.smsAutomationHeader}>
          <SettingsToggleItem
            searchId="sms-automation-import"
            leftIcon={Icon.Zap}
            title={strings.smsImportTitle}
            description="Scan transaction messages on this device at app start and when each SMS arrives."
            value={isAutomaticSmsImportEnabled}
            onValueChange={onToggleSmsImport}
            testID="automation-sms-import-toggle"
          />
          <SettingsToggleItem
            searchId="sms-review-notifications"
            leftIcon={Icon.Notifications}
            title={strings.smsReviewNotificationsTitle}
            description={
              notificationsBlocked
                ? 'Blocked by system settings. Enable app notifications and the SMS to review channel.'
                : strings.smsReviewNotificationsDesc
            }
            value={areSmsReviewNotificationsEnabled}
            onValueChange={onToggleSmsReviewNotifications}
            testID="automation-sms-review-notifications-toggle"
          />
          <SettingsToggleItem
            leftIcon={Icon.Notifications}
            searchId="sms-notification-details"
            title="Detailed SMS previews"
            description="Show amounts and transaction details in notifications. Hidden while Privacy Mode or app lock is enabled."
            value={showSmsNotificationDetails}
            onValueChange={onToggleSmsNotificationDetails}
            disabled={!areSmsReviewNotificationsEnabled}
            testID="sms-notification-details-toggle"
          />
          <SettingsToggleItem
            searchId="sms-auto-post-enabled"
            leftIcon={Icon.Terminal}
            title={strings.smsAutoPostEnabledTitle}
            description={strings.smsAutoPostEnabledDesc}
            value={isSmsAutoPostEnabled}
            onValueChange={onToggleSmsAutoPost}
            testID="automation-sms-auto-post-toggle"
          />
        </SettingsMenu>

        <SettingsMenu header={strings.smsManagementHeader}>
          <SettingsMenuItem
            searchId="sms-inbox"
            leftIcon={Icon.MessageSquare}
            title={strings.smsInboxTitle}
            description={strings.smsInboxDesc}
            onPress={onOpenInbox}
            testID="settings-sms-inbox"
          />
          <SettingsMenuItem
            searchId="sms-rules"
            leftIcon={Icon.Terminal}
            title={strings.smsAutoPostTitle}
            description={strings.smsAutoPostDesc}
            onPress={onOpenSmsRules}
          />
        </SettingsMenu>
      </Stack>
    </SettingsLayout>
  );
}
