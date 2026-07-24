import { AppConfig } from '@/src/constants/app-config';
import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { checkJournal, effect } from '@/src/services/accounting/BalanceEffects';
import type { JournalLineForCheck } from '@/src/services/accounting/BalanceEffects';

export type { JournalCheckResult as JournalValidationResult } from '@/src/services/accounting/BalanceEffects';

/**
 * @deprecated Prefer BalanceEffects (`effect`, `checkJournal`, `foldBalances`).
 * Kept as a thin Adapter for remaining journal scaffolding call sites.
 */
export class AccountingDomainService {
  getImpactMultiplier(accountType: AccountType, transactionType: TransactionType): number {
    return effect(accountType, transactionType).sign;
  }

  getBalanceImpactMultiplier(accountType: AccountType, transactionType: TransactionType): number {
    return effect(accountType, transactionType).sign;
  }

  validateJournal(
    transactions: JournalLineForCheck[],
    precision: number = AppConfig.constants.precision,
  ) {
    return checkJournal(transactions, precision);
  }

  calculateNewBalance(
    currentBalance: number,
    amount: number,
    accountType: AccountType,
    transactionType: TransactionType,
    precision: number = AppConfig.constants.precision,
  ): number {
    return effect(accountType, transactionType).apply(currentBalance, amount, precision);
  }

  isBackdated(transactionDate: number, latestTransactionDate?: number): boolean {
    if (!latestTransactionDate) return false;
    return latestTransactionDate > transactionDate;
  }

  validateDistinctAccounts(accountIds: string[]): { isValid: boolean; uniqueCount: number } {
    const uniqueAccounts = new Set(accountIds.filter(id => !!id));
    return {
      isValid: uniqueAccounts.size >= 2,
      uniqueCount: uniqueAccounts.size,
    };
  }

  constructSimpleJournal(input: {
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
}

export const accountingDomainService = new AccountingDomainService();
export const accountingService = accountingDomainService;
