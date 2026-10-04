import { PlannedPaymentFormView } from '@/src/features/planned-payments/components/PlannedPaymentFormView';
import { usePlannedPaymentForm } from '@/src/features/planned-payments/hooks/usePlannedPaymentForm';
import { useConfirmUnsavedChanges } from '@/src/hooks/useConfirmUnsavedChanges';
import { ArchiveVisibilityScopeProvider } from '@/src/contexts/ArchiveVisibilityScope';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

export default function PlannedPaymentFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vm = usePlannedPaymentForm(id);
  const fingerprint = useMemo(() => JSON.stringify(vm.form), [vm.form]);
  const guard = useConfirmUnsavedChanges({
    fingerprint,
    baselineReady: vm.isHydrated,
    disabled: vm.isSubmitting,
    leaveAfterSave: vm.leaveAfterSave,
    title: 'Discard planned payment changes?',
  });

  return (
    <ArchiveVisibilityScopeProvider>
      <PlannedPaymentFormView id={id} {...vm} onBack={guard.onBack} />
    </ArchiveVisibilityScopeProvider>
  );
}
