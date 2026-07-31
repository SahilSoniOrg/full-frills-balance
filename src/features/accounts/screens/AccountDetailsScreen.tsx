import { PrivacyScopeProvider } from '@/src/contexts/PrivacyScope';
import { AccountDetailsView } from '@/src/features/accounts/components/AccountDetailsView';
import { useAccountDetailsViewModel } from '@/src/features/accounts/hooks/useAccountDetailsViewModel';

export default function AccountDetailsScreen() {
  return (
    <PrivacyScopeProvider>
      <AccountDetailsScreenContent />
    </PrivacyScopeProvider>
  );
}

function AccountDetailsScreenContent() {
  const vm = useAccountDetailsViewModel();
  return <AccountDetailsView {...vm} />;
}
