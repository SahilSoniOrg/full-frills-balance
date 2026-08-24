import { IconName } from '@/src/components/core';
import { ColorKey } from '@/src/constants';
import { mapJournalLegSplitPresentation } from '@/src/services/journal/journalDetailsHelpers';
import { getAccountFallbackIcon } from '@/src/components/account-selection';
import { AccountId } from '@/src/types/ids';
import { DisplayTransaction } from '@/src/types/domainReadModels';

export interface JournalSplitItemViewModel {
  id: string;
  accountId: AccountId;
  accountName: string;
  transactionType: string;
  amount: number;
  currencyCode: string;
  amountPrefix: '+' | '-';
  amountColor: ColorKey;
  iconName: IconName | null;
  fallbackIcon?: IconName;
  iconColor: ColorKey;
  iconBackground: ColorKey;
  onPress: () => void;
}

export function buildJournalSplitItems(
  transactions: DisplayTransaction[],
  onAccountPress: (accountId: AccountId) => void,
): JournalSplitItemViewModel[] {
  return transactions.map(item => {
    const presentation = mapJournalLegSplitPresentation(item);

    return {
      id: item.id,
      accountId: item.accountId,
      accountName: item.accountName || 'Unknown Account',
      transactionType: presentation.transactionTypeLabel,
      amount: presentation.amount,
      currencyCode: presentation.currencyCode,
      amountPrefix: presentation.amountPrefix,
      amountColor: presentation.amountColor,
      iconName: item.icon || null,
      fallbackIcon: getAccountFallbackIcon(item.accountType),
      iconColor: presentation.iconColor,
      iconBackground: presentation.iconBackground,
      onPress: () => onAccountPress(item.accountId),
    };
  });
}
