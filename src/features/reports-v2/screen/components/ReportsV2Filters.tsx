import { Icon, type SegmentedOption } from '@/src/components/core';
import { FilterDisclosure } from '@/src/components/filters/FilterDisclosure';
import type { ReportsV2ViewModel } from '../../types';

export function ReportsV2Filters({
  vm,
  isExpanded,
  onToggle,
}: {
  vm: Pick<ReportsV2ViewModel, 'filters'>;
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
