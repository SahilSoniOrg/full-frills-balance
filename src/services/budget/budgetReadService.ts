import { AccountType } from '@/src/types/enums';
import { AccountId, BudgetId, WorkplaceId } from '@/src/types/ids';

import { toPlainBudget } from '@/src/data/models/Budget';
import { toPlainBudgetScope } from '@/src/data/models/BudgetScope';
import { accountObserveQueries } from '@/src/data/repositories/account';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import dayjs from 'dayjs';
import { combineLatest, from, Observable, of } from 'rxjs';
import { map, shareReplay, switchMap } from 'rxjs/operators';
import {
  calculateBudgetSpendFromTransactions,
  resolveLeafExpenseAccountIds,
} from './budgetCalculationHelpers';
import {
  getBudgetCurrentPeriod,
  getBudgetPeriodLabel,
  type BudgetPeriodInput,
} from './BudgetPeriodUtils';
import { BudgetUsage } from './types';
import { RecurrenceEngine } from '@/src/services/forward-finance/recurrence/RecurrenceEngine';
import type { DateRange, RecurrenceRule } from '@/src/services/forward-finance/recurrence/types';
import { isValidRepeatCount } from '@/src/utils/recurrenceLabels';

export type BudgetSpendingHistoryEntry = {
  label: string;
  startDate: number;
  endDate: number;
  spent: number;
  transactionCount: number;
  hasUnvaluedEntries: boolean;
};

const EMPTY_BUDGET_USAGE: BudgetUsage = {
  spent: 0,
  remaining: 0,
  budgetAmount: 0,
  usagePercent: 0,
};

/** Observe the last six completed periods and the current period for draft-selected categories. */
export function observeBudgetSpendingHistory(
  workplaceId: WorkplaceId,
  categoryIds: readonly AccountId[],
  rule: RecurrenceRule,
  currencyCode: string,
  referenceDate = Date.now(),
): Observable<BudgetSpendingHistoryEntry[]> {
  if (categoryIds.length === 0 || !isValidRepeatCount(rule.intervalN)) return of([]);

  const periods: DateRange[] = [];
  let range = RecurrenceEngine.getCurrentPeriod(rule, referenceDate);
  periods.push(range);
  while (periods.length < 7) {
    range = RecurrenceEngine.getCurrentPeriod(rule, range.startDate - 1);
    periods.push(range);
  }
  periods.reverse();

  return combineLatest([
    accountObserveQueries.observeByIds(workplaceId, [...categoryIds]),
    accountObserveQueries.observeByType(workplaceId, AccountType.EXPENSE),
  ]).pipe(
    switchMap(([scopeAccounts, allExpenses]) => {
      const leafIds = [...resolveLeafExpenseAccountIds(scopeAccounts, allExpenses, workplaceId)];
      if (leafIds.length === 0) {
        return of(
          periods.map(period => ({
            ...period,
            label: spendingPeriodLabel(period.startDate, rule.intervalType),
            spent: 0,
            transactionCount: 0,
            hasUnvaluedEntries: false,
          })),
        );
      }

      return combineLatest(
        periods.map(period =>
          transactionQueryRepository.observeBudgetTransactionsByJournalDateRange(
            workplaceId,
            leafIds,
            period.startDate,
            period.endDate,
            ACTIVE_JOURNAL_STATUSES,
          ),
        ),
      ).pipe(
        switchMap(transactionSets =>
          from(
            Promise.all(
              transactionSets.map(async transactions => {
                const usage = await calculateBudgetSpendFromTransactions(
                  workplaceId,
                  transactions,
                  0,
                  currencyCode,
                );
                return {
                  spent: usage.spent,
                  transactionCount: transactions.length,
                  hasUnvaluedEntries: usage.hasUnvaluedEntries ?? false,
                };
              }),
            ),
          ),
        ),
        map(values =>
          periods.map((period, index) => ({
            ...period,
            label: spendingPeriodLabel(period.startDate, rule.intervalType),
            ...values[index],
          })),
        ),
      );
    }),
  );
}

export function observeAllActiveBudgets(workplaceId: WorkplaceId) {
  return budgetRepository
    .observeAllActive(workplaceId)
    .pipe(map(budgets => budgets.map(toPlainBudget)));
}

export function observeBudgetById(workplaceId: WorkplaceId, budgetId: BudgetId) {
  return budgetRepository
    .observeById(workplaceId, budgetId)
    .pipe(map(budget => (budget ? toPlainBudget(budget) : null)));
}

export function observeBudgetScopes(workplaceId: WorkplaceId, budgetId: BudgetId) {
  return budgetRepository
    .observeScopes(workplaceId, budgetId)
    .pipe(map(scopes => scopes.map(toPlainBudgetScope)));
}

export interface JournalBudgetImpact {
  budgetId: BudgetId;
  name: string;
  currencyCode: string;
  usage: BudgetUsage;
  /** Set only when the journal falls outside the budget's current period. */
  periodLabel?: string;
}

