import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { AccountsListView } from '@/src/features/accounts/components/AccountsListView';
import { useAccountsListViewModel } from '@/src/features/accounts/hooks/useAccountsListViewModel';

function AccountsScreen() {
  const vm = useAccountsListViewModel();
  return <AccountsListView {...vm} />;
}

export default withPrivacyScope(AccountsScreen);
