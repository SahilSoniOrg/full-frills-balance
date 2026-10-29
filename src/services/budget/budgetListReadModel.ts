import type Transaction from '@/src/data/models/Transaction';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { accountQueries } from '@/src/services/accounts/accountQueries';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { AccountType } from '@/src/types/enums';
import type { WorkplaceId } from '@/src/types/ids';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { combineLatest, of, type Observable } from 'rxjs';
import {
  auditTime,
  combineLatestWith,
  map,
  shareReplay,
  startWith,
  switchMap,
} from 'rxjs/operators';
import { calculateBudgetListUsage, resolveLeafExpenseAccountIds } from './budgetCalculationHelpers';
import { budgetReadService } from './budgetReadService';
import { getBudgetCurrentPeriod } from './BudgetPeriodUtils';

/** One accounts feed and one valuation batch for the visible budget list. */
export function observeBudgetList(workplaceId: WorkplaceId, today: number) {
  const scopedBudgets$ = budgetReadService
    .observeAllActive(workplaceId)
    .pipe(
      switchMap(budgets =>
        budgets.length === 0
          ? of([])
          : combineLatest(
              budgets.map(budget =>
                budgetReadService
                  .observeScopes(workplaceId, budget.id)
                  .pipe(map(scopes => ({ budget, scopes }))),
              ),
            ),
      ),
    );

  return combineLatest([scopedBudgets$, accountQueries.observeAll(workplaceId)]).pipe(
    switchMap(([entries, accounts]) => {
      if (entries.length === 0) return of([]);
      const accountsById = new Map(accounts.map(account => [account.id, account]));
      const expenses = accounts.filter(account => account.accountType === AccountType.EXPENSE);
      // Identical scopes and periods share the database observer as well.
      const queries = new Map<string, Observable<Transaction[]>>();
      return combineLatest(
        entries.map(({ budget, scopes }) => {
          const scopeAccounts = scopes.map(scope => accountsById.get(scope.accountId));
          const leafIds = [
            ...resolveLeafExpenseAccountIds(scopeAccounts, expenses, workplaceId),
          ].sort();
          const { startDate, endDate } = getBudgetCurrentPeriod(budget, today);
          const key = JSON.stringify([leafIds, startDate, endDate]);
          let transactions$ = queries.get(key);
          if (!transactions$) {
            transactions$ = (
              leafIds.length === 0
                ? of([])
                : transactionQueryRepository.observeBudgetTransactionsByJournalDateRange(
                    workplaceId,
                    leafIds,
                    startDate,
                    endDate,
                    ACTIVE_JOURNAL_STATUSES,
                  )
            ).pipe(shareReplay({ bufferSize: 1, refCount: true }));
            queries.set(key, transactions$);
          }
          return transactions$.pipe(
            map(transactions => ({
              budget,
              scopeAccounts,
              transactions,
              hasLeaves: leafIds.length > 0,
            })),
          );
        }),
      );
    }),
    // A rate update revalues the current rows without rebuilding all observers.
    combineLatestWith(exchangeRateService.observeSpotRateUpdates().pipe(startWith(''))),
    // Coalesce synchronous emissions from overlapping transaction observers.
    auditTime(0),
    switchMap(async ([entries]) => {
      const usages = await calculateBudgetListUsage(
        workplaceId,
        entries.map(entry => ({
          transactions: entry.transactions,
          amount: entry.budget.amount,
          currencyCode: entry.budget.currencyCode,
        })),
      );
      return entries.map(({ budget, scopeAccounts, hasLeaves }, index) => ({
        budget,
        scopeAccounts,
        usage: hasLeaves
          ? usages[index]
          : {
              spent: 0,
              remaining: budget.amount,
              budgetAmount: budget.amount,
              usagePercent: 0,
            },
      }));
    }),
  );
}
