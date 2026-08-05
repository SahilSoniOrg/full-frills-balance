import { database } from '@/src/data/database/Database';
import { AccountType } from '@/src/data/models/Account';
import Budget from '@/src/data/models/Budget';
import Transaction from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { convertAmount } from '@/src/services/currencyConversion';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { logger } from '@/src/utils/logger';
import { AccountId, BudgetId, WorkplaceId } from '@/src/types/domain';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { Money } from '@/src/utils/money';
import { Q } from '@nozbe/watermelondb';
import dayjs from 'dayjs';
import { combineLatest, Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { BudgetPeriodUtils } from './BudgetPeriodUtils';

export interface BudgetUsage {
  spent: number;
  remaining: number;
  budgetAmount: number;
  usagePercent: number;
}

export class BudgetReadService {
  observeAllActive(workplaceId: WorkplaceId) {
    return budgetRepository.observeAllActive(workplaceId);
  }

  observeById(workplaceId: WorkplaceId, budgetId: BudgetId) {
    return budgetRepository.observeById(workplaceId, budgetId);
  }

  observeScopes(workplaceId: WorkplaceId, budgetId: BudgetId) {
    return budgetRepository.observeScopes(workplaceId, budgetId);
  }

  /**
   * Observe the reactive usage of a budget based on its assigned scopes.
   * Resolves scopes to leaf expense accounts, fetches transactions
   * within the budget month, and computes totals.
   * @param budget The budget record
   * @param targetMonth Optional YYYY-MM string to evaluate. Defaults to current month.
   */
  observeBudgetUsage(
    workplaceId: WorkplaceId,
    budget: Budget,
    referenceDate?: number | string,
  ): Observable<BudgetUsage> {
    return combineLatest([
      budget.observe(),
      budgetRepository.observeScopes(workplaceId, budget.id).pipe(
        switchMap(scopes => {
          if (scopes.length === 0) return of([]);
          return combineLatest(scopes.map(s => s.account.observe()));
        }),
      ),
      accountRepository.observeByType(workplaceId, AccountType.EXPENSE),
    ]).pipe(
      switchMap(([observedBudget, scopeAccounts, allExpenses]) => {
        let ref: number;
        if (typeof referenceDate === 'string') {
          const isCurrent = referenceDate === dayjs().format('YYYY-MM');
          ref = isCurrent ? Date.now() : dayjs(`${referenceDate}-15`).valueOf();
        } else {
          ref = referenceDate || Date.now();
        }
        const { startDate: startOfMonth, endDate: endOfMonth } = BudgetPeriodUtils.getCurrentPeriod(
          observedBudget,
          ref,
        );

        const childrenMap = new Map<AccountId, AccountId[]>();
        allExpenses.forEach(acc => {
          if (acc.parentAccountId) {
            const siblings = childrenMap.get(acc.parentAccountId) || [];
            siblings.push(acc.id);
            childrenMap.set(acc.parentAccountId, siblings);
          }
        });

        const getDescendants = (id: AccountId, result: Set<AccountId>) => {
          const children = childrenMap.get(id) || [];
          for (const childId of children) {
            result.add(childId);
            getDescendants(childId, result);
          }
        };

        const leafExpenseIds = new Set<AccountId>();
        for (const acc of scopeAccounts) {
          if (acc.accountType === AccountType.EXPENSE) {
            leafExpenseIds.add(acc.id);
            getDescendants(acc.id, leafExpenseIds);
          }
        }

        if (leafExpenseIds.size === 0) {
          return of({
            spent: 0,
            remaining: observedBudget.amount,
            budgetAmount: observedBudget.amount,
            usagePercent: 0,
          });
        }

        const clauses = [
          Q.experimentalJoinTables(['journals']),
          Q.where('account_id', Q.oneOf(Array.from(leafExpenseIds))),
          Q.where('transaction_date', Q.gte(startOfMonth)),
          Q.where('transaction_date', Q.lte(endOfMonth)),
          Q.where('deleted_at', Q.eq(null)),
          Q.on('journals', [
            Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
            Q.where('deleted_at', Q.eq(null)),
          ]),
        ];

        return database.collections
          .get<Transaction>('transactions')
          .query(...clauses)
          .observeWithColumns(['amount', 'transaction_type', 'currency_code', 'exchange_rate'])
          .pipe(
            switchMap(async transactions => {
              const budgetMoney = Money.from(observedBudget.amount, observedBudget.currencyCode);

              // P0 Perf: Batch pre-fetch all required exchange rates in parallel
              // This avoids N sequential bridge calls inside the loop below.
              const txCurrencies = new Set(transactions.map(t => t.currencyCode));
              txCurrencies.add(budgetMoney.currencyCode);

              await Promise.all(
                Array.from(txCurrencies).map(c =>
                  exchangeRateService.fetchRatesForBase(c).catch(() => ({})),
                ),
              );

              let spentMoney = Money.from(0, budgetMoney.currencyCode);

              for (const tx of transactions) {
                let txAmount = tx.amount;
                if (tx.currencyCode !== budgetMoney.currencyCode) {
                  const converted = await convertAmount({
                    amount: tx.amount,
                    fromCurrency: tx.currencyCode,
                    toCurrency: budgetMoney.currencyCode,
                    mode: 'historical',
                    storedExchangeRate: tx.exchangeRate,
                  });
                  if (!converted.ok) {
                    logger.warn('[BudgetReadService] FX unavailable for budget usage', {
                      from: tx.currencyCode,
                      to: budgetMoney.currencyCode,
                      transactionId: tx.id,
                    });
                    continue;
                  }
                  txAmount = converted.amount;
                }

                const txMoney = Money.from(txAmount, budgetMoney.currencyCode);
                if (tx.transactionType === 'DEBIT') {
                  spentMoney = spentMoney.add(txMoney);
                } else if (tx.transactionType === 'CREDIT') {
                  spentMoney = spentMoney.subtract(txMoney);
                }
              }

              return {
                spent: spentMoney.amount,
                remaining: budgetMoney.subtract(spentMoney).amount,
                budgetAmount: budgetMoney.amount,
                usagePercent: budgetMoney.amount > 0 ? spentMoney.amount / budgetMoney.amount : 0,
              };
            }),
          );
      }),
    );
  }
}

export const budgetReadService = new BudgetReadService();
