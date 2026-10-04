import { AccountFormView } from '@/src/features/accounts/components/AccountFormView';
import { buildAccountFormScreenChrome } from '@/src/features/accounts/helpers/buildAccountFormScreenChrome';
import { useAccountFormViewModel } from '@/src/features/accounts/hooks/useAccountFormViewModel';
import { useConfirmUnsavedChanges } from '@/src/hooks/useConfirmUnsavedChanges';
import { useEffect, useMemo } from 'react';

export default function AccountCreationScreen() {
  const vm = useAccountFormViewModel();
  const fingerprint = useMemo(
    () =>
      JSON.stringify({
        accountName: vm.accountName,
        accountType: vm.accountType,
        accountSubtype: vm.accountSubtype,
        selectedCurrency: vm.selectedCurrency,
        selectedIcon: vm.selectedIcon,
        selectedColor: vm.selectedColor,
        initialBalance: vm.initialBalance,
        parentAccountId: vm.parentAccountId,
        metadata: {
          statementDay: vm.metadata.statementDay,
          dueDay: vm.metadata.dueDay,
          creditLimitAmount: vm.metadata.creditLimitAmount,
          apr: vm.metadata.apr,
          emiDay: vm.metadata.emiDay,
          loanTenureMonths: vm.metadata.loanTenureMonths,
          minimumPaymentAmount: vm.metadata.minimumPaymentAmount,
          minimumPaymentPercent: vm.metadata.minimumPaymentPercent,
          payFromAccountId: vm.metadata.payFromAccountId,
          notes: vm.metadata.notes,
          isMinPaymentOnly: vm.metadata.isMinPaymentOnly,
        },
      }),
    [
      vm.accountName,
      vm.accountSubtype,
      vm.accountType,
      vm.initialBalance,
      vm.metadata,
      vm.parentAccountId,
      vm.selectedColor,
      vm.selectedCurrency,
      vm.selectedIcon,
    ],
  );
  const guard = useConfirmUnsavedChanges({
    fingerprint,
    baselineReady: !vm.isLoading,
    disabled: vm.isCreating,
    title: vm.isCategory ? 'Discard category changes?' : 'Discard account changes?',
  });
  const { leaveAfterSave } = vm;
  // Dispatch only after the saving render has disabled the leave guard.
  useEffect(() => {
    leaveAfterSave?.();
  }, [leaveAfterSave]);
  const chrome = useMemo(
    () => buildAccountFormScreenChrome(vm.heroTitle, vm.formChrome.headerActionItems, guard.onBack),
    [guard.onBack, vm.formChrome.headerActionItems, vm.heroTitle],
  );
  return <AccountFormView {...vm} chrome={chrome} />;
}
