import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { PersonalizationSettingsView } from '@/src/features/settings/components/PersonalizationSettingsView';
import { usePersonalizationViewModel } from '@/src/features/settings/hooks/usePersonalizationViewModel';
import { AppConfig } from '@/src/constants';

export default function PersonalizationSettingsScreen() {
  const vm = usePersonalizationViewModel();

  const chrome: ScreenNavChrome = {
    screenTitle: AppConfig.strings.settings.sections.personalization,
    showBack: true,
    backIcon: 'back',
  };

  return <PersonalizationSettingsView vm={vm} chrome={chrome} />;
}
