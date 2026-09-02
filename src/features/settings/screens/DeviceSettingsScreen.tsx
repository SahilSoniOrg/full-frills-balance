import { DeviceSettingsView } from '@/src/features/settings/components/DeviceSettingsView';
import { useNotificationSettingsViewModel } from '@/src/features/settings/hooks/useNotificationSettingsViewModel';

export default function DeviceSettingsScreen() {
  const notifications = useNotificationSettingsViewModel();

  return (
    <DeviceSettingsView
      isSmsImportEnabled={notifications.isSmsImportEnabled}
      onToggleSmsImport={notifications.setIsSmsImportEnabled}
    />
  );
}
