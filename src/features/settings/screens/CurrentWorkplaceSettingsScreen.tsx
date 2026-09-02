import { CurrentWorkplaceSettingsView } from '@/src/features/settings/components/CurrentWorkplaceSettingsView';
import { useCurrentWorkplaceSettingsViewModel } from '@/src/features/settings/hooks/useCurrentWorkplaceSettingsViewModel';

export default function CurrentWorkplaceSettingsScreen() {
  const vm = useCurrentWorkplaceSettingsViewModel();
  return <CurrentWorkplaceSettingsView vm={vm} />;
}
