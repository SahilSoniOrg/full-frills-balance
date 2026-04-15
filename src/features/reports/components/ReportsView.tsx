import { Screen } from '@/src/components/layout';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { ReportFilterBar } from '@/src/features/reports/components/ReportFilterBar';
import { ReportTabs } from '@/src/features/reports/components/ReportTabs';
import { ReportOverviewSection } from '@/src/features/reports/components/sections/ReportOverviewSection';
import { ReportSpendingSection } from '@/src/features/reports/components/sections/ReportSpendingSection';
import { ReportWealthSection } from '@/src/features/reports/components/sections/ReportWealthSection';
import { ReportsViewModel } from '@/src/features/reports/hooks/useReportsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { AppNavigation } from '@/src/utils/navigation';
import React from 'react';
import { RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

export function ReportsView(vm: ReportsViewModel) {
  const { theme } = useTheme();
  const { activeTab, setActiveTab, loading, onRefresh } = vm;

  const { width } = useWindowDimensions();
  // Screen padding = lg(16)*2 = 32. Components inside have their own padding.
  const CHART_WIDTH = width - Spacing.lg * 4;

  return (
    <Screen showBack={true} title={AppConfig.strings.reports.title} onBack={AppNavigation.back}>
      <View style={{ marginTop: Spacing.sm }}>
        <ReportFilterBar {...vm} />
      </View>
      <ReportTabs activeTab={activeTab} onTabChange={setActiveTab} />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      >
        {activeTab === 'OVERVIEW' && (
          <ReportOverviewSection vm={vm} theme={theme} chartWidth={CHART_WIDTH} />
        )}
        {activeTab === 'SPENDING' && (
          <ReportSpendingSection vm={vm} theme={theme} chartWidth={CHART_WIDTH} />
        )}
        {activeTab === 'WEALTH' && (
          <ReportWealthSection vm={vm} theme={theme} chartWidth={CHART_WIDTH} />
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.lg,
    paddingBottom: Size.xxl * 2,
  },
});
