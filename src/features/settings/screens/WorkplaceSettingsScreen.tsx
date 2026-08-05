import { AppIcon } from '@/src/components/core';
import { WorkplaceSettingsView } from '@/src/features/settings/components/WorkplaceSettingsView';
import { useWorkplaceSettingsViewModel } from '@/src/features/settings/hooks/useWorkplaceSettingsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { TouchableOpacity } from 'react-native';

export default function WorkplaceSettingsScreen() {
  const vm = useWorkplaceSettingsViewModel();
  const { theme } = useTheme();

  const headerActions = (
    <TouchableOpacity onPress={vm.startCreateWorkplace} style={{ padding: 8 }}>
      <AppIcon name="plus" size={24} color={theme.text} />
    </TouchableOpacity>
  );

  return <WorkplaceSettingsView vm={vm} headerActions={headerActions} />;
}
