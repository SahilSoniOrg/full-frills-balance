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
import { GroupInnerPager } from '@/src/navigation/GroupInnerPager';
import { usePrimaryPageNavigation } from '@/src/navigation/primaryPageNavigation';
import {
  primaryAdjacentSwipeGroup,
  primaryEntryRouteForGroup,
  primaryInnerIndex,
} from '@/src/navigation/primaryPages';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useEffect, useMemo } from 'react';
import { useSharedValue } from 'react-native-reanimated';

export type CommitmentsTab = 'budgets' | 'planned';

/**
 * Plans parent: fixed chrome + AppTabs, inner pager for Budgets ↔ Planned.
 */
export function CommitmentsGroupPager() {
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  const pageNavigation = usePrimaryPageNavigation();
  const activeRouteName = pageNavigation?.activeRouteName ?? 'commitments';
  const activeTab: CommitmentsTab = activeRouteName === 'planned-payments' ? 'planned' : 'budgets';
  const innerIndex = primaryInnerIndex(
    activeTab === 'planned' ? 'planned-payments' : 'commitments',
  );
  const innerProgress = useSharedValue(innerIndex);
  const { counts, updateCount } = useCommitmentsBadgeSnapshot();
  const strings = AppConfig.strings.commitmentsRedesign;

  // Keep both panes warm while the group shell is mounted so inner pans are painted.
  const budgets = useBudgetListViewModel(workplaceId, defaultCurrencyCode, true);
  const planned = usePlannedPayments(workplaceId, true);

  useEffect(() => {
    innerProgress.value = innerIndex;
  }, [innerIndex, innerProgress]);

  useEffect(() => {
    if (activeTab === 'budgets' && !budgets.isLoading) updateCount('budgets', budgets.items.length);
  }, [activeTab, budgets.isLoading, budgets.items.length, updateCount]);

  useEffect(() => {
    if (activeTab === 'planned' && !planned.isLoading) updateCount('planned', planned.items.length);
  }, [activeTab, planned.isLoading, planned.items.length, updateCount]);

  const options = useMemo(
    () => [
      {
        id: 'budgets' as const,
        label: strings.budgets,
        badge: counts.budgets ?? undefined,
        pageIndex: 0,
      },
      {
        id: 'planned' as const,
        label: strings.planned,
        badge: counts.planned ?? undefined,
        pageIndex: 1,
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
    [strings.title],
  );

  const onIndexChange = useCallback(
    (index: number) => {
      const routeName = index === 1 ? 'planned-payments' : 'commitments';
      if (pageNavigation) pageNavigation.navigateToPage(routeName);
      else AppNavigation.toPrimaryPage(routeName);
    },
    [pageNavigation],
  );

  const onTabChange = useCallback(
    (tab: CommitmentsTab) => {
      onIndexChange(tab === 'planned' ? 1 : 0);
    },
    [onIndexChange],
  );

  const onEdgeSwipe = useCallback(
    (direction: 'prev' | 'next') => {
      const adjacent = primaryAdjacentSwipeGroup('commitments', direction);
      if (!adjacent) return;
      const routeName = primaryEntryRouteForGroup(adjacent, direction);
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
          onChange={onTabChange}
          pageProgress={innerProgress}
        />
      </Box>
      <GroupInnerPager
        pageCount={2}
        index={innerIndex}
        pageProgress={innerProgress}
        onIndexChange={onIndexChange}
        onEdgeSwipe={onEdgeSwipe}
      >
        <Box flex={1}>
          <BudgetListView
            {...budgets}
            onRetry={budgets.retry}
            onCreate={() => AppNavigation.toBudgetForm()}
          />
        </Box>
        <Box flex={1}>
          <PlannedPaymentListView
            {...planned}
            onRetry={planned.retry}
            onCreate={() => AppNavigation.toPlannedPaymentForm()}
          />
        </Box>
      </GroupInnerPager>
    </ScreenWithChrome>
  );
}
