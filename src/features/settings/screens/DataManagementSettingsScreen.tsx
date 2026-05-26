import { DataManagementSettingsView } from '@/src/features/settings/components/DataManagementSettingsView';
import { useDataManagementViewModel } from '@/src/features/settings/hooks/useDataManagementViewModel';

export default function DataManagementSettingsScreen() {
  const vm = useDataManagementViewModel();

  return <DataManagementSettingsView vm={vm} />;
}
