import { DetailHeaderMenuActions } from '@/src/components/shared/DetailHeaderMenuActions';
import { buildDetailNavChrome } from '@/src/components/layout/buildDetailNavChrome';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AppConfig } from '@/src/constants';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { BudgetDetailView } from '@/src/features/budget/components/BudgetDetailView';
import { useBudgetDetailViewModel } from '@/src/features/budget/hooks/useBudgetDetailViewModel';
import { AppNavigation } from '@/src/utils/navigation';
import { useMemo } from 'react';

function BudgetDetailScreenInner() {
  const vm = useBudgetDetailViewModel();
  const strings = AppConfig.strings.commitmentsRedesign;
  const chrome = useMemo<ScreenNavChrome>(
    () =>
      buildDetailNavChrome({
        phase: vm.isLoading ? 'loading' : vm.isMissing ? 'missing' : 'ready',
        readyTitle: vm.budget?.name ?? AppConfig.strings.budget.details.screenTitle,
        loadingTitle: AppConfig.strings.budget.details.screenTitle,
        onBack: AppNavigation.back,
        headerActions: (
          <DetailHeaderMenuActions
            actions={[
              { label: strings.edit, onPress: vm.handleEdit, testID: 'edit-button' },
              {
                label: strings.delete,
                onPress: vm.handleDelete,
                destructive: true,
                testID: 'delete-button',
              },
            ]}
          />
        ),
        fab: vm.isSelectionModeActive
          ? undefined
          : {
              onPress: vm.onAddExpense,
              label: strings.expenseAction,
              accessibilityLabel: strings.addExpense,
            },
      }),
    [
      vm.isLoading,
      vm.isMissing,
      vm.budget?.name,
      vm.handleEdit,
      vm.handleDelete,
      vm.onAddExpense,
      vm.isSelectionModeActive,
      strings,
    ],
  );
  return <BudgetDetailView {...vm} chrome={chrome} />;
}
export const BudgetDetailScreen = withPrivacyScope(BudgetDetailScreenInner);
