import { DashboardScreenView } from '@/src/features/dashboard/components/DashboardScreenView';
import { useDashboardViewModel } from '@/src/features/dashboard/hooks/useDashboardViewModel';
import { useScrollToTop } from '@react-navigation/native';
import React, { useRef } from 'react';

export default function DashboardScreen() {
    const vm = useDashboardViewModel();
    const listRef = useRef(null);

    useScrollToTop(listRef);

    return <DashboardScreenView {...vm} listRef={listRef} />;
}
