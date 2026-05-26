import { AboutSupportSettingsView } from '@/src/features/settings/components/AboutSupportSettingsView';
import { useAboutSupportViewModel } from '@/src/features/settings/hooks/useAboutSupportViewModel';

export default function AboutSupportSettingsScreen() {
  const vm = useAboutSupportViewModel();

  return <AboutSupportSettingsView vm={vm} />;
}
