import { ScreenWithChrome } from '@/src/components/layout';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { PrivacyToggleButton } from '@/src/components/shared/PrivacyToggleButton';
import { AppTabs } from '@/src/components/core';
import { Box } from '@/src/design-system';
import { AppConfig } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { BudgetListView, useBudgetListViewModel } from '@/src/features/budget';
import { PlannedPaymentListView, usePlannedPayments } from '@/src/features/planned-payments';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { AppNavigation } from '@/src/utils/navigation';
import { useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

type CommitmentsTab = 'budgets' | 'planned';

function CommitmentsScreen() {
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  const budgets = useBudgetListViewModel(workplaceId, defaultCurrencyCode);
  const planned = usePlannedPayments(workplaceId);
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const router = useRouter();
  const activeTab: CommitmentsTab = tab === 'planned' ? 'planned' : 'budgets';
  const strings = AppConfig.strings.commitmentsRedesign;
  const options = useMemo(
    () => [
      { id: 'budgets' as const, label: strings.budgets, badge: budgets.items.length },
      { id: 'planned' as const, label: strings.planned, badge: planned.items.length },
    ],
    [strings, budgets.items.length, planned.items.length],
  );
  const activeList = activeTab === 'budgets' ? budgets : planned;
  // The empty state has its own add button; a FAB beside it would be a second one.
  const showsEmptyState =
    !activeList.isLoading && !activeList.error && activeList.items.length === 0;
  const chrome = useMemo<TabScreenChrome>(
    () => ({
      screenTitle: strings.title,
      showBack: false,
      headerActions: <PrivacyToggleButton />,
      fab: showsEmptyState
        ? undefined
        : {
            onPress: () =>
              activeTab === 'budgets'
                ? AppNavigation.toBudgetForm()
                : AppNavigation.toPlannedPaymentForm(),
            label: activeTab === 'budgets' ? strings.budgetAction : strings.plannedAction,
            accessibilityLabel:
              activeTab === 'budgets' ? strings.createBudget : strings.createPlanned,
          },
    }),
    [activeTab, strings, showsEmptyState],
  );
  return (
    <ScreenWithChrome chrome={chrome} scrollable={false}>
      <Box marginTop="md">
        <AppTabs
          testID="commitments-tabs"
          options={options}
          value={activeTab}
          onChange={(next: CommitmentsTab) => router.setParams({ tab: next })}
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
export default withPrivacyScope(CommitmentsScreen);
