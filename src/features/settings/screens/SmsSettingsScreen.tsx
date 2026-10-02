import { SmsSettingsView } from '@/src/features/settings/components/SmsSettingsView';
import { useSmsImportSetting } from '@/src/features/settings/hooks/useSmsImportSetting';
import { AppNavigation } from '@/src/utils/navigation';

export default function SmsSettingsScreen() {
  const sms = useSmsImportSetting();

  return (
    <SmsSettingsView
      isAutomaticSmsImportEnabled={sms.isAutomaticSmsImportEnabled}
      isSmsAutoPostEnabled={sms.isSmsAutoPostEnabled}
      areSmsReviewNotificationsEnabled={sms.areSmsReviewNotificationsEnabled}
      showSmsNotificationDetails={sms.showSmsNotificationDetails}
      notificationsBlocked={sms.notificationsBlocked}
      onToggleSmsNotificationDetails={sms.setShowSmsNotificationDetails}
      onToggleSmsImport={sms.setAutomaticSmsImportEnabled}
      onToggleSmsAutoPost={sms.setSmsAutoPostEnabled}
      onToggleSmsReviewNotifications={sms.setSmsReviewNotificationsEnabled}
      onOpenInbox={AppNavigation.toTransactionInbox}
      onOpenSmsRules={AppNavigation.toSmsRules}
    />
  );
}
