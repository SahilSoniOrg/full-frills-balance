import { AppConfig } from '@/src/constants/app-config';
import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import {
  getBalanceImpactMultiplier,
  JournalLineInput,
  validateBalance,
} from '@/src/services/accounting/accountingHelpers';
import { roundToPrecision } from '@/src/utils/money';

export interface JournalValidationResult {
  isValid: boolean;
  imbalance: number;
  totalDebits: number;
  totalCredits: number;
}

export class AccountingDomainService {
  getImpactMultiplier(accountType: AccountType, transactionType: TransactionType): number {
    return getBalanceImpactMultiplier(accountType, transactionType);
  }

  getBalanceImpactMultiplier(accountType: AccountType, transactionType: TransactionType): number {
    return getBalanceImpactMultiplier(accountType, transactionType);
  }

  validateJournal(
    transactions: JournalLineInput[],
    precision: number = AppConfig.constants.precision,
  ): JournalValidationResult {
    return validateBalance(transactions, precision);
  }

  calculateNewBalance(
    currentBalance: number,
    amount: number,
    accountType: AccountType,
    transactionType: TransactionType,
    precision: number = AppConfig.constants.precision,
  ): number {
    const multiplier = getBalanceImpactMultiplier(accountType, transactionType);
    return roundToPrecision(currentBalance + amount * multiplier, precision);
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
