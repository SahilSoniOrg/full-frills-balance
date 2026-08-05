import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AboutSupportSettingsView } from '@/src/features/settings/components/AboutSupportSettingsView';
import { useAboutSupportViewModel } from '@/src/features/settings/hooks/useAboutSupportViewModel';
import { AppConfig } from '@/src/constants';

export default function AboutSupportSettingsScreen() {
  const vm = useAboutSupportViewModel();

  const chrome: ScreenNavChrome = {
    screenTitle: AppConfig.strings.settings.sections.aboutAndSupport,
    showBack: true,
    backIcon: 'back',
  };

  return <AboutSupportSettingsView vm={vm} chrome={chrome} />;
}
