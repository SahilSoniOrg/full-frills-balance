import { AppearanceSettingsView } from '@/src/features/settings/components/AppearanceSettingsView';
import { useAppearanceSettingsViewModel } from '@/src/features/settings/hooks/useAppearanceSettingsViewModel';
import React from 'react';

export default function AppearanceSettingsScreen() {
  const vm = useAppearanceSettingsViewModel();

  return <AppearanceSettingsView vm={vm} />;
}
