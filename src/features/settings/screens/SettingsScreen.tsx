import { SettingsView } from '@/src/features/settings/components/SettingsView';
import { useSettingsViewModel } from '@/src/features/settings/hooks/useSettingsViewModel';
import React from 'react';

export default function SettingsScreen() {
    const vm = useSettingsViewModel();
    return <SettingsView {...vm} />;
}
