import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AccountManagementView } from '@/src/features/accounts/components/AccountManagementView';
import { useAccountManagementViewModel } from '@/src/features/accounts/hooks/useAccountManagementViewModel';

export function AccountManagementScreen() {
  return <AccountManagementScreenContent />;
}

function AccountManagementScreenContent() {
  const vm = useAccountManagementViewModel();

  const chrome: ScreenNavChrome = {
    screenTitle: 'Account Management',
    showBack: true,
    backIcon: 'close',
    onBack: vm.onBack,
  };

  return <AccountManagementView vm={vm} chrome={chrome} />;
}

export default AccountManagementScreen;
