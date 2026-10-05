import { BudgetEditView } from '@/src/features/budget/components/BudgetEditView';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import {
  type BudgetEditRouteParams,
  useBudgetEditViewModel,
} from '@/src/features/budget/hooks/useBudgetEditViewModel';
import { useConfirmUnsavedChanges } from '@/src/hooks/useConfirmUnsavedChanges';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

function BudgetEditScreen() {
  const params = useLocalSearchParams<BudgetEditRouteParams>();
  const vm = useBudgetEditViewModel(params);
  const fingerprint = useMemo(
    () =>
      JSON.stringify({
        name: vm.name,
        amount: vm.amount,
        currencyCode: vm.currencyCode,
        startMonth: vm.startMonth.toISOString(),
        intervalType: vm.schedule.intervalType,
        intervalN: vm.schedule.intervalN,
        recurrenceDay: vm.schedule.recurrenceDay,
        recurrenceMonth: vm.schedule.recurrenceMonth,
        selectedAccountIds: vm.selectedAccountIds,
        assetAccountIds: vm.assetAccountIds,
      }),
    [
      vm.amount,
      vm.assetAccountIds,
      vm.currencyCode,
      vm.name,
      vm.schedule.intervalN,
      vm.schedule.intervalType,
      vm.schedule.recurrenceDay,
      vm.schedule.recurrenceMonth,
      vm.selectedAccountIds,
      vm.startMonth,
    ],
  );
  const guard = useConfirmUnsavedChanges({
    fingerprint,
    baselineReady: !vm.loading,
    disabled: vm.isSaving,
    leaveAfterSave: vm.leaveAfterSave,
    title: 'Discard budget changes?',
  });

  return <BudgetEditView {...vm} onCancel={guard.onBack} />;
}

export default withPrivacyScope(BudgetEditScreen);
