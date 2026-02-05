import { DashboardScreenView } from '@/src/features/dashboard/components/DashboardScreenView';
import { useDashboardViewModel } from '@/src/features/dashboard/hooks/useDashboardViewModel';
import React from 'react';

export default function DashboardScreen() {
    const vm = useDashboardViewModel();
    return <DashboardScreenView {...vm} />;
}