type ValuedBudget = BudgetPeriodInput & { amount: number; currencyCode: string };

/** Leaf expense accounts a budget covers, following live scope and account-tree changes. */
function observeBudgetLeafAccountIds(
  workplaceId: WorkplaceId,
  budgetId: BudgetId,
  allExpenses$ = accountObserveQueries.observeByType(workplaceId, AccountType.EXPENSE),
): Observable<Set<AccountId>> {
  return combineLatest([
    budgetRepository.observeScopes(workplaceId, budgetId).pipe(
      switchMap(scopes => {
        const accountIds = scopes.map(scope => scope.accountId);
        if (accountIds.length === 0) return of([]);
        return accountObserveQueries.observeByIds(workplaceId, accountIds);
      }),
    ),
    allExpenses$,
  ]).pipe(
    map(([scopeAccounts, allExpenses]) =>
      resolveLeafExpenseAccountIds(scopeAccounts, allExpenses, workplaceId),
    ),
  );
}

function observeUsageForLeaves(
  workplaceId: WorkplaceId,
  budget: ValuedBudget,
  leafIds: Set<AccountId>,
  referenceDate: number,
): Observable<BudgetUsage> {
  if (leafIds.size === 0) {
    return of({
      spent: 0,
      remaining: budget.amount,
      budgetAmount: budget.amount,
      usagePercent: 0,
    });
  }
  const { startDate, endDate } = getBudgetCurrentPeriod(budget, referenceDate);
  return transactionQueryRepository
    .observeBudgetTransactionsByJournalDateRange(
      workplaceId,
      [...leafIds],
      startDate,
      endDate,
      ACTIVE_JOURNAL_STATUSES,
    )
    .pipe(
      switchMap(transactions =>
        calculateBudgetSpendFromTransactions(
          workplaceId,
          transactions,
          budget.amount,
          budget.currencyCode,
        ),
      ),
    );
}

/** Budgets whose live scope covers any of the given expense accounts, valued for the journal's period. */
export function observeBudgetsForAccounts(
  workplaceId: WorkplaceId,
  expenseAccountIds: readonly AccountId[],
  referenceDate: number,
  today: number = Date.now(),
): Observable<JournalBudgetImpact[]> {
  if (expenseAccountIds.length === 0) return of([]);
  const expenseIds = new Set(expenseAccountIds);
  const allExpenses$ = accountObserveQueries
    .observeByType(workplaceId, AccountType.EXPENSE)
    .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  return observeAllActiveBudgets(workplaceId).pipe(
    switchMap(budgets => {
      if (budgets.length === 0) return of([]);
      return combineLatest(
        budgets.map(budget =>
          observeBudgetLeafAccountIds(workplaceId, budget.id, allExpenses$).pipe(
            switchMap(leafIds => {
              if (![...leafIds].some(id => expenseIds.has(id))) return of(null);
              return observeUsageForLeaves(workplaceId, budget, leafIds, referenceDate).pipe(
                map((usage): JournalBudgetImpact => ({
                  budgetId: budget.id,
                  name: budget.name,
                  currencyCode: budget.currencyCode,
                  usage,
                  periodLabel:
                    getBudgetCurrentPeriod(budget, referenceDate).startDate ===
                    getBudgetCurrentPeriod(budget, today).startDate
                      ? undefined
                      : getBudgetPeriodLabel(budget, referenceDate),
                })),
              );
            }),
          ),
        ),
      );
    }),
    map(impacts => impacts.filter((impact): impact is JournalBudgetImpact => impact !== null)),
  );
}

/**
 * Observe the reactive usage of a budget based on its assigned scopes.
 * Resolves scopes to leaf expense accounts, fetches transactions
 * within the budget month, and computes totals.
 */
export function observeBudgetUsage(
  workplaceId: WorkplaceId,
  budgetId: BudgetId,
  referenceDate?: number,
): Observable<BudgetUsage> {
  return budgetRepository.observeById(workplaceId, budgetId).pipe(
    switchMap(budget => {
      if (!budget || budget.workplaceId !== workplaceId) {
        return of(EMPTY_BUDGET_USAGE);
      }
      return observeBudgetLeafAccountIds(workplaceId, budget.id).pipe(
        switchMap(leafIds =>
          observeUsageForLeaves(workplaceId, budget, leafIds, referenceDate ?? Date.now()),
        ),
      );
    }),
  );
}

function spendingPeriodLabel(startDate: number, intervalType?: string) {
  return dayjs(startDate).format(
    intervalType === 'DAILY' || intervalType === 'WEEKLY'
      ? 'MMM D'
      : intervalType === 'YEARLY'
        ? 'YYYY'
        : 'MMM YYYY',
  );
}

export const budgetReadService = {
  observeForAccounts: observeBudgetsForAccounts,
  observeSpendingHistory: observeBudgetSpendingHistory,
  observeAllActive: observeAllActiveBudgets,
  observeById: observeBudgetById,
  observeScopes: observeBudgetScopes,
  observeBudgetUsage,
};
