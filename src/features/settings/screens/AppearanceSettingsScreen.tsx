import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AppearanceSettingsView } from '@/src/features/settings/components/AppearanceSettingsView';
import { useAppearanceSettingsViewModel } from '@/src/features/settings/hooks/useAppearanceSettingsViewModel';
import { AppConfig } from '@/src/constants';

export default function AppearanceSettingsScreen() {
  const vm = useAppearanceSettingsViewModel();

  const chrome: ScreenNavChrome = {
    screenTitle: AppConfig.strings.settings.sections.appearance,
    showBack: true,
    backIcon: 'back',
  };

  return <AppearanceSettingsView vm={vm} chrome={chrome} />;
}
