import { PersonalizationSettingsView } from '@/src/features/settings/components/PersonalizationSettingsView';
import { usePersonalizationViewModel } from '@/src/features/settings/hooks/usePersonalizationViewModel';

export default function PersonalizationSettingsScreen() {
  const vm = usePersonalizationViewModel();
  return <PersonalizationSettingsView vm={vm} />;
}
