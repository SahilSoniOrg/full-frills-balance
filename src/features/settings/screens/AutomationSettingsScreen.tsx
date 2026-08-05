import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AutomationSettingsView } from '@/src/features/settings/components/AutomationSettingsView';
import { useNotificationSettingsViewModel } from '@/src/features/settings/hooks/useNotificationSettingsViewModel';
import { AppConfig } from '@/src/constants';

export default function AutomationSettingsScreen() {
  const vm = useNotificationSettingsViewModel();

  const chrome: ScreenNavChrome = {
    screenTitle: AppConfig.strings.settings.sections.remindersAndAutomation,
    showBack: true,
    backIcon: 'back',
  };

  return <AutomationSettingsView vm={vm} chrome={chrome} />;
}
