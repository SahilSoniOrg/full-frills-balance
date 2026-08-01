import { FloatingActionButton } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig } from '@/src/constants';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { AppNavigation } from '@/src/utils/navigation';
import { PlannedPaymentListView } from '../components/PlannedPaymentListView';
import { usePlannedPayments } from '../hooks/usePlannedPayments';

export default function PlannedPaymentListScreen() {
  const { workplaceId } = useWorkplace();
  const isPrivacyMode = useEffectivePrivacyMode();
  const { items, isLoading } = usePlannedPayments(workplaceId);

  return (
    <Screen title={AppConfig.strings.plannedPayments.title} showBack={true}>
      <PlannedPaymentListView items={items} isLoading={isLoading} isPrivacyMode={isPrivacyMode} />
      <FloatingActionButton
        onPress={() => AppNavigation.toPlannedPaymentForm()}
        label="New Planned Payment"
        placement="end"
        accessibilityLabel="Create a new planned payment"
      />
    </Screen>
  );
}
