import { FloatingActionButton } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig } from '@/src/constants';
import { AppNavigation } from '@/src/utils/navigation';
import { PlannedPaymentListView } from '../components/PlannedPaymentListView';

export default function PlannedPaymentListScreen() {
  return (
    <Screen title={AppConfig.strings.plannedPayments.title} showBack={true}>
      <PlannedPaymentListView />
      <FloatingActionButton
        onPress={() => AppNavigation.toPlannedPaymentForm()}
        label="New Planned Payment"
        placement="end"
        accessibilityLabel="Create a new planned payment"
      />
    </Screen>
  );
}
