import { TransactionDetailsView } from '@/src/features/journal/components/TransactionDetailsView';
import { useTransactionDetailsViewModel } from '@/src/features/journal/hooks/useTransactionDetailsViewModel';

export default function TransactionDetailsScreen() {
  const vm = useTransactionDetailsViewModel();
  return <TransactionDetailsView {...vm} />;
}
