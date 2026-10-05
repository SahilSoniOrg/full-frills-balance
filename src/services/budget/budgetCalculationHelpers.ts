import { summarizeBudgetUnvaluedEntries } from './budgetUnvaluedEntries';
import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { AppConfig } from '@/src/constants/app-config';
import { convertJournalLineAmount } from '@/src/services/currencyConversion';
import { resolveLeafAccountIds } from '@/src/services/forward-finance/scope/ScopeResolver';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { AccountType, type TransactionType } from '@/src/types/enums';
import { runTasksWithBoundedConcurrency } from '@/src/utils/asyncConcurrency';
import { logger } from '@/src/utils/logger';
import { getCurrencyPrecision } from '@/src/utils/currencyPrecision';
import { roundToPrecision } from '@/src/utils/money';
import { BudgetUsage } from './types';

export type BudgetLineValuationTx = {
  id: string;
  journalId: JournalId;
  accountId: AccountId;
  amount: number;
  currencyCode?: string;
  exchangeRate?: number;
  transactionType: TransactionType;
};

export type BudgetLineValuationAccount = {
  id: AccountId;
  currencyCode?: string;
};

export type ValuedBudgetLine = {
  amount: number;
  journalDate: number;
  transactionType: TransactionType;
};

export async function valueBudgetLinesForCurrency(
  workplaceId: WorkplaceId,
  transactions: BudgetLineValuationTx[],
  accountById: Map<AccountId, BudgetLineValuationAccount>,
  targetCurrency: string,
  logTag: string,
): Promise<{
  lines: (ValuedBudgetLine | null)[];
  unvaluedEntries: boolean[];
  journalById: Map<string, Journal>;
}> {
  const journals = await journalQueryRepository.findByIds(workplaceId, [
    ...new Set(transactions.map(transaction => transaction.journalId)),
  ]);
  const journalById = new Map<string, Journal>(
    journals.map(journal => [journal.id, journal] as const),
  );
  const lines: (ValuedBudgetLine | null)[] = new Array(transactions.length).fill(null);
  const unvaluedEntries = new Array(transactions.length).fill(false);

  await runTasksWithBoundedConcurrency(
    transactions,
    AppConfig.performance.maxConcurrentOperations,
    async (transaction, index) => {
      const journal = journalById.get(transaction.journalId);
      const account = accountById.get(transaction.accountId);
      if (!journal || !account) {
        unvaluedEntries[index] = true;
        logger.warn(`[${logTag}] Journal or account missing for budget valuation`, {
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
        targetCurrency,
        storedLineRate: transaction.exchangeRate,
        journalDate: journal.journalDate,
      });
      if (!converted.ok) {
        unvaluedEntries[index] = true;
        logger.warn(`[${logTag}] FX unavailable for budget valuation`, {
          from: converted.missingRate.fromCurrency,
          to: converted.missingRate.toCurrency,
          journalDate: journal.journalDate,
          transactionId: transaction.id,
        });
        return;
      }

      lines[index] = {
        amount: converted.amount,
        journalDate: journal.journalDate,
        transactionType: transaction.transactionType,
      };
    },
  );

  return { lines, unvaluedEntries, journalById };
}

/** Minimal account shape for leaf resolution — models or plain DTOs. */
export type BudgetLeafAccountInput = {
  id: AccountId;
  accountType: AccountType;
  parentAccountId?: AccountId | null;
  /** Present on Watermelon models; omitted on plain DTOs already workplace-scoped. */
  workplaceId?: WorkplaceId;
};

/**
 * Resolve all leaf expense account IDs from the given scope accounts.
 */
export function resolveLeafExpenseAccountIds(
  scopeAccounts: (BudgetLeafAccountInput | null | undefined)[],
  allExpenses: BudgetLeafAccountInput[],
  workplaceId: WorkplaceId,
): Set<AccountId> {
  const inWorkplace = (acc: BudgetLeafAccountInput) =>
    acc.workplaceId == null || acc.workplaceId === workplaceId;

  const rootExpenseIds = scopeAccounts
    .filter(
      (acc): acc is BudgetLeafAccountInput =>
        acc != null && inWorkplace(acc) && acc.accountType === AccountType.EXPENSE,
    )
    .map(acc => acc.id);

  const workplaceExpenses = allExpenses.filter(inWorkplace);

  return resolveLeafAccountIds(rootExpenseIds, workplaceExpenses);
}

export async function calculateBudgetSpendFromTransactions(
  workplaceId: WorkplaceId,
  transactions: Transaction[],
  budgetAmount: number,
  budgetCurrencyCode: string,
): Promise<BudgetUsage> {
  const precision = getCurrencyPrecision(budgetCurrencyCode);
  const roundedBudgetAmount = roundToPrecision(budgetAmount, precision);
  const accounts = await accountQueryRepository.findAllByIds(workplaceId, [
    ...new Set(transactions.map(transaction => transaction.accountId)),
  ]);
  const accountById = new Map<AccountId, BudgetLineValuationAccount>(
    accounts.map(account => [account.id, account] as const),
  );
  const { lines, unvaluedEntries, journalById } = await valueBudgetLinesForCurrency(
    workplaceId,
    transactions,
    accountById,
    budgetCurrencyCode,
    'BudgetReadService',
  );

  let spentAmount = 0;

  lines.forEach(line => {
    if (!line) return;

    if (line.transactionType === 'DEBIT') {
      spentAmount = roundToPrecision(spentAmount + line.amount, precision);
    } else if (line.transactionType === 'CREDIT') {
      spentAmount = roundToPrecision(spentAmount - line.amount, precision);
    }
  });

  return {
    spent: spentAmount,
    remaining: roundToPrecision(roundedBudgetAmount - spentAmount, precision),
    budgetAmount: roundedBudgetAmount,
    usagePercent: roundedBudgetAmount > 0 ? spentAmount / roundedBudgetAmount : 0,
    ...(unvaluedEntries.some(Boolean)
      ? {
          hasUnvaluedEntries: true,
          ...summarizeBudgetUnvaluedEntries(
            transactions.flatMap((tx, index) =>
              unvaluedEntries[index]
                ? [
                    {
                      journalId: tx.journalId,
                      currencyCode:
                        tx.currencyCode ||
                        accountById.get(tx.accountId)?.currencyCode ||
                        journalById.get(tx.journalId)?.currencyCode ||
                        '',
                    },
                  ]
                : [],
            ),
          ),
        }
      : {}),
  };
}
