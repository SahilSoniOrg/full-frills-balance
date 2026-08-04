import { PrivacyScopeProvider } from '@/src/contexts/PrivacyScope';
import { PlannedPaymentDetailsView } from '@/src/features/planned-payments/components/PlannedPaymentDetailsView';
import { usePlannedPaymentDetailsViewModel } from '@/src/features/planned-payments/hooks/usePlannedPaymentDetailsViewModel';
import { useLocalSearchParams } from 'expo-router';

export default function PlannedPaymentDetailsScreen() {
  return (
    <PrivacyScopeProvider>
      <PlannedPaymentDetailsScreenContent />
    </PrivacyScopeProvider>
  );
}

function PlannedPaymentDetailsScreenContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vm = usePlannedPaymentDetailsViewModel(id);
  return <PlannedPaymentDetailsView {...vm} />;
}
