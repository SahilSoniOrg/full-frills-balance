import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { MaintenanceSettingsView } from '@/src/features/settings/components/MaintenanceSettingsView';
import { useDataManagementViewModel } from '@/src/features/settings/hooks/useDataManagementViewModel';
import { AppConfig } from '@/src/constants';

export default function MaintenanceSettingsScreen() {
  const vm = useDataManagementViewModel();

  const chrome: ScreenNavChrome = {
    screenTitle: AppConfig.strings.settings.sections.maintenanceAndReset,
    showBack: true,
    backIcon: 'back',
  };

  return <MaintenanceSettingsView vm={vm} chrome={chrome} />;
}
