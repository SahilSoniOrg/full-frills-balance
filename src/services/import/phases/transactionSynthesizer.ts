import { AccountId, JournalId, TransactionId } from '@/src/types/ids';
import { JournalDisplayType, JournalStatus, TransactionType } from '@/src/types/enums';
import { generator } from '@/src/data/database/idGenerator';
import type { CanonicalAccount, CanonicalJournal, CanonicalTransaction } from '../canonicalImport';
import type { ImportIssue, ImportTransactionInput } from '../canonicalImportBuilder';

export function synthesizeTransactions(params: {
  rawTransactions: ImportTransactionInput[];
  defaultCurrency: string;
  accountMap: Map<string, AccountId>;
  accountCurrencyMap: Map<string, string>;
  categoryAccountMap: Map<string, AccountId>;
  canonicalAccounts: CanonicalAccount[];
  issues: ImportIssue[];
  getOrCreateSystemEquityAccount: (
    isOpeningBalance: boolean,
    currency: string,
    categoryAccountMap: Map<string, AccountId>,
    canonicalAccounts: CanonicalAccount[],
  ) => AccountId;
  getOrCreateUnknownCategory: (
    isIncome: boolean,
    currency: string,
    categoryAccountMap: Map<string, AccountId>,
    canonicalAccounts: CanonicalAccount[],
  ) => AccountId;
}): { journals: CanonicalJournal[]; transactions: CanonicalTransaction[] } {
  const journals: CanonicalJournal[] = [];
  const transactions: CanonicalTransaction[] = [];

  for (const tx of params.rawTransactions) {
    if (!Number.isFinite(tx.amount) || tx.amount <= 0) {
      params.issues.push({
        severity: 'error',
        entity: 'transaction',
        sourceId: tx.id,
        code: 'INVALID_AMOUNT',
        message: `Transaction amount '${tx.amount}' is invalid. Transactions must have a finite, positive amount.`,
      });
      continue;
    }

    const journalId = generator() as JournalId;
    const txCurrency = tx.currencyCode || params.defaultCurrency;
    const date = tx.date ?? Date.now();
    const amount = Math.abs(tx.amount);

    if (tx.type === 'TRANSFER') {
      const sourceId = tx.sourceAccountId ? params.accountMap.get(tx.sourceAccountId) : undefined;
      const destId = tx.targetAccountId ? params.accountMap.get(tx.targetAccountId) : undefined;

      if (!sourceId || !destId) {
        params.issues.push({
          severity: 'error',
          entity: 'transaction',
          sourceId: tx.id,
          code: 'ACCOUNT_NOT_FOUND',
          message: `Transfer missing source '${tx.sourceAccountId}' or destination '${tx.targetAccountId}' account.`,
        });
        continue;
      }

      const sourceCurrency = params.accountCurrencyMap.get(tx.sourceAccountId) || txCurrency;
      const destCurrency =
        (tx.targetAccountId && params.accountCurrencyMap.get(tx.targetAccountId)) || txCurrency;

      journals.push({
        id: journalId,
        journalDate: date,
        description: tx.description || 'Transfer',
        notes: tx.notes,
        currencyCode: sourceCurrency,
        status: JournalStatus.POSTED,
        totalAmount: amount,
        transactionCount: 2,
        displayType: JournalDisplayType.TRANSFER,
      });

      // Credit source (outflow from source)
      transactions.push({
        id: generator() as TransactionId,
        journalId,
        accountId: sourceId,
        amount,
        transactionType: TransactionType.CREDIT,
        currencyCode: sourceCurrency,
        transactionDate: date,
      });

      // Validate targetAmount and exchangeRate
      let validTargetAmount: number | undefined;
      if (tx.targetAmount !== undefined) {
        if (Number.isFinite(tx.targetAmount) && tx.targetAmount > 0) {
          validTargetAmount = tx.targetAmount;
        } else {
          params.issues.push({
            severity: 'warning',
            entity: 'transaction',
            sourceId: tx.id,
            code: 'INVALID_AMOUNT',
            message: `Invalid targetAmount '${tx.targetAmount}'. Must be a finite, positive number.`,
          });
        }
      }

      let validExchangeRate: number | undefined;
      if (tx.exchangeRate !== undefined) {
        if (Number.isFinite(tx.exchangeRate) && tx.exchangeRate > 0) {
          validExchangeRate = tx.exchangeRate;
        } else {
          params.issues.push({
            severity: 'warning',
            entity: 'transaction',
            sourceId: tx.id,
            code: 'INVALID_AMOUNT',
            message: `Invalid exchangeRate '${tx.exchangeRate}'. Must be a finite, positive number.`,
          });
        }
      }

      const destAmount =
        validTargetAmount !== undefined
          ? validTargetAmount
          : validExchangeRate !== undefined
            ? amount * validExchangeRate
            : amount;

      // Exchange rate multiplier = destination amount / source amount
      const effectiveExchangeRate =
        validExchangeRate ??
        (sourceCurrency !== destCurrency && amount > 0 && destAmount > 0
          ? destAmount / amount
          : undefined);

      // Debit dest (inflow to destination)
      transactions.push({
        id: generator() as TransactionId,
        journalId,
        accountId: destId,
        amount: destAmount,
        transactionType: TransactionType.DEBIT,
        currencyCode: destCurrency,
        transactionDate: date,
        exchangeRate: effectiveExchangeRate,
      });
    } else if (tx.type === 'INCOME') {
      const assetAccountId = tx.sourceAccountId
        ? params.accountMap.get(tx.sourceAccountId)
        : undefined;
      if (!assetAccountId) {
        params.issues.push({
          severity: 'error',
          entity: 'transaction',
          sourceId: tx.id,
          code: 'ACCOUNT_NOT_FOUND',
          message: `Income transaction missing source asset account '${tx.sourceAccountId}'.`,
        });
        continue;
      }

      let categoryAccountId: AccountId;
      if (tx.isOpeningBalance) {
        categoryAccountId = params.getOrCreateSystemEquityAccount(
          true,
          txCurrency,
          params.categoryAccountMap,
          params.canonicalAccounts,
        );
      } else if (
        tx.categoryId &&
        params.categoryAccountMap.has(`${tx.categoryId}:::${txCurrency}`)
      ) {
        categoryAccountId = params.categoryAccountMap.get(`${tx.categoryId}:::${txCurrency}`)!;
      } else {
        categoryAccountId = params.getOrCreateUnknownCategory(
          true,
          txCurrency,
          params.categoryAccountMap,
          params.canonicalAccounts,
        );
      }

      journals.push({
        id: journalId,
        journalDate: date,
        description: tx.description || 'Income',
        notes: tx.notes,
        currencyCode: txCurrency,
        status: JournalStatus.POSTED,
        totalAmount: amount,
        transactionCount: 2,
        displayType: JournalDisplayType.INCOME,
      });

      // Debit asset (inflow increases asset)
      transactions.push({
        id: generator() as TransactionId,
        journalId,
        accountId: assetAccountId,
        amount,
        transactionType: TransactionType.DEBIT,
        currencyCode: txCurrency,
        transactionDate: date,
      });

      // Credit income / equity
      transactions.push({
        id: generator() as TransactionId,
        journalId,
        accountId: categoryAccountId,
        amount,
        transactionType: TransactionType.CREDIT,
        currencyCode: txCurrency,
        transactionDate: date,
      });
    } else {
      // EXPENSE
      const assetAccountId = tx.sourceAccountId
        ? params.accountMap.get(tx.sourceAccountId)
        : undefined;
      if (!assetAccountId) {
        params.issues.push({
          severity: 'error',
          entity: 'transaction',
          sourceId: tx.id,
          code: 'ACCOUNT_NOT_FOUND',
          message: `Expense transaction missing source asset account '${tx.sourceAccountId}'.`,
        });
        continue;
      }

      let categoryAccountId: AccountId;
      if (tx.isBalanceCorrection) {
        categoryAccountId = params.getOrCreateSystemEquityAccount(
          false,
          txCurrency,
          params.categoryAccountMap,
          params.canonicalAccounts,
        );
      } else if (
        tx.categoryId &&
        params.categoryAccountMap.has(`${tx.categoryId}:::${txCurrency}`)
      ) {
        categoryAccountId = params.categoryAccountMap.get(`${tx.categoryId}:::${txCurrency}`)!;
      } else {
        categoryAccountId = params.getOrCreateUnknownCategory(
          false,
          txCurrency,
          params.categoryAccountMap,
          params.canonicalAccounts,
        );
      }

      journals.push({
        id: journalId,
        journalDate: date,
        description: tx.description || 'Expense',
        notes: tx.notes,
        currencyCode: txCurrency,
        status: JournalStatus.POSTED,
        totalAmount: amount,
        transactionCount: 2,
        displayType: JournalDisplayType.EXPENSE,
      });

      // Credit asset (outflow decreases asset)
      transactions.push({
        id: generator() as TransactionId,
        journalId,
        accountId: assetAccountId,
        amount,
        transactionType: TransactionType.CREDIT,
        currencyCode: txCurrency,
        transactionDate: date,
      });

      // Debit expense / equity
      transactions.push({
        id: generator() as TransactionId,
        journalId,
        accountId: categoryAccountId,
        amount,
        transactionType: TransactionType.DEBIT,
        currencyCode: txCurrency,
        transactionDate: date,
      });
    }
  }

  return { journals, transactions };
}
