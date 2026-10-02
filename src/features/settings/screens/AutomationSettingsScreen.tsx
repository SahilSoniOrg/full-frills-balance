import { AutomationSettingsView } from '@/src/features/settings/components/AutomationSettingsView';
import { useNotificationSettingsViewModel } from '@/src/features/settings/hooks/useNotificationSettingsViewModel';
import { AppNavigation } from '@/src/utils/navigation';

export default function AutomationSettingsScreen() {
  const notifications = useNotificationSettingsViewModel();

  return (
    <AutomationSettingsView
      notifications={notifications}
      onOpenSmsSettings={AppNavigation.toSmsSettings}
    />
  );
}
