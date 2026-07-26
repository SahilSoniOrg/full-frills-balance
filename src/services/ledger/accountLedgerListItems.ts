import { mapLedgerTransactionToCardProps } from '@/src/adapters/transactionCardAdapter';
import { DisplayTransaction } from '@/src/types/domain';
import { TransactionListItem } from '@/src/types/ui';

export function mapAccountLedgerTransactionToListItem(
  transaction: DisplayTransaction,
  onPress: () => void,
): TransactionListItem {
  return {
    id: transaction.id,
    type: 'transaction',
    date: transaction.transactionDate,
    onPress,
    cardProps: mapLedgerTransactionToCardProps(transaction),
  };
}
