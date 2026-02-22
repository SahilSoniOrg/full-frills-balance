import { database } from '@/src/data/database/Database'
import { AccountType } from '@/src/data/models/Account'
import Budget from '@/src/data/models/Budget'
import Transaction from '@/src/data/models/Transaction'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { budgetRepository } from '@/src/data/repositories/BudgetRepository'
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus'
import { Q } from '@nozbe/watermelondb'
import dayjs from 'dayjs'
import { combineLatest, Observable, of } from 'rxjs'
import { map, switchMap } from 'rxjs/operators'

export interface BudgetUsage {
    spent: number
    remaining: number
    budgetAmount: number
    usagePercent: number
}

export class BudgetReadService {
    /**
     * Observe the reactive usage of a budget based on its assigned scopes.
     * Resolves scopes to leaf expense accounts, fetches transactions
     * within the budget month, and computes totals.
     */
    observeBudgetUsage(budget: Budget): Observable<BudgetUsage> {
        return combineLatest([
            budget.observe(),
            budgetRepository.observeScopes(budget.id).pipe(
                switchMap(scopes => {
                    if (scopes.length === 0) return of([])
                    return combineLatest(scopes.map(s => s.account.observe()))
                })
            ),
            accountRepository.observeByType(AccountType.EXPENSE)
        ]).pipe(
            switchMap(([observedBudget, scopeAccounts, allExpenses]) => {
                const startOfMonth = dayjs(`${observedBudget.startMonth}-01`).startOf('month').valueOf()
                const endOfMonth = dayjs(`${observedBudget.startMonth}-01`).endOf('month').valueOf()

                const childrenMap = new Map<string, string[]>()
                allExpenses.forEach(acc => {
                    if (acc.parentAccountId) {
                        const siblings = childrenMap.get(acc.parentAccountId) || []
                        siblings.push(acc.id)
                        childrenMap.set(acc.parentAccountId, siblings)
                    }
                })

                const getDescendants = (id: string, result: Set<string>) => {
                    const children = childrenMap.get(id) || []
                    for (const childId of children) {
                        result.add(childId)
                        getDescendants(childId, result)
                    }
                }

                const leafExpenseIds = new Set<string>()
                for (const acc of scopeAccounts) {
                    if (acc.accountType === AccountType.EXPENSE) {
                        leafExpenseIds.add(acc.id)
                        getDescendants(acc.id, leafExpenseIds)
                    }
                }

                if (leafExpenseIds.size === 0) {
                    return of({
                        spent: 0,
                        remaining: observedBudget.amount,
                        budgetAmount: observedBudget.amount,
                        usagePercent: 0
                    })
                }

                const clauses = [
                    Q.experimentalJoinTables(['journals']),
                    Q.where('account_id', Q.oneOf(Array.from(leafExpenseIds))),
                    Q.where('transaction_date', Q.gte(startOfMonth)),
                    Q.where('transaction_date', Q.lte(endOfMonth)),
                    Q.where('deleted_at', Q.eq(null)),
                    Q.on('journals', [
                        Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
                        Q.where('deleted_at', Q.eq(null))
                    ])
                ]

                return database.collections.get<Transaction>('transactions')
                    .query(...clauses)
                    .observeWithColumns(['amount', 'transaction_type'])
                    .pipe(
                        map(transactions => {
                            let spent = 0
                            for (const tx of transactions) {
                                if (tx.transactionType === 'DEBIT') {
                                    // money flowing into an expense account = spent
                                    spent += tx.amount
                                } else if (tx.transactionType === 'CREDIT') {
                                    // money flowing out of an expense account = refund/reversal
                                    spent -= tx.amount
                                }
                            }
                            return {
                                spent,
                                remaining: observedBudget.amount - spent,
                                budgetAmount: observedBudget.amount,
                                usagePercent: observedBudget.amount > 0 ? spent / observedBudget.amount : 0
                            }
                        })
                    )
            })
        )
    }
}

export const budgetReadService = new BudgetReadService()
