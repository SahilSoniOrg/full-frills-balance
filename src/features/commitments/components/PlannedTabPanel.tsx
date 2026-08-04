import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { PlannedPaymentListView, usePlannedPayments } from '@/src/features/planned-payments';

type PlannedTabPanelProps = {
  isPrivacyMode: boolean;
};

/** Mounted only while the Planned tab is active — owns planned-payments subscription. */
export function PlannedTabPanel({ isPrivacyMode }: PlannedTabPanelProps) {
  const { workplaceId } = useWorkplace();
  const { items, isLoading } = usePlannedPayments(workplaceId);
  return (
    <PlannedPaymentListView items={items} isLoading={isLoading} isPrivacyMode={isPrivacyMode} />
  );
}
