import { AccountFormView } from '@/src/features/accounts/components/AccountFormView';
import { useAccountFormViewModel } from '@/src/features/accounts/hooks/useAccountFormViewModel';

export default function CategoryCreationScreen() {
  const vm = useAccountFormViewModel();
  return <AccountFormView {...vm} />;
}
