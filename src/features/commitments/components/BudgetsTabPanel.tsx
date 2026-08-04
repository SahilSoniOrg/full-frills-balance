import { BudgetListView, useBudgetListViewModel } from '@/src/features/budget';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';

type BudgetsTabPanelProps = {
  isPrivacyMode: boolean;
};

/** Mounted only while the Budgets tab is active — owns budget list subscription. */
export function BudgetsTabPanel({ isPrivacyMode }: BudgetsTabPanelProps) {
  const { workplaceId } = useWorkplace();
  const { items } = useBudgetListViewModel(workplaceId);
  return <BudgetListView items={items} isPrivacyMode={isPrivacyMode} />;
}
