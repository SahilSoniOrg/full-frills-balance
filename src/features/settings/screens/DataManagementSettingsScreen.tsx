import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { DataManagementSettingsView } from '@/src/features/settings/components/DataManagementSettingsView';
import { useDataManagementViewModel } from '@/src/features/settings/hooks/useDataManagementViewModel';
import { AppConfig } from '@/src/constants';

export default function DataManagementSettingsScreen() {
  const vm = useDataManagementViewModel();

  const chrome: ScreenNavChrome = {
    screenTitle: AppConfig.strings.settings.sections.dataManagement,
    showBack: true,
    backIcon: 'back',
  };

  return <DataManagementSettingsView vm={vm} chrome={chrome} />;
}
