import { AppConfig } from '@/src/constants';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useHub } from '@/src/features/hub/hooks/useHub';
import { Insight } from '@/src/services/insight/InsightService';
import { useCallback, useMemo, useState } from 'react';

export type HubTab = 'active' | 'dismissed';

export interface HubViewModel {
  title: string;
  activeTab: HubTab;
  setActiveTab: (tab: HubTab) => void;
  tabOptions: { id: HubTab; label: string; badge: number }[];
  activeInsights: Insight[];
  dismissedInsights: Insight[];
  unreadSmsCount: number;
  currencyCode: string;
  isPrivacyMode: boolean;
  strings: typeof AppConfig.strings.dashboard.hub;
  dismissInsight: (id: string) => Promise<void> | void;
  restoreInsight: (id: string) => Promise<void>;
}

export function useHubViewModel(): HubViewModel {
  const { strings } = AppConfig;
  const hubStrings = strings.dashboard.hub;
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  const isPrivacyMode = useEffectivePrivacyMode();
  const [activeTab, setActiveTab] = useState<HubTab>('active');
  const { activeInsights, dismissedInsights, unreadSmsCount, dismissInsight, restoreInsight } =
    useHub(workplaceId);

  const tabOptions = useMemo(
    () => [
      {
        id: 'active' as const,
        label: hubStrings.activeTab,
        badge: activeInsights.length + (unreadSmsCount > 0 ? 1 : 0),
      },
      {
        id: 'dismissed' as const,
        label: hubStrings.dismissedTab,
        badge: dismissedInsights.length,
      },
    ],
    [hubStrings, activeInsights.length, unreadSmsCount, dismissedInsights.length],
  );

  const onRestore = useCallback(
    async (id: string) => {
      await restoreInsight(id);
    },
    [restoreInsight],
  );

  return {
    title: hubStrings.title,
    activeTab,
    setActiveTab,
    tabOptions,
    activeInsights,
    dismissedInsights,
    unreadSmsCount,
    currencyCode: defaultCurrencyCode,
    isPrivacyMode,
    strings: hubStrings,
    dismissInsight,
    restoreInsight: onRestore,
  };
}
