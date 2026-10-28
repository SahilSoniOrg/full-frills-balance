import { ScreenWithChrome } from '@/src/components/layout';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { PrivacyToggleButton } from '@/src/components/shared/PrivacyToggleButton';
import { AppTabs } from '@/src/components/core';
import { Box } from '@/src/design-system';
import { AppConfig } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { BudgetListView, useBudgetListViewModel } from '@/src/features/budget';
import { PlannedPaymentListView, usePlannedPayments } from '@/src/features/planned-payments';
import { useCommitmentsBadgeSnapshot } from '@/src/features/commitments/CommitmentsGroupProvider';
import { usePrimaryPageNavigation } from '@/src/navigation/primaryPageNavigation';
import { primaryPageIndex } from '@/src/navigation/primaryPages';
import { AppNavigation } from '@/src/utils/navigation';
import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';

export type CommitmentsTab = 'budgets' | 'planned';

export function CommitmentsPage({ activeTab = 'budgets' }: { activeTab?: CommitmentsTab }) {
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  const isFocused = useIsFocused();
  // Neighbor previews may mount both Budgets and Planned pages. Gate each read
  // pipeline to the focused matching tab so both hooks never run hot together.
  const budgets = useBudgetListViewModel(
    workplaceId,
    defaultCurrencyCode,
    isFocused && activeTab === 'budgets',
  );
  const planned = usePlannedPayments(workplaceId, isFocused && activeTab === 'planned');
  const { counts, updateCount } = useCommitmentsBadgeSnapshot();
  const pageNavigation = usePrimaryPageNavigation();
  const strings = AppConfig.strings.commitmentsRedesign;

  useEffect(() => {
    if (isFocused && activeTab === 'budgets' && !budgets.isLoading) {
      updateCount('budgets', budgets.items.length);
    }
  }, [activeTab, budgets.isLoading, budgets.items.length, isFocused, updateCount]);
  useEffect(() => {
    if (isFocused && activeTab === 'planned' && !planned.isLoading) {
      updateCount('planned', planned.items.length);
    }
  }, [activeTab, isFocused, planned.isLoading, planned.items.length, updateCount]);

  const options = useMemo(
    () => [
      {
        id: 'budgets' as const,
        label: strings.budgets,
        badge: counts.budgets ?? undefined,
        pageIndex: primaryPageIndex('commitments'),
      },
      {
        id: 'planned' as const,
        label: strings.planned,
        badge: counts.planned ?? undefined,
        pageIndex: primaryPageIndex('planned-payments'),
      },
    ],
    [counts.budgets, counts.planned, strings.budgets, strings.planned],
  );
  const chrome = useMemo<TabScreenChrome>(
    () => ({
      screenTitle: strings.title,
      kind: 'tab',
      headerActions: <PrivacyToggleButton />,
    }),
    [strings],
  );
  const setActiveTab = useCallback(
    (next: CommitmentsTab) => {
      const routeName = next === 'planned' ? 'planned-payments' : 'commitments';
      if (pageNavigation) pageNavigation.navigateToPage(routeName);
      else AppNavigation.toPrimaryPage(routeName);
    },
    [pageNavigation],
  );

  return (
    <ScreenWithChrome
      chrome={chrome}
      scrollable={false}
      testID={activeTab === 'budgets' ? 'commitments-screen' : 'planned-payments-screen'}
    >
      <Box marginTop="md">
        <AppTabs
          testID="commitments-tabs"
          options={options}
          value={activeTab}
          onChange={setActiveTab}
          pageProgress={pageNavigation?.pageProgress}
        />
      </Box>
      <Box flex={1}>
        {activeTab === 'budgets' ? (
          <BudgetListView
            {...budgets}
            onRetry={budgets.retry}
            onCreate={() => AppNavigation.toBudgetForm()}
          />
        ) : (
          <PlannedPaymentListView
            {...planned}
            onRetry={planned.retry}
            onCreate={() => AppNavigation.toPlannedPaymentForm()}
          />
        )}
      </Box>
    </ScreenWithChrome>
  );
}

export default CommitmentsPage;
