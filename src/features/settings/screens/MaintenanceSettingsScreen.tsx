import { MaintenanceSettingsView } from '@/src/features/settings/components/MaintenanceSettingsView';
import { useMaintenanceSettingsViewModel } from '@/src/features/settings/hooks/useMaintenanceSettingsViewModel';

export default function MaintenanceSettingsScreen() {
  const vm = useMaintenanceSettingsViewModel();
  return <MaintenanceSettingsView vm={vm} />;
}
