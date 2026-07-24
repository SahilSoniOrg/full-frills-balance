import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';

/**
 * Non-sign journal scaffolding helpers (distinct accounts, simple 2-line construction).
 * Balance/sign logic lives in BalanceEffects (`checkJournal`, `effect`).
 */
export function validateDistinctAccounts(accountIds: string[]): {
  isValid: boolean;
  uniqueCount: number;
} {
  const uniqueAccounts = new Set(accountIds.filter(id => !!id));
  return {
    isValid: uniqueAccounts.size >= 2,
    uniqueCount: uniqueAccounts.size,
  };
}

export function isBackdated(transactionDate: number, latestTransactionDate?: number): boolean {
  if (!latestTransactionDate) return false;
  return latestTransactionDate > transactionDate;
}

export function constructSimpleJournal(input: {
  type: 'expense' | 'income' | 'transfer';
  amount: number;
  sourceAccount: { id: string; type: AccountType; rate: number };
  destinationAccount: { id: string; type: AccountType; rate: number };
  description: string;
  date: number;
}) {
  const { amount, sourceAccount, destinationAccount, description, date } = input;

  return {
    journalDate: date,
    description,
    transactions: [
      {
        accountId: destinationAccount.id,
        amount,
        transactionType: TransactionType.DEBIT,
        exchangeRate: destinationAccount.rate,
      },
      {
        accountId: sourceAccount.id,
        amount,
        transactionType: TransactionType.CREDIT,
        exchangeRate: sourceAccount.rate,
      },
    ],
  };
}
