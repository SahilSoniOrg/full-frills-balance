import { AutomationSettingsView } from '@/src/features/settings/components/AutomationSettingsView';
import { useNotificationSettingsViewModel } from '@/src/features/settings/hooks/useNotificationSettingsViewModel';
import { useSmsImportSetting } from '@/src/features/settings/hooks/useSmsImportSetting';
import { AppNavigation } from '@/src/utils/navigation';

export default function AutomationSettingsScreen() {
  const notifications = useNotificationSettingsViewModel();
  const smsImport = useSmsImportSetting();

  return (
    <AutomationSettingsView
      notifications={notifications}
      isSmsImportEnabled={smsImport.isSmsImportEnabled}
      onOpenInbox={AppNavigation.toTransactionInbox}
      onOpenSmsRules={AppNavigation.toSmsRules}
    />
  );
}
