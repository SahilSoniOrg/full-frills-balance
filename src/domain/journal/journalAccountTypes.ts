import { AccountType, TransactionType } from '@/src/types/enums';
import type { TabType } from '@/src/types/domainJournal';

export function getInferredAccountType(tab: TabType, side: TransactionType): AccountType {
  if (tab === 'expense') {
    return side === TransactionType.DEBIT ? AccountType.EXPENSE : AccountType.ASSET;
  }
  if (tab === 'income') {
    return side === TransactionType.CREDIT ? AccountType.INCOME : AccountType.ASSET;
  }
  // For transfers, both sides are Assets (or Liabilities)
  return AccountType.ASSET;
}

export function getAllowedAccountTypes(tab: TabType, side: TransactionType): AccountType[] {
  if (tab === 'expense') {
    return side === TransactionType.DEBIT
      ? [AccountType.EXPENSE]
      : [AccountType.ASSET, AccountType.LIABILITY];
  }
  if (tab === 'income') {
    return side === TransactionType.CREDIT
      ? [AccountType.INCOME]
      : [AccountType.ASSET, AccountType.LIABILITY];
  }
  // Transfer: Include ALL types as requested
  return [
    AccountType.ASSET,
    AccountType.LIABILITY,
    AccountType.EQUITY,
    AccountType.INCOME,
    AccountType.EXPENSE,
  ];
}
