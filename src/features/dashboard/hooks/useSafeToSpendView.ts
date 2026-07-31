import { usePrivacyPrefs } from '@/src/hooks/usePrivacyPrefs';
import { analytics } from '@/src/services/analytics-service';
import { SafeToSpendDashboard } from '@/src/services/simulation/SafeToSpendReadModel';
import React, { useCallback, useMemo } from 'react';
import { SafeToSpendMapper } from '../mappers/SafeToSpendMapper';
import { SafeToSpendViewModel } from '../types/SafeToSpendViewModel';

export interface SafeToSpendViewProps extends SafeToSpendDashboard {
  isLoading?: boolean;
  uiState?: {
    isInfoVisible?: boolean;
    setInfoVisible?: (v: boolean) => void;
    expandedSection?: 'assets' | 'income' | 'committed' | 'debts' | null;
    setExpandedSection?: (s: 'assets' | 'income' | 'committed' | 'debts' | null) => void;
    selectedLegendItem?: 'safe' | 'committed' | 'debts' | null;
    setSelectedLegendItem?: (i: 'safe' | 'committed' | 'debts' | null) => void;
    isPrivacyMode?: boolean;
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
  const { currencyCode, isLoading: propsIsLoading } = props;

  const { isPrivacyMode: globalPrivacyMode } = usePrivacyPrefs();
  const isPrivacyMode = props.uiState?.isPrivacyMode ?? globalPrivacyMode;

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
        isPrivacyMode,
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
    isPrivacyMode,
    propsIsLoading,
    currencyCode,
    safeToSpendDays,
  ]);

  const handleSetInfoVisible = useCallback(
    (v: boolean) => {
      setInfoVisible(v);
      if (v) {
        analytics.trackFeatureUsage('safe_to_spend', 'opened', {
          isOverCommitted: viewModel.isOverCommitted,
        });
      } else {
        analytics.trackFeatureUsage('safe_to_spend', 'closed');
      }
    },
    [setInfoVisible, viewModel.isOverCommitted],
  );

  const handleSetExpandedSection = useCallback(
    (s: 'assets' | 'income' | 'committed' | 'debts' | null) => {
      setExpandedSection(s);
      if (s) {
        analytics.trackFeatureUsage('safe_to_spend', 'section_expanded', { section: s });
      }
    },
    [setExpandedSection],
  );

  const handleSetSelectedLegendItem = useCallback(
    (i: 'safe' | 'committed' | 'debts' | null) => {
      setSelectedLegendItem(i);
      if (i) {
        analytics.trackFeatureUsage('safe_to_spend', 'legend_pressed', { item: i });
      }
    },
    [setSelectedLegendItem],
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
