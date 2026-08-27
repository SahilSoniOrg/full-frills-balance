import { useDashboardFeatureActions } from '@/src/features/dashboard/hooks/useDashboardFeatureActions';
import React, { useCallback, useMemo } from 'react';
import { SafeToSpendMapper } from '../mappers/SafeToSpendMapper';
import type { SafeToSpendMapperInput } from '../mappers/SafeToSpendMapper';
import { SafeToSpendViewModel } from '../types/SafeToSpendViewModel';

export interface SafeToSpendViewProps extends SafeToSpendMapperInput {
  currencyCode: string;
  isLoading?: boolean;
  uiState?: {
    isInfoVisible?: boolean;
    setInfoVisible?: (v: boolean) => void;
    expandedSection?: 'assets' | 'income' | 'committed' | 'debts' | null;
    setExpandedSection?: (s: 'assets' | 'income' | 'committed' | 'debts' | null) => void;
    selectedLegendItem?: 'safe' | 'committed' | 'debts' | null;
    setSelectedLegendItem?: (i: 'safe' | 'committed' | 'debts' | null) => void;
  };
}

export function useSafeToSpendView(props: SafeToSpendViewProps): SafeToSpendViewModel & {
  isInfoVisible: boolean;
  setInfoVisible: (v: boolean) => void;
  expandedSection: 'assets' | 'income' | 'committed' | 'debts' | null;
  setExpandedSection: (s: 'assets' | 'income' | 'committed' | 'debts' | null) => void;
  selectedLegendItem: 'safe' | 'committed' | 'debts' | null;
  setSelectedLegendItem: (i: 'safe' | 'committed' | 'debts' | null) => void;
} {
  const { trackInfoVisible, trackSectionExpanded, trackLegendPressed } =
    useDashboardFeatureActions();
  const { currencyCode, isLoading: propsIsLoading } = props;

  // UI State management
  const [internalInfoVisible, setInternalInfoVisible] = React.useState(false);
  const [internalExpandedSection, setInternalExpandedSection] = React.useState<
    'assets' | 'income' | 'committed' | 'debts' | null
  >(null);
  const [internalSelectedLegendItem, setInternalSelectedLegendItem] = React.useState<
    'safe' | 'committed' | 'debts' | null
  >(null);

  const isInfoVisible = props.uiState?.isInfoVisible ?? internalInfoVisible;
  const setInfoVisible = props.uiState?.setInfoVisible ?? setInternalInfoVisible;
  const expandedSection = props.uiState?.expandedSection ?? internalExpandedSection;
  const setExpandedSection = props.uiState?.setExpandedSection ?? setInternalExpandedSection;
  const selectedLegendItem = props.uiState?.selectedLegendItem ?? internalSelectedLegendItem;
  const setSelectedLegendItem =
    props.uiState?.setSelectedLegendItem ?? setInternalSelectedLegendItem;

  const {
    summary,
    totalLiquidAssets,
    report,
    accountSummaries,
    liquidAssetSubtypes,
    accountMap,
    safeToSpendDays,
  } = props;

  const viewModel = useMemo(() => {
    return SafeToSpendMapper.mapToViewModel(
      {
        summary,
        totalLiquidAssets,
        report: report!, // Mapper handles null/undefined
        accountSummaries,
        liquidAssetSubtypes,
        accountMap,
        safeToSpendDays,
      },
      {
        isLoading: !!propsIsLoading,
        currencyCode,
      },
    );
  }, [
    summary,
    totalLiquidAssets,
    report,
    accountSummaries,
    liquidAssetSubtypes,
    accountMap,
    propsIsLoading,
    currencyCode,
    safeToSpendDays,
  ]);

  const handleSetInfoVisible = useCallback(
    (v: boolean) => {
      setInfoVisible(v);
      trackInfoVisible(v, viewModel.isOverCommitted);
    },
    [setInfoVisible, trackInfoVisible, viewModel.isOverCommitted],
  );

  const handleSetExpandedSection = useCallback(
    (s: 'assets' | 'income' | 'committed' | 'debts' | null) => {
      setExpandedSection(s);
      if (s) trackSectionExpanded(s);
    },
    [setExpandedSection, trackSectionExpanded],
  );

  const handleSetSelectedLegendItem = useCallback(
    (i: 'safe' | 'committed' | 'debts' | null) => {
      setSelectedLegendItem(i);
      if (i) trackLegendPressed(i);
    },
    [setSelectedLegendItem, trackLegendPressed],
  );

  return {
    ...viewModel,

    // UI Orchestration
    isInfoVisible,
    setInfoVisible: handleSetInfoVisible,
    expandedSection,
    setExpandedSection: handleSetExpandedSection,
    selectedLegendItem,
    setSelectedLegendItem: handleSetSelectedLegendItem,
  };
}
