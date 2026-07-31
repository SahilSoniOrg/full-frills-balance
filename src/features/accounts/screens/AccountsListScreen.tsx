import { PrivacyScopeProvider } from '@/src/contexts/PrivacyScope';
import { AccountsListView } from '@/src/features/accounts/components/AccountsListView';
import { useAccountsListViewModel } from '@/src/features/accounts/hooks/useAccountsListViewModel';

export default function AccountsScreen() {
  return (
    <PrivacyScopeProvider>
      <AccountsScreenContent />
    </PrivacyScopeProvider>
  );
}

function AccountsScreenContent() {
  const vm = useAccountsListViewModel();
  return <AccountsListView {...vm} />;
}
