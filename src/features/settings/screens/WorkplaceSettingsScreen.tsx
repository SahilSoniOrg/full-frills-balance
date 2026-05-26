import { WorkplaceSettingsView } from '@/src/features/settings/components/WorkplaceSettingsView';
import { useWorkplaceSettingsViewModel } from '@/src/features/settings/hooks/useWorkplaceSettingsViewModel';

export default function WorkplaceSettingsScreen() {
  const vm = useWorkplaceSettingsViewModel();
  return <WorkplaceSettingsView vm={vm} />;
}
