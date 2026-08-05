import {
  MoneyDetailHeaderActions,
  moneyDetailEditDeleteActions,
} from '@/src/components/common/MoneyDetailHeaderActions';
import { buildDetailNavChrome } from '@/src/components/layout/buildDetailNavChrome';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { BudgetDetailView } from '@/src/features/budget/components/BudgetDetailView';
import { useBudgetDetailViewModel } from '@/src/features/budget/hooks/useBudgetDetailViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { useMemo } from 'react';

function BudgetDetailScreenInner() {
  const vm = useBudgetDetailViewModel();
  const { theme } = useTheme();

  const chrome = useMemo<ScreenNavChrome>(() => {
    const phase = vm.isLoading || !vm.budget || !vm.usage ? 'loading' : 'ready';

    return buildDetailNavChrome({
      phase,
      readyTitle: 'Budget Details',
      loadingTitle: 'Budget Details',
      headerActions: (
        <MoneyDetailHeaderActions
          actions={moneyDetailEditDeleteActions(vm.handleEdit, vm.handleDelete, theme)}
        />
      ),
    });
  }, [theme, vm.budget, vm.handleDelete, vm.handleEdit, vm.isLoading, vm.usage]);

  return <BudgetDetailView {...vm} chrome={chrome} />;
}

export const BudgetDetailScreen = withPrivacyScope(BudgetDetailScreenInner);
