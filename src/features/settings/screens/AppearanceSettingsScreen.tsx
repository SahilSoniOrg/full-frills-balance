import { AppearanceSettingsView } from '@/src/features/settings/components/AppearanceSettingsView';
import { useAppearanceSettingsViewModel } from '@/src/features/settings/hooks/useAppearanceSettingsViewModel';

export default function AppearanceSettingsScreen() {
  const vm = useAppearanceSettingsViewModel();
  return <AppearanceSettingsView vm={vm} />;
}
