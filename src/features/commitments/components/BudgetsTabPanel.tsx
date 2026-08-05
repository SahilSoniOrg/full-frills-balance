import { BudgetListView, useBudgetListViewModel } from '@/src/features/budget';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';

/** Mounted only while the Budgets tab is active — owns budget list subscription. */
export function BudgetsTabPanel() {
  const { workplaceId } = useWorkplace();
  const { items, isLoading } = useBudgetListViewModel(workplaceId);
  return <BudgetListView items={items} isLoading={isLoading} />;
}
