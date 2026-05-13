import { AutomationSettingsView } from '@/src/features/settings/components/AutomationSettingsView';
import { useNotificationSettingsViewModel } from '@/src/features/settings/hooks/useNotificationSettingsViewModel';
import React from 'react';

export default function AutomationSettingsScreen() {
  const vm = useNotificationSettingsViewModel();

  return <AutomationSettingsView vm={vm} />;
}
