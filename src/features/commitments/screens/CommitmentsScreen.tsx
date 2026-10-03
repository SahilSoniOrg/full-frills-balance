import { ScreenWithChrome } from '@/src/components/layout';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { PrivacyToggleButton } from '@/src/components/shared/PrivacyToggleButton';
import { AppSegmentedControl } from '@/src/components/core';
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
  const options = [
    { id: 'budgets' as const, label: `${strings.budgets} ${budgets.items.length}` },
    { id: 'planned' as const, label: `${strings.planned} ${planned.items.length}` },
  ];
  const chrome = useMemo<TabScreenChrome>(
    () => ({
      screenTitle: strings.title,
      showBack: false,
      headerActions: <PrivacyToggleButton />,
      fab: {
        onPress: () =>
          activeTab === 'budgets'
            ? AppNavigation.toBudgetForm()
            : AppNavigation.toPlannedPaymentForm(),
        label: activeTab === 'budgets' ? strings.budgetAction : strings.plannedAction,
        accessibilityLabel: activeTab === 'budgets' ? strings.createBudget : strings.createPlanned,
      },
    }),
    [activeTab, strings],
  );
  return (
    <ScreenWithChrome chrome={chrome} scrollable={false}>
      <Box marginHorizontal="lg" marginTop="md" marginBottom="sm">
        <AppSegmentedControl
          testID="commitments-tabs"
          options={options}
          value={activeTab}
          onChange={(next: CommitmentsTab) => router.setParams({ tab: next })}
          flex
          itemHeight={52}
          trackColor="surface"
          pillColor="surfaceSecondary"
          activeTextColor="text"
          inactiveTextColor="textSecondary"
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
