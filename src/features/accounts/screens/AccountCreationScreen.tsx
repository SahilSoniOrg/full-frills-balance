import { AccountFormView } from '@/src/features/accounts/components/AccountFormView';
import { buildAccountFormScreenChrome } from '@/src/features/accounts/helpers/buildAccountFormScreenChrome';
import { useAccountFormViewModel } from '@/src/features/accounts/hooks/useAccountFormViewModel';
import { useMemo } from 'react';

export default function AccountCreationScreen() {
  const vm = useAccountFormViewModel();
  const chrome = useMemo(
    () => buildAccountFormScreenChrome(vm.heroTitle, vm.formChrome.headerActionItems, vm.onBack),
    [vm.heroTitle, vm.formChrome.headerActionItems, vm.onBack],
  );
  return <AccountFormView {...vm} chrome={chrome} />;
}
