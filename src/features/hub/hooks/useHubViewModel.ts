import { AppConfig } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useInsightPatterns, useDismissedInsightPatterns } from '@/src/hooks/useInsightPatterns';
import { useUnreadSmsCount } from '@/src/hooks/useUnreadSmsCount';
import { analytics } from '@/src/services/analytics-service';
import { insightService, Insight } from '@/src/services/insight/InsightService';
import { useCallback, useMemo, useState } from 'react';

export type HubTab = 'active' | 'dismissed';

export interface HubViewModel {
  activeTab: HubTab;
  setActiveTab: (tab: HubTab) => void;
  tabOptions: { id: HubTab; label: string; badge: number }[];
  activeInsights: Insight[];
  dismissedInsights: Insight[];
  unreadSmsCount: number;
  currencyCode: string;
  strings: typeof AppConfig.strings.dashboard.hub;
  dismissInsight: (id: string) => Promise<void>;
  restoreInsight: (id: string) => Promise<void>;
}

export function useHubViewModel(): HubViewModel {
  const hubStrings = AppConfig.strings.dashboard.hub;
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  const [activeTab, setActiveTabState] = useState<HubTab>('active');

  const setActiveTab = useCallback((tab: HubTab) => {
    setActiveTabState(tab);
    analytics.trackFeatureUsage('hub', 'change_tab', { tab });
  }, []);

  const { data: activeInsights } = useInsightPatterns(workplaceId);
  const { data: dismissedInsights } = useDismissedInsightPatterns(workplaceId);
  const { data: unreadSmsCount } = useUnreadSmsCount(workplaceId);

  const dismissInsight = useCallback(async (id: string) => {
    analytics.trackFeatureUsage('hub', 'dismiss_insight', { pattern_id: id });
    await insightService.dismissPattern(id);
  }, []);

  const restoreInsight = useCallback(async (id: string) => {
    analytics.trackFeatureUsage('hub', 'restore_insight', { pattern_id: id });
    await insightService.undismissPattern(id);
  }, []);

  const tabOptions = useMemo(
    () => [
      {
        id: 'active' as const,
        label: hubStrings.activeTab,
        badge: (activeInsights?.length ?? 0) + ((unreadSmsCount ?? 0) > 0 ? 1 : 0),
      },
      {
        id: 'dismissed' as const,
        label: hubStrings.dismissedTab,
        badge: dismissedInsights?.length ?? 0,
      },
    ],
    [hubStrings, activeInsights?.length, unreadSmsCount, dismissedInsights?.length],
  );

  return {
    activeTab,
    setActiveTab,
    tabOptions,
    activeInsights: activeInsights ?? [],
    dismissedInsights: dismissedInsights ?? [],
    unreadSmsCount: unreadSmsCount ?? 0,
    currencyCode: defaultCurrencyCode,
    strings: hubStrings,
    dismissInsight,
    restoreInsight,
  };
}
