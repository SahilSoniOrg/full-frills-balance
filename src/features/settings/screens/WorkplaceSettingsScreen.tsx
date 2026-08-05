import { AppIcon } from '@/src/components/core';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { WorkplaceSettingsView } from '@/src/features/settings/components/WorkplaceSettingsView';
import { useWorkplaceSettingsViewModel } from '@/src/features/settings/hooks/useWorkplaceSettingsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { useMemo } from 'react';
import { TouchableOpacity } from 'react-native';

export default function WorkplaceSettingsScreen() {
  const vm = useWorkplaceSettingsViewModel();
  const { theme } = useTheme();

  const chrome = useMemo<ScreenNavChrome>(
    () => ({
      screenTitle: 'Workplaces',
      showBack: true,
      backIcon: 'back',
      headerActions: (
        <TouchableOpacity onPress={vm.startCreateWorkplace} style={{ padding: 8 }}>
          <AppIcon name="plus" size={24} color={theme.text} />
        </TouchableOpacity>
      ),
    }),
    [theme.text, vm.startCreateWorkplace],
  );

  return <WorkplaceSettingsView vm={vm} chrome={chrome} />;
}
