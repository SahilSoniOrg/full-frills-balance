import { ScreenWithChrome } from '@/src/components/layout';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { PrivacyToggleButton } from '@/src/components/shared/PrivacyToggleButton';
import { AppTabs } from '@/src/components/core';
import { Box, Stack } from '@/src/design-system';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { BudgetListView, useBudgetListViewModel } from '@/src/features/budget';
import { PlannedPaymentListView, usePlannedPayments } from '@/src/features/planned-payments';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { AppNavigation } from '@/src/utils/navigation';
import { useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

const TAB_OPTIONS = [
  { id: 'budgets' as const, label: 'Budgets' },
  { id: 'planned' as const, label: 'Planned' },
];

type CommitmentsTab = (typeof TAB_OPTIONS)[number]['id'];

function BudgetsPanel({ onCreate }: { onCreate: () => void }) {
  const { workplaceId } = useWorkplace();
  const { items, isLoading, error, retry, onItemPress } = useBudgetListViewModel(workplaceId);
  return (
    <BudgetListView
      items={items}
      isLoading={isLoading}
      error={error}
      onRetry={retry}
      onItemPress={onItemPress}
      onCreate={onCreate}
    />
  );
}

function PlannedPanel({ onCreate }: { onCreate: () => void }) {
  const { workplaceId } = useWorkplace();
  const { items, isLoading, error, retry, onItemPress } = usePlannedPayments(workplaceId);
  return (
    <PlannedPaymentListView
      items={items}
      isLoading={isLoading}
      error={error}
      onRetry={retry}
      onItemPress={onItemPress}
      onCreate={onCreate}
    />
  );
}

function CommitmentsScreen() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const router = useRouter();
  const activeTab: CommitmentsTab = tab === 'planned' ? 'planned' : 'budgets';
  const setActiveTab = (nextTab: CommitmentsTab) => router.setParams({ tab: nextTab });
  const chrome = useMemo<TabScreenChrome>(
    () => ({
      screenTitle: 'Commitments',
      showBack: false,
      headerActions: <PrivacyToggleButton />,
      fab: {
        onPress: () => {
          if (activeTab === 'budgets') {
            AppNavigation.toBudgetForm();
          } else {
            AppNavigation.toPlannedPaymentForm();
          }
        },
        label: activeTab === 'budgets' ? 'New Budget' : 'New Recurring Bill',
        accessibilityLabel:
          activeTab === 'budgets' ? 'Create a new budget' : 'Create a new recurring bill',
      },
    }),
    [activeTab],
  );

  return (
    <ScreenWithChrome chrome={chrome} scrollable={false}>
      <Stack gap="md">
        <Box marginTop="md">
          <AppTabs
            testID="commitments-tabs"
            options={TAB_OPTIONS}
            value={activeTab}
            onChange={setActiveTab}
          />
        </Box>
      </Stack>

      <Box flex={1} marginTop="md">
        {activeTab === 'budgets' ? (
          <BudgetsPanel onCreate={() => AppNavigation.toBudgetForm()} />
        ) : (
          <PlannedPanel onCreate={() => AppNavigation.toPlannedPaymentForm()} />
        )}
      </Box>
    </ScreenWithChrome>
  );
}

export default withPrivacyScope(CommitmentsScreen);
