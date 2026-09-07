import { DeviceSettingsView } from '@/src/features/settings/components/DeviceSettingsView';
import { useSmsImportSetting } from '@/src/features/settings/hooks/useSmsImportSetting';

export default function DeviceSettingsScreen() {
  const smsImport = useSmsImportSetting();

  return (
    <DeviceSettingsView
      isSmsImportEnabled={smsImport.isSmsImportEnabled}
      onToggleSmsImport={smsImport.setIsSmsImportEnabled}
    />
  );
}
