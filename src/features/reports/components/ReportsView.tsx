import { ScreenWithChrome } from '@/src/components/layout';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { Size, Spacing } from '@/src/constants';
import { Inset, Stack } from '@/src/design-system';
import { ReportFilterBar } from '@/src/features/reports/components/ReportFilterBar';
import { ReportOverviewSection } from '@/src/features/reports/components/sections/ReportOverviewSection';
import { ReportSpendingSection } from '@/src/features/reports/components/sections/ReportSpendingSection';
import { ReportWealthSection } from '@/src/features/reports/components/sections/ReportWealthSection';
import { ReportTabs } from '@/src/features/reports/components/ReportTabs';
import { ReportsViewModel } from '@/src/features/reports/hooks/useReportsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

interface ReportsViewProps {
  vm: ReportsViewModel;
  chrome: ScreenNavChrome;
}

export function ReportsView({ vm, chrome }: ReportsViewProps) {
  const { theme } = useTheme();
  const { filters, subPeriod, activeTab, setActiveTab, loading, overview, spending, wealth } = vm;

  const { width } = useWindowDimensions();
  const CHART_WIDTH = width - (Spacing.md * 2 + Spacing.lg * 2);

  return (
    <ScreenWithChrome chrome={chrome} scrollable={false}>
      <Inset space="md" vertical="md" flex={1}>
        <Stack space="xl" flex={1}>
          <View style={styles.filterBar}>
            <ReportFilterBar {...filters} subPeriod={subPeriod} />
          </View>
          <ReportTabs activeTab={activeTab} onTabChange={setActiveTab} />

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
            {activeTab === 'OVERVIEW' && (
              <ReportOverviewSection vm={overview} chartWidth={CHART_WIDTH} />
            )}
            {activeTab === 'SPENDING' && (
              <ReportSpendingSection vm={spending} chartWidth={CHART_WIDTH} />
            )}
            {activeTab === 'WEALTH' && <ReportWealthSection vm={wealth} chartWidth={CHART_WIDTH} />}
          </ScrollView>
        </Stack>
      </Inset>
    </ScreenWithChrome>
  );
}

const styles = StyleSheet.create({
  filterBar: {
    marginTop: Spacing.sm,
  },
  content: {
    paddingVertical: Spacing.lg,
    paddingBottom: Size.xxl * 2,
  },
});
