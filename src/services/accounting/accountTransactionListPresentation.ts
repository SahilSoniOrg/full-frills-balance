import { IconName } from '@/src/components/core';
import { getAccountFallbackIcon } from '@/src/features/accounts/utils/getAccountIcon';
import { journalPresenter } from '@/src/services/accounting/journalPresenter';
import { DisplayTransaction, JournalDisplayType } from '@/src/types/domain';
import { TransactionListItem } from '@/src/types/ui';
import { getAccountTypeVariant } from '@/src/utils/accountCategory';

export interface CounterAccountChip {
  id: string;
  name: string;
  accountType: string;
  icon?: string;
}

type TransactionWithCounters = DisplayTransaction & { counterAccounts?: CounterAccountChip[] };

export function buildCounterAccountChips(
  transaction: TransactionWithCounters,
): CounterAccountChip[] {
  if (transaction.counterAccounts && transaction.counterAccounts.length > 0) {
    const displayAccounts: CounterAccountChip[] = [];
    const visibleCount =
      transaction.counterAccounts.length > 2 ? 1 : transaction.counterAccounts.length;
    for (let i = 0; i < visibleCount; i++) {
      displayAccounts.push(transaction.counterAccounts[i]);
    }
    if (transaction.counterAccounts.length > visibleCount) {
      displayAccounts.push({
        id: 'more',
        name: `+${transaction.counterAccounts.length - visibleCount} more`,
        accountType: 'NEUTRAL',
        icon: 'list',
      });
    }
    return displayAccounts;
  }

  if (transaction.counterAccountType) {
    return [
      {
        id: 'counter',
        name: transaction.counterAccountName || transaction.counterAccountType,
        accountType: transaction.counterAccountType,
        icon: transaction.counterAccountIcon,
      },
    ];
  }

  return [
    {
      id: transaction.accountId,
      name: transaction.accountName || 'Unknown',
      accountType: transaction.accountType || 'ASSET',
      icon: transaction.icon,
    },
  ];
}

export function mapAccountLedgerTransactionToListItem(
  transaction: TransactionWithCounters,
  onPress: () => void,
): TransactionListItem {
  const displayAccounts = buildCounterAccountChips(transaction);
  const base = journalPresenter.getPresentation(
    transaction.displayType as JournalDisplayType,
    transaction.semanticLabel,
  );

  return {
    id: transaction.id,
    type: 'transaction',
    date: transaction.transactionDate,
    onPress,
    cardProps: {
      title: transaction.journalDescription || transaction.displayTitle || 'Transaction',
      amount: transaction.amount,
      currencyCode: transaction.currencyCode,
      transactionDate: transaction.transactionDate,
      presentation: {
        label: base.label,
        typeColor: base.colorKey,
        typeIcon: (transaction.isIncrease ? 'arrowUp' : 'arrowDown') as IconName,
        amountPrefix: transaction.isIncrease ? '+ ' : '− ',
      },
      badges: displayAccounts.map(acc => ({
        text: acc.name,
        variant: getAccountTypeVariant(acc.accountType),
        icon: acc.icon,
        fallbackIcon: getAccountFallbackIcon(acc.accountType),
      })),
      notes: transaction.notes,
    },
  };
}

/** Inserts reconciled markers into grouped transaction list items. */
export function injectReconciledMarkersIntoTransactionList(
  rawGroupedItems: TransactionListItem[],
  reconciledAt: Date | null,
): TransactionListItem[] {
  if (!reconciledAt || !rawGroupedItems.length) return rawGroupedItems;

  const result: TransactionListItem[] = [];
  let markerAdded = false;
  const reconTime = reconciledAt.getTime();

  for (const item of rawGroupedItems) {
    let itemToPush = item;
    if (!markerAdded) {
      if (item.type === 'transaction' && item.date && item.date <= reconTime) {
        result.push({
          id: 'reconciled-separator',
          type: 'separator' as TransactionListItem['type'],
          date: reconTime,
          isReconciledMarker: true,
        } as TransactionListItem);
        markerAdded = true;
      } else if (item.type === 'separator') {
        const startOfDay = item.date;
        const endOfDay = startOfDay + 24 * 60 * 60 * 1000 - 1;
        if (reconTime >= startOfDay) {
          itemToPush = { ...item, reconciledAt: reconTime } as TransactionListItem;
          if (reconTime <= endOfDay || item.isCollapsed) markerAdded = true;
          if (!item.isCollapsed && reconTime > endOfDay) {
            result.push({
              id: 'reconciled-separator',
              type: 'separator' as TransactionListItem['type'],
              date: reconTime,
              isReconciledMarker: true,
            } as TransactionListItem);
            markerAdded = true;
          }
        }
      }
    }
    result.push(itemToPush);
  }

  return result;
}
