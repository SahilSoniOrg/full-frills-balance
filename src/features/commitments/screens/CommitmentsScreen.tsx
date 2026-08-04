import { AppTabs, FloatingActionButton } from '@/src/components/core';
import { PrivacyToggleButton } from '@/src/components/common/PrivacyToggleButton';
import { ScreenSectionHeader } from '@/src/components/common/ScreenSectionHeader';
import { Screen } from '@/src/components/layout';
import { useEffectivePrivacyMode, withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { Box, Stack } from '@/src/design-system';
import { BudgetListView, useBudgetListViewModel } from '@/src/features/budget';
import { PlannedPaymentListView, usePlannedPayments } from '@/src/features/planned-payments';
import { AppNavigation } from '@/src/utils/navigation';
import { useMemo, useState } from 'react';

type Tab = 'budgets' | 'planned';

function CommitmentsScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('budgets');
  const { workplaceId } = useWorkplace();
  const { items: budgetItems } = useBudgetListViewModel(workplaceId);
  const { items: plannedItems, isLoading: plannedLoading } = usePlannedPayments(workplaceId);
  const isPrivacyMode = useEffectivePrivacyMode();

  const tabOptions = useMemo(
    () => [
      { id: 'budgets' as const, label: 'Budgets' },
      { id: 'planned' as const, label: 'Planned' },
    ],
    [],
  );

  const handleAdd = () => {
    if (activeTab === 'budgets') {
      AppNavigation.toBudgetForm();
    } else {
      AppNavigation.toPlannedPaymentForm();
    }
  };

  return (
    <Screen
      title="Commitments"
      showBack={false}
      scrollable={false}
      headerActions={<PrivacyToggleButton />}
    >
      <Stack gap="lg">
        <Box marginTop="md">
          <AppTabs
            testID="commitments-tabs"
            options={tabOptions}
            value={activeTab}
            onChange={setActiveTab}
          />
        </Box>
        <Box paddingHorizontal="lg">
          <ScreenSectionHeader
            subtitle={
              activeTab === 'budgets'
                ? 'Monthly budget limits and usage.'
                : 'Recurring rules and upcoming posts.'
            }
          />
        </Box>
      </Stack>

      <Box flex={1} marginTop="md">
        {activeTab === 'budgets' ? (
          <BudgetListView items={budgetItems} isPrivacyMode={isPrivacyMode} />
        ) : (
          <PlannedPaymentListView
            items={plannedItems}
            isLoading={plannedLoading}
            isPrivacyMode={isPrivacyMode}
          />
        )}
      </Box>

      <FloatingActionButton
        onPress={handleAdd}
        label={activeTab === 'budgets' ? 'New Budget' : 'New Planned Payment'}
        placement="end"
        accessibilityLabel={
          activeTab === 'budgets' ? 'Create a new budget' : 'Create a new planned payment'
        }
      />
    </Screen>
  );
}

export default withPrivacyScope(CommitmentsScreen);
