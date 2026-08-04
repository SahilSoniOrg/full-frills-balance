import { BudgetDetailView } from '@/src/features/budget/components/BudgetDetailView';
import { useBudgetDetailViewModel } from '@/src/features/budget/hooks/useBudgetDetailViewModel';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';

function BudgetDetailScreenInner() {
  const vm = useBudgetDetailViewModel();
  return <BudgetDetailView {...vm} />;
}

export const BudgetDetailScreen = withPrivacyScope(BudgetDetailScreenInner);
