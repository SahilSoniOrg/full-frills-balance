import { AccountReorderView } from '@/src/features/accounts/components/AccountReorderView';
import { useAccountReorderViewModel } from '@/src/features/accounts/hooks/useAccountReorderViewModel';

export default function AccountReorderScreen() {
  const vm = useAccountReorderViewModel();
  return <AccountReorderView {...vm} />;
}
