import { AppNavigation } from '@/src/utils/navigation';
import { useState } from 'react';

export type CommitmentsTab = 'budgets' | 'planned';

const TAB_OPTIONS = [
  { id: 'budgets' as const, label: 'Budgets' },
  { id: 'planned' as const, label: 'Planned' },
];

export interface CommitmentsViewModel {
  activeTab: CommitmentsTab;
  setActiveTab: (tab: CommitmentsTab) => void;
  tabOptions: typeof TAB_OPTIONS;
  subtitle: string;
  fab: {
    onPress: () => void;
    label: string;
    accessibilityLabel: string;
  };
}

export function useCommitmentsViewModel(): CommitmentsViewModel {
  const [activeTab, setActiveTab] = useState<CommitmentsTab>('budgets');

  return {
    activeTab,
    setActiveTab,
    tabOptions: TAB_OPTIONS,
    subtitle:
      activeTab === 'budgets'
        ? 'Monthly budget limits and usage.'
        : 'Recurring rules and upcoming posts.',
    fab: {
      onPress: () => {
        if (activeTab === 'budgets') {
          AppNavigation.toBudgetForm();
        } else {
          AppNavigation.toPlannedPaymentForm();
        }
      },
      label: activeTab === 'budgets' ? 'New Budget' : 'New Planned Payment',
      accessibilityLabel:
        activeTab === 'budgets' ? 'Create a new budget' : 'Create a new planned payment',
    },
  };
}
