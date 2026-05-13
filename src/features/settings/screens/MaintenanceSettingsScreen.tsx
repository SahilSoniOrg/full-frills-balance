import { MaintenanceSettingsView } from '@/src/features/settings/components/MaintenanceSettingsView';
import { useDataManagementViewModel } from '@/src/features/settings/hooks/useDataManagementViewModel';
import React from 'react';

export default function MaintenanceSettingsScreen() {
  const vm = useDataManagementViewModel();

  return <MaintenanceSettingsView vm={vm} />;
}
