import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AccountFormView } from '@/src/features/accounts/components/AccountFormView';
import { useAccountFormViewModel } from '@/src/features/accounts/hooks/useAccountFormViewModel';
import { useMemo } from 'react';

export default function AccountCreationScreen() {
  const vm = useAccountFormViewModel();
  const chrome = useMemo<ScreenNavChrome>(
    () => ({
      screenTitle: vm.heroTitle,
      showBack: true,
      backIcon: 'back',
    }),
    [vm.heroTitle],
  );
  return <AccountFormView {...vm} chrome={chrome} />;
}
