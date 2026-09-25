import { AccountType } from '@/src/types/enums';
import { BudgetId, WorkplaceId } from '@/src/types/ids';

import { toPlainBudget } from '@/src/data/models/Budget';
import { toPlainBudgetScope } from '@/src/data/models/BudgetScope';
import { accountObserveQueries } from '@/src/data/repositories/account';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import dayjs from 'dayjs';
import { combineLatest, Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import {
  calculateBudgetSpendFromTransactions,
  resolveLeafExpenseAccountIds,
} from './budgetCalculationHelpers';
import { BudgetPeriodUtils } from './BudgetPeriodUtils';
import { BudgetUsage } from './types';

const EMPTY_BUDGET_USAGE: BudgetUsage = {
  spent: 0,
  remaining: 0,
  budgetAmount: 0,
  usagePercent: 0,
};

export class BudgetReadService {
  observeAllActive(workplaceId: WorkplaceId) {
    return budgetRepository
      .observeAllActive(workplaceId)
      .pipe(map(budgets => budgets.map(toPlainBudget)));
  }

  observeById(workplaceId: WorkplaceId, budgetId: BudgetId) {
    return budgetRepository
      .observeById(workplaceId, budgetId)
      .pipe(map(budget => (budget ? toPlainBudget(budget) : null)));
  }

  observeScopes(workplaceId: WorkplaceId, budgetId: BudgetId) {
    return budgetRepository
      .observeScopes(workplaceId, budgetId)
      .pipe(map(scopes => scopes.map(toPlainBudgetScope)));
  }

  /**
   * Observe the reactive usage of a budget based on its assigned scopes.
   * Resolves scopes to leaf expense accounts, fetches transactions
   * within the budget month, and computes totals.
   */
  observeBudgetUsage(
    workplaceId: WorkplaceId,
    budgetId: BudgetId,
    referenceDate?: number | string,
  ): Observable<BudgetUsage> {
    return budgetRepository.observeById(workplaceId, budgetId).pipe(
      switchMap(budget => {
        if (!budget || budget.workplaceId !== workplaceId) {
          return of(EMPTY_BUDGET_USAGE);
        }

        return combineLatest([
          budgetRepository.observeScopes(workplaceId, budget.id).pipe(
            switchMap(scopes => {
              const accountIds = scopes.map(scope => scope.accountId);
              if (accountIds.length === 0) return of([]);
              return accountObserveQueries.observeByIds(workplaceId, accountIds);
            }),
          ),
          accountObserveQueries.observeByType(workplaceId, AccountType.EXPENSE),
        ]).pipe(
          switchMap(([scopeAccounts, allExpenses]) => {
            let ref: number;
            if (typeof referenceDate === 'string') {
              const isCurrent = referenceDate === dayjs().format('YYYY-MM');
              ref = isCurrent ? Date.now() : dayjs(`${referenceDate}-15`).valueOf();
            } else {
              ref = referenceDate || Date.now();
            }
            const { startDate: startOfMonth, endDate: endOfMonth } =
              BudgetPeriodUtils.getCurrentPeriod(budget, ref);

            const leafExpenseIds = resolveLeafExpenseAccountIds(
              scopeAccounts,
              allExpenses,
              workplaceId,
            );

            if (leafExpenseIds.size === 0) {
              return of({
                spent: 0,
                remaining: budget.amount,
                budgetAmount: budget.amount,
                usagePercent: 0,
              });
            }

            return transactionQueryRepository
              .observeBudgetTransactions(
                workplaceId,
                Array.from(leafExpenseIds),
                startOfMonth,
                endOfMonth,
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
          }),
        );
      }),
    );
  }
}

export const budgetReadService = new BudgetReadService();
