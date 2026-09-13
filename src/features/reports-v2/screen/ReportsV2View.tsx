import { MultiAccountPickerModal, useAccounts } from '@/src/components/account-selection';
import { DateRangePicker } from '@/src/components/filters/DateRangePicker';
import { FilterDisclosure } from '@/src/components/filters/FilterDisclosure';
import { useCallback, useMemo, useState } from 'react';
import {
  AppCard,
  AppButton,
  AppIcon,
  AppText,
  EmptyStateView,
  Icon,
  LoadingView,
  type AppTextProps,
  type SegmentedOption,
} from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { BarChart, type BarChartDataPoint } from '@/src/components/charts/BarChart';
import { LineChart, type DataPoint } from '@/src/components/charts/LineChart';
import { ReportChartCard } from '../../reports/components/ReportChartCard';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { Shape, Spacing, Typography } from '@/src/constants/design-tokens';
import { Inset, Stack } from '@/src/design-system';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { useTheme } from '@/src/hooks/use-theme';
import { asAccountId, asWorkplaceId } from '@/src/types/ids';
import { AppNavigation } from '@/src/utils/navigation';
import type { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import {
  ActivityIndicator,
  RefreshControl,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import type { ReportsV2QueryEngine } from '@/src/services/reports-v2/reportQueryEngine';
import type { ReportMeasure } from '@/src/services/reports-v2/types/measure';
import type {
  ReportSection,
  ReportVisualization,
  ReportWarning,
} from '@/src/services/reports-v2/types/result';
import { REPORTS_V2_SECTIONS } from '../helpers';
import { useReportsV2ViewModel } from '../hooks/useReportsV2ViewModel';
import type { ReportsV2SectionId } from '../types';

interface ReportsV2ViewProps {
  engine: ReportsV2QueryEngine;
  workplaceId: string;
  targetCurrency: string;
  chrome: ScreenNavChrome;
}

type NonMoneyMeasure = Exclude<ReportMeasure, { kind: 'MONEY' }>;

function measureText(measure: NonMoneyMeasure): string {
  if (measure.kind === 'PERCENTAGE') {
    return measure.value === null ? 'Unavailable' : `${measure.value.toFixed(1)}%`;
  }
  if (measure.kind === 'COUNT') return `${measure.value}`;
  return measure.value.toFixed(2);
}

type MeasureTextProps = { measure: ReportMeasure } & Omit<AppTextProps, 'children'>;

function MeasureText({ measure, ...textProps }: MeasureTextProps) {
  if (measure.kind === 'MONEY') {
    return <MoneyText {...textProps} amount={measure.amount} currencyCode={measure.currencyCode} />;
  }

  return <AppText {...textProps}>{measureText(measure)}</AppText>;
}

function measureNumber(measure: ReportMeasure): number {
  return measure.kind === 'MONEY' ? measure.amount : (measure.value ?? 0);
}

function metricTone(measure: ReportMeasure): 'income' | 'expense' | 'default' {
  if (measure.kind !== 'MONEY') return 'default';
  return measure.amount < 0 ? 'expense' : 'income';
}

function SectionFilters({
  vm,
  isExpanded,
  onToggle,
}: {
  vm: ReturnType<typeof useReportsV2ViewModel>;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const periodOptions: readonly SegmentedOption<string>[] = [
    { id: 'month', label: 'Month' },
    { id: 'quarter', label: 'Quarter' },
    { id: 'year', label: 'YTD' },
    { id: 'all-time', label: 'All time' },
    { id: 'custom', label: 'Custom' },
  ];
  const basisOptions: readonly SegmentedOption<string>[] = [
    { id: 'ACTUAL', label: 'Actual' },
    { id: 'ACTUAL_PLUS_PLANNED', label: 'Actual + planned' },
  ];
  const comparisonOptions: readonly SegmentedOption<string>[] = [
    { id: 'NONE', label: 'None' },
    { id: 'PREVIOUS_PERIOD', label: 'Prior period' },
    { id: 'PREVIOUS_YEAR', label: 'Last year' },
  ];
  const basisLabel = vm.filters.basis === 'ACTUAL_PLUS_PLANNED' ? 'Actual + planned' : 'Actual';
  const comparisonLabel = vm.filters.comparison === 'NONE' ? 'No comparison' : 'Compared';
  const groups = [
    {
      label: 'Period',
      options: periodOptions,
      value: vm.filters.periodPreset,
      onChange: (value: string) => vm.filters.onPeriodPresetChange(value as never),
    },
    {
      label: 'Basis',
      options: basisOptions,
      value: vm.filters.basis,
      onChange: (value: string) => vm.filters.onBasisChange(value as never),
    },
    {
      label: 'Compare with',
      options: comparisonOptions,
      value: vm.filters.comparison,
      onChange: (value: string) => vm.filters.onComparisonChange(value as never),
    },
    {
      label: 'Accounts',
      chip: {
        label: vm.filters.accountScopeLabel,
        icon: Icon.Wallet,
        isActive: vm.filters.accountIds.length > 0,
        onPress: () => vm.filters.onRequestAccountScope?.(),
      },
    },
  ];
  return (
    <FilterDisclosure
      isExpanded={isExpanded}
      onToggle={onToggle}
      collapsedTitle={`${basisLabel} · ${comparisonLabel}`}
      collapsedDetails={`${vm.filters.periodLabel} · ${vm.filters.accountScopeLabel}`}
      groups={groups}
      testID="reports-v2-filters-toggle"
    />
  );
}

function QualityBanner({
  warnings,
  onPress,
}: {
  warnings: readonly ReportWarning[];
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const errorCount = warnings.reduce(
    (total, warning) => total + (warning.severity === 'ERROR' ? (warning.count ?? 1) : 0),
    0,
  );
  const warningCount = warnings.reduce(
    (total, warning) => total + (warning.severity === 'WARNING' ? (warning.count ?? 1) : 0),
    0,
  );
  const infoCount = warnings.reduce(
    (total, warning) => total + (warning.severity === 'INFO' ? (warning.count ?? 1) : 0),
    0,
  );
  const tone = errorCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'asset';
  const color = theme[tone];
  const backgroundColor =
    tone === 'error'
      ? theme.errorLight
      : tone === 'warning'
        ? theme.warningLight
        : theme.assetLight;
  const headline =
    errorCount > 0
      ? 'Needs attention'
      : warningCount > 0
        ? 'A few checks need review'
        : 'Report checks complete';
  const detail =
    errorCount > 0
      ? `${errorCount.toLocaleString()} error${errorCount === 1 ? '' : 's'} found in this period`
      : warningCount > 0
        ? `${warningCount.toLocaleString()} warning${warningCount === 1 ? '' : 's'} found in this period`
        : infoCount > 0
          ? `${infoCount.toLocaleString()} informational note${infoCount === 1 ? '' : 's'}`
          : 'No data quality issues found in this period';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open report health"
      style={[styles.qualityBanner, { borderColor: color }]}
    >
      <View style={[styles.qualityIcon, { backgroundColor }]}>
        <AppIcon
          name={errorCount > 0 ? Icon.Alert : warningCount > 0 ? Icon.Error : Icon.CheckCircle}
          size={18}
          color={color}
        />
      </View>
      <View style={styles.qualityCopy}>
        <AppText variant="body" weight="semibold">
          {headline}
        </AppText>
        <AppText variant="caption" color="secondary" numberOfLines={1}>
          {detail}
        </AppText>
      </View>
      <AppIcon name={Icon.ChevronRight} size={18} color="textSecondary" />
    </Pressable>
  );
}

function ReportStatusNotice({
  state,
  onRetry,
}: {
  state: 'refreshing' | 'error';
  onRetry: () => void;
}) {
  const { theme } = useTheme();
  const isError = state === 'error';
  const color = isError ? theme.error : theme.primary;
  return (
    <View
      style={[
        styles.statusNotice,
        {
          borderColor: isError ? theme.error : theme.divider,
          backgroundColor: isError ? theme.errorLight : theme.surfaceSecondary,
        },
      ]}
      accessibilityRole="alert"
    >
      <View
        style={[
          styles.statusIcon,
          { backgroundColor: isError ? theme.errorLight : theme.primaryLight },
        ]}
      >
        <AppIcon name={isError ? Icon.Alert : Icon.Refresh} size={16} color={color} />
      </View>
      <View style={styles.statusCopy}>
        <AppText variant="caption" weight="semibold">
          {isError ? 'Report update failed' : 'Updating report'}
        </AppText>
        <AppText variant="caption" color="secondary" numberOfLines={2}>
          {isError
            ? 'Showing the previous results. Try again.'
            : 'Your current results stay visible while we update.'}
        </AppText>
      </View>
      {isError ? (
        <AppButton variant="ghost" size="sm" onPress={onRetry}>
          Retry
        </AppButton>
      ) : (
        <ActivityIndicator size="small" color={theme.primary} />
      )}
    </View>
  );
}

function ReportSectionTabs({
  options,
  value,
  onChange,
}: {
  options: readonly SegmentedOption<string>[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[styles.sectionTabs, { borderBottomColor: theme.border }]}
      accessibilityRole="tablist"
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.sectionTabsContent}
      >
        {options.map(option => {
          const isActive = option.id === value;
          return (
            <Pressable
              key={option.id}
              onPress={() => onChange(option.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={option.label}
              style={[styles.sectionTab, isActive && { borderBottomColor: theme.primary }]}
            >
              <AppText
                variant="caption"
                weight={isActive ? 'semibold' : 'regular'}
                style={[
                  styles.sectionTabText,
                  { color: isActive ? theme.primary : theme.textSecondary },
                ]}
              >
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function MetricGrid({ section }: { section: ReportSection }) {
  const { theme } = useTheme();
  return (
    <View style={styles.metricGrid}>
      {(section.metrics ?? []).map(item => {
        const tone = metricTone(item.value);
        const color =
          tone === 'income' ? theme.success : tone === 'expense' ? theme.error : theme.text;
        const change = item.comparison?.percentageChange;
        return (
          <AppCard
            key={item.id}
            variant="secondary"
            paddingSize="sm"
            style={[styles.metricCard, { borderTopColor: color }]}
          >
            <AppText variant="caption" color="secondary" numberOfLines={1}>
              {item.label}
            </AppText>
            <MeasureText
              measure={item.value}
              variant="subheading"
              weight="bold"
              style={{ color }}
            />
            {change !== undefined && change !== null ? (
              <AppText variant="caption" color="secondary" numberOfLines={1}>
                {change > 0 ? '+' : ''}
                {change.toFixed(1)}% vs prior
              </AppText>
            ) : (
              <AppText variant="caption" color="secondary">
                Current period
              </AppText>
            )}
          </AppCard>
        );
      })}
    </View>
  );
}

function Trend({ visualization }: { visualization: ReportVisualization }) {
  const privateMode = useEffectivePrivacyMode();
  const { theme } = useTheme();
  const [selectedIndex, setSelectedIndex] = useState<number | undefined>();
  const waterfall = visualization.kind === 'WATERFALL' ? visualization : null;
  const reportSeries = visualization.kind === 'WATERFALL' ? null : visualization.series;
  const series = useMemo(() => reportSeries ?? [], [reportSeries]);
  const chartSeries = useMemo(
    () =>
      waterfall
        ? [
            { id: 'opening', label: 'Opening', value: waterfall.opening },
            ...waterfall.changes.flatMap(change =>
              change.value.kind === 'MONEY'
                ? [{ id: change.id, label: change.label, value: change.value }]
                : [],
            ),
            { id: 'closing', label: 'Closing', value: waterfall.closing },
          ]
        : null,
    [waterfall],
  );
  const barData = useMemo<BarChartDataPoint[]>(() => {
    if (chartSeries) {
      return chartSeries.map(item => ({
        label: item.label,
        values: [item.value.amount],
        colors: [item.value.amount < 0 ? theme.error : theme.primary],
      }));
    }
    const points = series[0]?.points ?? [];
    return points.map((point, index) => ({
      label: chartLabel(point.date),
      values: series.map(item => item.points[index]?.value.amount ?? 0),
      colors: series.map(item =>
        item.points[index]?.value.amount < 0 ? theme.error : theme.primary,
      ),
    }));
  }, [chartSeries, series, theme.error, theme.primary]);
  const lineData = useMemo<DataPoint[]>(
    () => (series[0]?.points ?? []).map(point => ({ x: point.date, y: point.value.amount })),
    [series],
  );
  const secondaryLineData = useMemo<DataPoint[]>(
    () => (series[1]?.points ?? []).map(point => ({ x: point.date, y: point.value.amount })),
    [series],
  );
  const tooltip = useCallback(
    (index: number) => {
      if (chartSeries) {
        const item = chartSeries[index];
        return item ? (
          <MoneyText amount={item.value.amount} currencyCode={item.value.currencyCode} />
        ) : null;
      }
      return series.map(item => {
        const point = item.points[index];
        return point ? (
          <AppText key={item.id} variant="caption">
            {item.label}:{' '}
            <MoneyText amount={point.value.amount} currencyCode={point.value.currencyCode} />
          </AppText>
        ) : null;
      });
    },
    [chartSeries, series],
  );
  const chart = chartSeries ? (
    <BarChart
      data={barData}
      currencyCode={waterfall!.closing.currencyCode}
      selectedIndex={selectedIndex}
      onPress={index => setSelectedIndex(index < 0 ? undefined : index)}
      renderTooltipContent={tooltip}
    />
  ) : visualization.kind === 'LINE' ? (
    <LineChart
      data={lineData}
      secondaryData={secondaryLineData.length > 0 ? secondaryLineData : undefined}
      currencyCode={series[0]?.points[0]?.value.currencyCode ?? ''}
      selectedIndex={selectedIndex}
      onPress={index => setSelectedIndex(index < 0 ? undefined : index)}
      renderTooltipContent={tooltip}
    />
  ) : (
    <BarChart
      data={barData}
      currencyCode={series[0]?.points[0]?.value.currencyCode ?? ''}
      stacked={visualization.kind === 'STACKED_BAR'}
      selectedIndex={selectedIndex}
      onPress={index => setSelectedIndex(index < 0 ? undefined : index)}
      renderTooltipContent={tooltip}
    />
  );
  return (
    <ReportChartCard
      title="Trend"
      headerContent={
        <View style={styles.chartLegend} accessibilityLabel="Trend series">
          {(chartSeries ?? series).map(item => (
            <AppText key={item.id} variant="caption" color="secondary">
              ● {item.label}
            </AppText>
          ))}
        </View>
      }
      testID="reports-v2-trend"
    >
      <View accessibilityRole="image" accessibilityLabel="Report trend chart">
        {chart}
      </View>
      <AppText variant="caption" color="secondary">
        {privateMode ? 'Values hidden' : 'Tap the chart to inspect a point'}
      </AppText>
    </ReportChartCard>
  );
}

function chartLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function Breakdown({
  section,
  onDrilldown,
  interactive = true,
}: {
  section: ReportSection;
  onDrilldown: (input: {
    label: string;
    accountIds?: readonly string[];
    journalIds?: readonly string[];
  }) => void;
  interactive?: boolean;
}) {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);
  if (!section.rows?.length)
    return (
      <EmptyStateView
        title="No activity in this period"
        subtitle="Try a wider range or include planned activity."
      />
    );
  const maximum = Math.max(1, ...section.rows.map(item => Math.abs(measureNumber(item.value))));
  return (
    <AppCard paddingSize="none">
      <View style={styles.breakdownHeader}>
        <View>
          <AppText variant="heading" weight="semibold">
            Details
          </AppText>
          <AppText variant="caption" color="secondary">
            {interactive
              ? 'Tap a row to inspect its journals'
              : 'Details will be available when the update finishes'}
          </AppText>
        </View>
        <AppText variant="caption" color="secondary">
          {section.rows.length} items
        </AppText>
      </View>
      {(expanded ? section.rows : section.rows.slice(0, 12)).map((item, index) => (
        <Pressable
          key={item.id}
          onPress={() => {
            if (!interactive) return;
            onDrilldown({
              label: item.label,
              accountIds: item.accountIds,
              journalIds: item.journalIds,
            });
          }}
          disabled={!interactive}
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.label} details`}
          accessibilityState={{ disabled: !interactive }}
          style={[
            styles.breakdownRow,
            !interactive && styles.breakdownRowDisabled,
            index > 0 && styles.rowBorder,
            index > 0 && { borderTopColor: theme.divider },
          ]}
        >
          <View style={styles.rowCopy}>
            <AppText variant="body" weight="medium" numberOfLines={2}>
              {item.label}
            </AppText>
            <View style={[styles.rowTrack, { backgroundColor: theme.surfaceSecondary }]}>
              <View
                style={[
                  styles.rowFill,
                  {
                    width: `${Math.min(100, (Math.abs(measureNumber(item.value)) / maximum) * 100)}%`,
                    backgroundColor: measureNumber(item.value) < 0 ? theme.error : theme.primary,
                  },
                ]}
              />
            </View>
          </View>
          <View style={styles.rowValue}>
            <MeasureText measure={item.value} variant="body" weight="semibold" />
            {item.percentage && item.percentage.value !== null ? (
              <AppText variant="caption" color="secondary">
                {item.percentage.value.toFixed(1)}%
              </AppText>
            ) : item.percentage ? (
              <AppText variant="caption" color="secondary">
                Unavailable
              </AppText>
            ) : null}
          </View>
          <AppIcon name={Icon.ChevronRight} size={17} color="textTertiary" />
        </Pressable>
      ))}
      {section.rows.length > 12 ? (
        <AppButton
          variant="ghost"
          size="sm"
          onPress={() => setExpanded(value => !value)}
          accessibilityLabel={
            expanded ? 'Show fewer details' : `Show all ${section.rows.length} details`
          }
          style={styles.showMoreButton}
        >
          {expanded ? 'Show less' : `Show all ${section.rows.length}`}
        </AppButton>
      ) : null}
    </AppCard>
  );
}

function ReportSectionView({
  section,
  onDrilldown,
  interactive = true,
}: {
  section: ReportSection;
  onDrilldown: (input: {
    label: string;
    accountIds?: readonly string[];
    journalIds?: readonly string[];
  }) => void;
  interactive?: boolean;
}) {
  return (
    <Stack gap="md">
      <View style={styles.sectionHeading}>
        <AppText variant="caption" color="secondary" weight="bold" style={styles.eyebrow}>
          REPORT VIEW
        </AppText>
        <AppText variant="xl">{section.title}</AppText>
      </View>
      <MetricGrid section={section} />
      {(section.visualizations ?? []).map((visualization, index) => (
        <Trend key={`${section.id}-visual-${index}`} visualization={visualization} />
      ))}
      {section.rows ? (
        <Breakdown section={section} onDrilldown={onDrilldown} interactive={interactive} />
      ) : null}
    </Stack>
  );
}

export function ReportsV2View({ engine, workplaceId, targetCurrency, chrome }: ReportsV2ViewProps) {
  const { theme } = useTheme();
  const { accounts } = useAccounts(asWorkplaceId(workplaceId));
  const [areFiltersExpanded, setAreFiltersExpanded] = useState(false);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [isAccountPickerVisible, setIsAccountPickerVisible] = useState(false);
  const openDatePicker = useCallback(() => setIsDatePickerVisible(true), []);
  const openAccountPicker = useCallback(() => setIsAccountPickerVisible(true), []);
  const toggleFilters = useCallback(() => setAreFiltersExpanded(expanded => !expanded), []);
  const handleJournalDrilldown = useCallback(
    ({
      journalIds,
      accountIds,
      startDate,
      endDate,
    }: {
      journalIds: readonly string[];
      accountIds?: readonly string[];
      startDate: number;
      endDate: number;
    }) => {
      AppNavigation.toJournalSearch({
        ...(startDate > 0 ? { startDate, endDate } : {}),
        accountIds: accountIds ? [...accountIds] : undefined,
        journalIds: journalIds.length > 0 ? [...journalIds] : undefined,
      });
    },
    [],
  );
  const vm = useReportsV2ViewModel({
    engine,
    workplaceId,
    targetCurrency,
    onRequestCustomRange: openDatePicker,
    onRequestAccountScope: openAccountPicker,
    onJournalDrilldown: handleJournalDrilldown,
  });
  const onPeriodPresetChange = vm.filters.onPeriodPresetChange;
  const setCustomRange = vm.setCustomRange;
  const currentPickerFilter = useMemo<PeriodFilter>(() => {
    if (vm.filters.periodPreset === 'all-time') return { type: 'ALL_TIME' };
    if (vm.filters.periodPreset === 'custom') {
      return {
        type: 'CUSTOM',
        startDate: vm.query.period.startDate,
        endDate: vm.query.period.endDate,
      };
    }
    const start = new Date(vm.query.period.startDate);
    return { type: 'MONTH', month: start.getMonth(), year: start.getFullYear() };
  }, [vm.filters.periodPreset, vm.query.period.endDate, vm.query.period.startDate]);
  const handleDateSelect = useCallback(
    (range: DateRange | null, filter: PeriodFilter) => {
      if (filter.type === 'ALL_TIME') {
        onPeriodPresetChange('all-time');
      } else if (range) {
        setCustomRange(range.startDate, range.endDate);
      }
      setIsDatePickerVisible(false);
    },
    [onPeriodPresetChange, setCustomRange],
  );
  const selectedAccountIds = useMemo(
    () => vm.filters.accountIds.map(asAccountId),
    [vm.filters.accountIds],
  );
  const activeSection = useMemo(
    () =>
      vm.result?.sections.find(section => section.id === vm.activeSection) ??
      vm.result?.sections[0],
    [vm.activeSection, vm.result],
  );
  const sectionOptions = useMemo<readonly SegmentedOption<string>[]>(
    () => REPORTS_V2_SECTIONS.map(item => ({ id: item.id, label: item.shortLabel })),
    [],
  );
  const warnings = vm.result?.warnings ?? [];
  return (
    <>
      <ScreenWithChrome chrome={chrome} scrollable={false}>
        <Inset space="md" vertical="md" flex={1}>
          <ScrollView
            contentContainerStyle={styles.content}
            refreshControl={
              <RefreshControl
                refreshing={vm.state === 'refreshing'}
                onRefresh={vm.onRefresh}
                tintColor={theme.primary}
              />
            }
          >
            <SectionFilters vm={vm} isExpanded={areFiltersExpanded} onToggle={toggleFilters} />
            {vm.result && (vm.state === 'refreshing' || vm.state === 'error') ? (
              <ReportStatusNotice state={vm.state} onRetry={vm.onRetry} />
            ) : null}
            <View style={styles.sectionNav}>
              <ReportSectionTabs
                options={sectionOptions}
                value={vm.activeSection}
                onChange={value => vm.setActiveSection(value as ReportsV2SectionId)}
              />
            </View>
            {vm.result ? (
              <QualityBanner warnings={warnings} onPress={() => vm.setActiveSection('health')} />
            ) : null}
            {vm.state === 'error' && !vm.result ? (
              <EmptyStateView
                title="Report unavailable"
                subtitle={vm.error?.message ?? 'Try again.'}
                primaryActionLabel="Retry"
                onPrimaryAction={vm.onRetry}
              />
            ) : null}
            {vm.state === 'loading' && !vm.result ? (
              <LoadingView loading text="Building your report…" />
            ) : null}
            {vm.result && activeSection ? (
              <ReportSectionView
                section={activeSection}
                onDrilldown={vm.onDrilldown}
                interactive={vm.state !== 'refreshing' && vm.state !== 'error'}
              />
            ) : null}
          </ScrollView>
        </Inset>
      </ScreenWithChrome>
      <MultiAccountPickerModal
        visible={isAccountPickerVisible}
        onClose={() => setIsAccountPickerVisible(false)}
        onSelect={vm.filters.onAccountIdsChange}
        accounts={accounts}
        selectedIds={selectedAccountIds}
        title="Filter by accounts"
      />
      <DateRangePicker
        visible={isDatePickerVisible}
        onClose={() => setIsDatePickerVisible(false)}
        currentFilter={currentPickerFilter}
        onSelect={handleDateSelect}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: Spacing.xxxxl, gap: Spacing.xl },
  eyebrow: { letterSpacing: 1.2 },
  sectionNav: { gap: Spacing.xs },
  sectionTabs: { borderBottomWidth: 1 },
  sectionTabsContent: { flexDirection: 'row', gap: Spacing.lg, paddingHorizontal: Spacing.xs },
  sectionTab: {
    minHeight: 44,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  sectionTabText: { textTransform: 'uppercase', letterSpacing: Typography.letterSpacing.wide },
  sectionHeading: { gap: Spacing.xs },
  qualityBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderRadius: Shape.radius.r2,
    padding: Spacing.md,
  },
  qualityIcon: {
    width: 34,
    height: 34,
    borderRadius: Shape.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qualityCopy: { flex: 1, gap: Spacing.xs },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  metricCard: { flexGrow: 1, flexBasis: '30%', minWidth: 112, borderTopWidth: 2 },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
  },
  chartLegend: {
    flexDirection: 'row',
    gap: Spacing.md,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    flex: 1,
    marginLeft: Spacing.md,
  },
  chart: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.xs,
    borderBottomWidth: 1,
    paddingHorizontal: 2,
  },
  chartSeries: { flex: 1, minHeight: 78, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  chartBar: { flex: 1, minWidth: 2, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  breakdownHeader: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.md,
  },
  breakdownRow: {
    minHeight: 78,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  breakdownRowDisabled: { opacity: 0.6 },
  rowBorder: { borderTopWidth: 1 },
  rowCopy: { flex: 1, gap: Spacing.sm },
  rowTrack: { height: 5, borderRadius: 5, overflow: 'hidden' },
  rowFill: { height: 5, borderRadius: 5 },
  showMoreButton: { alignSelf: 'center', marginVertical: Spacing.sm },
  rowValue: { alignItems: 'flex-end', minWidth: 76, gap: Spacing.xs },
  statusNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Shape.radius.r2,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  statusIcon: {
    width: 30,
    height: 30,
    borderRadius: Shape.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCopy: { flex: 1, gap: Spacing.xs },
});
