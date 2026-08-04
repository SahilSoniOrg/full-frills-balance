import { PrivacyToggleButton } from '@/src/components/common/PrivacyToggleButton';
import { Screen } from '@/src/components/layout';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { Inset, Stack } from '@/src/design-system';
import { ReportFilterBar } from '@/src/features/reports/components/ReportFilterBar';
import { ReportTabs } from '@/src/features/reports/components/ReportTabs';
import { ReportOverviewSection } from '@/src/features/reports/components/sections/ReportOverviewSection';
import { ReportSpendingSection } from '@/src/features/reports/components/sections/ReportSpendingSection';
import { ReportWealthSection } from '@/src/features/reports/components/sections/ReportWealthSection';
import { ReportsViewModel } from '@/src/features/reports/hooks/useReportsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

interface ReportsViewProps {
  vm: ReportsViewModel;
}

export function ReportsView({ vm }: ReportsViewProps) {
  const { theme } = useTheme();
  const {
    filters,
    activeTab,
    setActiveTab,
    loading,
    formatMoney,
    formatMoneyShort,
    overview,
    spending,
    wealth,
  } = vm;

  const { width } = useWindowDimensions();
  // Screen has Spacing.md (12) inset on each side when using Inset space="md".
  // ReportChartCard has padding Spacing.lg (16) on each side = 32.
  // Total reduction = 24 + 32 = 56.
  const CHART_WIDTH = width - (Spacing.md * 2 + Spacing.lg * 2);

  return (
    <Screen
      title={AppConfig.strings.reports.title}
      showBack={false}
      scrollable={false}
      headerActions={<PrivacyToggleButton />}
    >
      <Inset space="md" vertical="md" flex={1}>
        <Stack space="xl" flex={1}>
          <View style={{ marginTop: Spacing.sm }}>
            <ReportFilterBar {...filters} />
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
              <ReportOverviewSection
                vm={overview}
                chartWidth={CHART_WIDTH}
                formatMoneyShort={formatMoneyShort}
              />
            )}
            {activeTab === 'SPENDING' && (
              <ReportSpendingSection
                vm={spending}
                chartWidth={CHART_WIDTH}
                formatMoney={formatMoney}
              />
            )}
            {activeTab === 'WEALTH' && (
              <ReportWealthSection
                vm={wealth}
                chartWidth={CHART_WIDTH}
                formatMoneyShort={formatMoneyShort}
              />
            )}
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
