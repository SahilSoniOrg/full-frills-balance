import { AppConfig } from '@/src/constants';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AccountManagementView } from '@/src/features/accounts/components/AccountManagementView';
import { useAccountManagementViewModel } from '@/src/features/accounts/hooks/useAccountManagementViewModel';

export function AccountManagementScreen() {
  const vm = useAccountManagementViewModel();

  const chrome: ScreenNavChrome = {
    screenTitle: AppConfig.strings.accounts.manageHierarchy,
    kind: 'nav',
    onBack: vm.onBack,
  };

  return <AccountManagementView vm={vm} chrome={chrome} />;
}

export default AccountManagementScreen;
