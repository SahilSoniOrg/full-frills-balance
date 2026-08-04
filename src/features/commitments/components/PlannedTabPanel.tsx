import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { PlannedPaymentListView, usePlannedPayments } from '@/src/features/planned-payments';

/** Mounted only while the Planned tab is active — owns planned-payments subscription. */
export function PlannedTabPanel() {
  const { workplaceId } = useWorkplace();
  const { items, isLoading } = usePlannedPayments(workplaceId);
  return <PlannedPaymentListView items={items} isLoading={isLoading} />;
}
