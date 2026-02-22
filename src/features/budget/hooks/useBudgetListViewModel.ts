import { budgetRepository } from '@/src/data/repositories/BudgetRepository'
import { useObservable } from '@/src/hooks/useObservable'
import { budgetReadService } from '@/src/services/budget/budgetReadService'
import { combineLatest, of } from 'rxjs'
import { map, switchMap } from 'rxjs/operators'
import { BudgetItem } from '../types'

export function useBudgetListViewModel() {
    const budgetsObservable = budgetRepository.observeAllActive().pipe(
        switchMap(budgets => {
            if (budgets.length === 0) return of([])

            const itemObservables = budgets.map(budget =>
                budgetReadService.observeBudgetUsage(budget).pipe(
                    map(usage => ({ budget, usage } as BudgetItem))
                )
            )
            return combineLatest(itemObservables)
        })
    )

    const { data: items = [] } = useObservable<BudgetItem[]>(() => budgetsObservable, [], [])

    return { items }
}
