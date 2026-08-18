import { PlannedPaymentFormView } from '@/src/features/planned-payments/components/PlannedPaymentFormView';
import { usePlannedPaymentFormScreen } from '@/src/features/planned-payments/hooks/usePlannedPaymentFormScreen';
import { useLocalSearchParams } from 'expo-router';

export default function PlannedPaymentFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vm = usePlannedPaymentFormScreen(id);
  return <PlannedPaymentFormView id={id} {...vm} />;
}
