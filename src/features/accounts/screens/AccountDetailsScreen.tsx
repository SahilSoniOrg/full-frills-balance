import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { AccountDetailsView } from '@/src/features/accounts/components/AccountDetailsView';
import { useAccountDetailsViewModel } from '@/src/features/accounts/hooks/useAccountDetailsViewModel';

function AccountDetailsScreen() {
  const vm = useAccountDetailsViewModel();
  return <AccountDetailsView {...vm} />;
}

export default withPrivacyScope(AccountDetailsScreen);
