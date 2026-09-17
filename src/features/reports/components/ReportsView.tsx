import { ScreenWithChrome } from '@/src/components/layout';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { FilterDisclosure } from '@/src/components/filters/FilterDisclosure';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { Inset } from '@/src/design-system';
import { AppTabs, Icon, type TabOption } from '@/src/components/core';
import { ReportFilterChrome } from '@/src/features/reports/components/ReportFilterChrome';
import { ReportOverviewSection } from '@/src/features/reports/components/sections/ReportOverviewSection';
import { ReportSpendingSection } from '@/src/features/reports/components/sections/ReportSpendingSection';
import { ReportWealthSection } from '@/src/features/reports/components/sections/ReportWealthSection';
import { ReportTab } from '@/src/features/reports/hooks/reportTabTypes';
import { ReportsViewModel } from '@/src/features/reports/hooks/useReportsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { RefreshControl, StyleSheet, useWindowDimensions } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useCallback, useState } from 'react';

const REPORT_TABS: readonly TabOption<ReportTab>[] = [
  { id: 'OVERVIEW', label: AppConfig.strings.reports.tabs.overview },
  { id: 'SPENDING', label: AppConfig.strings.reports.tabs.spending },
  { id: 'WEALTH', label: AppConfig.strings.reports.tabs.wealth },
];

interface ReportsViewProps {
  vm: ReportsViewModel;
  chrome: ScreenNavChrome;
}

export function ReportsView({ vm, chrome }: ReportsViewProps) {
  const { theme } = useTheme();
  const { filters, activeTab, setActiveTab, loading, overview, spending, wealth } = vm;
  const [areFiltersExpanded, setAreFiltersExpanded] = useState(false);

  const { width } = useWindowDimensions();
  const CHART_WIDTH = Math.max(0, width - (Spacing.md * 2 + Spacing.lg * 2));
  const toggleFilters = useCallback(() => setAreFiltersExpanded(expanded => !expanded), []);
  const accountLabel =
    filters.accountIds.length === 0
      ? AppConfig.strings.reports.allAccounts
      : AppConfig.strings.reports.accountCount(filters.accountIds.length);

  return (
    <ScreenWithChrome chrome={chrome} scrollable={false}>
      <Inset space="md" vertical="md" flex={1}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={filters.onRefresh}
              tintColor={theme.primary}
            />
          }
        >
          <FilterDisclosure
            isExpanded={areFiltersExpanded}
            onToggle={toggleFilters}
            collapsedTitle={AppConfig.strings.reports.filtersTitle}
            collapsedDetails={`${filters.dateLabel} · ${accountLabel}`}
            groups={[
              {
                label: 'Period',
                chip: {
                  label: filters.dateLabel,
                  icon: Icon.Calendar,
                  isActive: true,
                  onPress: filters.onOpenDatePicker,
                  testID: 'reports-date-filter',
                },
              },
              {
                label: 'Accounts',
                chip: {
                  label: accountLabel,
                  icon: Icon.Wallet,
                  isActive: filters.accountIds.length > 0,
                  onPress: filters.onOpenAccountPicker,
                  testID: 'reports-account-filter',
                },
              },
            ]}
            testID="reports-filters-toggle"
          />
          <AppTabs
            options={REPORT_TABS}
            value={activeTab}
            onChange={setActiveTab}
            testID="report-tabs"
          />
          {activeTab === 'OVERVIEW' && (
            <ReportOverviewSection vm={overview} chartWidth={CHART_WIDTH} />
          )}
          {activeTab === 'SPENDING' && (
            <ReportSpendingSection vm={spending} chartWidth={CHART_WIDTH} />
          )}
          {activeTab === 'WEALTH' && <ReportWealthSection vm={wealth} chartWidth={CHART_WIDTH} />}
        </ScrollView>
      </Inset>
      <ReportFilterChrome filters={filters} />
    </ScreenWithChrome>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: Size.xxl * 2,
    gap: Spacing.xl,
  },
});
