import { WorkplaceSettingsView } from '@/src/features/settings/components/WorkplaceSettingsView';
import { useWorkplaceSettingsViewModel } from '@/src/features/settings/hooks/useWorkplaceSettingsViewModel';
import React from 'react';

export default function WorkplaceSettingsScreen() {
  const vm = useWorkplaceSettingsViewModel();
  return <WorkplaceSettingsView vm={vm} />;
}
