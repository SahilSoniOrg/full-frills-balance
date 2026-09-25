import Account from '@/src/data/models/Account';
import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { AppConfig } from '@/src/constants/app-config';
import { convertJournalLineAmount } from '@/src/services/currencyConversion';
import { ScopeResolver } from '@/src/services/forward-finance/scope/ScopeResolver';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { AccountType } from '@/src/types/enums';
import { runTasksWithBoundedConcurrency } from '@/src/utils/asyncConcurrency';
import { logger } from '@/src/utils/logger';
import { getCurrencyPrecision } from '@/src/utils/currencyPrecision';
import { roundToPrecision } from '@/src/utils/money';
import { BudgetUsage } from './types';

/**
 * Resolve all leaf expense account IDs from the given scope accounts.
 */
export function resolveLeafExpenseAccountIds(
  scopeAccounts: (Account | null | undefined)[],
  allExpenses: Account[],
  workplaceId: WorkplaceId,
): Set<AccountId> {
  const rootExpenseIds = scopeAccounts
    .filter(
      (acc): acc is Account =>
        acc != null && acc.workplaceId === workplaceId && acc.accountType === AccountType.EXPENSE,
    )
    .map(acc => acc.id);

  const workplaceExpenses = allExpenses.filter(acc => acc.workplaceId === workplaceId);

  return ScopeResolver.resolveLeafAccountIds(rootExpenseIds, workplaceExpenses);
}

/**
 * Calculate multi-currency spend across transactions for a target budget.
 */
export async function calculateBudgetSpendFromTransactions(
  workplaceId: WorkplaceId,
  transactions: Transaction[],
  budgetAmount: number,
  budgetCurrencyCode: string,
): Promise<BudgetUsage> {
  const precision = getCurrencyPrecision(budgetCurrencyCode);
  const roundedBudgetAmount = roundToPrecision(budgetAmount, precision);
  const [journals, accounts] = await Promise.all([
    journalQueryRepository.findByIds(workplaceId, [
      ...new Set(transactions.map(transaction => transaction.journalId)),
    ]),
    accountQueryRepository.findAllByIds(workplaceId, [
      ...new Set(transactions.map(transaction => transaction.accountId)),
    ]),
  ]);
  const journalById = new Map<string, Journal>(
    journals.map(journal => [journal.id, journal] as const),
  );
  const accountById = new Map<AccountId, Account>(
    accounts.map(account => [account.id, account] as const),
  );
  const convertedAmounts: (number | null)[] = new Array(transactions.length).fill(null);
  const unvaluedEntries = new Array<boolean>(transactions.length).fill(false);

  await runTasksWithBoundedConcurrency(
    transactions,
    AppConfig.performance.maxConcurrentOperations,
    async (transaction, index) => {
      const journal = journalById.get(transaction.journalId);
      const account = accountById.get(transaction.accountId);
      if (!journal || !account) {
        unvaluedEntries[index] = true;
        logger.warn('[BudgetReadService] Journal or account missing for budget valuation', {
          transactionId: transaction.id,
          journalId: transaction.journalId,
          accountId: transaction.accountId,
        });
        return;
      }

      const converted = await convertJournalLineAmount({
        amount: transaction.amount,
        lineCurrency: transaction.currencyCode || account.currencyCode || journal.currencyCode,
        journalCurrency: journal.currencyCode,
        targetCurrency: budgetCurrencyCode,
        storedLineRate: transaction.exchangeRate,
        journalDate: journal.journalDate,
      });
      if (!converted.ok) {
        unvaluedEntries[index] = true;
        logger.warn('[BudgetReadService] FX unavailable for budget usage', {
          from: converted.missingRate.fromCurrency,
          to: converted.missingRate.toCurrency,
          journalDate: journal.journalDate,
          transactionId: transaction.id,
        });
        return;
      }

      convertedAmounts[index] = converted.amount;
    },
  );

  let spentAmount = 0;

  transactions.forEach((tx, index) => {
    const txAmount = convertedAmounts[index];
    if (txAmount === null) return;

    if (tx.transactionType === 'DEBIT') {
      spentAmount = roundToPrecision(spentAmount + txAmount, precision);
    } else if (tx.transactionType === 'CREDIT') {
      spentAmount = roundToPrecision(spentAmount - txAmount, precision);
    }
  });

  return {
    spent: spentAmount,
    remaining: roundToPrecision(roundedBudgetAmount - spentAmount, precision),
    budgetAmount: roundedBudgetAmount,
    usagePercent: roundedBudgetAmount > 0 ? spentAmount / roundedBudgetAmount : 0,
    ...(unvaluedEntries.some(Boolean) ? { hasUnvaluedEntries: true } : {}),
  };
}
