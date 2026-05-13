import { PrivacySecuritySettingsView } from '@/src/features/settings/components/PrivacySecuritySettingsView';
import { usePrivacySettingsViewModel } from '@/src/features/settings/hooks/usePrivacySettingsViewModel';
import React from 'react';

export default function PrivacySecuritySettingsScreen() {
  const vm = usePrivacySettingsViewModel();

  return <PrivacySecuritySettingsView vm={vm} />;
}
