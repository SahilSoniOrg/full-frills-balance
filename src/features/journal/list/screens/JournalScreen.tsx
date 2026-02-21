import { DateRangeFilter } from '@/src/components/common/DateRangeFilter';
import { ExpandableSearchButton } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { JournalListView } from '@/src/features/journal/components/JournalListView';
import { useJournalListScreen } from '@/src/features/journal/hooks/useJournalListScreen';
import { useJournalRouteDateRange } from '@/src/features/journal/list/hooks/useJournalRouteDateRange';
import { useExchangeRates } from '@/src/hooks/useExchangeRates';
import { AppNavigation } from '@/src/utils/navigation';
import { preferences } from '@/src/utils/preferences';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

export default function JournalScreen() {
    const initialDateRange = useJournalRouteDateRange();
    const [defaultCurrency, setDefaultCurrency] = useState<string>(AppConfig.defaultCurrency);
    const [isPrefsLoaded, setIsPrefsLoaded] = useState(false);

    useEffect(() => {
        preferences.loadPreferences().then(p => {
            if (p.defaultCurrencyCode) setDefaultCurrency(p.defaultCurrencyCode);
            setIsPrefsLoaded(true);
        });
    }, []);

    const { rateMap } = useExchangeRates(isPrefsLoaded ? defaultCurrency : undefined);

    const { listViewProps, vm } = useJournalListScreen({
        pageSize: AppConfig.pagination.dashboardPageSize,
        emptyState: {
            title: AppConfig.strings.journal.emptyTitle,
            subtitle: AppConfig.strings.journal.emptySubtitle,
        },
        loadingText: AppConfig.strings.common.loading,
        loadingMoreText: AppConfig.strings.common.loading,
        initialDateRange: initialDateRange ?? null,
        exchangeRateMap: rateMap,
        baseCurrency: defaultCurrency,
    });

    const handleFabPress = useCallback(() => {
        AppNavigation.toJournalEntry();
    }, []);

    const headerActions = useMemo(() => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <ExpandableSearchButton
                value={vm.searchQuery}
                onChangeText={vm.onSearchChange}
            />
            {vm.searchQuery.length === 0 && (
                <DateRangeFilter
                    range={vm.dateRange}
                    onPress={vm.showDatePicker}
                    onPrevious={vm.navigatePrevious}
                    onNext={vm.navigateNext}
                    showNavigationArrows={false}
                />
            )}
        </View>
    ), [vm.searchQuery, vm.dateRange, vm.showDatePicker, vm.navigatePrevious, vm.navigateNext, vm.onSearchChange]);

    const fab = useMemo(() => ({ onPress: handleFabPress }), [handleFabPress]);

    if (!isPrefsLoaded) return null; // Or a proper loading screen

    return (
        <JournalListView
            {...listViewProps}
            screenTitle={AppConfig.strings.journal.transactions}
            headerActions={headerActions}
            listHeader={null}
            fab={fab}
        />
    );
}
