import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { PlannedPaymentDetailsView } from '@/src/features/planned-payments/components/PlannedPaymentDetailsView';
import { usePlannedPaymentDetailsViewModel } from '@/src/features/planned-payments/hooks/usePlannedPaymentDetailsViewModel';
import { useLocalSearchParams } from 'expo-router';

function PlannedPaymentDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vm = usePlannedPaymentDetailsViewModel(id);
  return <PlannedPaymentDetailsView {...vm} />;
}

export default withPrivacyScope(PlannedPaymentDetailsScreen);
