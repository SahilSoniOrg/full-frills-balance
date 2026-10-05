import type { AccountType } from '@/src/types/enums';

export function inferSimpleJournalTypeFromAccounts(args: {
  sourceAccountType?: AccountType | string;
  destinationAccountType?: AccountType | string;
  displayTypeFallback?: string;
}): 'expense' | 'income' | 'transfer' {
  const dest = args.destinationAccountType;
  const source = args.sourceAccountType;
  if (dest === 'LIABILITY' || dest === 'ASSET') return 'transfer';
  if (source === 'INCOME') return 'income';
  if (dest === 'EXPENSE') return 'expense';
  return (String(args.displayTypeFallback).toLowerCase() || 'expense') as
    'expense' | 'income' | 'transfer';
}
