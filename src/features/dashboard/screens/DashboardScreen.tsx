import { DashboardScreenView } from '@/src/features/dashboard/components/DashboardScreenView';
import { useDashboardViewModel } from '@/src/features/dashboard/hooks/useDashboardViewModel';
import { analytics } from '@/src/services/analytics-service';
import { AppNavigation } from '@/src/utils/navigation';
import { useScrollToTop } from '@react-navigation/native';
import React, { useCallback, useRef } from 'react';

export default function DashboardScreen() {
    const vm = useDashboardViewModel();
    const listRef = useRef(null);

    useScrollToTop(listRef);

    const handleNewEntryPress = useCallback(() => {
        analytics.logEntrypointOpened('dashboard', 'bottom_action');
        analytics.logEntrypointSelected('dashboard', 'bottom_action', 'journal_entry');
        AppNavigation.toJournalEntry();
    }, []);

    return (
        <DashboardScreenView
            {...vm}
            listRef={listRef}
            fab={{
                onPress: handleNewEntryPress,
                label: 'New Entry',
                placement: 'end',
                accessibilityLabel: 'Open new entry options',
            }}
        />
    );
}
