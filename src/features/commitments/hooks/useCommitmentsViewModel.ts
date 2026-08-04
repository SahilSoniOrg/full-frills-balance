import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useMemo, useState } from 'react';

export type CommitmentsTab = 'budgets' | 'planned';

export interface CommitmentsViewModel {
  activeTab: CommitmentsTab;
  setActiveTab: (tab: CommitmentsTab) => void;
  tabOptions: { id: CommitmentsTab; label: string }[];
  subtitle: string;
  isPrivacyMode: boolean;
  fab: {
    onPress: () => void;
    label: string;
    accessibilityLabel: string;
  };
}

export function useCommitmentsViewModel(): CommitmentsViewModel {
  const [activeTab, setActiveTab] = useState<CommitmentsTab>('budgets');
  const isPrivacyMode = useEffectivePrivacyMode();

  const tabOptions = useMemo(
    () => [
      { id: 'budgets' as const, label: 'Budgets' },
      { id: 'planned' as const, label: 'Planned' },
    ],
    [],
  );

  const subtitle =
    activeTab === 'budgets'
      ? 'Monthly budget limits and usage.'
      : 'Recurring rules and upcoming posts.';

  const onPress = useCallback(() => {
    if (activeTab === 'budgets') {
      AppNavigation.toBudgetForm();
    } else {
      AppNavigation.toPlannedPaymentForm();
    }
  }, [activeTab]);

  const fab = useMemo(
    () => ({
      onPress,
      label: activeTab === 'budgets' ? 'New Budget' : 'New Planned Payment',
      accessibilityLabel:
        activeTab === 'budgets' ? 'Create a new budget' : 'Create a new planned payment',
    }),
    [activeTab, onPress],
  );

  return {
    activeTab,
    setActiveTab,
    tabOptions,
    subtitle,
    isPrivacyMode,
    fab,
  };
}
