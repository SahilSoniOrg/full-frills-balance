import { ScreenHeaderActions } from '@/src/components/shared/ScreenHeaderActions';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AccountFormView } from '@/src/features/accounts/components/AccountFormView';
import { toHeaderIconButtons } from '@/src/features/accounts/helpers/accountManagementActions';
import { useAccountFormViewModel } from '@/src/features/accounts/hooks/useAccountFormViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { useConfirmUnsavedChanges } from '@/src/hooks/useConfirmUnsavedChanges';
import { Icon } from '@/src/types/domainIcons';
import { useMemo } from 'react';

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
    leaveAfterSave: vm.leaveAfterSave,
    title: vm.isCategory ? 'Discard category changes?' : 'Discard account changes?',
  });
  const { theme } = useTheme();
  const chrome = useMemo((): ScreenNavChrome => {
    const headerActionItems = toHeaderIconButtons(vm.formChrome.managementActions, theme);
    return {
      screenTitle: vm.heroTitle,
      showBack: true,
      backIcon: Icon.Back,
      onBack: guard.onBack,
      headerActions:
        headerActionItems.length > 0 ? (
          <ScreenHeaderActions actions={headerActionItems} />
        ) : undefined,
    };
  }, [guard.onBack, vm.formChrome.managementActions, vm.heroTitle, theme]);
  return <AccountFormView {...vm} chrome={chrome} />;
}
