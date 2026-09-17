import { MultiAccountPickerModal, useAccounts } from '@/src/components/account-selection';
import { DateRangePicker } from '@/src/components/filters/DateRangePicker';
import { AppTabs, EmptyStateView, LoadingView, type TabOption } from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { Spacing } from '@/src/constants/design-tokens';
import { Inset } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import type { ReportsV2QueryEngine } from '@/src/services/reports-v2/reportQueryEngine';
import { asAccountId, asWorkplaceId } from '@/src/types/ids';
import type { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { REPORTS_V2_SECTIONS } from '../helpers';
import { useReportsV2ViewModel } from '../hooks/useReportsV2ViewModel';
import type { ReportsV2SectionId } from '../types';
import { ReportsV2Filters } from './components/ReportsV2Filters';
import { ReportsV2QualityBanner } from './components/ReportsV2QualityBanner';
import { ReportsV2SectionContent } from './components/ReportsV2SectionContent';
import { ReportsV2MissingRatesAction } from './components/ReportsV2MissingRatesAction';
import { ReportsV2StatusNotice } from './components/ReportsV2StatusNotice';

interface ReportsV2ViewProps {
  engine: ReportsV2QueryEngine;
  workplaceId: string;
  targetCurrency: string;
  chrome: ScreenNavChrome;
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
  const sectionOptions = useMemo<readonly TabOption<ReportsV2SectionId>[]>(
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
            <ReportsV2Filters vm={vm} isExpanded={areFiltersExpanded} onToggle={toggleFilters} />
            {vm.result && (vm.state === 'refreshing' || vm.state === 'error') ? (
              <ReportsV2StatusNotice state={vm.state} onRetry={vm.onRetry} />
            ) : null}
            <AppTabs
              options={sectionOptions}
              value={vm.activeSection}
              onChange={vm.setActiveSection}
              testID="reports-v2-section-tabs"
            />
            {vm.result ? (
              <ReportsV2QualityBanner
                warnings={warnings}
                onPress={() => vm.setActiveSection('health')}
              />
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
            {vm.renderedSection ? (
              <ReportsV2SectionContent
                section={vm.renderedSection}
                onDrilldown={vm.onDrilldown}
                interactive={vm.state !== 'refreshing' && vm.state !== 'error'}
              />
            ) : null}
            {vm.activeSection === 'health' && vm.canFetchMissingRates ? (
              <ReportsV2MissingRatesAction
                onPress={vm.onFetchMissingRates}
                loading={vm.isFetchingMissingRates}
                disabled={vm.state === 'refreshing' || vm.state === 'error'}
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

const styles = {
  content: { paddingBottom: Spacing.xxxxl, gap: Spacing.xl },
};
