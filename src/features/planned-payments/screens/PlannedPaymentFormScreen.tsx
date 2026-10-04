import { PlannedPaymentFormView } from '@/src/features/planned-payments/components/PlannedPaymentFormView';
import { usePlannedPaymentFormScreen } from '@/src/features/planned-payments/hooks/usePlannedPaymentFormScreen';
import { useConfirmUnsavedChanges } from '@/src/hooks/useConfirmUnsavedChanges';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

export default function PlannedPaymentFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vm = usePlannedPaymentFormScreen(id);
  const fingerprint = useMemo(() => JSON.stringify(vm.form), [vm.form]);
  const guard = useConfirmUnsavedChanges({
    fingerprint,
    baselineReady: vm.isHydrated,
    disabled: vm.isSubmitting,
    leaveAfterSave: vm.leaveAfterSave,
    title: 'Discard planned payment changes?',
  });

  return <PlannedPaymentFormView id={id} {...vm} onBack={guard.onBack} />;
}
