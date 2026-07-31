import { IconName } from '@/src/components/core';
import { ColorKey } from '@/src/constants';
import { getAccountFallbackIcon } from '@/src/utils/accountIcon';
import { mapDisplayTransactionSplitPresentation } from '@/src/services/journal/transactionDetailsHelpers';
import { AccountId, DisplayTransaction } from '@/src/types/domain';

export interface TransactionSplitItemViewModel {
  id: string;
  accountId: AccountId;
  accountName: string;
  transactionType: string;
  amountText: string;
  amountColor: ColorKey;
  iconName: IconName | string | null;
  fallbackIcon?: IconName;
  iconColor: ColorKey;
  iconBackground: ColorKey;
  onPress: () => void;
}

export function buildTransactionSplitItems(
  transactions: DisplayTransaction[],
  onAccountPress: (accountId: AccountId) => void,
): TransactionSplitItemViewModel[] {
  return transactions.map(item => {
    const presentation = mapDisplayTransactionSplitPresentation(item);

    return {
      id: item.id,
      accountId: item.accountId,
      accountName: item.accountName || 'Unknown Account',
      transactionType: presentation.transactionTypeLabel,
      amountText: presentation.amountText,
      amountColor: presentation.amountColor,
      iconName: item.icon || null,
      fallbackIcon: getAccountFallbackIcon(item.accountType),
      iconColor: presentation.iconColor,
      iconBackground: presentation.iconBackground,
      onPress: () => onAccountPress(item.accountId),
    };
  });
}
