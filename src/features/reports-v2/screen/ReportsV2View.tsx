import { MultiAccountPickerModal, useAccounts } from '@/src/components/account-selection';
import { DateRangePicker } from '@/src/components/filters/DateRangePicker';
import {
  AppButton,
  AppTabs,
  ErrorStateView,
  LoadingView,
  type TabOption,
} from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AppConfig } from '@/src/constants';
import { Spacing } from '@/src/constants/design-tokens';
import { Box } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import type { ReportsV2QueryEngine } from '@/src/services/reports-v2/reportQueryEngine';
import { asAccountId, asWorkplaceId } from '@/src/types/ids';
import type { DateRange, PeriodFilter } from '@/src/domain/calendar/dateRanges';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import type { Observable } from 'rxjs';
import { IncompleteFxWarning } from '@/src/components/shared/IncompleteFxWarning';
import { showIncompleteFxDetails } from '@/src/services/currency/incompleteFxDetails';
import { formatPeriodLabel, REPORTS_V2_SECTIONS } from '../helpers';
import { useReportsV2ViewModel } from '../hooks/useReportsV2ViewModel';
import type { ReportsV2SectionId } from '../types';
import { ReportsV2Filters } from './components/ReportsV2Filters';
import { ReportsV2QualityBanner } from './components/ReportsV2QualityBanner';
import { ReportsV2SectionContent } from './components/ReportsV2SectionContent';
import { ReportsV2StatusNotice } from './components/ReportsV2StatusNotice';
import {
  explanationContextFromFilters,
  reportExplanationDataNotes,
} from './components/reportExplanations';

interface ReportsV2ViewProps {
  engine: ReportsV2QueryEngine;
  workplaceId: string;
  targetCurrency: string;
  inputChanges?: Observable<unknown>;
  refreshVersion?: number;
  chrome: ScreenNavChrome;
}

export function ReportsV2View({
  engine,
  workplaceId,
  targetCurrency,
  inputChanges,
  refreshVersion,
  chrome,
}: ReportsV2ViewProps) {
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
        ...(endDate > 0 ? { startDate, endDate } : {}),
        accountIds: accountIds ? [...accountIds] : undefined,
        journalIds: journalIds.length > 0 ? [...journalIds] : undefined,
      });
    },
    [],
  );
  const vm = useReportsV2ViewModel({
    engine,
    inputChanges,
    workplaceId,
    targetCurrency,
    refreshVersion,
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
  const warnings = useMemo(() => vm.result?.warnings ?? [], [vm.result?.warnings]);
  const explanationContext = useMemo(() => {
    if (vm.resultIsCurrent || !vm.result) return explanationContextFromFilters(vm.filters);
    const query = vm.result.query;
    const accountCount = query.accountIds?.length ?? 0;
    return explanationContextFromFilters({
      periodLabel: formatPeriodLabel(query.period.startDate, query.period.endDate, 'custom'),
      accountScopeLabel: accountCount
        ? `${accountCount} selected account${accountCount === 1 ? '' : 's'}`
        : 'All accounts',
      basis: query.basis,
      comparison: query.comparison,
      includeArchivedAccounts: query.includeArchivedAccounts !== false,
      targetCurrency: query.targetCurrency,
    });
  }, [vm.filters, vm.result, vm.resultIsCurrent]);
  const explanationDataNotes = useMemo(() => reportExplanationDataNotes(warnings), [warnings]);

  return (
    <>
      <ScreenWithChrome chrome={chrome} scrollable={false}>
        <Box padding="lg" paddingVertical="md" flex={1}>
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
              <ReportsV2StatusNotice
                state={vm.state}
                onRetry={vm.onRetry}
                message={
                  !vm.resultIsCurrent
                    ? AppConfig.strings.reportsV2.previousFilterResults
                    : undefined
                }
              />
            ) : null}
            {vm.result &&
            !vm.resultIsCurrent &&
            vm.state !== 'error' &&
            vm.state !== 'refreshing' ? (
              <ReportsV2StatusNotice
                state="refreshing"
                onRetry={vm.onRetry}
                message={AppConfig.strings.reportsV2.previousFilterResults}
              />
            ) : null}
            <AppTabs
              options={sectionOptions}
              value={vm.activeSection}
              onChange={vm.setActiveSection}
              testID="reports-v2-section-tabs"
            />
            {vm.result && vm.resultIsCurrent ? (
              <ReportsV2QualityBanner
                warnings={warnings}
                onPress={() => vm.resultIsCurrent && vm.setActiveSection('health')}
              />
            ) : null}
            {vm.resultIsCurrent && vm.missingRateQuotes.length > 0 ? (
              <IncompleteFxWarning
                testID="reports-v2-incomplete-fx-warning"
                message={AppConfig.strings.reportsV2.incompleteFxWarning}
                onPress={() =>
                  vm.resultIsCurrent &&
                  showIncompleteFxDetails({
                    context: 'reports',
                    currencyCode: targetCurrency,
                    missingRateQuotes: vm.missingRateQuotes,
                  })
                }
              />
            ) : null}
            {vm.state === 'error' && !vm.result ? (
              <ErrorStateView
                variant="inline"
                message={
                  vm.error?.message
                    ? `Report unavailable. ${vm.error.message}`
                    : 'Report unavailable. Try again.'
                }
                retryLabel={AppConfig.strings.common.retry}
                onRetry={vm.onRetry}
              />
            ) : null}
            {(vm.state === 'loading' || vm.state === 'refreshing') && !vm.result ? (
              <LoadingView loading text="Building your report…" />
            ) : null}
            {vm.renderedSection ? (
              <ReportsV2SectionContent
                section={vm.renderedSection}
                explanationContext={explanationContext}
                dataNotes={explanationDataNotes}
                onDrilldown={vm.onDrilldown}
                interactive={
                  vm.resultIsCurrent && vm.state !== 'refreshing' && vm.state !== 'error'
                }
              />
            ) : null}
            {vm.activeSection === 'health' && vm.canFetchMissingRates ? (
              <AppButton
                variant="secondary"
                onPress={vm.onFetchMissingRates}
                loading={vm.isFetchingMissingRates}
                disabled={
                  !vm.resultIsCurrent ||
                  vm.state === 'refreshing' ||
                  vm.state === 'error' ||
                  vm.isFetchingMissingRates
                }
                accessibilityLabel={AppConfig.strings.reportsV2.fetchMissingRates}
              >
                {AppConfig.strings.reportsV2.fetchMissingRates}
              </AppButton>
            ) : null}
          </ScrollView>
        </Box>
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
