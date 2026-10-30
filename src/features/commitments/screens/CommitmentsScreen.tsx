import { useMemo } from 'react';
import { ScreenWithChrome } from '@/src/components/layout';
import { PrivacyToggleButton } from '@/src/components/shared/PrivacyToggleButton';
import { AppConfig } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { BudgetListView, useBudgetListViewModel } from '@/src/features/budget';
import { PlannedPaymentListView, usePlannedPayments } from '@/src/features/planned-payments';
import { usePrimaryLeafPrepared } from '@/src/navigation/primaryPageNavigation';
import { AppNavigation } from '@/src/utils/navigation';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';

export type CommitmentsTab = 'budgets' | 'planned';

export function CommitmentsPage({ tab = 'budgets' }: { tab?: CommitmentsTab }) {
  const chrome = useMemo<TabScreenChrome>(
    () => ({
      kind: 'tab',
      screenTitle: AppConfig.strings.commitmentsRedesign.title,
      headerActions: <PrivacyToggleButton />,
    }),
    [],
  );
  return (
    <ScreenWithChrome
      chrome={chrome}
      scrollable={false}
      testID={tab === 'budgets' ? 'commitments-screen' : 'planned-payments-screen'}
    >
      {tab === 'budgets' ? <BudgetLeaf /> : <PlannedLeaf />}
    </ScreenWithChrome>
  );
}

function BudgetLeaf() {
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  const active = usePrimaryLeafPrepared('commitments');
  const vm = useBudgetListViewModel(workplaceId, defaultCurrencyCode, active);
  return (
    <BudgetListView {...vm} onRetry={vm.retry} onCreate={() => AppNavigation.toBudgetForm()} />
  );
}

function PlannedLeaf() {
  const { workplaceId } = useWorkplace();
  const active = usePrimaryLeafPrepared('planned-payments');
  const vm = usePlannedPayments(workplaceId, active);
  return (
    <PlannedPaymentListView
      {...vm}
      onRetry={vm.retry}
      onCreate={() => AppNavigation.toPlannedPaymentForm()}
    />
  );
}

export default CommitmentsPage;
