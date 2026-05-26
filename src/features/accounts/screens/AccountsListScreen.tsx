import { AccountsListView } from '@/src/features/accounts/components/AccountsListView';
import { useAccountsListViewModel } from '@/src/features/accounts/hooks/useAccountsListViewModel';

export default function AccountsScreen() {
  const vm = useAccountsListViewModel();
  return <AccountsListView {...vm} />;
}
