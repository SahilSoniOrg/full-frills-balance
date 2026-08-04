import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { TransactionDetailsView } from '@/src/features/journal/components/TransactionDetailsView';
import { useTransactionDetailsViewModel } from '@/src/features/journal/hooks/useTransactionDetailsViewModel';

function TransactionDetailsScreen() {
  const vm = useTransactionDetailsViewModel();
  return <TransactionDetailsView {...vm} />;
}

export default withPrivacyScope(TransactionDetailsScreen);
