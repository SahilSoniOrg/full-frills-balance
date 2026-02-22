import { database } from '@/src/data/database/Database'
import Budget from '@/src/data/models/Budget'
import BudgetScope from '@/src/data/models/BudgetScope'
import { Q } from '@nozbe/watermelondb'

export interface BudgetInput {
    name: string
    amount: number
    currencyCode: string
    startMonth: string
    active?: boolean
}

export class BudgetRepository {
    private get db() {
        return database
    }

    private get budgets() {
        return this.db.collections.get<Budget>('budgets')
    }

    private get budgetScopes() {
        return this.db.collections.get<BudgetScope>('budget_scopes')
    }

    observeAllActive() {
        return this.budgets
            .query(Q.where('active', true), Q.sortBy('start_month', Q.desc))
            .observeWithColumns(['name', 'amount', 'currency_code', 'start_month', 'active'])
    }

    observeScopes(budgetId: string) {
        return this.budgetScopes
            .query(Q.where('budget_id', budgetId))
            .observe()
    }

    async getScopes(budgetId: string): Promise<BudgetScope[]> {
        return await this.budgetScopes
            .query(Q.where('budget_id', budgetId))
            .fetch()
    }

    async find(id: string): Promise<Budget | null> {
        try {
            return await this.budgets.find(id)
        } catch {
            return null
        }
    }

    async create(data: BudgetInput, accountIds: string[]): Promise<Budget> {
        return await this.db.write(async () => {
            const budget = await this.budgets.create((record) => {
                record.name = data.name
                record.amount = data.amount
                record.currencyCode = data.currencyCode
                record.startMonth = data.startMonth
                record.active = data.active ?? true
                record.createdAt = new Date()
                record.updatedAt = new Date()
            })

            const scopeCreates = accountIds.map((accountId) =>
                this.budgetScopes.prepareCreate((scope) => {
                    scope.budget.set(budget)
                    scope.account.id = accountId
                    scope.createdAt = new Date()
                    scope.updatedAt = new Date()
                })
            )

            await this.db.batch(...scopeCreates)
            return budget
        })
    }

    async update(budget: Budget, updates: Partial<BudgetInput>, accountIds: string[]): Promise<Budget> {
        return await this.db.write(async () => {
            const existingScopes = await this.budgetScopes.query(Q.where('budget_id', budget.id)).fetch()

            const updateOp = budget.prepareUpdate((record) => {
                if (updates.name !== undefined) record.name = updates.name
                if (updates.amount !== undefined) record.amount = updates.amount
                if (updates.currencyCode !== undefined) record.currencyCode = updates.currencyCode
                if (updates.startMonth !== undefined) record.startMonth = updates.startMonth
                if (updates.active !== undefined) record.active = updates.active
                record.updatedAt = new Date()
            })

            const existingAccountIds = existingScopes.map(s => s.account.id)
            const toAdd = accountIds.filter(id => !existingAccountIds.includes(id))
            const toRemove = existingScopes.filter(s => !accountIds.includes(s.account.id))

            const addOps = toAdd.map(accountId =>
                this.budgetScopes.prepareCreate((scope) => {
                    scope.budget.set(budget)
                    scope.account.id = accountId
                    scope.createdAt = new Date()
                    scope.updatedAt = new Date()
                })
            )

            const removeOps = toRemove.map(scope => scope.prepareDestroyPermanently())

            await this.db.batch(updateOp, ...addOps, ...removeOps)
            return budget
        })
    }

    async delete(budget: Budget): Promise<void> {
        return await this.db.write(async () => {
            const scopes = await this.budgetScopes.query(Q.where('budget_id', budget.id)).fetch()
            const removeScopes = scopes.map(s => s.prepareDestroyPermanently())
            const removeBudget = budget.prepareDestroyPermanently()
            await this.db.batch(...removeScopes, removeBudget)
        })
    }
}

export const budgetRepository = new BudgetRepository()
