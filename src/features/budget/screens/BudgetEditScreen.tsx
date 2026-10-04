import { BudgetEditView } from '@/src/features/budget/components/BudgetEditView';
import {
  type BudgetEditRouteParams,
  useBudgetEditViewModel,
} from '@/src/features/budget/hooks/useBudgetEditViewModel';
import { useConfirmUnsavedChanges } from '@/src/hooks/useConfirmUnsavedChanges';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

export default function BudgetEditScreen() {
  const params = useLocalSearchParams<BudgetEditRouteParams>();
  const vm = useBudgetEditViewModel(params);
  const fingerprint = useMemo(
    () =>
      JSON.stringify({
        name: vm.name,
        amount: vm.amount,
        currencyCode: vm.currencyCode,
        startMonth: vm.startMonth.toISOString(),
        intervalType: vm.intervalType,
        intervalN: vm.intervalN,
        recurrenceDay: vm.recurrenceDay,
        recurrenceMonth: vm.recurrenceMonth,
        selectedAccountIds: vm.selectedAccountIds,
        assetAccountIds: vm.assetAccountIds,
      }),
    [
      vm.amount,
      vm.assetAccountIds,
      vm.currencyCode,
      vm.intervalN,
      vm.intervalType,
      vm.name,
      vm.recurrenceDay,
      vm.recurrenceMonth,
      vm.selectedAccountIds,
      vm.startMonth,
    ],
  );
  const guard = useConfirmUnsavedChanges({
    fingerprint,
    baselineReady: !vm.loading,
    disabled: vm.isSaving,
    title: 'Discard budget changes?',
  });

  return <BudgetEditView {...vm} onCancel={guard.onBack} />;
}
