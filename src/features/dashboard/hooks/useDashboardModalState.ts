import { analytics } from '@/src/services/analytics-service';
import { useMemo, useState } from 'react';

export type DashboardExplanationSection = 'assets' | 'income' | 'committed' | 'debts';
export type DashboardLegendItem = 'safe' | 'committed' | 'debts';

export function useDashboardModalState() {
  const [isExplanationVisible, setExplanationVisible] = useState(false);
  const [expandedSection, setExpandedSection] = useState<DashboardExplanationSection | null>(null);
  const [selectedLegendItem, setSelectedLegendItem] = useState<DashboardLegendItem | null>(null);

  const explanationModalState = useMemo(
    () => ({
      visible: isExplanationVisible,
      setVisible: (visible: boolean) => {
        setExplanationVisible(visible);
        if (visible) analytics.logChartInteracted('safe_to_spend', 'explanation_open');
      },
      expandedSection,
      setExpandedSection: (section: DashboardExplanationSection | null) => {
        setExpandedSection(section);
        if (section) analytics.logChartInteracted('safe_to_spend', `explanation_expand_${section}`);
      },
    }),
    [isExplanationVisible, expandedSection],
  );

  const legendModalState = useMemo(
    () => ({
      selectedItem: selectedLegendItem,
      setSelectedItem: setSelectedLegendItem,
    }),
    [selectedLegendItem],
  );

  return { explanationModalState, legendModalState };
}
