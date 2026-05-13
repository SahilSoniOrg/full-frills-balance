import { AppConfig, Size, Spacing } from '@/src/constants';
import { Screen } from '@/src/components/layout';
import { Inset, Stack } from '@/src/design-system';
import { ReportFilterBar } from '@/src/features/reports/components/ReportFilterBar';
import { ReportTabs } from '@/src/features/reports/components/ReportTabs';
import { ReportOverviewSection } from '@/src/features/reports/components/sections/ReportOverviewSection';
import { ReportSpendingSection } from '@/src/features/reports/components/sections/ReportSpendingSection';
import { ReportWealthSection } from '@/src/features/reports/components/sections/ReportWealthSection';
import { ReportsViewModel } from '@/src/features/reports/hooks/useReportsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

interface ReportsViewProps {
  vm: ReportsViewModel;
}

export function ReportsView({ vm }: ReportsViewProps) {
  const { theme } = useTheme();
  const { activeTab, setActiveTab, loading, onRefresh } = vm;

  const { width } = useWindowDimensions();
  // Screen has Spacing.md (12) inset on each side when using Inset space="md".
  // ReportChartCard has padding Spacing.lg (16) on each side = 32.
  // Total reduction = 24 + 32 = 56.
  const CHART_WIDTH = width - (Spacing.md * 2 + Spacing.lg * 2);

  return (
    <Screen title={AppConfig.strings.reports.title} showBack={false} scrollable={false}>
      <Inset space="md" vertical="md" flex={1}>
        <Stack space="xl" flex={1}>
          <View style={{ marginTop: Spacing.sm }}>
            <ReportFilterBar {...vm} />
          </View>
          <ReportTabs activeTab={activeTab} onTabChange={setActiveTab} />

          <ScrollView
            contentContainerStyle={styles.content}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={onRefresh}
                tintColor={theme.primary}
              />
            }
          >
            {activeTab === 'OVERVIEW' && <ReportOverviewSection vm={vm} chartWidth={CHART_WIDTH} />}
            {activeTab === 'SPENDING' && <ReportSpendingSection vm={vm} chartWidth={CHART_WIDTH} />}
            {activeTab === 'WEALTH' && <ReportWealthSection vm={vm} chartWidth={CHART_WIDTH} />}
          </ScrollView>
        </Stack>
      </Inset>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingVertical: Spacing.lg,
    paddingBottom: Size.xxl * 2,
  },
});
